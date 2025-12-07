import { execSync } from 'child_process'
import { hostname, platform, arch, totalmem, freemem, cpus, uptime } from 'os'

export interface HostInfo {
  hostname: string
  platform: string
  arch: string
  cpus: number
  totalMemory: number
  freeMemory: number
  uptime: number
  username: string
  localIP: string
}

export async function getHostInfo(): Promise<HostInfo> {
  let localIP = '127.0.0.1'

  try {
    // Use Node.js built-in networkInterfaces to get private IP
    const { networkInterfaces } = require('os')
    const interfaces = networkInterfaces()

    // Priority order: look for common interface names first
    const priorityInterfaces = ['en0', 'eth0', 'en1', 'wlan0', 'Wi-Fi', 'Ethernet']

    // First try priority interfaces
    for (const ifaceName of priorityInterfaces) {
      if (interfaces[ifaceName]) {
        for (const iface of interfaces[ifaceName]) {
          // IPv4, not internal, not loopback
          if (iface.family === 'IPv4' && !iface.internal) {
            localIP = iface.address
            break
          }
        }
        if (localIP !== '127.0.0.1') break
      }
    }

    // If still not found, scan all interfaces
    if (localIP === '127.0.0.1') {
      for (const ifaceName of Object.keys(interfaces)) {
        for (const iface of interfaces[ifaceName]) {
          // IPv4, not internal, private IP range
          if (iface.family === 'IPv4' && !iface.internal) {
            const addr = iface.address
            // Check if it's a private IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (addr.startsWith('192.168.') || addr.startsWith('10.') ||
              (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)) {
              localIP = addr
              break
            }
          }
        }
        if (localIP !== '127.0.0.1') break
      }
    }
  } catch (error) {
    console.error('Error detecting network IP:', error)
    // Fallback to 127.0.0.1
  }

  let username = 'unknown'
  try {
    username = execSync('whoami', { encoding: 'utf-8' }).trim()
  } catch {
    // Fallback
  }

  return {
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    cpus: cpus().length,
    totalMemory: totalmem(),
    freeMemory: freemem(),
    uptime: uptime(),
    username,
    localIP,
  }
}
