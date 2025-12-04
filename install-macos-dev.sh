#!/bin/bash
set -e

INSTALL_DIR="/usr/local/bin"

echo "Installing LocalRun Agent (development build)..."

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  TARBALL="macos/dist/localrun-v1.0.0-*-darwin-arm64.tar.gz"
  echo "Detected: Apple Silicon (arm64)"
elif [ "$ARCH" = "x86_64" ]; then
  TARBALL="macos/dist/localrun-v1.0.0-*-darwin-x64.tar.gz"
  echo "Detected: Intel (x86_64)"
else
  echo "Error: Unsupported architecture: $ARCH"
  exit 1
fi

# Find the tarball
TARBALL_PATH=$(ls $TARBALL 2>/dev/null | head -n 1)

if [ -z "$TARBALL_PATH" ]; then
  echo "Error: Binary not found for $ARCH. Run 'make pack' first"
  exit 1
fi

echo "Using: $TARBALL_PATH"

# Create temp directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "Extracting..."
tar -xzf "$OLDPWD/$TARBALL_PATH"

# Install binary
echo "Installing to $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo cp localrun/bin/localrun "$INSTALL_DIR/localrun"
sudo chmod +x "$INSTALL_DIR/localrun"

# Cleanup
cd -
rm -rf "$TMP_DIR"

echo "LocalRun Agent installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Install as service:  localrun install"
echo "  2. Start the service:   localrun start"
echo "  3. Check status:        localrun status"
echo ""
