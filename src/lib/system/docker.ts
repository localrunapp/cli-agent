import Docker from 'dockerode'

export interface Container {
  id: string
  name: string
  image: string
  status: string
  ports: Array<{
    private: number
    public?: number
    type: string
  }>
  created: number
}

/**
 * Check if Docker is available on the system
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const docker = new Docker()
    await docker.ping()
    return true
  } catch (error) {
    return false
  }
}

export async function getDockerContainers(): Promise<Container[]> {
  try {
    // Check if Docker is available first
    const dockerAvailable = await isDockerAvailable()
    if (!dockerAvailable) {
      // Docker not installed or not running - return empty array silently
      return []
    }

    const docker = new Docker()
    const containers = await docker.listContainers({ all: true })

    return containers.map(container => {
      const ports = (container.Ports || []).map(p => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
      }))

      return {
        id: container.Id?.substring(0, 12) || 'unknown',
        name: container.Names?.[0]?.replace(/^\//, '') || 'unknown',
        image: container.Image || 'unknown',
        status: container.State || 'unknown',
        ports,
        created: container.Created || 0,
      }
    })
  } catch (error) {
    // Silent fail - Docker not available or error occurred
    return []
  }
}
