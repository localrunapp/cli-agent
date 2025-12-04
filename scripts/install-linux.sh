#!/bin/bash
set -e

INSTALL_DIR="/usr/local/bin"
GITHUB_REPO="localrun-tech/cli-agent"
BASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"

echo "Installing LocalRun Agent (latest version)..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  RELEASE_URL="${BASE_URL}/localrun-linux-arm64.tar.gz"
  echo "Detected: ARM64"
elif [ "$ARCH" = "x86_64" ]; then
  RELEASE_URL="${BASE_URL}/localrun-linux-x64.tar.gz"
  echo "Detected: Intel (x86_64)"
else
  echo "Error: Unsupported architecture: $ARCH"
  exit 1
fi

# Check if running on Linux
if [ "$(uname -s)" != "Linux" ]; then
  echo "Error: This installer is for Linux only"
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
echo "Next steps:"
echo "  1. Install as service:  localrun install"
echo "  2. Enable service:      systemctl --user enable --now localrun-agent"
echo "  3. Check status:        localrun status"
echo ""
echo "For help: localrun --help"
