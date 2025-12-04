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

      // Detect platform
      if (process.platform === 'linux') {
        // Always use system-wide service
        const servicePath = '/etc/systemd/system/localrun-agent.service'
        const serviceContent = `[Unit]
Description=LocalRun Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=${binaryPath} serve --port 47777
Restart=always
RestartSec=10
StandardOutput=append:/var/log/localrun-agent.log
StandardError=append:/var/log/localrun-agent.log
Environment=PATH=${process.env.PATH}

[Install]
WantedBy=multi-user.target
`
        writeFileSync(servicePath, serviceContent)
        this.log(chalk.green('✓') + ` System service installed at ${servicePath}`)

        // Reload, enable and start service automatically
        this.log(chalk.blue('🔄 Reloading systemd...'))
        execSync('systemctl daemon-reload', { stdio: 'inherit' })
        
        this.log(chalk.blue('🔧 Enabling and starting service...'))
        execSync('systemctl enable --now localrun-agent', { stdio: 'inherit' })
        
        this.log(chalk.green('✓ LocalRun Agent service is now running!'))
        this.log('')
        this.log(chalk.blue('Service commands:'))
        this.log(chalk.white('  systemctl status localrun-agent   # Check status'))
        this.log(chalk.white('  systemctl stop localrun-agent     # Stop service'))
        this.log(chalk.white('  systemctl restart localrun-agent  # Restart service'))
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

        // Load and start the LaunchAgent automatically
        this.log(chalk.blue('🔧 Loading and starting LaunchAgent...'))
        try {
          // Unload first in case it was already loaded
          execSync('launchctl unload ~/Library/LaunchAgents/com.localrun.agent.plist 2>/dev/null || true', { stdio: 'inherit' })
          // Load and start
          execSync('launchctl load ~/Library/LaunchAgents/com.localrun.agent.plist', { stdio: 'inherit' })
          
          this.log(chalk.green('✓ LocalRun Agent service is now running!'))
          this.log('')
          this.log(chalk.blue('Service commands:'))
          this.log(chalk.white('  localrun status    # Check status'))
          this.log(chalk.white('  localrun stop      # Stop service'))
          this.log(chalk.white('  localrun start     # Start service'))
          this.log('')
        } catch (error) {
          this.log(chalk.yellow('⚠️  LaunchAgent installed but failed to start automatically'))
          this.log(chalk.blue('To start manually: ') + chalk.white('localrun start'))
          this.log('')
        }
      }
    } catch (error) {
      this.error(chalk.red('✗ Error installing service: ') + (error as Error).message)
    }
  }
}
