import { Command, Flags } from '@oclif/core'
import express from 'express'
import { homedir } from 'os'
import { join } from 'path'
import { writeFileSync } from 'fs'
import chalk from 'chalk'
import { getHostInfo } from '../lib/system/host'
import { getOpenPorts } from '../lib/system/ports'
import { getProcesses } from '../lib/system/processes'
import { getDockerContainers } from '../lib/system/docker'
import WebSocket = require('ws')
import * as pty from 'node-pty'
import * as os from 'os'
import { Scanner } from '../lib/scanner'

export default class Serve extends Command {
  static description = 'Start agent HTTP server (used by LaunchAgent)'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --port 47777',
  ]

  static flags = {
    port: Flags.integer({ char: 'p', description: 'Server port', default: 47777 }),
    host: Flags.string({ char: 'h', description: 'Server host', default: '127.0.0.1' }),
    backend: Flags.string({ description: 'Backend IP/URL (e.g. 192.168.1.50)' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Serve)
    const DEFAULT_BACKEND = 'localhost'

    // Load config early to determine URL
    const configPath = join(homedir(), '.localrun', 'agent.json')
    let config: any = {}
    try {
      if (require('fs').existsSync(configPath)) {
        config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'))
      }
    } catch (e) { }

    // Determine raw backend value: Flag > Config > Default
    let backendInput = flags.backend || config.backend_host || DEFAULT_BACKEND

    // Construct full WebSocket URL
    let wsUrl = backendInput
    if (!wsUrl.includes('://')) {
      // If no protocol, assume it's a host/ip
      // Check for port
      if (!wsUrl.includes(':')) {
        wsUrl = `${wsUrl}:8000`
      }
      wsUrl = `ws://${wsUrl}/ws/terminal/agent`
    }

    const app = express()
    app.use(express.json())
    // ... (middleware and routes unchanged) ...
    app.listen(flags.port, flags.host, () => {
      this.log(chalk.green('✓') + ` LocalRun Agent listening on ${chalk.blue(`http://${flags.host}:${flags.port}`)}`)
      this.log(chalk.green('✓') + ` Backend URL: ${chalk.blue(wsUrl)}`)

      // Generate persistent server_id if missing
      if (!config.server_id) {
        config.server_id = require('crypto').randomUUID()
      }

      writeFileSync(configPath, JSON.stringify({
        ...config,
        server_id: config.server_id,
        backend_host: backendInput, // Save the raw input (IP/Host)
        port: flags.port,
        version: this.config.version,
        pid: process.pid,
        started_at: new Date().toISOString(),
      }, null, 2))

      // Start heartbeat
      this.startHeartbeat(config.server_id)

      // Connect to Terminal Backend
      this.connectToTerminalBackend(wsUrl, config.server_id)
    })
  }

  connectToTerminalBackend(wsUrl: string, serverId: string) {
    const ws = new WebSocket(wsUrl)
    let ptyProcess: any = null

    ws.on('open', () => {
      this.log(chalk.green('✓') + ' Connected to Terminal Backend')

      // Register with server_id
      ws.send(JSON.stringify({
        type: 'register',
        server_id: serverId,
        system_info: {
          hostname: os.hostname(),
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
        }
      }))
    })

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.type === 'terminal_input') {
          if (!ptyProcess) {
            ptyProcess = this.spawnShell(ws)
          }
          ptyProcess.write(message.data)
        } else if (message.type === 'terminal_resize') {
          if (ptyProcess) {
            ptyProcess.resize(message.cols, message.rows)
          }
        } else if (message.type === 'config_update') {
          // Handle config update (e.g. server_id assignment)
          if (message.config && message.config.server_id) {
            const configPath = join(homedir(), '.localrun', 'agent.json')
            let config: any = {}
            try {
              if (require('fs').existsSync(configPath)) {
                config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'))
              }
            } catch (e) { }

            if (config.server_id !== message.config.server_id) {
              this.log(chalk.yellow('! Server ID updated by backend. Updating config and restarting...'))
              config.server_id = message.config.server_id
              writeFileSync(configPath, JSON.stringify(config, null, 2))
              process.exit(0) // Restart service (managed by systemd/launchd)
            }
          }
        } else if (message.type === 'scan_request') {
          this.log(chalk.blue('ℹ') + ' Received scan request')
          const scanner = new Scanner()
          // If target is provided, scan specific host, otherwise scan local network
          const results = await scanner.scan(message.target)
          ws.send(JSON.stringify({
            type: 'scan_result',
            results
          }))
        }
      } catch (error) {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.log(chalk.red('✗') + ' Disconnected from Terminal Backend. Reconnecting in 5s...')
      if (ptyProcess) {
        ptyProcess.kill()
        ptyProcess = null
      }
      setTimeout(() => this.connectToTerminalBackend(wsUrl, serverId), 5000)
    })

    ws.on('error', (error) => {
      this.log(chalk.red('✗') + ` WebSocket Error: ${error.message}`)
    })
  }

  spawnShell(ws: WebSocket) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env as any
    })

    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal_output', data }))
      }
    })

    return ptyProcess
  }

  async startHeartbeat(serverId: string) {
    const sendHeartbeat = async () => {
      try {
        const stats = await this.getSystemStats(serverId)
        await fetch('http://localhost:8000/agent/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stats),
        })
      } catch (error) {
        // Silent error to avoid log spam
      }
    }

    // Send immediately then every 5s
    sendHeartbeat()
    setInterval(sendHeartbeat, 5000)
  }

  async getSystemStats(serverId: string) {
    const hostInfo = await getHostInfo()
    const cpuPercent = await this.getCpuUsage()
    const diskInfo = this.getDiskInfo()
    const memInfo = await this.getMemoryUsage()

    return {
      server_id: serverId,
      os_name: hostInfo.platform === 'darwin' ? 'macOS' : hostInfo.platform,
      os_version: require('os').release(), // Kernel version
      cpu_cores: hostInfo.cpus,
      cpu_percent: cpuPercent,
      memory_gb: memInfo.gb,
      memory_percent: memInfo.percent,
      disk_gb: Number(diskInfo.totalGb.toFixed(2)),
      disk_percent: Number(diskInfo.percent.toFixed(2)),
      local_ip: hostInfo.localIP,
      timestamp: new Date().toISOString(),
    }
  }

  async getMemoryUsage(): Promise<{ gb: number, percent: number }> {
    const { platform, totalmem, freemem } = require('os')

    if (platform() === 'darwin') {
      try {
        const { execSync } = require('child_process')
        const output = execSync('vm_stat').toString()
        const lines = output.split('\n')

        let pageSize = 4096 // Default fallback
        const pageSizeMatch = lines[0].match(/page size of (\d+) bytes/)
        if (pageSizeMatch) {
          pageSize = parseInt(pageSizeMatch[1], 10)
        }

        let active = 0
        let wired = 0
        let compressed = 0

        for (const line of lines) {
          if (line.includes('Pages active:')) active = parseInt(line.split(':')[1].trim().replace('.', ''), 10)
          if (line.includes('Pages wired down:')) wired = parseInt(line.split(':')[1].trim().replace('.', ''), 10)
          if (line.includes('Pages occupied by compressor:')) compressed = parseInt(line.split(':')[1].trim().replace('.', ''), 10)
        }

        const usedBytes = (active + wired + compressed) * pageSize
        const totalBytes = totalmem()

        return {
          gb: Number((usedBytes / (1024 * 1024 * 1024)).toFixed(2)),
          percent: Number(((usedBytes / totalBytes) * 100).toFixed(2))
        }
      } catch (e) {
        // Fallback to standard if vm_stat fails
      }
    }

    // Default Linux/Windows behavior
    const total = totalmem()
    const free = freemem()
    const used = total - free
    return {
      gb: Number((used / (1024 * 1024 * 1024)).toFixed(2)),
      percent: Number(((used / total) * 100).toFixed(2))
    }
  }

  getDiskInfo() {
    try {
      const { execSync } = require('child_process')
      const { platform } = require('os')

      if (platform() === 'win32') {
        // Windows implementation using wmic
        const output = execSync('wmic logicaldisk get size,freespace,caption').toString()
        const lines = output.trim().split('\n')

        let totalBytes = 0
        let freeBytes = 0

        // Skip header and parse lines
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue

          // Format: Caption FreeSpace Size
          // Example: C: 100000 200000
          const parts = line.split(/\s+/)
          if (parts.length >= 3) {
            // wmic output is usually: Caption FreeSpace Size
            // But we need to be careful with column order if we didn't specify format csv
            // The command 'wmic logicaldisk get size,freespace,caption' output order depends on implementation but usually alphabetical columns?
            // Actually wmic output is fixed width usually.
            // Let's use a safer command: wmic logicaldisk where "DeviceID='C:'" get FreeSpace,Size /value

            // Simpler approach for C: drive which is usually the main one
            try {
              const cDrive = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size /value').toString()
              // Output format:
              // FreeSpace=12345
              // Size=67890

              const freeMatch = cDrive.match(/FreeSpace=(\d+)/)
              const sizeMatch = cDrive.match(/Size=(\d+)/)

              if (freeMatch && sizeMatch) {
                const free = parseInt(freeMatch[1], 10)
                const size = parseInt(sizeMatch[1], 10)
                const used = size - free

                const totalGb = size / (1024 * 1024 * 1024)
                const percent = (used / size) * 100

                return {
                  totalGb: Number(totalGb.toFixed(2)),
                  percent: Number(percent.toFixed(2))
                }
              }
            } catch (e) {
              // Fallback or ignore
            }
          }
        }
        return { totalGb: 0, percent: 0 }
      }

      // On macOS, check /System/Volumes/Data for actual user disk usage
      let cmd = 'df -k /'
      if (platform() === 'darwin') {
        cmd = 'df -k /System/Volumes/Data'
      }

      const output = execSync(cmd).toString()
      const lines = output.trim().split('\n')
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/)
        // Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on
        if (parts.length >= 5) {
          const totalKb = parseInt(parts[1], 10)
          const capacityStr = parts[4] // "58%"
          const percent = parseInt(capacityStr.replace('%', ''), 10)
          const totalGb = totalKb / (1024 * 1024)
          return {
            totalGb: Number(totalGb.toFixed(2)),
            percent
          }
        }
      }
    } catch {
      // Fallback
    }
    return { totalGb: 0, percent: 0 }
  }

  async getCpuUsage(): Promise<number> {
    const { cpus } = require('os')
    const startCpus = cpus()

    await new Promise(resolve => setTimeout(resolve, 500))

    const endCpus = cpus()
    let idle = 0
    let total = 0

    for (let i = 0; i < startCpus.length; i++) {
      const start = startCpus[i].times
      const end = endCpus[i].times

      const startTotal = start.user + start.nice + start.sys + start.idle + start.irq
      const endTotal = end.user + end.nice + end.sys + end.idle + end.irq

      const startIdle = start.idle
      const endIdle = end.idle

      total += endTotal - startTotal
      idle += endIdle - startIdle
    }

    return Number((100 - (idle / total) * 100).toFixed(2))
  }
}
