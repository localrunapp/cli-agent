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

# Verify installation
echo "🔍 Verifying installation..."
if ! command -v localrun &> /dev/null; then
  echo "❌ Error: localrun command not found in PATH"
  exit 1
fi

# Test that localrun works
if ! localrun --version &> /dev/null; then
  echo "❌ Error: localrun command not working properly"
  exit 1
fi

VERSION=$(localrun --version 2>/dev/null | head -n1)
echo "✅ LocalRun Agent $VERSION is working correctly"
echo ""

# Automatically install and configure service
echo "🔧 Configuring service..."

# Build install command
INSTALL_CMD="localrun install"

# Add backend if specified
if [ -n "$BACKEND" ]; then
  echo "🔍 Verifying connection to backend: $BACKEND..."
  
  # Extract host and port (simple check)
  if [[ "$BACKEND" != *":"* ]]; then
     CHECK_URL="http://$BACKEND:8000/health"
  else
     CHECK_URL="http://$BACKEND/health"
  fi

  if curl -s --connect-timeout 5 "$CHECK_URL" > /dev/null; then
    echo "✅ Connection successful!"
  else
    echo "⚠️  Warning: Could not connect to backend at $BACKEND"
    echo "   The agent might not be able to register automatically."
    echo "   Check if the IP/Port is correct and accessible from this machine."
    
    read -p "   Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Installation aborted."
      exit 1
    fi
  fi

  echo "Setting up service with backend: $BACKEND"
  INSTALL_CMD="$INSTALL_CMD --backend $BACKEND"
else
  echo "Setting up service with default backend (localhost)"
fi

# Add port if specified
if [ -n "$PORT" ]; then
  INSTALL_CMD="$INSTALL_CMD --port $PORT"
fi

echo "Running: $INSTALL_CMD"
if $INSTALL_CMD; then
  echo ""
  echo "🎉 LocalRun Agent is now fully installed and running!"
  
  if [ -n "$BACKEND" ]; then
    echo "📡 Connected to backend: $BACKEND"
  else
    echo "📡 Connected to backend: localhost (default)"
  fi
  
  echo ""
  echo "🔧 Service management commands:"
  echo "  localrun status    # Check status"
  echo "  localrun stop      # Stop service"
  echo "  localrun start     # Start service"
  echo "  localrun logs      # View logs"
  echo ""
  echo "✨ Installation complete!"
else
  echo ""
  echo "❌ Service installation failed. You can try manually:"
  echo "  localrun install"
  if [ -n "$BACKEND" ]; then
    echo "  localrun install --backend $BACKEND"
  fi
  exit 1
fi
