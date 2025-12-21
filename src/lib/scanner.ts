import * as net from 'net'
import * as http from 'http'
import { getDockerContainers, Container } from './system/docker'
import { getOpenPorts, Port } from './system/ports'

export interface ServiceInfo {
    port: number
    state: 'open' | 'closed'
    protocol: 'tcp' | 'udp' // Added protocol
    service?: string
    version?: string
    banner?: string
    docker?: {
        id: string
        image: string
        name: string
    }
    process?: {
        name: string
        pid: number
    }
}

export class Scanner {
    private commonPorts = [
        21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 631, 993, 995,
        1433, 2377, 3000, 3001, 3306, 3389, 5432, 5900, 6379, 7946, 8000, 8008, 8080, 8443, 8888, 9200, 20241, 27017, 47777
    ]

    private dockerContainers: Container[] = []
    private hostPorts: Port[] = []

    async scan(host: string = '127.0.0.1', ports: number[] = this.commonPorts): Promise<ServiceInfo[]> {
        const results: ServiceInfo[] = []
        let portsToScan = new Set<number>(ports);

        // Fetch Docker containers and Host ports if scanning localhost
        if (host === '127.0.0.1' || host === 'localhost') {
            try {
                const [containers, openPorts] = await Promise.all([
                    getDockerContainers(),
                    getOpenPorts()
                ])
                this.dockerContainers = containers
                this.hostPorts = openPorts

                // Add automatically detected ports to the scan list
                openPorts.forEach(p => portsToScan.add(p.port));
                containers.forEach(c => c.ports.forEach(p => {
                    if (p.public) portsToScan.add(p.public);
                }));
            } catch (error) {
                console.error('Error detecting local ports:', error);
            }
        }

        const sortedPorts = Array.from(portsToScan).sort((a, b) => a - b);

        // Increase concurrency for faster scanning
        const batchSize = 100
        for (let i = 0; i < sortedPorts.length; i += batchSize) {
            const batch = sortedPorts.slice(i, i + batchSize)
            const batchResults = await Promise.all(batch.map(port => this.checkPort(host, port)))
            results.push(...batchResults.filter(r => r.state === 'open'))
        }

        return results.filter(r => r.port !== 47777).sort((a, b) => a.port - b.port)
    }

    static generateRange(start: number, end: number): number[] {
        return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }

    private async checkPort(host: string, port: number): Promise<ServiceInfo> {
        return new Promise(async (resolve) => {
            const socket = new net.Socket()
            let status: 'open' | 'closed' = 'closed'
            let banner = ''

            // Check if port maps to Docker container
            const dockerInfo = this.findDockerContainer(port)
            // Check if port maps to Host process
            const processInfo = this.findHostProcess(port)

            // Shorter timeout for faster scanning
            socket.setTimeout(1000) // Increased slightly for banner wait

            socket.on('connect', async () => {
                status = 'open'

                // Identify service logic
                const info = await this.identifyService(host, port, socket)
                socket.destroy()

                resolve({
                    port,
                    state: status,
                    protocol: 'tcp',
                    service: info.service,
                    version: info.version,
                    banner: info.banner,
                    docker: dockerInfo,
                    process: processInfo
                })
            })

            socket.on('timeout', () => {
                socket.destroy()
                resolve({ port, state: 'closed', protocol: 'tcp' })
            })

            socket.on('error', () => {
                socket.destroy()
                resolve({ port, state: 'closed', protocol: 'tcp' })
            })

            socket.connect(port, host)
        })
    }

    private findDockerContainer(port: number): { id: string, image: string, name: string } | undefined {
        for (const container of this.dockerContainers) {
            const portMap = container.ports.find(p => p.public === port)
            if (portMap) {
                return {
                    id: container.id,
                    image: container.image,
                    name: container.name
                }
            }
        }
        return undefined
    }

    private findHostProcess(port: number): { name: string, pid: number } | undefined {
        const p = this.hostPorts.find(hp => hp.port === port)
        if (p && p.process && p.pid) {
            return {
                name: p.process,
                pid: p.pid
            }
        }
        return undefined
    }

    private async identifyService(host: string, port: number, socket: net.Socket): Promise<{ service: string, version?: string, banner?: string }> {
        // 0. Known Port Map
        const knownPorts: { [key: number]: string } = {
            21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS',
            631: 'CUPS (IPP)', 3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis',
            27017: 'MongoDB', 2377: 'Docker Swarm (Mgmt)', 7946: 'Docker Swarm (Node)',
            47777: 'LocalRun Helper'
        }

        // 1. Check if it's HTTP
        try {
            const httpInfo = await this.checkHttp(host, port)
            if (httpInfo) return httpInfo
        } catch (e) { }

        // 2. Banner Grabbing for unknown/generic TCP services
        // We listen for data for a short time
        const banner = await this.grabBanner(socket)
        if (banner) {
            if (banner.startsWith('SSH-')) return { service: 'SSH', version: banner.trim(), banner }
            if (banner.startsWith('220')) return { service: 'FTP/SMTP', banner: banner.trim() }
            if (banner.includes('mysql_native_password')) return { service: 'MySQL', banner: banner.trim() }

            // If we have a banner but don't recognize it, return generic with banner
            return { service: knownPorts[port] || 'Unknown (TCP)', banner: banner.trim().substring(0, 50) }
        }

        // 3. Fallback to known port map
        if (knownPorts[port]) return { service: knownPorts[port] }

        return { service: 'Unknown' }
    }

    private grabBanner(socket: net.Socket): Promise<string> {
        return new Promise((resolve) => {
            let data = ''
            const listener = (chunk: Buffer) => {
                data += chunk.toString()
                // If we got something, clear timeout and resolve
                if (data.length > 0) {
                    resolve(data)
                }
            }

            socket.on('data', listener)

            // Wait max 500ms for a banner
            setTimeout(() => {
                socket.removeListener('data', listener)
                resolve(data)
            }, 500)
        })
    }

    private checkHttp(host: string, port: number): Promise<{ service: string, version?: string, banner?: string } | null> {
        return new Promise((resolve) => {
            const req = http.get(`http://${host}:${port}`, { timeout: 1000 }, (res) => {
                let data = ''
                res.on('data', (chunk) => data += chunk)
                res.on('end', () => {
                    // Try to extract title
                    const titleMatch = data.match(/<title>(.*?)<\/title>/i)
                    const title = titleMatch ? titleMatch[1] : ''
                    const server = res.headers['server'] || res.headers['x-powered-by']

                    // Framework detection heuristics
                    let framework = ''
                    if (server?.includes('uvicorn') || server?.includes('hypercorn')) framework = 'FastAPI'
                    if (server?.includes('Werkzeug')) framework = 'Flask'
                    if (server?.includes('Express')) framework = 'Express'
                    if (res.headers['set-cookie']?.some(c => c.includes('laravel'))) framework = 'Laravel'
                    if (data.includes('Laravel')) framework = 'Laravel'

                    resolve({
                        service: 'HTTP',
                        version: framework || String(server || ''),
                        banner: title.substring(0, 50)
                    })
                })
            })

            req.on('error', () => resolve(null))
            req.on('timeout', () => {
                req.destroy()
                resolve(null)
            })
        })
    }
}
