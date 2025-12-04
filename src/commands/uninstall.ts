import {Command} from '@oclif/core'
import {homedir} from 'os'
import {join} from 'path'
import {existsSync, unlinkSync} from 'fs'
import {execSync} from 'child_process'
import chalk from 'chalk'

export default class Uninstall extends Command {
  static description = 'Uninstall LocalRun Agent from system'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.localrun.agent.plist')

    if (!existsSync(plistPath)) {
      this.warn('⚠️  Service not installed')
      return
    }

    try {
      try {
        execSync(`launchctl unload "${plistPath}"`, {stdio: 'pipe'})
        this.log(chalk.green('✓') + ' Service stopped')
      } catch {
        // Ignore if not running
      }

      unlinkSync(plistPath)
      this.log(chalk.green('✓') + ' LaunchAgent removed')

      this.log('')
      this.log(chalk.green('✨ LocalRun Agent uninstalled successfully'))
      this.log('')
      this.log(chalk.gray('Note: Config files in ~/.localrun remain'))
      this.log(chalk.gray('      Remove them manually if desired'))
    } catch (error) {
      this.error(chalk.red('✗ Error uninstalling: ') + (error as Error).message)
    }
  }
}
