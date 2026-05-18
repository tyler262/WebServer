# Pi Home Dashboard

A local-network home dashboard that runs on a Raspberry Pi.

## Features

| Card | What it shows |
|------|--------------|
| Weather | Current conditions — temp, humidity, wind, feels-like |
| TV Controls | Turn off each Hisense Google TV via ADB over Wi-Fi |
| Pi-hole | Query count, block rate, blocklist size, status |
| System | CPU, RAM, disk, temperature, uptime |
| Quote of the Day | Inspirational quote — refreshable on demand |
| Daily Joke | Safe-mode joke with hidden punchline — refreshable |
| Photo of the Day | Random daily photo (Picsum) or NASA APOD |
| To-Do List | Shared household task list — persists across reboots |
| Suggestions | Household message/suggestion box |
| Network Devices | Live ping status for phones, TVs, router, etc. |
| News | RSS headlines from AP News, NPR, BBC |

## Install

```bash
bash install.sh
```

The script installs all dependencies, configures nginx as a reverse proxy on
port 80, and adds a Pi-hole DNS record so the dashboard is reachable at a
clean local URL from every device on your network.

## Configure

Edit `config.json` before opening the dashboard:

```bash
nano config.json
```

| Setting | What to put |
|---------|------------|
| `weather.city` | Your city name |
| `weather.latitude/longitude` | From [latlong.net](https://www.latlong.net) |
| `weather.units` | `"fahrenheit"` or `"celsius"` |
| `tvs[*].ip` | IP address of each Hisense TV |
| `devices[*].ip` | Phones, router, anything you want to ping |
| `pihole.api_key` | Pi-hole admin → Settings → API (optional) |

## Pretty URL

The installer sets `http://dashboard.home` by default.
To change the hostname, edit the `DASHBOARD_HOSTNAME` line near the top of
`install.sh` and re-run it.

## TV Setup (once per TV)

Using your TV remote:

1. Settings → Device Preferences → About  
   Press **OK on "Build" 7 times** to unlock Developer Options
2. Developer Options → enable **USB debugging**
3. Settings → Network → Status — note the TV's IP address
4. On the Pi: `adb connect <TV_IP>:5555`  
   A dialog appears on the TV — navigate to it with your remote and press OK

## NASA Photo of the Day (optional)

The default photo source is Picsum (beautiful landscape photos, no key needed).
To switch to NASA APOD:

1. Get a free key at <https://api.nasa.gov/>
2. In `config.json`: `"photo": { "source": "nasa_apod", "nasa_api_key": "your-key" }`

## Manage the service

```bash
sudo systemctl restart pi-dashboard     # restart Flask
sudo journalctl -u pi-dashboard -f      # live logs
sudo systemctl reload nginx             # reload nginx config
```
