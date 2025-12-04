import {Command} from '@oclif/core'
import {homedir} from 'os'
import {join} from 'path'
import {existsSync} from 'fs'
import {execSync} from 'child_process'
import chalk from 'chalk'

export default class Stop extends Command {
  static description = 'Stop LocalRun Agent service'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.localrun.agent.plist')

    if (!existsSync(plistPath)) {
      this.error(chalk.red('✗ Service not installed.'))
    }

    try {
      execSync(`launchctl unload "${plistPath}"`, {stdio: 'pipe'})
      this.log(chalk.green('✓') + ' LocalRun Agent stopped')
    } catch (error: any) {
      if (error.message.includes('Could not find')) {
        this.warn('⚠️  Service not running')
      } else {
        this.error(chalk.red('✗ Error stopping: ') + error.message)
      }
    }
  }
}
