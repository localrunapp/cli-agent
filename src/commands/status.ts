import {Command} from '@oclif/core'
import {homedir} from 'os'
import {join} from 'path'
import {existsSync, readFileSync} from 'fs'
import {execSync} from 'child_process'
import chalk from 'chalk'

export default class Status extends Command {
  static description = 'View LocalRun Agent service status'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.localrun.agent.plist')

    this.log('')
    this.log(chalk.bold('LocalRun Agent Status'))
    this.log(chalk.gray('─'.repeat(50)))
    this.log('')

    const isInstalled = existsSync(plistPath)
    this.log(`Installed:    ${isInstalled ? chalk.green('✓ Yes') : chalk.red('✗ No')}`)

    if (!isInstalled) {
      this.log('')
      this.log(chalk.yellow('Run: localrun install'))
      return
    }

    // Check if running
    try {
      const result = execSync('launchctl list', {encoding: 'utf-8'})
      const isRunning = result.includes('com.localrun.agent')
      this.log(`Status:       ${isRunning ? chalk.green('✓ Running') : chalk.yellow('⚠ Stopped')}`)

      const configPath = join(homedir(), '.localrun', 'agent.json')
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        this.log(`Port:         ${chalk.blue(config.port || 47777)}`)
        this.log(`Version:      ${chalk.blue(this.config.version)}`)
        if (config.started_at) {
          this.log(`Started:      ${chalk.gray(new Date(config.started_at).toLocaleString())}`)
        }
      }

      // Check connectivity
      if (isRunning) {
        try {
          const configPath = join(homedir(), '.localrun', 'agent.json')
          let port = 47777
          if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'))
            port = config.port || 47777
          }

          execSync(`curl -s http://localhost:${port}/api/ping > /dev/null`, {timeout: 2000})
          this.log(`Health:       ${chalk.green('✓ OK')}`)
          this.log(`URL:          ${chalk.blue(`http://localhost:${port}`)}`)
        } catch {
          this.log(`Health:       ${chalk.yellow('⚠ Not responding')}`)
        }
      }

      this.log('')
      this.log(chalk.gray('Log file: ~/Library/Logs/localrun-agent.log'))
    } catch (error) {
      this.error(chalk.red('Error checking status: ') + (error as Error).message)
    }

    this.log('')
  }
}
