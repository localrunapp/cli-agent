import { Command, Flags } from '@oclif/core'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import chalk from 'chalk'

export default class Logs extends Command {
  static description = 'View LocalRun Agent service logs'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -f',
  ]

  static flags = {
    follow: Flags.boolean({ char: 'f', description: 'Follow logs in real-time' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Logs)
    const logPath = join(homedir(), '.localrun', 'logs', 'agent.log')

    if (!existsSync(logPath)) {
      this.warn('⚠️  No logs available yet')
      return
    }

    if (flags.follow) {
      this.log(chalk.gray(`Following logs from ${logPath}...`))
      this.log(chalk.gray('Press Ctrl+C to exit'))
      this.log('')

      const tail = spawn('tail', ['-f', logPath])

      tail.stdout.on('data', (data) => {
        process.stdout.write(data)
      })

      tail.stderr.on('data', (data) => {
        process.stderr.write(data)
      })

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        tail.kill()
        this.log('')
        this.log(chalk.gray('Logs stopped'))
        process.exit(0)
      })
    } else {
      const cat = spawn('tail', ['-n', '50', logPath])

      cat.stdout.on('data', (data) => {
        process.stdout.write(data)
      })

      cat.on('close', () => {
        this.log('')
        this.log(chalk.gray(`Use -f to follow logs in real-time`))
      })
    }
  }
}
