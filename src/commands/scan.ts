import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import { Scanner } from '../lib/scanner'

export default class Scan extends Command {
    static description = 'Scan ports on a target host'

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --ip 192.168.1.10',
    ]

    static flags = {
        ip: Flags.string({ char: 'i', description: 'Target IP address to scan', default: '127.0.0.1' }),
        range: Flags.string({ char: 'r', description: 'Port range (e.g. 1-1000)', exclusive: ['all'] }),
        all: Flags.boolean({ char: 'a', description: 'Scan all ports (1-65535)', exclusive: ['range'] }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(Scan)
        const targetIp = flags.ip

        let ports: number[] = []

        if (flags.all) {
            this.log(chalk.yellow('Scanning ALL ports (1-65535). This may take a while...'))
            ports = Scanner.generateRange(1, 65535)
        } else if (flags.range) {
            const [start, end] = flags.range.split('-').map(Number)
            if (isNaN(start) || isNaN(end) || start > end) {
                this.error('Invalid range format. Use start-end (e.g. 1-1000)')
            }
            this.log(`Scanning range: ${start}-${end}...`)
            ports = Scanner.generateRange(start, end)
        } else {
            // Default common ports + expanded list based on user feedback
            // We'll let the scanner use its default common ports, but we should probably expand that list in the scanner class too
            // For now, let's use the default behavior of the scanner which uses commonPorts
            // But wait, we need to pass undefined to use default? Or just not pass it?
            // The scanner.scan signature is scan(host, ports).
            // If we don't pass ports, it uses default.
        }

        this.log(`Scanning target: ${chalk.blue(targetIp)}...`)

        const scanner = new Scanner()

        try {
            const results = await scanner.scan(targetIp, ports.length > 0 ? ports : undefined)

            if (results.length === 0) {
                this.log(chalk.yellow('No open ports found.'))
                return
            }

            this.log(chalk.green(`\nFound ${results.length} open ports:`))

            // Simple table output
            this.log(chalk.bold('PORT\tPROTOCOL\tSTATE\tSERVICE\tVERSION\t\tPROCESS\t\tDOCKER'))
            results.forEach(r => {
                const dockerInfo = r.docker ? `${r.docker.image} (${r.docker.name})` : ''
                const processInfo = r.process ? `${r.process.name} (${r.process.pid})` : ''
                this.log(`${r.port}\t${r.protocol.toUpperCase()}\t\t${chalk.green(r.state)}\t${r.service || 'Unknown'}\t${r.version || ''}\t\t${chalk.yellow(processInfo)}\t\t${chalk.cyan(dockerInfo)}`)
            })

        } catch (error) {
            this.error('Scan failed: ' + (error as Error).message)
        }
    }
}
