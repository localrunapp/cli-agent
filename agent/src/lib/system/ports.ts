import {execSync} from 'child_process'

export interface Port {
  port: number
  protocol: string
  process?: string
  pid?: number
}

export async function getOpenPorts(): Promise<Port[]> {
  try {
    const output = execSync('lsof -iTCP -sTCP:LISTEN -n -P', {encoding: 'utf-8'})
    const lines = output.split('\n').slice(1) // Skip header
    const ports: Port[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split(/\s+/)
      if (parts.length < 9) continue

      const process = parts[0]
      const pid = parseInt(parts[1], 10)
      const portInfo = parts[8]

      const match = portInfo.match(/:(\d+)$/)
      if (match) {
        const port = parseInt(match[1], 10)
        
        if (!ports.some(p => p.port === port)) {
          ports.push({
            port,
            protocol: 'tcp',
            process,
            pid,
          })
        }
      }
    }

    return ports.sort((a, b) => a.port - b.port)
  } catch (error) {
    console.error('Error getting ports:', error)
    return []
  }
}
