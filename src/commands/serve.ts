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
    backend: Flags.string({ description: 'Backend IP/URL (e.g. 192.168.1.50)', default: 'localhost' }),
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
      wsUrl = `ws://${wsUrl}/ws/agent`
    }

    const app = express()
    app.use(express.json())

    // Store start time for uptime calculation
    const startTime = Date.now()

    // Health check endpoint
    app.get('/health', (req, res) => {
      const uptime = Math.floor((Date.now() - startTime) / 1000) // seconds
      res.json({
        status: 'ok',
        uptime,
        version: require('../../package.json').version,
        server_id: config.server_id || 'not-initialized',
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        timestamp: new Date().toISOString()
      })
    })

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
        started_at: new Date().toISOString(),
      }, null, 2))

      // Perform handshake before connecting
      this.performHandshakeAndConnect(wsUrl, config.server_id, backendInput)
    })
  }

  async performHandshakeAndConnect(wsUrl: string, serverId: string, backendHost: string) {
    try {
      // Construct HTTP URL from WebSocket URL
      const httpUrl = wsUrl
        .replace('ws://', 'http://')
        .replace('wss://', 'https://')
        .replace('/ws/agent', '')

      // Get system info for handshake
      const hostInfo = await getHostInfo()

      this.log(chalk.blue('ℹ') + ` Performing handshake with backend...`)

      // Call handshake endpoint
      const response = await fetch(`${httpUrl}/agent/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: serverId,
          agent_version: require('../../package.json').version,
          hostname: os.hostname()
        })
      })

      if (!response.ok) {
        throw new Error(`Handshake failed: ${response.status} ${response.statusText}`)
      }

      const handshakeResult = await response.json()

      this.log(chalk.green('✓') + ` Handshake status: ${handshakeResult.status}`)

      // Handle different handshake responses
      if (handshakeResult.status === 'id_mismatch') {
        // Localhost agent with old ID - update and reconnect
        this.log(chalk.yellow('!') + ` Server ID mismatch detected`)
        this.log(chalk.yellow('!') + ` Old ID: ${handshakeResult.old_id.substring(0, 8)}...`)
        this.log(chalk.yellow('!') + ` New ID: ${handshakeResult.server_id.substring(0, 8)}...`)
        this.log(chalk.blue('ℹ') + ` Updating local configuration...`)

        // Update config with new server ID
        const configPath = join(homedir(), '.localrun', 'agent.json')
        const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'))
        config.server_id = handshakeResult.server_id
        writeFileSync(configPath, JSON.stringify(config, null, 2))

        this.log(chalk.green('✓') + ` Configuration updated successfully`)

        // Reconnect with new ID
        serverId = handshakeResult.server_id

      } else if (handshakeResult.status === 'register_required') {
        // Remote agent with invalid ID - will register via WebSocket
        this.log(chalk.yellow('!') + ` Server not found in database`)
        this.log(chalk.blue('ℹ') + ` Will register as new server...`)
      } else if (handshakeResult.status === 'ok') {
        // All good - proceed
        this.log(chalk.green('✓') + ` Server validated: ${handshakeResult.message}`)
      }

      // Now connect to WebSocket with validated/updated ID
      this.connectToAgentControl(wsUrl, serverId)

      // Connect to Stats Channel
      const statsWsUrl = wsUrl.replace('/ws/agent', `/agent/servers/${serverId}/stats`)
      this.connectToStatsChannel(statsWsUrl, serverId)

      // Connect to Terminal Channel
      const terminalWsUrl = wsUrl.replace('/ws/agent', `/agent/servers/${serverId}/terminal`)
      this.connectToTerminalChannel(terminalWsUrl, serverId)

    } catch (error: any) {
      this.log(chalk.red('✗') + ` Handshake error: ${error.message}`)
      this.log(chalk.yellow('!') + ` Falling back to direct connection...`)

      // Fallback: connect anyway (for backwards compatibility)
      this.connectToAgentControl(wsUrl, serverId)
      const statsWsUrl = wsUrl.replace('/ws/agent', `/agent/servers/${serverId}/stats`)
      this.connectToStatsChannel(statsWsUrl, serverId)
      const terminalWsUrl = wsUrl.replace('/ws/agent', `/agent/servers/${serverId}/terminal`)
      this.connectToTerminalChannel(terminalWsUrl, serverId)
    }
  }

  connectToAgentControl(wsUrl: string, serverId: string) {
    const ws = new WebSocket(wsUrl)

    ws.on('open', async () => {
      this.log(chalk.green('\u2713') + ' Connected to Agent Control Channel')

      // Detect if connecting to localhost
      const isLocalhost = wsUrl.includes('localhost') ||
        wsUrl.includes('127.0.0.1') ||
        wsUrl.includes('::1')

      // Get local IP
      const hostInfo = await getHostInfo()

      // Register with server_id
      ws.send(JSON.stringify({
        type: 'register',
        server_id: serverId,
        is_localhost: isLocalhost,  // Tell backend if this is localhost
        local_ip: hostInfo.localIP,  // Send actual local IP
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

        if (message.type === 'config_update') {
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

              // Exit to let systemd/launchd restart us
              process.exit(0)
            }
          }
        } else if (message.type === 'registration_success') {
          this.log(chalk.green('\u2713') + ' Agent registered successfully')
        } else if (message.type === 'start_service_discovery') {
          this.log(chalk.blue('\u2139') + ' Starting service discovery...')
          this.runServiceDiscovery(ws, serverId)
        } else if (message.type === 'scan_request') {
          this.log(chalk.blue('\u2139') + ' Received scan request')
          const scanner = new Scanner()
          const results = await scanner.scan(message.target)
          ws.send(JSON.stringify({
            type: 'scan_result',
            results
          }))
        } else if (message.type === 'pong') {
          // Keepalive response
        }
      } catch (error) {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.log(chalk.red('\u2717') + ' Disconnected from Agent Control Channel. Reconnecting in 5s...')
      setTimeout(() => this.connectToAgentControl(wsUrl, serverId), 5000)
    })

    ws.on('error', (error) => {
      this.log(chalk.red('✗') + ` Control Channel Error: ${error.message}`)
    })
  }

  connectToStatsChannel(wsUrl: string, serverId: string) {
    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
      this.log(chalk.green('\u2713') + ' Connected to Stats Channel')

      // Send stats every 5 seconds
      const statsInterval = setInterval(async () => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(statsInterval)
          return
        }

        try {
          const stats = await this.getSystemStats(serverId)
          ws.send(JSON.stringify(stats))
        } catch (error: any) {
          this.log(chalk.red('\u2717') + ` Error getting stats: ${error.message}`)
        }
      }, 5000)

      // Send initial stats immediately
      this.getSystemStats(serverId).then(stats => {
        ws.send(JSON.stringify(stats))
      }).catch(error => {
        this.log(chalk.red('\u2717') + ` Error sending initial stats: ${error.message}`)
      })
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())
        if (message.type === 'error') {
          this.log(chalk.red('\u2717') + ` Stats Channel Error: ${message.message}`)
          this.log(chalk.yellow('!') + ' Server not registered. Waiting for control channel to re-register...')
          ws.close()
        }
      } catch (error) {
        // Ignore non-JSON messages
      }
    })

    ws.on('close', () => {
      this.log(chalk.red('\u2717') + ' Disconnected from Stats Channel. Reconnecting in 10s...')
      setTimeout(() => this.connectToStatsChannel(wsUrl, serverId), 10000)  // Wait longer for re-registration
    })

    ws.on('error', (error) => {
      this.log(chalk.red('\u2717') + ` Stats Channel Error: ${error.message}`)
    })
  }
  connectToTerminalChannel(wsUrl: string, serverId: string) {
    const ws = new WebSocket(wsUrl)
    let ptyProcess: any = null

    ws.on('open', () => {
      this.log(chalk.green('\u2713') + ' Connected to Terminal Channel')

      // Spawn shell on connection
      ptyProcess = this.spawnShell(ws)
    })

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.type === 'terminal_input') {
          if (ptyProcess) {
            ptyProcess.write(message.data)
          }
        } else if (message.type === 'terminal_resize') {
          if (ptyProcess) {
            ptyProcess.resize(message.cols, message.rows)
          }
        }
      } catch (error) {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.log(chalk.red('\u2717') + ' Disconnected from Terminal Channel. Reconnecting in 5s...')
      if (ptyProcess) {
        ptyProcess.kill()
        ptyProcess = null
      }
      setTimeout(() => this.connectToTerminalChannel(wsUrl, serverId), 5000)
    })

    ws.on('error', (error) => {
      this.log(chalk.red('\u2717') + ` Terminal Channel Error: ${error.message}`)
    })
  }

  spawnShell(ws: WebSocket) {
    // Detect user's default shell
    let shell: string = ''

    if (os.platform() === 'win32') {
      shell = 'powershell.exe'
    } else {
      // Robust shell detection for Unix-like systems
      const candidates = [
        process.env.SHELL,
        '/bin/bash',
        '/usr/bin/bash',
        '/bin/zsh',
        '/usr/bin/zsh',
        '/bin/sh',
        '/usr/bin/sh'
      ]

      for (const candidate of candidates) {
        if (candidate && require('fs').existsSync(candidate)) {
          shell = candidate
          break
        }
      }

      // Fallback if nothing found (unlikely)
      if (!shell) shell = '/bin/sh'
    }

    try {
      this.log(chalk.blue('ℹ') + ` Spawning terminal with shell: ${shell}`)

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || process.cwd(), // Fallback if HOME is not set
        env: process.env as any
      })

      ptyProcess.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal_output', data }))
        }
      })

      // Verification: Send immediate welcome message
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal_output',
          data: `\r\n\u001b[32m✔ LocalRun: Connected to ${shell}\u001b[0m\r\n`
        }))
      }

      // Handle process exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        this.log(chalk.yellow('!') + ` Shell exited with code ${exitCode}, signal ${signal}`)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'terminal_output',
            data: `\r\n[Process exited with code ${exitCode}]\r\n`
          }))
        }
      })

      return ptyProcess
    } catch (error: any) {
      this.log(chalk.red('✗') + ` Failed to spawn shell: ${error.message}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal_output',
          data: `\r\nError: Failed to spawn shell (${shell}): ${error.message}\r\n`
        }))
      }
      return null
    }
  }

  async startHeartbeat(serverId: string, backendUrl: string) {
    const sendHeartbeat = async () => {
      try {
        const stats = await this.getSystemStats(serverId)
        await fetch(`${backendUrl}/agent/heartbeat`, {
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
    const ioStats = await this.getDiskIOStats()

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
      disk_read_ops: ioStats.read_ops,
      disk_write_ops: ioStats.write_ops,
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

  async getDiskIOStats(): Promise<{ read_ops: number, write_ops: number }> {
    try {
      const { execSync } = require('child_process')
      const { platform } = require('os')

      if (platform() === 'darwin') {
        // macOS: usar iostat para obtener operaciones por segundo
        // -c 2 = 2 samples, usamos el segundo para datos actuales
        const output = execSync('iostat -d -c 2 -w 1 disk0', { timeout: 3000 }).toString()
        const lines = output.trim().split('\n')

        // La última línea contiene los datos actuales
        if (lines.length >= 3) {
          const parts = lines[lines.length - 1].split(/\s+/).filter((p: string) => p)
          // Format: KB/t tps MB/s
          // tps = transactions per second (total I/O operations)
          const tps = parseFloat(parts[1]) || 0

          // Aproximación: dividir entre lectura y escritura
          return {
            read_ops: Math.round(tps * 0.6),  // ~60% lecturas típicamente
            write_ops: Math.round(tps * 0.4)  // ~40% escrituras
          }
        }
      } else if (platform() === 'linux') {
        // Linux: leer /proc/diskstats
        // Formato: major minor name reads ... writes ...
        const output = execSync('cat /proc/diskstats | grep -E " (sda|nvme0n1|vda) "', { timeout: 1000 }).toString()
        const parts = output.trim().split(/\s+/)

        if (parts.length >= 8) {
          // Column 3: reads completed, Column 7: writes completed
          // Estos son contadores acumulativos, necesitamos calcular delta
          const reads = parseInt(parts[3], 10) || 0
          const writes = parseInt(parts[7], 10) || 0

          // Para obtener ops/s necesitaríamos guardar el valor anterior
          // Por ahora retornamos los valores absolutos (se pueden usar para calcular delta en el backend)
          return {
            read_ops: reads,
            write_ops: writes
          }
        }
      } else if (platform() === 'win32') {
        // Windows: usar typeperf para obtener operaciones por segundo
        const output = execSync(
          'typeperf "\\PhysicalDisk(_Total)\\Disk Reads/sec" "\\PhysicalDisk(_Total)\\Disk Writes/sec" -sc 1',
          { timeout: 3000 }
        ).toString()

        const lines = output.split('\n')
        if (lines.length >= 3) {
          const values = lines[2].split(',')
          return {
            read_ops: Math.round(parseFloat(values[1]?.replace(/"/g, '')) || 0),
            write_ops: Math.round(parseFloat(values[2]?.replace(/"/g, '')) || 0)
          }
        }
      }
    } catch (e) {
      // Silently fail and return zeros - I/O stats are optional
    }

    return { read_ops: 0, write_ops: 0 }
  }

  async runServiceDiscovery(ws: WebSocket, serverId: string) {
    try {
      const { Scanner } = require('../lib/scanner')
      const scanner = new Scanner()

      // Scan localhost common ports
      const results = await scanner.scan('127.0.0.1')

      if (results.length > 0) {
        this.log(chalk.green('✓') + ` Discovered ${results.length} services`)

        ws.send(JSON.stringify({
          type: 'service_discovery_result',
          server_id: serverId,
          data: results
        }))
      } else {
        this.log(chalk.yellow('⚠') + ' No services discovered')
      }
    } catch (error) {
      this.log(chalk.red('✗') + ' Service discovery failed: ' + (error as Error).message)
    }
  }
}
