from flask import Flask, jsonify, render_template
import json
import os
import socket
import subprocess

import feedparser
import psutil
import requests

app = Flask(__name__)
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

WMO_DESCRIPTIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm + hail", 99: "Thunderstorm + heavy hail",
}


def wmo_icon(code):
    if code == 0:
        return "☀️"
    if code in (1, 2):
        return "⛅"
    if code == 3:
        return "☁️"
    if code in (45, 48):
        return "🌫️"
    if 51 <= code <= 67:
        return "🌧️"
    if 71 <= code <= 77:
        return "❄️"
    if 80 <= code <= 82:
        return "🌦️"
    if 85 <= code <= 86:
        return "🌨️"
    if code >= 95:
        return "⛈️"
    return "🌡️"


def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)


def ping(host):
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "1", host],
            capture_output=True,
            timeout=3,
        )
        return r.returncode == 0
    except Exception:
        return False


def get_uptime():
    try:
        with open("/proc/uptime") as f:
            secs = float(f.read().split()[0])
        d = int(secs // 86400)
        h = int((secs % 86400) // 3600)
        m = int((secs % 3600) // 60)
        if d:
            return f"{d}d {h}h {m}m"
        if h:
            return f"{h}h {m}m"
        return f"{m}m"
    except Exception:
        return "unknown"


@app.route("/")
def index():
    config = load_config()
    return render_template("index.html", tvs=config.get("tvs", []))


@app.route("/api/weather")
def weather():
    config = load_config()
    w = config["weather"]
    try:
        r = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": w["latitude"],
                "longitude": w["longitude"],
                "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
                "temperature_unit": w.get("units", "fahrenheit"),
                "wind_speed_unit": "mph",
                "timezone": "auto",
            },
            timeout=10,
        )
        r.raise_for_status()
        d = r.json()["current"]
        unit_sym = "°F" if w.get("units", "fahrenheit") == "fahrenheit" else "°C"
        return jsonify(
            {
                "city": w["city"],
                "temp": round(d["temperature_2m"]),
                "feels_like": round(d["apparent_temperature"]),
                "humidity": d["relative_humidity_2m"],
                "wind": round(d["wind_speed_10m"]),
                "description": WMO_DESCRIPTIONS.get(d["weather_code"], "Unknown"),
                "icon": wmo_icon(d["weather_code"]),
                "unit": unit_sym,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/news")
def news():
    config = load_config()
    news_cfg = config.get("news", {})
    feeds = news_cfg.get("feeds", [])
    per_feed = news_cfg.get("articles_per_feed", 5)
    articles = []
    for feed_cfg in feeds:
        try:
            parsed = feedparser.parse(feed_cfg["url"])
            for entry in parsed.entries[:per_feed]:
                articles.append(
                    {
                        "title": entry.get("title", "").strip(),
                        "link": entry.get("link", ""),
                        "source": feed_cfg["name"],
                        "published": entry.get("published", ""),
                    }
                )
        except Exception:
            pass
    return jsonify(articles)


@app.route("/api/devices")
def devices():
    config = load_config()
    results = [
        {"name": d["name"], "ip": d["ip"], "online": ping(d["ip"])}
        for d in config.get("devices", [])
    ]
    return jsonify(results)


@app.route("/api/pihole")
def pihole():
    config = load_config()
    ph = config.get("pihole", {})
    host = ph.get("host", "localhost")
    api_key = ph.get("api_key", "")
    try:
        url = f"http://{host}/admin/api.php?summary"
        if api_key:
            url += f"&auth={api_key}"
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        d = r.json()
        return jsonify(
            {
                "queries_today": d.get("dns_queries_today", 0),
                "blocked_today": d.get("ads_blocked_today", 0),
                "percent_blocked": round(float(d.get("ads_percentage_today", 0)), 1),
                "domains_blocked": d.get("domains_being_blocked", 0),
                "status": d.get("status", "unknown"),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/system")
def system():
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        temp = None
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                temp = round(int(f.read().strip()) / 1000, 1)
        except OSError:
            pass
        return jsonify(
            {
                "cpu_percent": cpu,
                "mem_percent": mem.percent,
                "mem_used_gb": round(mem.used / 1024**3, 1),
                "mem_total_gb": round(mem.total / 1024**3, 1),
                "disk_percent": disk.percent,
                "disk_used_gb": round(disk.used / 1024**3, 1),
                "disk_total_gb": round(disk.total / 1024**3, 1),
                "cpu_temp": temp,
                "hostname": socket.gethostname(),
                "uptime": get_uptime(),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tv/off/<int:tv_index>", methods=["POST"])
def tv_off(tv_index):
    config = load_config()
    tvs = config.get("tvs", [])
    if not (0 <= tv_index < len(tvs)):
        return jsonify({"error": "TV not found"}), 404
    tv = tvs[tv_index]
    ip = tv["ip"]
    try:
        subprocess.run(
            ["adb", "connect", f"{ip}:5555"], capture_output=True, timeout=10
        )
        result = subprocess.run(
            ["adb", "-s", f"{ip}:5555", "shell", "input", "keyevent", "KEYCODE_SLEEP"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return jsonify({"success": True, "tv": tv["name"]})
        return jsonify({"success": False, "error": result.stderr or "ADB command failed"}), 500
    except FileNotFoundError:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "adb not installed — run: sudo apt install android-tools-adb",
                }
            ),
            500,
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
