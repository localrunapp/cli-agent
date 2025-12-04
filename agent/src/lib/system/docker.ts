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

export async function getDockerContainers(): Promise<Container[]> {
  try {
    const docker = new Docker()
    const containers = await docker.listContainers({all: true})

    return containers.map(container => {
      const ports = (container.Ports || []).map(p => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
      }))

      return {
        id: container.Id.substring(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        image: container.Image,
        status: container.State,
        ports,
        created: container.Created,
      }
    })
  } catch (error) {
    console.error('Error getting Docker containers:', error)
    return []
  }
}
