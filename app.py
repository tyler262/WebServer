from flask import Flask, jsonify, render_template, request
import json
import os
import random
import socket
import sqlite3
import subprocess
import threading
import time

import feedparser
import psutil
import requests

app = Flask(__name__)
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")
DB_FILE = os.path.join(os.path.dirname(__file__), "dashboard.db")


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


# ── Routes ─────────────────────────────────────────────────────────────────────

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
        return jsonify({
            "city": w["city"],
            "temp": round(d["temperature_2m"]),
            "feels_like": round(d["apparent_temperature"]),
            "humidity": d["relative_humidity_2m"],
            "wind": round(d["wind_speed_10m"]),
            "description": WMO_DESCRIPTIONS.get(d["weather_code"], "Unknown"),
            "icon": wmo_icon(d["weather_code"]),
            "unit": unit_sym,
        })
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
        send_notification(title, row["text"], tags=tags)

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
    send_notification(
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
    send_notification("🛒 Grocery list", f"Added: {text}", tags=["shopping_cart"])
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
