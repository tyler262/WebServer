#!/usr/bin/env bash
#
# Pi Home Dashboard — Installer
# Usage: bash install.sh
#
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'
BLU='\033[0;34m'; BOLD='\033[1m';   NC='\033[0m'

ok()   { echo -e "  ${GRN}✓${NC}  $*"; }
step() { echo -e "\n${BOLD}${BLU}▶  $*${NC}"; }
warn() { echo -e "  ${YLW}⚠${NC}  $*"; }
die()  { echo -e "\n  ${RED}✗  $*${NC}\n"; exit 1; }

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="${SUDO_USER:-$USER}"
FLASK_PORT=8888
DASHBOARD_HOSTNAME="dashboard.home"   # Change this if you prefer e.g. home.lan
VENV_DIR="$SCRIPT_DIR/.venv"

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║    Pi Home Dashboard — Installer     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"

# ── Safety checks ─────────────────────────────────────────────────────────────
step "Checking prerequisites"

[[ $EUID -eq 0 ]] && die "Run as your normal user, not root.\n  bash install.sh"

command -v python3 &>/dev/null || die "Python 3 not found. Run: sudo apt install python3"
PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
ok "Python $PY_VER"

command -v sudo &>/dev/null || die "sudo is required"
ok "sudo available"

# ── System packages ───────────────────────────────────────────────────────────
step "Installing system packages"

echo "    Updating package list…"
sudo apt-get update -qq

PKGS=()
python3 -m venv --help &>/dev/null || PKGS+=(python3-venv)
command -v adb &>/dev/null         || PKGS+=(android-tools-adb)

if [[ ${#PKGS[@]} -gt 0 ]]; then
    echo "    Installing: ${PKGS[*]}"
    sudo apt-get install -y -qq "${PKGS[@]}"
fi

ok "python3-venv"
ok "adb (Android Debug Bridge)"

# ── Python virtualenv + packages ──────────────────────────────────────────────
step "Setting up Python virtual environment"

if [[ ! -d "$VENV_DIR" ]]; then
    python3 -m venv "$VENV_DIR"
    ok "Created venv at $VENV_DIR"
else
    ok "venv already exists"
fi

"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"
ok "flask, requests, feedparser, psutil installed in venv"

# ── systemd service ───────────────────────────────────────────────────────────
step "Setting up systemd service"

sudo tee /etc/systemd/system/pi-dashboard.service > /dev/null <<SERVICE
[Unit]
Description=Pi Home Dashboard
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$VENV_DIR/bin/python $SCRIPT_DIR/app.py
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable pi-dashboard -q
sudo systemctl restart pi-dashboard

sleep 2

if systemctl is-active --quiet pi-dashboard; then
    ok "pi-dashboard service running on port $FLASK_PORT"
else
    warn "Service may have failed — check: sudo journalctl -u pi-dashboard -n 20"
fi

# ── Pi-hole DNS ───────────────────────────────────────────────────────────────
step "Adding Pi-hole DNS record"

PI_IP=$(hostname -I | awk '{print $1}')
CUSTOM_LIST="/etc/pihole/custom.list"
DNS_OK=false

if [[ -f "$CUSTOM_LIST" ]]; then
    if grep -q "$DASHBOARD_HOSTNAME" "$CUSTOM_LIST" 2>/dev/null; then
        ok "$DASHBOARD_HOSTNAME already in Pi-hole DNS"
        DNS_OK=true
    else
        echo "$PI_IP $DASHBOARD_HOSTNAME" | sudo tee -a "$CUSTOM_LIST" > /dev/null
        ok "Added  $DASHBOARD_HOSTNAME → $PI_IP"
        DNS_OK=true
    fi

    if command -v pihole &>/dev/null; then
        pihole restartdns &>/dev/null \
            || sudo systemctl restart pihole-FTL &>/dev/null \
            || true
        ok "Pi-hole DNS restarted"
    fi
fi

if [[ "$DNS_OK" == false ]]; then
    warn "Couldn't find Pi-hole's custom.list — add the DNS record manually:"
    warn "  Pi-hole admin → Local DNS → DNS Records"
    warn "  Hostname: $DASHBOARD_HOSTNAME   →   IP: $PI_IP"
fi

# ── config.json check ─────────────────────────────────────────────────────────
step "Checking config.json"

CONFIG="$SCRIPT_DIR/config.json"
CONFIG_OK=true

if grep -q '"Your City"' "$CONFIG"; then
    warn "config.json still has placeholder values — edit it before using the dashboard"
    warn "  nano $CONFIG"
    warn ""
    warn "  Things to set:"
    warn "    weather.city / latitude / longitude   (find coords: latlong.net)"
    warn "    tvs[*].ip                             (your Hisense TV IPs)"
    warn "    devices[*].ip                         (phones, router, etc.)"
    warn "    pihole.password                       (Pi-hole v6: your web UI password)"
    CONFIG_OK=false
else
    ok "config.json looks configured"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           All done!                  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Open the dashboard on any device on your network:${NC}"
echo -e ""
echo -e "    ${GRN}${BOLD}http://$DASHBOARD_HOSTNAME:$FLASK_PORT${NC}     ← pretty URL (via Pi-hole DNS)"
echo -e "    ${GRN}http://$PI_IP:$FLASK_PORT${NC}        ← direct IP (always works)"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    sudo systemctl restart pi-dashboard"
echo -e "    sudo journalctl -u pi-dashboard -f        # live logs"
echo -e "    sudo systemctl status pi-dashboard"
echo ""
echo -e "  ${BOLD}TV setup (once per TV, using your remote):${NC}"
echo -e "    1. Settings → Device Preferences → About"
echo -e "       Press OK on 'Build' 7 times to unlock Developer Options"
echo -e "    2. Developer Options → enable USB debugging"
echo -e "    3. Settings → Network → Status  (note the TV's IP)"
echo -e "    4. On the Pi:  adb connect <TV_IP>:5555"
echo -e "       A dialog appears on the TV — navigate to it and press OK"
echo ""

if [[ "$CONFIG_OK" == false ]]; then
    echo -e "  ${YLW}${BOLD}⚠  Edit config.json before opening the dashboard!${NC}"
    echo -e "     nano $CONFIG"
    echo ""
fi
