# LocalRun Agent

Native system agent built with Node.js/OCLIF. Provides local system access for the LocalRun dashboard.

Currently supports: **macOS** (Apple Silicon & Intel)

## Installation

### For Users

**macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/localrun-tech/cli-agent/main/agent/install-macos.sh | bash
```

## Commands

```bash
localrun install    # Install as system service
localrun start      # Start service
localrun stop       # Stop service
localrun status     # View status
localrun logs       # View logs
localrun logs -f    # Follow logs
localrun serve      # Start HTTP server
localrun uninstall  # Remove service
```

### For Developers

```bash
make {os}-install    # Install dependencies
make {os}-build      # Compile TypeScript
make {os}-dev        # Link for development
make {os}-pack       # Create a binari executable
make {os}-clean      # Clean local install files and dependencies
```

## API Endpoints

When running, the agent exposes an HTTP API on `http://127.0.0.1:47777`:

- `GET /api/ping` - Health check
- `GET /api/host/info` - Host information
- `GET /api/host/ports` - Open ports
- `GET /api/host/processes` - Running processes
- `GET /api/docker/containers` - Docker containers

## Building Binaries

```bash
make pack    # Build standalone binaries for arm64 + x64
```

Generates:

- `localrun-darwin-arm64.tar.gz` (Apple Silicon)
- `localrun-darwin-x64.tar.gz` (Intel)

## Architecture

```
agent/
├── macos/              # Source code
│   ├── src/
│   │   ├── commands/   # CLI commands
│   │   └── lib/        # System modules
│   ├── bin/            # Executables
│   └── package.json
├── Makefile            # Build automation
└── install-macos.sh    # User installer
```

## License

MIT
