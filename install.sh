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
FLASK_PORT=5000
DASHBOARD_HOSTNAME="dashboard.home"   # Change this if you prefer e.g. home.lan

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
command -v pip3   &>/dev/null || PKGS+=(python3-pip)
command -v nginx  &>/dev/null || PKGS+=(nginx)
command -v adb    &>/dev/null || PKGS+=(android-tools-adb)

if [[ ${#PKGS[@]} -gt 0 ]]; then
    echo "    Installing: ${PKGS[*]}"
    sudo apt-get install -y -qq "${PKGS[@]}"
fi

ok "python3-pip"
ok "nginx"
ok "adb (Android Debug Bridge)"

# ── Python packages ───────────────────────────────────────────────────────────
step "Installing Python packages"

pip3 install -q -r "$SCRIPT_DIR/requirements.txt"
ok "flask, requests, feedparser, psutil"

# ── Pi-hole port conflict check ───────────────────────────────────────────────
# Pi-hole v6 runs its own web server and defaults to port 80.
# nginx also needs port 80 for the dashboard pretty URL.
# If pihole-FTL is holding port 80, move it to 8080 first.

if ss -tlnp 2>/dev/null | grep -q '0\.0\.0\.0:80.*pihole\|:::80.*pihole'; then
    step "Pi-hole is on port 80 — moving it to port 8080"
    PIHOLE_TOML="/etc/pihole/pihole.toml"
    if [[ -f "$PIHOLE_TOML" ]]; then
        sudo cp "$PIHOLE_TOML" "${PIHOLE_TOML}.installer-bak"
        # Replace port 80 with 8080 in the webserver section only
        sudo sed -i 's/\(port *= *"\)80/\18080/' "$PIHOLE_TOML"
        sudo systemctl restart pihole-FTL
        sleep 3
        ok "Pi-hole web UI moved to port 8080"
        warn "Pi-hole admin is now at: http://$(hostname -I | awk '{print $1}'):8080/admin"
    else
        warn "Could not find /etc/pihole/pihole.toml"
        warn "Move Pi-hole off port 80 manually before running this again:"
        warn "  sudo pihole-FTL --config webserver.port 8080"
        warn "  sudo systemctl restart pihole-FTL"
        exit 1
    fi
fi

# ── nginx reverse proxy ───────────────────────────────────────────────────────
step "Configuring nginx (port 80 → Flask on $FLASK_PORT)"

NGINX_CONF="/etc/nginx/sites-available/pi-dashboard"

sudo tee "$NGINX_CONF" > /dev/null <<NGINX
server {
    listen 80 default_server;
    server_name $DASHBOARD_HOSTNAME _;

    location / {
        proxy_pass         http://127.0.0.1:$FLASK_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host            \$host;
        proxy_set_header   X-Real-IP       \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }
}
NGINX

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pi-dashboard

# Remove the default nginx page so it doesn't conflict
sudo rm -f /etc/nginx/sites-enabled/default

if sudo nginx -t -q 2>/dev/null; then
    sudo systemctl reload nginx
    sudo systemctl enable nginx -q
    ok "nginx configured and running"
else
    warn "nginx config test failed — check: sudo nginx -t"
fi

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
ExecStart=$(command -v python3) $SCRIPT_DIR/app.py
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
    ok "pi-dashboard service running"
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

    # Restart Pi-hole DNS resolver
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
echo -e "    ${GRN}${BOLD}http://$DASHBOARD_HOSTNAME${NC}     ← pretty URL (via Pi-hole DNS)"
echo -e "    ${GRN}http://$PI_IP${NC}        ← direct IP (always works)"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    sudo systemctl restart pi-dashboard"
echo -e "    sudo journalctl -u pi-dashboard -f        # live logs"
echo -e "    sudo systemctl reload nginx"
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
