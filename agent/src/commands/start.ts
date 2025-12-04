import {Command} from '@oclif/core'
import {homedir} from 'os'
import {join} from 'path'
import {existsSync, readFileSync} from 'fs'
import {execSync} from 'child_process'
import chalk from 'chalk'

export default class Start extends Command {
  static description = 'Start LocalRun Agent service'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.localrun.agent.plist')

    if (!existsSync(plistPath)) {
      this.error(chalk.red('✗ Service not installed. Run: localrun install'))
    }

    try {
      execSync(`launchctl load "${plistPath}"`, {stdio: 'pipe'})
      
      const configPath = join(homedir(), '.localrun', 'agent.json')
      let port = 47777
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        port = config.port || 47777
      }

      this.log(chalk.green('✓') + ' LocalRun Agent started')
      this.log(chalk.blue(`  Listening on: http://127.0.0.1:${port}`))
      this.log('')
      this.log('View logs: ' + chalk.white('localrun logs'))
    } catch (error: any) {
      if (error.message.includes('already loaded')) {
        this.warn('⚠️  Service already running')
      } else {
        this.error(chalk.red('✗ Error starting: ') + error.message)
      }
    }
  }
}
