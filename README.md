# LocalRun Agent

Native system agent for the LocalRun platform. Built with Node.js and OCLIF.
This agent enables remote system monitoring, terminal access, and service management.

## Installation

### macOS

```bash
curl -sL https://raw.githubusercontent.com/localrunapp/cli-agent/main/scripts/install-macos.sh | bash
```

### Linux

```bash
curl -sL https://raw.githubusercontent.com/localrunapp/cli-agent/main/scripts/install-linux.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/localrunapp/cli-agent/main/scripts/install-windows.ps1 | iex
```

## Usage

Start the agent and connect to your LocalRun instance:

```bash
localrun serve --backend 192.168.1.50
```

### Commands

- `localrun serve`: Start the agent server
- `localrun install`: Install as system service
- `localrun start`: Start the service
- `localrun stop`: Stop the service
- `localrun status`: Check service status
- `localrun logs`: View service logs
- `localrun uninstall`: Remove system service
- `localrun app update`: Update application containers
- `localrun --help`: Show help and available commands

## Development

### Prerequisites

- Node.js 20+
- npm 11+

### Setup

```bash
make install
make build
make dev
```

### Release

To create a new release (bumps version, tags git, pushes, and creates GitHub Release):

```bash
make release-patch  # v1.0.0 -> v1.0.1
make release-minor  # v1.0.0 -> v1.1.0
make release-major  # v1.0.0 -> v2.0.0
```

## License

MIT
