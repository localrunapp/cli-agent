import { Command } from '@oclif/core'
import { existsSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import chalk from 'chalk'

export default class Install extends Command {
  static description = 'Install LocalRun Agent as system service (LaunchAgent)'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    this.log(chalk.blue('📦 Installing LocalRun Agent...'))

    try {
      const configDir = join(homedir(), '.localrun')
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true })
        this.log(chalk.green('✓') + ' Configuration directory created')
      }

      let binaryPath = execSync('which localrun', { encoding: 'utf-8' }).trim()

      // Resolve symlinks recursively (macOS compatible)
      let resolvedPath = binaryPath
      while (existsSync(resolvedPath)) {
        try {
          const linkTarget = execSync(`readlink "${resolvedPath}"`, { encoding: 'utf-8' }).trim()
          if (!linkTarget) break

          // Handle relative paths
          if (linkTarget.startsWith('/')) {
            resolvedPath = linkTarget
          } else {
            const dir = execSync(`dirname "${resolvedPath}"`, { encoding: 'utf-8' }).trim()
            resolvedPath = join(dir, linkTarget)
          }
        } catch {
          break // Not a symlink
        }
      }
      binaryPath = resolvedPath

      // Get node path
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()

      // Detect platform
      if (process.platform === 'linux') {
        // Linux Systemd Service
        const systemdDir = join(homedir(), '.config', 'systemd', 'user')
        if (!existsSync(systemdDir)) {
          mkdirSync(systemdDir, { recursive: true })
        }

        const servicePath = join(systemdDir, 'localrun-agent.service')
        const serviceContent = `[Unit]
Description=LocalRun Agent
After=network.target

[Service]
ExecStart=${nodePath} ${binaryPath} serve --port 47777
Restart=always
RestartSec=10
StandardOutput=append:${homedir()}/.localrun/agent.log
StandardError=append:${homedir()}/.localrun/agent.log
Environment=PATH=${process.env.PATH}

[Install]
WantedBy=default.target
`
        writeFileSync(servicePath, serviceContent)
        this.log(chalk.green('✓') + ` Systemd service installed at ${servicePath}`)

        this.log('')
        this.log(chalk.blue('To enable and start the service:'))
        this.log(chalk.white('  systemctl --user daemon-reload'))
        this.log(chalk.white('  systemctl --user enable --now localrun-agent'))
        this.log('')
      } else {
        // macOS LaunchAgent
        const plistPath = join(homedir(), 'Library', 'LaunchAgents', 'com.localrun.agent.plist')
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.localrun.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${binaryPath}</string>
        <string>serve</string>
        <string>--port</string>
        <string>47777</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${homedir()}/Library/Logs/localrun-agent.log</string>
    <key>StandardErrorPath</key>
    <string>${homedir()}/Library/Logs/localrun-agent.log</string>
    <key>WorkingDirectory</key>
    <string>${homedir()}</string>
</dict>
</plist>
`

        // Asegurar que el directorio existe
        const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
        if (!existsSync(launchAgentsDir)) {
          mkdirSync(launchAgentsDir, { recursive: true })
        }

        writeFileSync(plistPath, plistContent)
        this.log(chalk.green('✓') + ` LaunchAgent installed at ${plistPath}`)

        this.log('')
        this.log(chalk.blue('To start the service:'))
        this.log(chalk.white('  localrun start'))
        this.log('')
      }
    } catch (error) {
      this.error(chalk.red('✗ Error installing service: ') + (error as Error).message)
    }
  }
}
