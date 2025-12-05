#!/bin/bash
set -e

INSTALL_DIR="/usr/local/bin"
GITHUB_REPO="localrunapp/cli-agent"
BASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"

echo "Installing LocalRun Agent (latest version)..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  TARGET="darwin-arm64"
  echo "Detected: Apple Silicon (arm64)"
elif [ "$ARCH" = "x86_64" ]; then
  TARGET="darwin-x64"
  echo "Detected: Intel (x86_64)"
else
  echo "Error: Unsupported architecture: $ARCH"
  exit 1
fi

# Get latest release info to find exact filename
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/latest")
TARBALL_NAME=$(echo "$LATEST_RELEASE" | grep -o "v.*-${TARGET}\.tar\.gz" | head -1)

if [ -z "$TARBALL_NAME" ]; then
  echo "Error: Could not find release tarball for ${TARGET}"
  exit 1
fi

RELEASE_URL="${BASE_URL}/${TARBALL_NAME}"

# Check if running on macOS
if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: This installer is for macOS only"
  exit 1
fi

# Create temp directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "Downloading LocalRun Agent..."
if command -v curl &> /dev/null; then
  curl -L -o localrun.tar.gz "$RELEASE_URL"
elif command -v wget &> /dev/null; then
  wget -O localrun.tar.gz "$RELEASE_URL"
else
  echo "Error: curl or wget required"
  exit 1
fi

echo "Extracting..."
tar -xzf localrun.tar.gz

# Install binary and dependencies
LOCALRUN_HOME="/usr/local/lib/localrun"
echo "Installing to $LOCALRUN_HOME..."
sudo rm -rf "$LOCALRUN_HOME"
sudo mkdir -p "$LOCALRUN_HOME"
sudo cp -R localrun/* "$LOCALRUN_HOME/"

echo "Creating symlink in $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo ln -sf "$LOCALRUN_HOME/bin/localrun" "$INSTALL_DIR/localrun"

# Cleanup
cd -
rm -rf "$TMP_DIR"

echo "LocalRun Agent installed successfully!"
echo ""

# Check if BACKEND environment variable is set
if [ -n "$BACKEND" ]; then
  echo "Setting up service with backend: $BACKEND"
  
  # Build install command with backend
  INSTALL_CMD="localrun install --backend $BACKEND"
  
  # Add port if specified
  if [ -n "$PORT" ]; then
    INSTALL_CMD="$INSTALL_CMD --port $PORT"
  fi
  
  echo "Running: $INSTALL_CMD"
  $INSTALL_CMD
  
  echo ""
  echo "✅ LocalRun Agent is now running and connected to $BACKEND!"
  echo ""
  echo "Service commands:"
  echo "  localrun status    # Check status"
  echo "  localrun stop      # Stop service"
  echo "  localrun start     # Start service"
else
  echo "Next steps:"
  echo "  1. Install as service:  localrun install"
  echo "  2. Or with backend:     localrun install --backend YOUR_BACKEND_IP"
  echo ""
  echo "For help: localrun --help"
fi
