import {execSync} from 'child_process'
import {hostname, platform, arch, totalmem, freemem, cpus, uptime} from 'os'

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
    if (platform() === 'darwin') {
      const ipOutput = execSync("ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo '127.0.0.1'", {
        encoding: 'utf-8',
      }).trim()
      localIP = ipOutput
    }
  } catch {
    // Fallback to 127.0.0.1
  }

  let username = 'unknown'
  try {
    username = execSync('whoami', {encoding: 'utf-8'}).trim()
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
