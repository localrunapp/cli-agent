# LocalRun Agent

Native system agent for the LocalRun platform. Built with Node.js and OCLIF.
This agent enables remote system monitoring, terminal access, and service management.

## Installation

### Linux & macOS

```bash
curl -sL https://raw.githubusercontent.com/guillermofarias/localrun/main/cli-agent/install-linux.sh | bash
```

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/guillermofarias/localrun/main/cli-agent/install-windows.ps1 | iex
```

## Usage

Start the agent and connect to your LocalRun instance:

```bash
localrun-agent serve --backend 192.168.1.50
```

### Commands

- `localrun-agent serve`: Start the agent server.
- `localrun-agent scan`: Scan local network for services.
- `localrun-agent --help`: Show help and available commands.

## Development

### Prerequisites

- Node.js 18+
- npm 9+

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
