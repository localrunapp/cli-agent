import { Command, Flags } from '@oclif/core'
import fetch from 'node-fetch'
import { join } from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'

export default class AppUpdate extends Command {
    static description = 'Update LocalRun Application Containers'

    static flags = {
        host: Flags.string({ char: 'h', description: 'Agent host', default: 'localhost' }),
        port: Flags.integer({ char: 'p', description: 'Agent port', default: 47777 }),
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(AppUpdate)
        const agentUrl = `http://${flags.host}:${flags.port}/api/update`
        const projectPath = process.cwd()

        // Check if update.sh exists in current directory
        if (!existsSync(join(projectPath, 'update.sh'))) {
            this.error(`update.sh not found in ${projectPath}. Please run this command from the root of your LocalRun project.`)
        }

        this.log(chalk.blue(`Requesting update via Agent at ${agentUrl}...`))

        try {
            const response = await fetch(agentUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: projectPath }),
            })

            if (!response.ok) {
                const error = await response.json() as any
                throw new Error(error.error || response.statusText)
            }

            const result = await response.json() as any
            this.log(chalk.green('Update initiated successfully!'))
            this.log('Output:')
            console.log(result.stdout)

            if (result.stderr) {
                console.error(chalk.yellow('Stderr:'))
                console.error(result.stderr)
            }

        } catch (error) {
            this.error(chalk.red(`Failed to update: ${(error as Error).message}`))
        }
    }
}
