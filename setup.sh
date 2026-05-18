#!/usr/bin/env bash
set -e

echo "=== Pi Dashboard Setup ==="
echo ""

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo ""
echo "Installing ADB for TV control..."
if command -v apt-get &>/dev/null; then
  sudo apt-get install -y android-tools-adb
else
  echo "  (apt not found — install adb manually)"
fi

echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Edit config.json:"
echo "   - Set your city name, latitude, longitude"
echo "   - Set your TV IP addresses"
echo "   - Set your device IPs (phones, router, etc.)"
echo "   - Set Pi-hole API key if you have one (Settings > API in Pi-hole)"
echo ""
echo "2. Find your coordinates: https://www.latlong.net/"
echo ""
echo "3. TV ADB Setup (do this once per TV):"
echo "   a. On the TV: Settings > Device Preferences > About"
echo "      Tap 'Build' 7 times to unlock Developer Options"
echo "   b. Settings > Device Preferences > Developer Options"
echo "      Enable 'USB debugging'"
echo "   c. Find TV IP: Settings > Network > Status"
echo "   d. Run: adb connect <TV_IP>:5555"
echo "      Accept the prompt that appears on the TV screen"
echo ""
echo "4. Run the dashboard:"
echo "   python app.py"
echo ""
echo "   Then open http://$(hostname -I | awk '{print $1}'):5000 on any device"
echo ""
echo "5. (Optional) Run as a system service so it starts on boot:"
echo "   sudo cp pi-dashboard.service /etc/systemd/system/"
echo "   sudo sed -i \"s|/home/pi|$HOME|g\" /etc/systemd/system/pi-dashboard.service"
echo "   sudo systemctl enable --now pi-dashboard"
echo ""
