#!/usr/bin/env bash
# PEGD Worker — Linux performance setup
# Enables MSR mod + huge pages for maximum XMRig RandomX hashrate
# Run once with: sudo bash setup-linux.sh

set -e

XMRIG=$(find "$HOME/.pegd-worker/miners" -name "xmrig" -type f 2>/dev/null | sort -V | tail -1)

echo ""
echo "PEGD Worker — Linux Setup"
echo "========================="
echo ""

# ── MSR module ────────────────────────────────────────────────────────────────
echo "[1/4] Loading MSR kernel module..."
modprobe msr && echo "      MSR loaded" || echo "      MSR already loaded or not available"

# Persist across reboots
if ! grep -q "^msr$" /etc/modules 2>/dev/null; then
  echo "msr" >> /etc/modules
  echo "      Added msr to /etc/modules (persists on reboot)"
fi

# ── XMRig capabilities (MSR without running as root) ─────────────────────────
echo ""
echo "[2/4] Setting XMRig capabilities for MSR access..."
if [ -n "$XMRIG" ]; then
  setcap cap_sys_rawio+ep "$XMRIG"
  echo "      cap_sys_rawio set on $XMRIG"
else
  echo "      XMRig not found — start the worker once to download it, then re-run this script"
fi

# ── 2MB huge pages (runtime, no reboot needed) ───────────────────────────────
echo ""
echo "[3/4] Allocating 2MB huge pages..."
echo 1280 > /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
GOT_2M=$(cat /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages)
echo "      Allocated: $GOT_2M pages (need 1280)"

# Persist 2MB pages
if ! grep -q "vm.nr_hugepages" /etc/sysctl.conf 2>/dev/null; then
  echo "vm.nr_hugepages=1280" >> /etc/sysctl.conf
fi

# ── 1GB huge pages (runtime attempt, fallback to GRUB) ───────────────────────
echo ""
echo "[4/4] Attempting 1GB huge pages..."
echo 4 > /sys/kernel/mm/hugepages/hugepages-1048576kB/nr_hugepages 2>/dev/null || true
GOT_1G=$(cat /sys/kernel/mm/hugepages/hugepages-1048576kB/nr_hugepages 2>/dev/null || echo 0)

if [ "$GOT_1G" -ge 4 ] 2>/dev/null; then
  echo "      1GB pages active: $GOT_1G pages"
else
  echo "      Runtime allocation failed ($GOT_1G) — adding to GRUB for next boot..."
  GRUB_FILE="/etc/default/grub"
  if grep -q "hugepagesz=1G" "$GRUB_FILE" 2>/dev/null; then
    echo "      Already in GRUB"
  else
    sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"/GRUB_CMDLINE_LINUX_DEFAULT="\1 hugepagesz=1G hugepages=4 hugepagesz=2M hugepages=1280"/' "$GRUB_FILE"
    update-grub 2>/dev/null && echo "      GRUB updated — 1GB pages active after reboot" || echo "      update-grub failed — check $GRUB_FILE manually"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Done. Restart the PEGD Worker to apply."
echo ""
echo "  MSR mod:      enabled (XMRig will apply register tweaks automatically)"
echo "  2MB pages:    $GOT_2M / 1280 allocated"
echo "  1GB pages:    $GOT_1G / 4 allocated (0 = needs reboot)"
echo ""
echo "Expected hashrate boost: +30-50% over default settings."
echo ""
