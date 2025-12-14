import { execSync } from 'child_process'
import { hostname, platform, arch, totalmem, freemem, cpus, uptime, networkInterfaces } from 'os'

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
    const interfaces = networkInterfaces()

    // Interfaces to exclude (Docker, VPN, virtual)
    const excludePatterns = [
      'docker', 'veth', 'br-', 'virbr', 'vmnet', 'vboxnet',
      'utun', 'awdl', 'llw', 'bridge', 'tun', 'tap', 'cni', 'flannel'
    ]

    // Priority order: physical network interfaces first
    const priorityInterfaces = [
      'wlp',       // Linux WiFi
      'eth',       // Linux Ethernet
      'enp',       // Linux Ethernet
      'wlan',      // Linux WiFi
      'en',        // macOS WiFi/Ethernet
      'Wi-Fi',     // Windows WiFi
      'Ethernet'   // Windows Ethernet
    ]

    // Helper to check if interface should be excluded
    const shouldExclude = (ifaceName: string): boolean => {
      const lowerName = ifaceName.toLowerCase()
      // Always exclude if matches pattern
      if (excludePatterns.some(pattern => lowerName.includes(pattern))) return true
      return false
    }

    let found = false

    // 1. Try priority interfaces first
    for (const priority of priorityInterfaces) {
      const matchingNames = Object.keys(interfaces).filter(name =>
        name.toLowerCase().startsWith(priority.toLowerCase())
      )

      for (const name of matchingNames) {
        if (shouldExclude(name)) continue

        for (const iface of interfaces[name] || []) {
          // IPv4, not internal
          if (iface.family === 'IPv4' && !iface.internal) {
            const addr = iface.address
            // Verify it's a private IP (LAN)
            if (addr.startsWith('192.168.') || addr.startsWith('10.') ||
              (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)) {
              localIP = addr
              found = true
              break
            }
          }
        }
        if (found) break
      }
      if (found) break
    }

    // 2. If no priority interface found, scan ALL non-excluded interfaces
    if (!found) {
      for (const name of Object.keys(interfaces)) {
        if (shouldExclude(name)) continue

        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            const addr = iface.address
            if (addr.startsWith('192.168.') || addr.startsWith('10.') ||
              (addr.startsWith('172.') && parseInt(addr.split('.')[1]) >= 16 && parseInt(addr.split('.')[1]) <= 31)) {
              localIP = addr
              found = true
              break
            }
          }
        }
        if (found) break
      }
    }

  } catch (error) {
    console.error('Error detecting network IP:', error)
  }

  let username = 'unknown'
  try {
    username = execSync('whoami', { encoding: 'utf-8' }).trim()
  } catch { }

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
