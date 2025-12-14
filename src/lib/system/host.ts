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

    // Interfaces to exclude (Docker, VPN, virtual)
    const excludePatterns = [
      'docker', 'veth', 'br-', 'virbr', 'vmnet', 'vboxnet',
      'utun', 'awdl', 'llw', 'bridge', 'tun', 'tap'
    ]

    // Priority order: physical network interfaces first
    const priorityInterfaces = [
      'wlp3s0',    // Linux WiFi (common naming)
      'eth0',      // Linux Ethernet
      'enp',       // Linux Ethernet (predictable naming)
      'wlan0',     // Linux WiFi (older naming)
      'en0',       // macOS WiFi/Ethernet
      'en1',       // macOS secondary
      'Wi-Fi',     // Windows WiFi
      'Ethernet'   // Windows Ethernet
    ]

    // Helper to check if interface should be excluded
    const shouldExclude = (ifaceName: string): boolean => {
      const lowerName = ifaceName.toLowerCase()
      return excludePatterns.some(pattern => lowerName.includes(pattern))
    }

    // First try priority interfaces (physical network)
    for (const ifaceName of priorityInterfaces) {
      // Check exact match or starts with (for enp*, wlp*, etc)
      const matchingIfaces = Object.keys(interfaces).filter(name =>
        name === ifaceName || name.startsWith(ifaceName)
      )

      for (const name of matchingIfaces) {
        if (shouldExclude(name)) continue

        for (const iface of interfaces[name]) {
          // IPv4, not internal, not loopback
          if (iface.family === 'IPv4' && !iface.internal) {
            const addr = iface.address
            // Verify it's a private IP
            if (addr.startsWith('192.168.') || addr.startsWith('10.') ||
              (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)) {
              localIP = addr
              break
            }
          }
        }
        if (localIP !== '127.0.0.1') break
      }
      if (localIP !== '127.0.0.1') break
    }

    // If still not found, scan all interfaces (excluding Docker/virtual)
    if (localIP === '127.0.0.1') {
      for (const ifaceName of Object.keys(interfaces)) {
        // Skip excluded interfaces
        if (shouldExclude(ifaceName)) continue

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
