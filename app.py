from flask import Flask, jsonify, render_template, request, send_from_directory
import json
import os
import random
import smtplib
import socket
import sqlite3
import subprocess
import threading
import time
from datetime import datetime, timedelta
from email.mime.text import MIMEText

import feedparser
import psutil
import requests

app = Flask(__name__)
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE  = os.path.join(BASE_DIR, "config.json")
DB_FILE      = os.path.join(BASE_DIR, "dashboard.db")
TW_DATA_FILE = os.path.join(BASE_DIR, "tribalwars", "tw_data.json")
TW_DIR       = os.path.join(BASE_DIR, "tribalwars")


# ── Database ───────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    # Migrate todos: old schema used 'done' (0/1), new uses 'status' (0/1/2)
    todo_cols = {row[1] for row in conn.execute("PRAGMA table_info(todos)").fetchall()}
    if todo_cols and "status" not in todo_cols:
        conn.execute("ALTER TABLE todos ADD COLUMN status INTEGER NOT NULL DEFAULT 0")
        if "done" in todo_cols:
            conn.execute("UPDATE todos SET status = done")
        conn.commit()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            text       TEXT    NOT NULL,
            status     INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL DEFAULT '',
            text       TEXT    NOT NULL,
            created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS groceries (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            text       TEXT    NOT NULL,
            done       INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS weather_cities (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT    NOT NULL,
            latitude      REAL    NOT NULL,
            longitude     REAL    NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            title          TEXT NOT NULL,
            date           TEXT NOT NULL,
            time           TEXT,
            end_time       TEXT,
            notes          TEXT NOT NULL DEFAULT '',
            created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            reminder_sent  INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS briefs_sent (
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            PRIMARY KEY (date, type)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS storage_locations (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT    NOT NULL,
            notes         TEXT    NOT NULL DEFAULT '',
            display_order INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS storage_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            location_id INTEGER NOT NULL,
            name        TEXT    NOT NULL,
            notes       TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    """)

    conn.commit()
    conn.close()


init_db()


# ── Weather codes ──────────────────────────────────────────────────────────────

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
    if code == 0: return "☀️"
    if code in (1, 2): return "⛅"
    if code == 3: return "☁️"
    if code in (45, 48): return "🌫️"
    if 51 <= code <= 67: return "🌧️"
    if 71 <= code <= 77: return "❄️"
    if 80 <= code <= 82: return "🌦️"
    if 85 <= code <= 86: return "🌨️"
    if code >= 95: return "⛈️"
    return "🌡️"


# ── Config & in-memory cache ───────────────────────────────────────────────────

def load_config():
    with open(CONFIG_FILE) as f:
        return json.load(f)


_cache: dict = {}


def get_cache(key: str, ttl: int = 3600):
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < ttl:
        return entry["data"]
    return None


def set_cache(key: str, data):
    _cache[key] = {"ts": time.time(), "data": data}


# ── Push notifications via ntfy ────────────────────────────────────────────────

def send_notification(title: str, message: str, tags: list = None):
    """Non-blocking push notification via ntfy.sh (or self-hosted ntfy)."""
    config = load_config()
    ntfy_cfg = config.get("ntfy", {})
    topic = ntfy_cfg.get("topic", "").strip()
    if not topic:
        return
    server = ntfy_cfg.get("server", "https://ntfy.sh").rstrip("/")

    def _fire():
        try:
            headers = {"Title": title}
            if tags:
                headers["Tags"] = ",".join(tags)
            requests.post(
                f"{server}/{topic}",
                data=message.encode("utf-8"),
                headers=headers,
                timeout=5,
            )
        except Exception:
            pass

    threading.Thread(target=_fire, daemon=True).start()


# ── SMS via email-to-SMS gateway ───────────────────────────────────────────────

def send_sms(title: str, message: str):
    """Non-blocking SMS via carrier email-to-SMS gateway (Gmail SMTP)."""
    config = load_config()
    sms_cfg = config.get("sms", {})
    recipients = sms_cfg.get("recipients", [])
    smtp_user = sms_cfg.get("smtp_user", "").strip()
    smtp_password = sms_cfg.get("smtp_password", "").strip()
    if not recipients or not smtp_user or not smtp_password:
        return

    smtp_host = sms_cfg.get("smtp_host", "smtp.gmail.com")
    smtp_port = int(sms_cfg.get("smtp_port", 587))

    def _fire():
        try:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                for recipient in recipients:
                    msg = MIMEText(message)
                    msg["From"] = smtp_user
                    msg["To"] = recipient
                    msg["Subject"] = title
                    server.sendmail(smtp_user, recipient, msg.as_string())
        except Exception:
            pass

    threading.Thread(target=_fire, daemon=True).start()


def notify(title: str, message: str, tags: list = None):
    """Send both a push notification (ntfy) and an SMS."""
    send_notification(title, message, tags=tags)
    send_sms(title, message)


# ── Pi-hole v6 auth ────────────────────────────────────────────────────────────

_pihole_v6_sid: dict = {"value": None, "expires": 0.0}


def _pihole_v6_auth(host: str, password: str) -> str:
    r = requests.post(
        f"http://{host}/api/auth",
        json={"password": password},
        timeout=5,
    )
    r.raise_for_status()
    sess = r.json().get("session", {})
    if not sess.get("valid"):
        raise Exception("Authentication failed — check pihole.password in config.json")
    _pihole_v6_sid["value"] = sess["sid"]
    _pihole_v6_sid["expires"] = time.time() + sess.get("validity", 1800) - 60
    return sess["sid"]


def _pihole_v6_get(host: str, password: str, path: str) -> dict:
    if not _pihole_v6_sid["value"] or time.time() >= _pihole_v6_sid["expires"]:
        _pihole_v6_auth(host, password)
    r = requests.get(
        f"http://{host}/api/{path}",
        headers={"sid": _pihole_v6_sid["value"]},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()


# ── Helpers ────────────────────────────────────────────────────────────────────

def ping(host):
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "1", host],
            capture_output=True, timeout=3,
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
        if d: return f"{d}d {h}h {m}m"
        if h: return f"{h}h {m}m"
        return f"{m}m"
    except Exception:
        return "unknown"


# ── Calendar notifications & scheduler ────────────────────────────────────────

def _fmt_event_time(e):
    return f" at {e['time']}" if e['time'] else " (all day)"


def _send_morning_brief():
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_db()
    evs = conn.execute(
        "SELECT * FROM events WHERE date = ? ORDER BY time ASC NULLS LAST", (today,)
    ).fetchall()
    conn.close()
    if not evs:
        return
    lines = ["Good morning! Today:"] + [f"• {e['title']}{_fmt_event_time(e)}" for e in evs]
    notify("📅 Morning Brief", "\n".join(lines), tags=["calendar"])


def _send_evening_brief():
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    conn = get_db()
    evs = conn.execute(
        "SELECT * FROM events WHERE date = ? ORDER BY time ASC NULLS LAST", (tomorrow,)
    ).fetchall()
    conn.close()
    if not evs:
        return
    lines = ["Tomorrow's events:"]
    for e in evs:
        flag = ""
        if e['time']:
            try:
                if int(e['time'].split(":")[0]) < 9:
                    flag = " ⚠️ early"
            except Exception:
                pass
        lines.append(f"• {e['title']}{_fmt_event_time(e)}{flag}")
    notify("📅 Evening Brief", "\n".join(lines), tags=["calendar"])


def _send_event_reminders():
    config = load_config()
    mins = int(config.get("calendar", {}).get("reminder_minutes", 60))
    now = datetime.now()
    target_time = (now + timedelta(minutes=mins)).strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")
    conn = get_db()
    evs = conn.execute(
        "SELECT * FROM events WHERE date = ? AND time = ? AND reminder_sent = 0",
        (today, target_time),
    ).fetchall()
    for e in evs:
        msg = f"{e['title']} starts in {mins} min"
        if e['notes']:
            msg += f"\n{e['notes']}"
        notify("📅 Reminder", msg, tags=["alarm_clock"])
        conn.execute("UPDATE events SET reminder_sent = 1 WHERE id = ?", (e['id'],))
    conn.commit()
    conn.close()


def _calendar_scheduler():
    sent = {}
    while True:
        try:
            now = datetime.now()
            today = now.strftime("%Y-%m-%d")
            hhmm = now.strftime("%H:%M")
            config = load_config()
            cal = config.get("calendar", {})
            day = sent.setdefault(today, {})

            if hhmm == cal.get("morning_brief", "08:00") and not day.get("morning"):
                day["morning"] = True
                _send_morning_brief()

            if hhmm == cal.get("evening_brief", "21:00") and not day.get("evening"):
                day["evening"] = True
                _send_evening_brief()

            _send_event_reminders()

            for d in [k for k in sent if k < today]:
                del sent[d]
        except Exception:
            pass
        time.sleep(60)


threading.Thread(target=_calendar_scheduler, daemon=True).start()


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    config = load_config()
    return render_template("index.html", tvs=config.get("tvs", []))


@app.route("/settings")
def settings_page():
    return render_template("settings.html")


@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify(load_config())


@app.route("/api/config", methods=["PATCH"])
def patch_config():
    data = request.get_json(silent=True) or {}
    try:
        config = load_config()
        for key, val in data.items():
            config[key] = val
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
        if "weather" in data:
            _cache.pop("weather_default", None)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/geocode")
def geocode():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": name, "count": 1, "language": "en", "format": "json"},
            timeout=8,
        ).json()
        results = geo.get("results") or []
        if not results:
            return jsonify({"error": f"City not found: {name}"}), 404
        r = results[0]
        display = r["name"]
        if r.get("admin1"):
            display += f", {r['admin1']}"
        return jsonify({"name": display, "latitude": r["latitude"], "longitude": r["longitude"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _fetch_weather_for(lat, lon, units="fahrenheit"):
    r = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat, "longitude": lon,
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m",
            "temperature_unit": units,
            "wind_speed_unit": "mph",
            "timezone": "auto",
        },
        timeout=10,
    )
    r.raise_for_status()
    d = r.json()["current"]
    unit_sym = "°F" if units == "fahrenheit" else "°C"
    return {
        "temp": round(d["temperature_2m"]),
        "feels_like": round(d["apparent_temperature"]),
        "humidity": d["relative_humidity_2m"],
        "wind": round(d["wind_speed_10m"]),
        "description": WMO_DESCRIPTIONS.get(d["weather_code"], "Unknown"),
        "icon": wmo_icon(d["weather_code"]),
        "unit": unit_sym,
    }


@app.route("/api/weather")
def weather():
    config = load_config()
    w = config.get("weather", {})
    units = w.get("units", "fahrenheit")
    results = []

    # Default city from config.json — shown first, not deletable from dashboard
    if w.get("latitude") and w.get("city") and w.get("city") != "Your City":
        cached = get_cache("weather_default", ttl=600)
        if cached:
            results.append(cached)
        else:
            try:
                data = _fetch_weather_for(w["latitude"], w["longitude"], units)
                data.update({"city_id": None, "name": w["city"], "is_default": True})
                set_cache("weather_default", data)
                results.append(data)
            except Exception as e:
                results.append({"city_id": None, "name": w["city"], "is_default": True, "error": str(e)})

    # Additional cities from DB
    conn = get_db()
    cities = conn.execute(
        "SELECT * FROM weather_cities ORDER BY display_order, id"
    ).fetchall()
    conn.close()
    for city in cities:
        cache_key = f"weather_{city['id']}"
        cached = get_cache(cache_key, ttl=600)
        if cached:
            results.append(cached)
            continue
        try:
            data = _fetch_weather_for(city["latitude"], city["longitude"], units)
            data.update({"city_id": city["id"], "name": city["name"], "is_default": False})
            set_cache(cache_key, data)
            results.append(data)
        except Exception as e:
            results.append({"city_id": city["id"], "name": city["name"], "is_default": False, "error": str(e)})

    return jsonify(results)


@app.route("/api/weather/cities", methods=["GET"])
def weather_cities():
    conn = get_db()
    rows = conn.execute("SELECT * FROM weather_cities ORDER BY display_order, id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/weather/cities", methods=["POST"])
def add_weather_city():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400

    # Geocode via Open-Meteo
    try:
        geo = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": name, "count": 1, "language": "en", "format": "json"},
            timeout=8,
        ).json()
        results = geo.get("results") or []
        if not results:
            return jsonify({"error": f"City not found: {name}"}), 404
        r = results[0]
        display = r["name"]
        if r.get("admin1"):
            display += f", {r['admin1']}"
        lat, lon = r["latitude"], r["longitude"]
    except Exception as e:
        return jsonify({"error": f"Geocoding failed: {e}"}), 500

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO weather_cities (name, latitude, longitude) VALUES (?,?,?)",
        (display, lat, lon),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM weather_cities WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/weather/cities/<int:city_id>", methods=["DELETE"])
def delete_weather_city(city_id):
    conn = get_db()
    conn.execute("DELETE FROM weather_cities WHERE id = ?", (city_id,))
    conn.commit()
    conn.close()
    _cache.pop(f"weather_{city_id}", None)
    return "", 204


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
                articles.append({
                    "title": entry.get("title", "").strip(),
                    "link": entry.get("link", ""),
                    "source": feed_cfg["name"],
                    "published": entry.get("published", ""),
                })
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
    password = ph.get("password", "").strip()
    api_key = ph.get("api_key", "").strip()

    # Pi-hole v6: uses password auth + REST API
    if password:
        try:
            summary = _pihole_v6_get(host, password, "stats/summary")
            blocking = _pihole_v6_get(host, password, "dns/blocking")
            q = summary.get("queries", {})
            g = summary.get("gravity", {})
            return jsonify({
                "queries_today": q.get("total", 0),
                "blocked_today": q.get("blocked", 0),
                "percent_blocked": round(float(q.get("percent_blocked", 0)), 1),
                "domains_blocked": g.get("domains_being_blocked", 0),
                "status": blocking.get("blocking", "unknown"),
            })
        except Exception as e:
            return jsonify({"error": f"Pi-hole v6: {e}"}), 500

    # Pi-hole v5 fallback: /admin/api.php
    try:
        url = f"http://{host}/admin/api.php?summary"
        if api_key:
            url += f"&auth={api_key}"
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        d = r.json()
        return jsonify({
            "queries_today": d.get("dns_queries_today", 0),
            "blocked_today": d.get("ads_blocked_today", 0),
            "percent_blocked": round(float(d.get("ads_percentage_today", 0)), 1),
            "domains_blocked": d.get("domains_being_blocked", 0),
            "status": d.get("status", "unknown"),
        })
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
        return jsonify({
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
        })
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
        subprocess.run(["adb", "connect", f"{ip}:5555"], capture_output=True, timeout=10)
        result = subprocess.run(
            ["adb", "-s", f"{ip}:5555", "shell", "input", "keyevent", "KEYCODE_SLEEP"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return jsonify({"success": True, "tv": tv["name"]})
        return jsonify({"success": False, "error": result.stderr or "ADB command failed"}), 500
    except FileNotFoundError:
        return jsonify({"success": False, "error": "adb not installed — run: sudo apt install android-tools-adb"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/quote")
def quote():
    force = request.args.get("refresh") == "1"
    cached = None if force else get_cache("quote", 3600)
    if cached:
        return jsonify(cached)
    try:
        r = requests.get("https://zenquotes.io/api/random", timeout=10)
        r.raise_for_status()
        d = r.json()[0]
        result = {"text": d["q"], "author": d["a"]}
        set_cache("quote", result)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/joke")
def joke():
    force = request.args.get("refresh") == "1"
    cached = None if force else get_cache("joke", 3600)
    if cached:
        return jsonify(cached)
    try:
        r = requests.get("https://v2.jokeapi.dev/joke/Any?safe-mode", timeout=10)
        r.raise_for_status()
        d = r.json()
        if d.get("error"):
            return jsonify({"error": d.get("message", "JokeAPI error")}), 500
        if d["type"] == "single":
            result = {"type": "single", "joke": d["joke"]}
        else:
            result = {"type": "twopart", "setup": d["setup"], "delivery": d["delivery"]}
        set_cache("joke", result)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/photo")
def photo():
    force = request.args.get("refresh") == "1"
    cached = None if force else get_cache("photo", 6 * 3600)
    if cached:
        return jsonify(cached)
    config = load_config()
    photo_cfg = config.get("photo", {})
    source = photo_cfg.get("source", "picsum")

    if source == "nasa_apod":
        api_key = photo_cfg.get("nasa_api_key") or "DEMO_KEY"
        try:
            r = requests.get(
                "https://api.nasa.gov/planetary/apod",
                params={"api_key": api_key},
                timeout=10,
            )
            r.raise_for_status()
            d = r.json()
            if d.get("media_type") != "image":
                raise ValueError("Today's APOD is not an image")
            explanation = d.get("explanation", "")
            result = {
                "url": d.get("hdurl") or d.get("url"),
                "title": d.get("title", ""),
                "caption": explanation[:220] + "…" if len(explanation) > 220 else explanation,
                "source": "NASA Astronomy Picture of the Day",
            }
            set_cache("photo", result)
            return jsonify(result)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        # Force refresh picks a random Picsum image; normal load seeds by date
        seed = str(random.randint(1, 999999)) if force else time.strftime("%Y%m%d")
        result = {
            "url": f"https://picsum.photos/seed/{seed}/1000/520",
            "title": "",
            "caption": "",
            "source": "picsum.photos",
        }
        set_cache("photo", result)
        return jsonify(result)


# ── Todos (3 states: 0=pending, 1=in progress, 2=done) ────────────────────────

_TODO_NOTIFY = {
    1: ("⏳ In progress", ["hourglass_flowing_sand"]),
    2: ("✅ Done",        ["white_check_mark"]),
}


@app.route("/api/todos", methods=["GET"])
def get_todos():
    conn = get_db()
    rows = conn.execute("SELECT * FROM todos ORDER BY status ASC, id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/todos", methods=["POST"])
def add_todo():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text required"}), 400
    if len(text) > 500:
        return jsonify({"error": "Max 500 characters"}), 400
    conn = get_db()
    cur = conn.execute("INSERT INTO todos (text) VALUES (?)", (text,))
    conn.commit()
    row = conn.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/todos/<int:todo_id>", methods=["PATCH"])
def update_todo(todo_id):
    data = request.get_json(silent=True) or {}
    new_status = int(data.get("status", 0))
    if new_status not in (0, 1, 2):
        return jsonify({"error": "Invalid status"}), 400

    conn = get_db()
    old = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if not old:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    conn.execute("UPDATE todos SET status = ? WHERE id = ?", (new_status, todo_id))
    conn.commit()
    row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    conn.close()

    old_status = old["status"] if "status" in old.keys() else 0
    if new_status > old_status and new_status in _TODO_NOTIFY:
        title, tags = _TODO_NOTIFY[new_status]
        notify(title, row["text"], tags=tags)

    return jsonify(dict(row))


@app.route("/api/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    conn = get_db()
    conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    conn.commit()
    conn.close()
    return "", 204


# ── Notes / Suggestions ────────────────────────────────────────────────────────

@app.route("/api/notes", methods=["GET"])
def get_notes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM notes ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/notes", methods=["POST"])
def add_note():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    name = (data.get("name") or "").strip()[:60]
    if not text:
        return jsonify({"error": "Text required"}), 400
    if len(text) > 1000:
        return jsonify({"error": "Max 1000 characters"}), 400
    conn = get_db()
    cur = conn.execute("INSERT INTO notes (name, text) VALUES (?, ?)", (name, text))
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    notify(
        f"💬 {name or 'Anonymous'} left a suggestion",
        text,
        tags=["speech_balloon"],
    )
    return jsonify(dict(row)), 201


@app.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    conn = get_db()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return "", 204


# ── Groceries ──────────────────────────────────────────────────────────────────

@app.route("/api/groceries", methods=["GET"])
def get_groceries():
    conn = get_db()
    rows = conn.execute("SELECT * FROM groceries ORDER BY done ASC, id DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/groceries", methods=["POST"])
def add_grocery():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Text required"}), 400
    if len(text) > 300:
        return jsonify({"error": "Max 300 characters"}), 400
    conn = get_db()
    cur = conn.execute("INSERT INTO groceries (text) VALUES (?)", (text,))
    conn.commit()
    row = conn.execute("SELECT * FROM groceries WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    notify("🛒 Grocery list", f"Added: {text}", tags=["shopping_cart"])
    return jsonify(dict(row)), 201


@app.route("/api/groceries/<int:item_id>", methods=["PATCH"])
def update_grocery(item_id):
    data = request.get_json(silent=True) or {}
    done = 1 if data.get("done") else 0
    conn = get_db()
    conn.execute("UPDATE groceries SET done = ? WHERE id = ?", (done, item_id))
    conn.commit()
    row = conn.execute("SELECT * FROM groceries WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(row))


@app.route("/api/groceries/<int:item_id>", methods=["DELETE"])
def delete_grocery(item_id):
    conn = get_db()
    conn.execute("DELETE FROM groceries WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return "", 204


# ── Calendar ──────────────────────────────────────────────────────────────────

@app.route("/api/calendar", methods=["GET"])
def get_events():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM events WHERE date >= date('now','localtime','-1 day') ORDER BY date, time ASC NULLS LAST"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/calendar", methods=["POST"])
def add_event():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    date  = (data.get("date") or "").strip()
    if not title or not date:
        return jsonify({"error": "Title and date required"}), 400
    t     = (data.get("time") or "").strip() or None
    notes = (data.get("notes") or "").strip()
    conn  = get_db()
    cur   = conn.execute(
        "INSERT INTO events (title, date, time, notes) VALUES (?,?,?,?)",
        (title[:200], date, t, notes[:500]),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/calendar/<int:event_id>", methods=["DELETE"])
def delete_event(event_id):
    conn = get_db()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return "", 204


# ── Storage Inventory ──────────────────────────────────────────────────────────

@app.route("/storage")
def storage_page():
    return render_template("storage.html")


@app.route("/api/storage")
def get_storage():
    conn = get_db()
    locs = conn.execute("SELECT * FROM storage_locations ORDER BY display_order, id").fetchall()
    result = []
    for loc in locs:
        items = conn.execute(
            "SELECT * FROM storage_items WHERE location_id = ? ORDER BY name",
            (loc["id"],),
        ).fetchall()
        result.append({**dict(loc), "items": [dict(i) for i in items]})
    conn.close()
    return jsonify(result)


@app.route("/api/storage/search")
def search_storage():
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    conn = get_db()
    rows = conn.execute(
        """SELECT si.id, si.name, si.notes, sl.name AS location_name, sl.id AS location_id
           FROM storage_items si
           JOIN storage_locations sl ON sl.id = si.location_id
           WHERE si.name LIKE ? OR si.notes LIKE ?
           ORDER BY si.name""",
        (f"%{q}%", f"%{q}%"),
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/storage/locations", methods=["POST"])
def add_storage_location():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name required"}), 400
    notes = (data.get("notes") or "").strip()
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO storage_locations (name, notes) VALUES (?,?)", (name[:200], notes[:500])
    )
    conn.commit()
    row = conn.execute("SELECT * FROM storage_locations WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/storage/locations/<int:loc_id>", methods=["DELETE"])
def delete_storage_location(loc_id):
    conn = get_db()
    conn.execute("DELETE FROM storage_items WHERE location_id = ?", (loc_id,))
    conn.execute("DELETE FROM storage_locations WHERE id = ?", (loc_id,))
    conn.commit()
    conn.close()
    return "", 204


@app.route("/api/storage/items", methods=["POST"])
def add_storage_item():
    data = request.get_json(silent=True) or {}
    location_id = data.get("location_id")
    name = (data.get("name") or "").strip()
    if not location_id or not name:
        return jsonify({"error": "location_id and name required"}), 400
    notes = (data.get("notes") or "").strip()
    conn = get_db()
    loc = conn.execute("SELECT id FROM storage_locations WHERE id = ?", (location_id,)).fetchone()
    if not loc:
        conn.close()
        return jsonify({"error": "Location not found"}), 404
    cur = conn.execute(
        "INSERT INTO storage_items (location_id, name, notes) VALUES (?,?,?)",
        (location_id, name[:300], notes[:500]),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM storage_items WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/storage/items/<int:item_id>", methods=["DELETE"])
def delete_storage_item(item_id):
    conn = get_db()
    conn.execute("DELETE FROM storage_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return "", 204


# ── Tribal Wars ────────────────────────────────────────────────────────────────

def _tw_cors(response):
    """Allow TW pages (different origin) to POST to our endpoints."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


def _generate_tw_context(data: dict):
    """Write tribalwars/CONTEXT.md from synced data."""
    p      = data.get("player") or {}
    tribe  = data.get("tribe")
    vils   = data.get("my_villages", [])
    members = data.get("tribe_members", [])
    top_tribes = data.get("top_tribes", [])
    neighbors  = data.get("neighbors", [])

    lines = [
        "# Tribal Wars Context — " + data.get("world", "?"),
        "",
        f"> Auto-generated by sync.js — last synced: {data.get('synced_at', '?')}",
        "> Do not edit manually. Re-run sync.js inside the game to refresh.",
        "",
        "## Player",
        f"- **Name**: {p.get('name', '?')}",
        f"- **World**: {data.get('world', '?')}",
        f"- **Rank**: #{p.get('rank', '?')}",
        f"- **Points**: {p.get('points', 0):,}",
        f"- **Villages**: {p.get('villages', 0)}",
    ]

    if tribe:
        lines.append(f"- **Tribe**: [{tribe.get('tag')}] {tribe.get('name')}  (Rank #{tribe.get('rank')})")
    else:
        lines.append("- **Tribe**: none")

    lines += [
        "",
        "## My Villages",
        "",
        "| Name | Coords | Points |",
        "|------|--------|--------|",
    ]
    for v in sorted(vils, key=lambda x: -x.get("points", 0)):
        lines.append(f"| {v['name']} | ({v['x']}|{v['y']}) | {v.get('points', 0):,} |")

    if tribe:
        lines += [
            "",
            f"## Tribe: [{tribe.get('tag')}] — {tribe.get('name')}",
            f"- Rank: #{tribe.get('rank')}",
            f"- Members: {tribe.get('members')}",
            f"- Total Villages: {tribe.get('villages')}",
            f"- Total Points: {tribe.get('points', 0):,}",
            "",
            "### Tribe Members",
            "",
            "| Player | Rank | Points | Villages |",
            "|--------|------|--------|----------|",
        ]
        for m in members:
            lines.append(f"| {m['name']} | #{m['rank']} | {m['points']:,} | {m['villages']} |")

    lines += [
        "",
        "## World — Top Tribes",
        "",
        "| Rank | Tag | Name | Members | Points |",
        "|------|-----|------|---------|--------|",
    ]
    for t in top_tribes[:20]:
        lines.append(f"| #{t['rank']} | [{t['tag']}] | {t['name']} | {t['members']} | {t['points']:,} |")

    if neighbors:
        lines += [
            "",
            "## Neighbors (within 25 tiles)",
            "",
            "| Player | Tribe | Rank | Points | Nearest Village | Distance |",
            "|--------|-------|------|--------|-----------------|----------|",
        ]
        for n in neighbors[:40]:
            nearest = n.get("near_villages", [{}])[0]
            coord   = f"({nearest.get('x')}|{nearest.get('y')})" if nearest else "?"
            dist_   = nearest.get("dist", "?")
            lines.append(
                f"| {n['name']} | [{n.get('tribe_tag', '')}] | #{n['rank']} "
                f"| {n['points']:,} | {coord} | {dist_} |"
            )

    lines += [
        "",
        "## Notes",
        "",
        "_Add enemies, active wars, diplomacy, and strategy notes here._",
        "_This section is not overwritten by sync.js._",
        "",
    ]

    os.makedirs(TW_DIR, exist_ok=True)
    context_path = os.path.join(TW_DIR, "CONTEXT.md")

    # Preserve the Notes section if it already exists
    if os.path.exists(context_path):
        with open(context_path) as f:
            existing = f.read()
        notes_marker = "## Notes"
        if notes_marker in existing:
            existing_notes = existing[existing.index(notes_marker):]
            # Replace the placeholder Notes section with the preserved one
            marker_idx = next(
                (i for i, l in enumerate(lines) if l == "## Notes"), None
            )
            if marker_idx is not None:
                lines = lines[:marker_idx] + existing_notes.splitlines()

    with open(context_path, "w") as f:
        f.write("\n".join(lines) + "\n")


@app.route("/api/tw/sync", methods=["POST", "OPTIONS"])
def tw_sync():
    if request.method == "OPTIONS":
        return _tw_cors(app.make_default_options_response())

    data = request.get_json(silent=True)
    if not data:
        return _tw_cors(jsonify({"error": "No JSON body"})), 400

    os.makedirs(TW_DIR, exist_ok=True)
    with open(TW_DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

    _generate_tw_context(data)

    p = data.get("player") or {}
    return _tw_cors(jsonify({
        "ok": True,
        "player": p.get("name"),
        "villages": len(data.get("my_villages", [])),
        "neighbors": len(data.get("neighbors", [])),
    }))


@app.route("/api/tw/data", methods=["GET"])
def tw_data():
    if not os.path.exists(TW_DATA_FILE):
        return jsonify({"error": "No data yet — run sync.js first"}), 404
    with open(TW_DATA_FILE) as f:
        return _tw_cors(jsonify(json.load(f)))


@app.route("/tw/<path:filename>")
def tw_scripts(filename):
    """Serve scripts from the tribalwars/ folder.
    Enter http://your-pi-ip:8888/tw/sync.js in the TW Script URL field."""
    return send_from_directory(TW_DIR, filename)


# ── OTA Update ─────────────────────────────────────────────────────────────────

@app.route("/api/update", methods=["POST"])
def ota_update():
    config = load_config()
    update_cfg = config.get("update", {})
    expected_pw = update_cfg.get("password", "").strip()
    branch = update_cfg.get("branch", "main").strip()

    if not expected_pw:
        return jsonify({"error": "Set update.password in config.json first"}), 403

    data = request.get_json(silent=True) or {}
    if data.get("password") != expected_pw:
        return jsonify({"error": "Wrong password"}), 403

    # Preserve config.json across the reset — it has local settings not in git
    import shutil
    config_bak = CONFIG_FILE + ".update-bak"
    shutil.copy2(CONFIG_FILE, config_bak)

    lines = []
    try:
        for cmd in [
            ["git", "fetch", "origin", branch],
            ["git", "reset", "--hard", f"origin/{branch}"],
        ]:
            r = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, timeout=60)
            lines.append(f"$ {' '.join(cmd)}")
            lines.append((r.stdout + r.stderr).strip())
            if r.returncode != 0:
                shutil.copy2(config_bak, CONFIG_FILE)
                return jsonify({"error": "git failed", "output": "\n".join(lines)}), 500
    finally:
        shutil.copy2(config_bak, CONFIG_FILE)
        os.remove(config_bak)

    def _restart():
        time.sleep(2)
        subprocess.run(["sudo", "systemctl", "restart", "pi-dashboard"])

    threading.Thread(target=_restart, daemon=True).start()

    return jsonify({"ok": True, "output": "\n".join(lines)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8888, debug=False)
