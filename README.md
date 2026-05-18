# Pi Home Dashboard

A local-network web dashboard for a Raspberry Pi.

## Features

- **Weather** — current conditions via Open-Meteo (no API key needed)
- **News** — RSS headlines from AP News, NPR, BBC
- **Network devices** — live ping status for phones, TVs, router, etc.
- **Pi-hole stats** — queries, block rate, blocklist size
- **System health** — CPU, RAM, disk, temperature, uptime
- **TV control** — turn off Hisense Google TVs via ADB over Wi-Fi

## Setup

```bash
bash setup.sh
```

Then edit `config.json` with your IPs, coordinates, and TV addresses.

Start the server:

```bash
python app.py
```

Open `http://<pi-ip>:5000` on any device on your network.

## TV Control Setup

Each TV needs to be paired with ADB once:

1. On the TV → Settings → Device Preferences → About → tap **Build** 7 times
2. Developer Options → enable **USB debugging**
3. Note the TV's IP (Settings → Network → Status)
4. On the Pi: `adb connect <TV_IP>:5555` — accept the prompt on the TV

After that the "Turn Off" button works.

## Run on Boot

```bash
sudo cp pi-dashboard.service /etc/systemd/system/
sudo sed -i "s|/home/pi|$HOME|g" /etc/systemd/system/pi-dashboard.service
sudo systemctl enable --now pi-dashboard
```
