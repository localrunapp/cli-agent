import {execSync} from 'child_process'

export interface Process {
  pid: number
  name: string
  cpu: number
  memory: number
  user: string
}

export async function getProcesses(): Promise<Process[]> {
  try {
    const output = execSync('ps aux', {encoding: 'utf-8'})
    const lines = output.split('\n').slice(1) // Skip header
    const processes: Process[] = []

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split(/\s+/)
      if (parts.length < 11) continue

      const user = parts[0]
      const pid = parseInt(parts[1], 10)
      const cpu = parseFloat(parts[2])
      const memory = parseFloat(parts[3])
      const name = parts.slice(10).join(' ')

      processes.push({
        pid,
        name,
        cpu,
        memory,
        user,
      })
    }

    return processes
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 50)
  } catch (error) {
    console.error('Error getting processes:', error)
    return []
  }
}
