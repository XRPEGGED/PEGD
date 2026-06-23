#!/bin/bash
# PEGD Compute Worker — one-line installer
# Usage: curl -fsSL https://pegd.org/install.sh | bash

set -e
WORKER_URL="https://pegd.org/worker.py"
WORKER_DIR="$HOME/.pegd-worker"
WORKER_BIN="$WORKER_DIR/worker.py"

echo ""
echo "  ██████╗ ███████╗ ██████╗ ██████╗ "
echo "  ██╔══██╗██╔════╝██╔════╝ ██╔══██╗"
echo "  ██████╔╝█████╗  ██║  ███╗██║  ██║"
echo "  ██╔═══╝ ██╔══╝  ██║   ██║██║  ██║"
echo "  ██║     ███████╗╚██████╔╝██████╔╝"
echo "  ╚═╝     ╚══════╝ ╚═════╝ ╚═════╝ "
echo "  Compute Worker Installer"
echo ""

# Python 3
if ! command -v python3 &>/dev/null; then
  echo "[!] Python 3 not found — installing..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y python3
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y python3
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm python
  else
    echo "[!] Could not install Python 3 automatically."
    echo "    Install it from https://python.org then re-run this script."
    exit 1
  fi
fi

# tkinter
if ! python3 -c "import tkinter" 2>/dev/null; then
  echo "[*] Installing tkinter..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y python3-tk
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y python3-tkinter
  elif command -v pacman &>/dev/null; then
    sudo pacman -S --noconfirm python-tk
  elif command -v brew &>/dev/null; then
    brew install python-tk
  fi
fi

# Download worker
mkdir -p "$WORKER_DIR"
echo "[*] Downloading PEGD Worker..."
curl -fsSL "$WORKER_URL" -o "$WORKER_BIN"

# Desktop shortcut (Linux)
if [ -d "$HOME/Desktop" ] && command -v xdg-user-dirs-update &>/dev/null; then
  cat > "$HOME/Desktop/PEGD Worker.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=PEGD Worker
Comment=PEGD Compute Pool — GPU/CPU Miner
Exec=python3 $WORKER_BIN
Icon=utilities-system-monitor
Terminal=false
Categories=Utility;
StartupNotify=true
EOF
  chmod +x "$HOME/Desktop/PEGD Worker.desktop"
  echo "[*] Desktop shortcut created."
fi

echo ""
echo "[✓] Done! Launching PEGD Worker..."
echo ""
python3 "$WORKER_BIN"
