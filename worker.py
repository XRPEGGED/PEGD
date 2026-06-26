#!/usr/bin/env python3
"""
PEGD Compute Worker
Mine the most profitable GPU coin. Earn PEGD.
"""

import datetime
import json
import math
import os
import platform
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib import request, error
from urllib.parse import urlencode

try:
    import tkinter as tk
    from tkinter import ttk, messagebox, scrolledtext
except Exception:
    print("tkinter is required. Install Python from python.org with Tcl/Tk support.")
    sys.exit(1)

# ── Config ──────────────────────────────────────────────────────────────────

COORDINATOR_URL = "https://pegd-compute.xrpegged.workers.dev"
CONFIG_FILE     = Path.home() / ".pegd-worker" / "config.json"
MINERS_DIR      = Path(__file__).parent / "miners"
HEARTBEAT_SECS  = 120
DEFAULT_ASSIGNMENT_SECS = 300
IS_WINDOWS      = os.name == "nt"
PLATFORM_KEY    = "windows" if IS_WINDOWS else "linux"

TUNING_FILE    = Path.home() / ".pegd-worker" / "tuning.json"
TREX_API       = "http://127.0.0.1:4067/summary"
TUNE_STEPS     = [20, 21, 22, 23, 24]  # T-Rex KawPow is unstable below its normal intensity range
TUNE_WARMUP    = 40   # seconds to stabilize before sampling
TUNE_SAMPLE    = 15   # seconds to average over

DEFAULT_INTENSITY   = 90   # % of max intensity (0–100)
DEFAULT_TEMP_LIMIT  = 80   # °C — miner pauses above this
DEFAULT_POWER_LIMIT = 0    # watts — 0 = use card default (>0 requires root on Linux)

MINER_RELEASES = {
    "trex": {
        "vendor": "nvidia",
        "linux": {
            "url": "https://github.com/trexminer/T-Rex/releases/download/0.26.8/t-rex-0.26.8-linux.tar.gz",
            "bin": "t-rex",
        },
        "windows": {
            "url": "https://github.com/trexminer/T-Rex/releases/download/0.26.8/t-rex-0.26.8-win.zip",
            "bin": "t-rex.exe",
        },
    },
    "lolminer": {
        "vendor": "any",
        "linux": {
            "url": "https://github.com/Lolliedieb/lolMiner-releases/releases/download/1.88/lolMiner_v1.88_Lin64.tar.gz",
            "bin": "lolMiner",
        },
        "windows": {
            "url": "https://github.com/Lolliedieb/lolMiner-releases/releases/download/1.88/lolMiner_v1.88_Win64.zip",
            "bin": "lolMiner.exe",
        },
    },
    "xmrig": {
        "vendor": "cpu",
        "linux": {
            "url": "https://github.com/xmrig/xmrig/releases/download/v6.22.2/xmrig-6.22.2-linux-static-x64.tar.gz",
            "bin": "xmrig",
        },
        "windows": {
            "url": "https://github.com/xmrig/xmrig/releases/download/v6.22.2/xmrig-6.22.2-msvc-win64.zip",
            "bin": "xmrig.exe",
        },
    },
    "lpminer": {
        "vendor": "nvidia",   # PearlPow is NVIDIA-only
        "linux": {
            "url": "https://pearl.luckypool.io/lpminer/lpminer-0.1.9.tar.gz",
            "bin": "lpminer",
        },
        "windows": {
            "url": "https://pearl.luckypool.io/lpminer/lpminer-0.1.10.zip",
            "bin": "lpminer.exe",
        },
    },
}

# Algorithm → miner preference
ALGO_MINER = {
    "KHeavyHash":  "trex",
    "Autolykos2":  "trex",
    "Etchash":     "trex",
    "Ethash":      "trex",
    "KawPow":      "trex",
    "FiroPoW":     "trex",
    "ZHash":       "lolminer",
    "Equihash":    "lolminer",
    "Octopus":     "lolminer",
    "RandomX":     "xmrig",
    "PearlPow":    "lpminer",
}

# ── GPU Detection ────────────────────────────────────────────────────────────

def detect_gpus():
    gpus = []
    # NVIDIA
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, text=True
        )
        for i, line in enumerate(out.strip().splitlines()):
            parts = [p.strip() for p in line.split(",")]
            gpus.append({"index": i, "name": parts[0], "vram_mb": int(parts[1]),
                          "vendor": "nvidia", "driver": parts[2]})
    except Exception:
        pass

    # AMD
    if not gpus:
        try:
            if IS_WINDOWS:
                out = subprocess.check_output(
                    ["powershell", "-NoProfile", "-Command",
                     "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"],
                    stderr=subprocess.DEVNULL, text=True
                )
                names = [line.strip() for line in out.splitlines()
                         if "amd" in line.lower() or "radeon" in line.lower()]
                for i, name in enumerate(names):
                    gpus.append({"index": i, "name": name, "vram_mb": 0,
                                 "vendor": "amd", "driver": "windows"})
            else:
                out = subprocess.check_output(
                    ["rocm-smi", "--showproductname", "--csv"],
                    stderr=subprocess.DEVNULL, text=True
                )
                for i, line in enumerate(out.strip().splitlines()[1:]):
                    gpus.append({"index": i, "name": line.strip(), "vram_mb": 0,
                                 "vendor": "amd", "driver": "rocm"})
        except Exception:
            pass

    return gpus

def detect_cpu():
    cores = os.cpu_count() or 1
    if IS_WINDOWS:
        name = os.environ.get("PROCESSOR_IDENTIFIER") or platform.processor() or "CPU"
        return {"name": name, "cores": cores}
    try:
        with open('/proc/cpuinfo') as f:
            for line in f:
                if line.startswith('model name'):
                    name = line.split(':')[1].strip()
                    return {"name": name, "cores": cores}
    except Exception:
        pass
    return {"name": platform.processor() or "CPU", "cores": cores}

def tuning_key(gpu_name, algorithm):
    slug = re.sub(r'[^a-z0-9]+', '_', gpu_name.lower()).strip('_')
    return f"{slug}_{algorithm.lower()}"

def load_tuning():
    if TUNING_FILE.exists():
        try:
            return json.loads(TUNING_FILE.read_text())
        except Exception:
            pass
    return {}

def save_tuning(data):
    TUNING_FILE.parent.mkdir(parents=True, exist_ok=True)
    TUNING_FILE.write_text(json.dumps(data, indent=2))

def query_trex_api():
    """Return (mh_per_s, watts) from T-Rex REST API, or (None, None)."""
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = request.Request(TREX_API)
        with request.urlopen(req, timeout=3) as r:
            data = json.loads(r.read())
        mh  = data["hashrate"]["total"][0] / 1e6
        w   = sum(g.get("power", 0) for g in data.get("gpus", []))
        return mh, w
    except Exception:
        return None, None

def poll_gpu_temp():
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL, text=True
        )
        temps = [int(t.strip()) for t in out.strip().splitlines() if t.strip().isdigit()]
        return max(temps) if temps else None
    except Exception:
        return None

def apply_memory_oc(mhz_offset):
    """Apply GPU memory OC via nvidia-settings. Returns (success, message)."""
    if not mhz_offset:
        return True, ""
    if IS_WINDOWS:
        return False, "Memory offset is Linux-only; use the absolute memory lock control on Windows."
    env = {**os.environ, "DISPLAY": os.environ.get("DISPLAY", ":0")}
    try:
        r = subprocess.run(
            ["nvidia-settings", "-a",
             f"[gpu:0]/GPUMemoryTransferRateOffsetAllBand[3]={mhz_offset}"],
            capture_output=True, text=True, timeout=5, env=env
        )
        if r.returncode == 0:
            return True, f"Memory OC +{mhz_offset} MHz applied"
        return False, (
            "nvidia-settings failed — enable Coolbits first:\n"
            "  sudo nvidia-xconfig --cool-bits=28\n"
            "  then reboot"
        )
    except FileNotFoundError:
        return False, "nvidia-settings not found: sudo apt install nvidia-settings"
    except Exception as e:
        return False, str(e)

def apply_locked_clocks(core_mhz=0, memory_mhz=0):
    """Apply absolute NVIDIA core/memory clocks. Returns (success, message)."""
    targets = []
    if core_mhz > 0:
        targets.append(("--lock-gpu-clocks", core_mhz, "core"))
    if memory_mhz > 0:
        targets.append(("--lock-memory-clocks", memory_mhz, "memory"))
    if not targets:
        return True, ""

    prefix = ["nvidia-smi"]
    if hasattr(os, "geteuid") and os.geteuid() != 0:
        prefix = ["sudo", "-n", "nvidia-smi"]

    applied = []
    try:
        for option, mhz, label in targets:
            result = subprocess.run(
                [*prefix, "-i", "0", f"{option}={mhz},{mhz}"],
                capture_output=True, text=True, timeout=8
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout).strip()
                return False, (
                    f"Could not lock GPU {label} at {mhz} MHz. "
                    "NVIDIA clock locking requires a supported clock and Administrator/root permissions."
                    + (f" ({detail})" if detail else "")
                )
            applied.append(f"{label} {mhz} MHz")
        return True, "Locked GPU " + " / ".join(applied)
    except FileNotFoundError as e:
        missing = e.filename or "nvidia-smi"
        return False, f"{missing} not found; NVIDIA clock locks were not applied"
    except Exception as e:
        return False, str(e)

# ── Time-of-Use scheduler ─────────────────────────────────────────────────────
# Off-peak windows run weekdays between off_start and off_end (wrap midnight),
# plus all weekends and US federal holidays.

TOU_PLANS = {
    "disabled":    ("Mine 24/7 (no TOU)",                  None, None),
    "11pm_6am":    ("11pm–6am + weekends  (Alliant RG-5)", 23,   6),
    "10pm_6am":    ("10pm–6am + weekends",                 22,   6),
    "9pm_7am":     ("9pm–7am  + weekends",                 21,   7),
    "8pm_8am":     ("8pm–8am  + weekends",                 20,   8),
    "7pm_7am":     ("7pm–7am  + weekends",                 19,   7),
}
TOU_LABELS = [v[0] for v in TOU_PLANS.values()]
TOU_KEYS   = list(TOU_PLANS.keys())

_FIXED_HOLIDAYS = {(1,1),(7,4),(12,25)}

def _nth_weekday(year, month, n, wd):
    d, count = datetime.date(year, month, 1), 0
    while True:
        if d.weekday() == wd:
            count += 1
            if count == n:
                return d
        d += datetime.timedelta(days=1)

def _last_weekday(year, month, wd):
    d = datetime.date(year, month % 12 + 1, 1) - datetime.timedelta(days=1)
    while d.weekday() != wd:
        d -= datetime.timedelta(days=1)
    return d

def _is_holiday(d):
    if (d.month, d.day) in _FIXED_HOLIDAYS:
        return True
    y = d.year
    return (d == _last_weekday(y, 5, 0)
         or d == _nth_weekday(y, 9, 1, 0)
         or d == _nth_weekday(y, 11, 4, 3))

def is_offpeak(plan_key):
    _, start, end = TOU_PLANS.get(plan_key, TOU_PLANS["disabled"])
    if start is None:
        return True
    now = datetime.datetime.now()
    d, h = now.date(), now.hour
    if d.weekday() >= 5 or _is_holiday(d):
        return True
    return h >= start or h < end

def next_offpeak_str(plan_key):
    _, start, _ = TOU_PLANS.get(plan_key, TOU_PLANS["disabled"])
    if start is None:
        return ""
    now = datetime.datetime.now()
    fmt = f"{start % 12 or 12}:00 {'AM' if start < 12 else 'PM'}"
    candidate = now.replace(hour=start, minute=0, second=0, microsecond=0)
    if candidate > now:
        return f"{fmt} today"
    tomorrow = (now + datetime.timedelta(days=1)).date()
    if tomorrow.weekday() >= 5 or _is_holiday(tomorrow):
        return "midnight (weekend starts)"
    return f"{fmt} tomorrow"

# ── Config ───────────────────────────────────────────────────────────────────

def load_config():
    default_cpu_threads = max(1, round((os.cpu_count() or 1) * DEFAULT_INTENSITY / 100))
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text())
            cfg.setdefault("cpu_threads", default_cpu_threads)
            return cfg
        except Exception:
            pass
    return {"wallet": "", "autostart": False,
            "intensity": DEFAULT_INTENSITY,
            "cpu_threads": default_cpu_threads,
            "temp_limit": DEFAULT_TEMP_LIMIT,
            "power_limit": DEFAULT_POWER_LIMIT}

def save_config(cfg):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))

# ── Unmineable API ───────────────────────────────────────────────────────────

UNMINEABLE_COIN = 'SOL'
COMPUTE_POOL_WALLET = '4xpXLWEndmwFRm8tZm31pcUdGCw2u6MaeBs3q1RgE5C9'

def default_cpu_assignment():
    return {
        "coin":              "SOL",
        "ticker":            "SOL",
        "payoutCoin":        "SOL",
        "algorithm":         "RandomX",
        "miner":             "xmrig",
        "stratumUrl":        "stratum+tcp://rx.unmineable.com:3333",
        "unmineableWallet":  f"SOL:{COMPUTE_POOL_WALLET}.WORKER_ID-cpu#U-FGJ8HA",
    }

def fetch_unmineable_account(wallet):
    """Returns { balance, threshold, uuid } or None."""
    try:
        import ssl
        ctx = ssl.create_default_context()
        url = f"https://api.unmineable.com/v4/address/{wallet}?coin={UNMINEABLE_COIN}"
        req = request.Request(url, headers=HEADERS)
        with request.urlopen(req, timeout=15, context=ctx) as r:
            data = json.loads(r.read())
        if not data.get('success'):
            return None
        d = data['data']
        return {
            'balance':   float(d.get('balance', 0)),
            'threshold': float(d.get('payment_threshold', 0.05)),
            'uuid':      d.get('uuid'),
        }
    except Exception as e:
        print(f"[unmineable account error] {e}")
        return None

def fetch_unmineable_workers(uuid):
    """Returns list of { name, online, rhr, chr } or []."""
    try:
        import ssl
        ctx = ssl.create_default_context()
        url = f"https://api.unmineable.com/v4/account/{uuid}/workers"
        req = request.Request(url, headers=HEADERS)
        with request.urlopen(req, timeout=15, context=ctx) as r:
            data = json.loads(r.read())
        if not data.get('success'):
            return []
        workers = []
        for algo_data in data['data'].values():
            for w in algo_data.get('workers', []):
                workers.append({
                    'name':   w.get('name', '?'),
                    'online': w.get('online', False),
                    'rhr':    float(w.get('rhr', 0)),
                    'chr':    float(w.get('chr', 0)),
                })
        return workers
    except Exception as e:
        print(f"[unmineable workers error] {e}")
        return []

# ── Coordinator API ───────────────────────────────────────────────────────────

HEADERS = {'User-Agent': 'pegd-worker/1.0'}

def fetch_assignment():
    try:
        import ssl
        ctx = ssl.create_default_context()
        req = request.Request(f"{COORDINATOR_URL}/assignment", headers=HEADERS)
        with request.urlopen(req, timeout=30, context=ctx) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"[fetch_assignment error] {e}")
        return None

def assignment_refresh_seconds(assignment):
    explicit = assignment.get("refreshIntervalSeconds")
    try:
        if explicit is not None:
            return max(120, min(900, int(explicit)))
        block_time = float(assignment.get("blockTime") or 0)
        if block_time > 0:
            return max(120, min(900, round(block_time * 3)))
    except (TypeError, ValueError):
        pass
    return DEFAULT_ASSIGNMENT_SECS

def theoretical_block_probability(hashrate_mhs, network_hashrate_hs, block_time, window_seconds=86400):
    if hashrate_mhs <= 0 or network_hashrate_hs <= 0 or block_time <= 0:
        return None
    share = min((hashrate_mhs * 1e6) / network_hashrate_hs, 1.0)
    expected_seconds = block_time / share
    return min(-math.expm1(-window_seconds / expected_seconds), 1.0)

def send_heartbeat(wallet, hashrate, gpu_name, coin):
    try:
        import ssl
        ctx = ssl.create_default_context()
        data = json.dumps({
            "wallet":  wallet,
            "hashrate": hashrate,
            "gpu":     gpu_name,
            "coin":    coin,
        }).encode()
        req = request.Request(
            f"{COORDINATOR_URL}/heartbeat",
            data=data,
            headers={"Content-Type": "application/json", **HEADERS},
            method="POST"
        )
        with request.urlopen(req, timeout=30, context=ctx):
            pass
        return True
    except Exception as e:
        print(f"[heartbeat error] {e}")
        return False

# ── Miner Process ─────────────────────────────────────────────────────────────

def miner_release(miner_key):
    return MINER_RELEASES[miner_key][PLATFORM_KEY]

def find_miner_bin(miner_key):
    binary = miner_release(miner_key)["bin"]
    expected = MINERS_DIR / miner_key / binary
    if expected.exists():
        return expected
    found = list((MINERS_DIR / miner_key).rglob(binary))
    return found[0] if found else expected

def kill_orphaned_miners():
    """Kill any miner processes not owned by this worker (left over from a prior session)."""
    miner_bins = {r[PLATFORM_KEY]["bin"] for r in MINER_RELEASES.values()}
    my_pid = os.getpid()
    killed = []
    try:
        out = subprocess.check_output(
            ["ps", "-eo", "pid,ppid,comm"], text=True, stderr=subprocess.DEVNULL
        )
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 3:
                continue
            pid, ppid, comm = int(parts[0]), int(parts[1]), parts[2]
            if comm in miner_bins and ppid != my_pid:
                try:
                    os.kill(pid, 15)  # SIGTERM
                    killed.append((pid, comm))
                except OSError:
                    pass
    except Exception:
        pass
    return killed


def miner_popen_kwargs():
    kwargs = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "bufsize": 1,
    }
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    return kwargs

def select_miner(algorithm, gpus):
    miner_key = ALGO_MINER.get(algorithm, "lolminer")
    if miner_key == "trex" and gpus and gpus[0].get("vendor") != "nvidia":
        return "lolminer"
    return miner_key

ZIL_ALGOS = {"kawpow", "ethash", "etchash", "firopow"}

def build_miner_cmd(miner_key, assignment, wallet, gpu_indices, intensity=80, temp_limit=75, power_limit=0, enable_zil=False, zil_wallet="", cpu_threads=None):
    bin_path = find_miner_bin(miner_key)
    stratum  = assignment.get("stratumUrl", "")
    algo     = assignment.get("algorithm", "")

    worker_id    = wallet if wallet else "worker"
    unmineable_u = assignment.get("unmineableWallet", "").replace("WORKER_ID", worker_id)
    if not unmineable_u:
        unmineable_u = f"worker.{worker_id}"

    host_port = stratum.replace("stratum+tcp://", "")

    # T-Rex intensity is 0–25; map from 0–100%; floor at 16 — KawPow/DAG algos crash below this
    trex_intensity = max(16, round(intensity / 100 * 25))

    if miner_key == "xmrig":
        if algo and algo.lower() != "randomx":
            return None
        cpu = detect_cpu()
        requested_threads = cpu_threads if cpu_threads is not None else round(cpu["cores"] * intensity / 100)
        threads = max(1, min(cpu["cores"], int(requested_threads)))
        # Write a minimal config enabling MSR mod (wrmsr) — XMRig applies the right
        # register value for Intel/AMD automatically when running with admin/root.
        xmrig_cfg = {
            "donate-level": 0,
            "randomx": {"wrmsr": True, "rdmsr": True, "1gb-pages": False},
            "pools": [{
                "url":  host_port or "rx.unmineable.com:3333",
                "user": unmineable_u,
                "pass": "x",
            }],
            "cpu": {"enabled": True, "max-threads-hint": round(intensity)},
            "print-time": 15,
            "colors": False,
        }
        cfg_path = bin_path.parent / "xmrig-pegd.json"
        cfg_path.write_text(json.dumps(xmrig_cfg, indent=2))
        return [
            str(bin_path),
            "--config", str(cfg_path),
            "--algo",       "rx/0",
            "--threads",    str(threads),
            "--no-color",
            "--print-time", "15",
        ]

    if miner_key == "trex":
        cmd = [
            str(bin_path),
            "-a", algo.lower(),
            "-o", stratum,
            "-u", unmineable_u,
            "-p", "x",
            "--intensity", str(trex_intensity),
            "--temperature-limit", str(temp_limit),
            "--dag-build-mode", "1",
            "--api-bind-http", "127.0.0.1:4067",
            "--no-color",
        ]
        if power_limit > 0:
            cmd += ["--pl", str(power_limit)]
        if enable_zil and zil_wallet and algo.lower() in ZIL_ALGOS:
            referral = "U-FGJ8HA"
            zil_user = f"ZIL:{zil_wallet}.{worker_id}#{referral}"
            cmd += [
                "--dual-algo", "zilliqa",
                "--url2",  "stratum+tcp://zil.unmineable.com:3333",
                "--user2", zil_user,
                "--pass2", "x",
            ]
        return cmd

    elif miner_key == "lolminer":
        cmd = [
            str(bin_path),
            "--algo", algo.upper(),
            "--pool", host_port,
            "--user", unmineable_u,
            "--pass", "x",
            "--apiport", "4068",
            "--longstats", "60",
        ]
        return cmd

    elif miner_key == "lpminer":
        # PearlPow (NVIDIA only). lpminer uses --pool and --wallet, no --algo flag needed.
        return [
            str(bin_path),
            "--pool", stratum or "stratum+tcp://pearlpow.unmineable.com:3333",
            "--wallet", unmineable_u,
        ]

    return []

HASHRATE_RE = re.compile(
    r"(?:Total\s+)?(?:Speed|Hashrate|MH/s|KH/s|GH/s)[:\s]*([\d.]+)\s*(TH|GH|MH|KH|H)",
    re.IGNORECASE
)
# XMRig: "speed 10s/60s/15m 1254.2 1248.5 n/a H/s"
XMRIG_HR_RE = re.compile(r'speed\s+\S+\s+([\d.]+)', re.IGNORECASE)

def parse_hashrate(line):
    m = HASHRATE_RE.search(line)
    if m:
        val, unit = float(m.group(1)), m.group(2).upper()
        scale = {"TH": 1e6, "GH": 1e3, "MH": 1.0, "KH": 1e-3, "H": 1e-6}
        return val * scale.get(unit, 1.0)  # always MH/s
    x = XMRIG_HR_RE.search(line)
    if x:
        return float(x.group(1)) / 1e6  # XMRig reports H/s → convert to MH/s
    return None

# ── Main App ──────────────────────────────────────────────────────────────────

class PEGDWorker:
    def __init__(self, root):
        self.root = root
        self.root.title("PEGD Compute Worker")
        self.root.configure(bg="#0a0a1a")
        self.root.geometry("820x700")
        self.root.resizable(True, True)

        self.cfg            = load_config()
        self.gpus           = detect_gpus()
        self.cpu            = detect_cpu()
        self.cpu_threads_max = max(1, int(self.cpu.get("cores") or 1))
        self.assignment     = None
        self.cpu_assignment = None
        self.miner_proc     = None   # GPU miner process
        self.cpu_proc       = None   # CPU miner process (XMRig)
        self.running        = False
        self.hashrate       = 0.0    # GPU MH/s
        self.cpu_hashrate   = 0.0    # CPU H/s (XMRig reports H/s natively)
        self.cpu_retry_after = 0.0
        self.cpu_last_hashrate_at = time.time()
        self.total_earned   = 0.0
        self.unmineable_uuid = None

        self._build_ui()
        self._apply_theme()

        orphans = kill_orphaned_miners()
        if self.gpus:
            self._log(f"Detected {len(self.gpus)} GPU(s): {', '.join(g['name'] for g in self.gpus)}")
        else:
            self._log("No GPU detected — will mine RandomX on CPU", "warn")
        self._log(f"CPU: {self.cpu['name']} ({self.cpu['cores']} cores)")
        for pid, name in orphans:
            self._log(f"Killed orphaned {name} (PID {pid}) from prior session", "warn")

        if self.cfg.get("autostart") and self.cfg.get("wallet"):
            self.root.after(1500, self.start_mining)

    # ── UI ────────────────────────────────────────────────────────────────────

    def _build_ui(self):
        pad = {"padx": 16, "pady": 8}

        # Header
        hdr = tk.Frame(self.root, bg="#0d0d22", pady=12)
        hdr.pack(fill=tk.X)
        tk.Label(hdr, text="PEGD", bg="#0d0d22", fg="#00f5ff",
                 font=("Arial", 28, "bold")).pack(side=tk.LEFT, padx=20)
        tk.Label(hdr, text="Compute Worker", bg="#0d0d22", fg="#7070a0",
                 font=("Arial", 14)).pack(side=tk.LEFT)
        self.status_dot = tk.Label(hdr, text="⬤  Idle", bg="#0d0d22",
                                    fg="#555577", font=("Arial", 11))
        self.status_dot.pack(side=tk.RIGHT, padx=20)

        body = tk.Frame(self.root, bg="#0a0a1a")
        body.pack(fill=tk.BOTH, expand=True, **pad)

        # Wallet
        row = tk.Frame(body, bg="#0a0a1a")
        row.pack(fill=tk.X, pady=4)
        tk.Label(row, text="Solana Wallet", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9), width=14, anchor="w").pack(side=tk.LEFT)
        self.wallet_var = tk.StringVar(value=self.cfg.get("wallet", ""))
        tk.Entry(row, textvariable=self.wallet_var, bg="#13132e", fg="#e0e0ff",
                 insertbackground="#00f5ff", relief="flat",
                 font=("Courier", 10), width=52).pack(side=tk.LEFT, padx=6)

        # GPU info
        row2 = tk.Frame(body, bg="#0a0a1a")
        row2.pack(fill=tk.X, pady=4)
        tk.Label(row2, text="GPU", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9), width=14, anchor="w").pack(side=tk.LEFT)
        if self.gpus:
            hw_txt = ", ".join(g["name"] for g in self.gpus)
        else:
            hw_txt = f"CPU — {self.cpu['name']} ({self.cpu['cores']} cores) · RandomX"
        tk.Label(row2, text=hw_txt, bg="#0a0a1a", fg="#e0e0ff",
                 font=("Arial", 10)).pack(side=tk.LEFT)

        # Stats cards — GPU box (cyan) and CPU box (yellow) are visually separated
        cards = tk.Frame(body, bg="#0a0a1a")
        cards.pack(fill=tk.X, pady=12)

        # GPU group
        gpu_outer = tk.Frame(cards, bg="#00f5ff", padx=1, pady=1)
        gpu_outer.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 6))
        tk.Label(gpu_outer, text="  GPU  ", bg="#00f5ff", fg="#0a0a1a",
                 font=("Arial", 7, "bold")).pack(anchor="nw")
        gpu_cards = tk.Frame(gpu_outer, bg="#0a0a1a")
        gpu_cards.pack(fill=tk.X)
        self.coin_lbl = self._stat_card(gpu_cards, "MINING",   "—")
        self.hr_lbl   = self._stat_card(gpu_cards, "GPU MH/s", "0", "#00f5ff")
        self.temp_lbl = self._stat_card(gpu_cards, "GPU TEMP", "—°C")

        # CPU group
        cpu_outer = tk.Frame(cards, bg="#f0b90b", padx=1, pady=1)
        cpu_outer.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 6))
        tk.Label(cpu_outer, text="  CPU  ", bg="#f0b90b", fg="#0a0a1a",
                 font=("Arial", 7, "bold")).pack(anchor="nw")
        cpu_cards = tk.Frame(cpu_outer, bg="#0a0a1a")
        cpu_cards.pack(fill=tk.X)
        self.cpu_coin_lbl = self._stat_card(cpu_cards, "MINING",  "—",  "#f0b90b")
        self.cpu_hr_lbl   = self._stat_card(cpu_cards, "CPU H/s", "0",  "#f0b90b")

        # Earnings (no group border — shared stats)
        earn_cards = tk.Frame(cards, bg="#0a0a1a")
        earn_cards.pack(side=tk.LEFT, expand=True, fill=tk.X)
        self.earned_lbl = self._stat_card(earn_cards, "EARNED",           "0 PEGD")
        self.score_lbl  = self._stat_card(earn_cards, "THEORETICAL 24H",  "—")

        # Unmineable pool stats row
        pool_row = tk.Frame(body, bg="#0a0a1a")
        pool_row.pack(fill=tk.X, pady=(0, 8))
        self.pool_bal_lbl     = self._stat_card(pool_row, "POOL BALANCE", "— SOL")
        self.pool_thresh_lbl  = self._stat_card(pool_row, "PAYOUT AT",    "0.05 SOL")
        self.pool_hr_lbl      = self._stat_card(pool_row, "GPU MH/s",     "—")
        self.pool_status_lbl  = self._stat_card(pool_row, "WORKER",       "—")

        # Start / Stop
        btn_row = tk.Frame(body, bg="#0a0a1a")
        btn_row.pack(fill=tk.X, pady=4)
        self.start_btn = tk.Button(
            btn_row, text="▶  START MINING",
            bg="#00f5ff", fg="#0a0a1a", activebackground="#00d4e0",
            font=("Arial", 13, "bold"), relief="flat", cursor="hand2",
            command=self.start_mining, padx=24, pady=10
        )
        self.start_btn.pack(side=tk.LEFT)
        self.stop_btn = tk.Button(
            btn_row, text="■  STOP",
            bg="#13132e", fg="#7070a0", activebackground="#1a1a3e",
            font=("Arial", 13), relief="flat", cursor="hand2",
            command=self.stop_mining, padx=24, pady=10, state=tk.DISABLED
        )
        self.stop_btn.pack(side=tk.LEFT, padx=8)

        self.autostart_var = tk.BooleanVar(value=self.cfg.get("autostart", False))
        tk.Checkbutton(btn_row, text="Autostart", variable=self.autostart_var,
                       bg="#0a0a1a", fg="#7070a0", selectcolor="#13132e",
                       activebackground="#0a0a1a", command=self._save).pack(
                           side=tk.RIGHT)
        saved_plan  = self.cfg.get("tou_plan", "disabled")
        saved_label = TOU_PLANS.get(saved_plan, TOU_PLANS["disabled"])[0]
        self.tou_var = tk.StringVar(value=saved_label)
        tk.Label(btn_row, text="TOU", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.RIGHT, padx=(8, 2))
        tou_menu = tk.OptionMenu(btn_row, self.tou_var, *TOU_LABELS,
                                 command=lambda _: self._save())
        tou_menu.config(bg="#13132e", fg="#f0b90b", activebackground="#1a1a3e",
                        activeforeground="#f0b90b", relief="flat",
                        highlightthickness=0, font=("Arial", 9))
        tou_menu["menu"].config(bg="#13132e", fg="#f0b90b")
        tou_menu.pack(side=tk.RIGHT)

        self.tune_btn = tk.Button(
            btn_row, text="⚡ Tune",
            bg="#13132e", fg="#a070f0", activebackground="#1a1a3e",
            font=("Arial", 11), relief="flat", cursor="hand2",
            command=self._start_tune, padx=12, pady=10
        )
        self.tune_btn.pack(side=tk.LEFT, padx=8)

        # ── GPU settings (cyan border) ────────────────────────────────────────
        gpu_s_outer = tk.Frame(body, bg="#00f5ff", padx=1, pady=1)
        gpu_s_outer.pack(fill=tk.X, pady=(6, 3))
        gpu_hdr = tk.Frame(gpu_s_outer, bg="#00f5ff")
        gpu_hdr.pack(fill=tk.X)
        tk.Label(gpu_hdr, text="  GPU SETTINGS  ", bg="#00f5ff", fg="#0a0a1a",
                 font=("Arial", 7, "bold")).pack(side=tk.LEFT)
        self.gpu_enabled_var = tk.BooleanVar(value=self.cfg.get("gpu_enabled", True))
        tk.Checkbutton(gpu_hdr, text="Enabled", variable=self.gpu_enabled_var,
                       bg="#00f5ff", fg="#0a0a1a", selectcolor="#00b8c8",
                       activebackground="#00f5ff", font=("Arial", 7, "bold"),
                       command=self._on_gpu_toggle).pack(side=tk.RIGHT, padx=6)
        gpu_s = tk.Frame(gpu_s_outer, bg="#0a0a1a", padx=8, pady=6)
        gpu_s.pack(fill=tk.X)

        # Intensity / Temp / Power
        ctrl = tk.Frame(gpu_s, bg="#0a0a1a")
        ctrl.pack(fill=tk.X, pady=(0, 4))

        tk.Label(ctrl, text="Intensity %", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.intensity_var = tk.IntVar(value=self.cfg.get("intensity", DEFAULT_INTENSITY))
        intensity_sl = tk.Scale(ctrl, from_=10, to=100, orient=tk.HORIZONTAL,
                                variable=self.intensity_var, bg="#0a0a1a", fg="#00f5ff",
                                highlightthickness=0, troughcolor="#13132e",
                                length=140, command=lambda _: self._save())
        intensity_sl.pack(side=tk.LEFT, padx=(4, 4))
        self.tune_lbl = tk.Label(ctrl, text="", bg="#0a0a1a", fg="#444466",
                                 font=("Arial", 8))
        self.tune_lbl.pack(side=tk.LEFT, padx=(0, 16))

        tk.Label(ctrl, text="Temp limit °C", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.temp_limit_var = tk.IntVar(value=self.cfg.get("temp_limit", DEFAULT_TEMP_LIMIT))
        temp_sl = tk.Scale(ctrl, from_=55, to=90, orient=tk.HORIZONTAL,
                           variable=self.temp_limit_var, bg="#0a0a1a", fg="#f0b90b",
                           highlightthickness=0, troughcolor="#13132e",
                           length=120, command=lambda _: self._save())
        temp_sl.pack(side=tk.LEFT, padx=(4, 20))

        tk.Label(ctrl, text="Power limit W", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.power_limit_var = tk.IntVar(value=self.cfg.get("power_limit", DEFAULT_POWER_LIMIT))
        power_sl = tk.Scale(ctrl, from_=0, to=400, resolution=10, orient=tk.HORIZONTAL,
                            variable=self.power_limit_var, bg="#0a0a1a", fg="#a070f0",
                            highlightthickness=0, troughcolor="#13132e",
                            length=120, command=lambda _: self._save())
        power_sl.pack(side=tk.LEFT, padx=4)
        tk.Label(ctrl, text="(0=default)", bg="#0a0a1a", fg="#444466",
                 font=("Arial", 8)).pack(side=tk.LEFT, padx=2)

        # Clock locks
        ctrl_clocks = tk.Frame(gpu_s, bg="#0a0a1a")
        ctrl_clocks.pack(fill=tk.X, pady=(0, 4))

        tk.Label(ctrl_clocks, text="Core lock MHz", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.core_clock_var = tk.IntVar(value=self.cfg.get("core_clock", 0))
        core_input = tk.Spinbox(
            ctrl_clocks, from_=0, to=3200, increment=1,
            textvariable=self.core_clock_var, width=7,
            bg="#13132e", fg="#00f5ff", insertbackground="#00f5ff",
            buttonbackground="#1a1a3e", relief="flat",
            command=self._save
        )
        core_input.pack(side=tk.LEFT, padx=(6, 14))

        tk.Label(ctrl_clocks, text="Memory lock MHz", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.memory_clock_var = tk.IntVar(value=self.cfg.get("memory_clock", 0))
        memory_input = tk.Spinbox(
            ctrl_clocks, from_=0, to=12000, increment=1,
            textvariable=self.memory_clock_var, width=7,
            bg="#13132e", fg="#a78bfa", insertbackground="#a78bfa",
            buttonbackground="#1a1a3e", relief="flat",
            command=self._save
        )
        memory_input.pack(side=tk.LEFT, padx=(6, 8))
        tk.Button(
            ctrl_clocks, text="Apply clocks", command=self._apply_gpu_clock_settings,
            bg="#13132e", fg="#a78bfa", activebackground="#1a1a3e",
            activeforeground="#a78bfa", relief="flat", cursor="hand2",
            font=("Arial", 9, "bold"), padx=10, pady=4
        ).pack(side=tk.LEFT, padx=(0, 8))
        tk.Label(ctrl_clocks, text="(0=unchanged)", bg="#0a0a1a", fg="#444466",
                 font=("Arial", 8)).pack(side=tk.LEFT, padx=2)

        # Mem offset + ZIL
        ctrl2 = tk.Frame(gpu_s, bg="#0a0a1a")
        ctrl2.pack(fill=tk.X)

        tk.Label(ctrl2, text="Mem offset MHz", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        self.memoc_var = tk.IntVar(value=self.cfg.get("mem_oc", 0))
        mem_sl = tk.Scale(ctrl2, from_=0, to=1500, resolution=50, orient=tk.HORIZONTAL,
                          variable=self.memoc_var, bg="#0a0a1a", fg="#00d4e0",
                          highlightthickness=0, troughcolor="#13132e",
                          length=140, command=lambda _: self._save())
        mem_sl.pack(side=tk.LEFT, padx=(4, 4))
        if IS_WINDOWS:
            mem_sl.config(state=tk.DISABLED)
        mem_hint = "(Linux/Coolbits only)" if IS_WINDOWS else "(requires Coolbits)"
        tk.Label(ctrl2, text=mem_hint, bg="#0a0a1a", fg="#444466",
                 font=("Arial", 8)).pack(side=tk.LEFT, padx=(0, 20))

        self.zil_var = tk.BooleanVar(value=self.cfg.get("zil_dual", False))
        self.zil_chk = tk.Checkbutton(ctrl2, text="ZIL dual mine  (+15–25% revenue)",
                       variable=self.zil_var, bg="#0a0a1a", fg="#f0b90b",
                       selectcolor="#13132e", activebackground="#0a0a1a",
                       command=self._on_zil_toggle)
        self.zil_chk.pack(side=tk.LEFT)

        # ZIL wallet — inside GPU section, shown only when checkbox is ticked
        self.zil_wallet_frame = tk.Frame(gpu_s, bg="#0a0a1a")
        self.zil_wallet_frame.pack(fill=tk.X, pady=(4, 0))
        tk.Label(self.zil_wallet_frame, text="ZIL Wallet Address",
                 bg="#0a0a1a", fg="#7070a0", font=("Arial", 9)).pack(side=tk.LEFT)
        self.zil_wallet_var = tk.StringVar(value=self.cfg.get("zil_wallet", ""))
        tk.Entry(self.zil_wallet_frame, textvariable=self.zil_wallet_var,
                 bg="#13132e", fg="#f0b90b", insertbackground="#f0b90b",
                 relief="flat", font=("Courier", 9), width=46
                 ).pack(side=tk.LEFT, padx=(8, 0))
        tk.Label(self.zil_wallet_frame, text="(any ZIL-compatible address)",
                 bg="#0a0a1a", fg="#444466", font=("Arial", 8)).pack(side=tk.LEFT, padx=(6, 0))
        self.zil_wallet_frame.pack_forget() if not self.zil_var.get() else None

        # ── CPU settings (yellow border) ──────────────────────────────────────
        cpu_s_outer = tk.Frame(body, bg="#f0b90b", padx=1, pady=1)
        cpu_s_outer.pack(fill=tk.X, pady=(3, 6))
        cpu_hdr = tk.Frame(cpu_s_outer, bg="#f0b90b")
        cpu_hdr.pack(fill=tk.X)
        tk.Label(cpu_hdr, text="  CPU SETTINGS  ", bg="#f0b90b", fg="#0a0a1a",
                 font=("Arial", 7, "bold")).pack(side=tk.LEFT)
        self.cpu_enabled_var = tk.BooleanVar(value=self.cfg.get("cpu_enabled", True))
        tk.Checkbutton(cpu_hdr, text="Enabled", variable=self.cpu_enabled_var,
                       bg="#f0b90b", fg="#0a0a1a", selectcolor="#b88a00",
                       activebackground="#f0b90b", font=("Arial", 7, "bold"),
                       command=self._on_cpu_toggle).pack(side=tk.RIGHT, padx=6)
        cpu_s = tk.Frame(cpu_s_outer, bg="#0a0a1a", padx=8, pady=6)
        cpu_s.pack(fill=tk.X)

        ctrl_cpu = tk.Frame(cpu_s, bg="#0a0a1a")
        ctrl_cpu.pack(fill=tk.X)

        tk.Label(ctrl_cpu, text="CPU threads", bg="#0a0a1a", fg="#7070a0",
                 font=("Arial", 9)).pack(side=tk.LEFT)
        saved_cpu_threads = max(
            1,
            min(
                self.cpu_threads_max,
                int(self.cfg.get("cpu_threads", max(1, round(self.cpu_threads_max * DEFAULT_INTENSITY / 100))))
            )
        )
        self.cpu_threads_var = tk.IntVar(value=saved_cpu_threads)
        cpu_sl = tk.Scale(ctrl_cpu, from_=1, to=self.cpu_threads_max, orient=tk.HORIZONTAL,
                          variable=self.cpu_threads_var, bg="#0a0a1a", fg="#f0b90b",
                          highlightthickness=0, troughcolor="#13132e",
                          length=220, command=lambda _: self._save())
        cpu_sl.pack(side=tk.LEFT, padx=(4, 4))
        cpu_sl.bind("<ButtonRelease-1>", self._on_cpu_threads_release)
        tk.Label(ctrl_cpu, text=f"(XMRig RandomX · max {self.cpu_threads_max})",
                 bg="#0a0a1a", fg="#444466", font=("Arial", 8)).pack(side=tk.LEFT, padx=2)

        # Log
        tk.Label(body, text="LOG", bg="#0a0a1a", fg="#444466",
                 font=("Arial", 8, "bold")).pack(anchor="w", pady=(8, 2))
        self.log = scrolledtext.ScrolledText(
            body, height=10, bg="#070718", fg="#5050a0",
            font=("Courier", 9), relief="flat", state=tk.DISABLED
        )
        self.log.tag_config("ok",   foreground="#00f5ff")
        self.log.tag_config("warn", foreground="#f0b90b")
        self.log.tag_config("err",  foreground="#ef4444")
        self.log.tag_config("cpu",  foreground="#a78bfa")
        self.log.pack(fill=tk.BOTH, expand=True)

    def _stat_card(self, parent, label, value, color="#00f5ff"):
        f = tk.Frame(parent, bg="#13132e", padx=16, pady=10)
        f.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=4)
        tk.Label(f, text=label, bg="#13132e", fg="#444466",
                 font=("Arial", 8, "bold")).pack(anchor="w")
        lbl = tk.Label(f, text=value, bg="#13132e", fg=color,
                        font=("Arial", 14, "bold"))
        lbl.pack(anchor="w")
        return lbl

    def _apply_theme(self):
        style = ttk.Style()
        style.theme_use("clam")

    def _log(self, msg, tag="ok"):
        if threading.current_thread() is not threading.main_thread():
            self.root.after(0, self._log, msg, tag)
            return
        self.log.config(state=tk.NORMAL)
        ts = time.strftime("%H:%M:%S")
        self.log.insert(tk.END, f"[{ts}] {msg}\n", tag)
        self.log.see(tk.END)
        self.log.config(state=tk.DISABLED)

    # ── Mining control ────────────────────────────────────────────────────────

    def start_mining(self):
        wallet = self.wallet_var.get().strip()
        if not wallet:
            messagebox.showwarning("Missing wallet",
                                   "Enter your Solana wallet address to receive PEGD.")
            return

        self._save()
        self.running = True
        self._set_status("Connecting...", "#f0b90b")
        self.start_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)

        threading.Thread(target=self._mine_loop, daemon=True).start()

    def stop_mining(self):
        self.running = False
        self._kill_miner()
        self._set_status("Idle", "#555577")
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        self._log("Stopped.")

    def _mine_loop(self):
        wallet   = self.wallet_var.get().strip()
        gpu_name = self.gpus[0]["name"] if self.gpus else self.cpu["name"]
        last_assignment_check = 0
        assignment_secs       = DEFAULT_ASSIGNMENT_SECS
        last_heartbeat        = time.time()
        last_pool_check       = 0
        last_nonzero_hr       = time.time()
        peak_announced        = False
        POOL_CHECK_SECS       = 120  # refresh Unmineable stats every 2 min

        while self.running:
            now = time.time()
            plan_key = self._tou_plan_key()

            # TOU check — pause during peak (expensive) hours
            if not is_offpeak(plan_key):
                if self.miner_proc:
                    self._kill_miner()
                    last_assignment_check = 0
                if not peak_announced:
                    resume = next_offpeak_str(plan_key)
                    self._log(f"Peak hours — paused to save on electricity. Resumes {resume}.", "warn")
                    self._set_status(f"Paused — off-peak at {resume}", "#f0b90b")
                    peak_announced = True
                time.sleep(60)
                continue
            if peak_announced:
                self._log("Off-peak hours — resuming mining.", "ok")
                self._set_status("Connecting...", "#f0b90b")
                peak_announced = False

            # Refresh assignment
            if now - last_assignment_check > assignment_secs or self.assignment is None:
                self._log("Fetching assignment...")
                a = fetch_assignment()
                if a:
                    cpu_assignment = a.get("cpuAssignment") or default_cpu_assignment()
                    gpu_assignment = {k: v for k, v in a.items() if k != "cpuAssignment"}

                    # Only restart a miner if its effective work changed.
                    def _mining_key(x):
                        if not x:
                            return None
                        return (
                            x.get('algorithm'),
                            x.get('stratumUrl'),
                            x.get('unmineableWallet'),
                            x.get('payoutCoin') or x.get('coin'),
                        )

                    if self.gpus:
                        gpu_switched = _mining_key(gpu_assignment) != _mining_key(self.assignment)
                        cpu_switched = _mining_key(cpu_assignment) != _mining_key(self.cpu_assignment)
                        self.assignment = gpu_assignment
                        self.cpu_assignment = cpu_assignment
                        assignment_secs = assignment_refresh_seconds(gpu_assignment)
                        self._update_assignment_ui(gpu_assignment)
                        if gpu_switched:
                            self._log(f"→ {gpu_assignment.get('coin','?')} ({gpu_assignment.get('algorithm','?')})", "ok")
                            self._restart_miner(wallet)
                        elif cpu_switched and cpu_assignment:
                            self._log(
                                f"[CPU] Switching → {cpu_assignment.get('algorithm','?')} / {cpu_assignment.get('payoutCoin','?')}",
                                "cpu"
                            )
                            self._kill_cpu_miner()
                            self._start_cpu_miner(wallet, cpu_assignment)
                    else:
                        selected = cpu_assignment or gpu_assignment
                        switched = _mining_key(selected) != _mining_key(self.assignment)
                        self.assignment = selected
                        self.cpu_assignment = selected
                        assignment_secs = assignment_refresh_seconds(selected)
                        self._update_assignment_ui(selected)
                        if switched:
                            self._log(f"[CPU] → {selected.get('algorithm','?')} / {selected.get('payoutCoin', selected.get('coin','?'))}", "cpu")
                            self._restart_miner(wallet)
                else:
                    self._log("Coordinator unreachable — retrying in 30s", "warn")
                    time.sleep(30)
                    continue
                last_assignment_check = now

            # Refresh Unmineable pool stats
            if now - last_pool_check > POOL_CHECK_SECS:
                threading.Thread(
                    target=self._refresh_pool_stats,
                    args=(wallet,), daemon=True
                ).start()
                last_pool_check = now

            # Watchdog: restart if process alive but hashrate stuck at 0 for >3 min
            if self.miner_proc and self.miner_proc.poll() is None:
                primary_hashrate = self.hashrate if self.gpus else self.cpu_hashrate / 1e6
                if primary_hashrate > 0:
                    last_nonzero_hr = time.time()
                elif time.time() - last_nonzero_hr > 180 and self.assignment:
                    self._log("Watchdog: hashrate at 0 for 3 min — restarting miner", "warn")
                    last_assignment_check = 0
                    last_nonzero_hr = time.time()
                    self._restart_miner(wallet)

            # GPU temperature (and heartbeat throttle)
            if time.time() - last_heartbeat < HEARTBEAT_SECS:
                time.sleep(5)
                continue
            last_heartbeat = time.time()

            temp = poll_gpu_temp()
            if temp is not None:
                color = "#ef4444" if temp >= self.temp_limit_var.get() else \
                        "#f0b90b" if temp >= self.temp_limit_var.get() - 10 else "#00f5ff"
                self.root.after(0, self.temp_lbl.config,
                                {"text": f"{temp}°C", "fg": color})

            # Restart CPU miner if it died or stayed at zero hashrate.
            if self.gpus and self.cpu_assignment:
                cpu_alive = self.cpu_proc is not None and self.cpu_proc.poll() is None
                if cpu_alive and self.cpu_hashrate > 0:
                    self.cpu_last_hashrate_at = time.time()
                elif cpu_alive and time.time() - self.cpu_last_hashrate_at > 180:
                    self._log("[CPU] Watchdog: zero hashrate for 3 min — restarting XMRig", "warn")
                    self._kill_cpu_miner()
                    self._start_cpu_miner(wallet, self.cpu_assignment)
                elif not cpu_alive and time.time() >= self.cpu_retry_after:
                    self._log("[CPU] XMRig not running — restarting", "warn")
                    self._start_cpu_miner(wallet, self.cpu_assignment)

            # Heartbeat — report combined GPU + CPU hashrate
            cpu_mhs = self.cpu_hashrate / 1e6  # H/s → MH/s
            combined_hr = self.hashrate + cpu_mhs
            ok = send_heartbeat(wallet, combined_hr, gpu_name,
                                self.assignment.get("ticker", ""))
            if not ok:
                self._log("Heartbeat failed", "warn")

            time.sleep(HEARTBEAT_SECS)

        self._kill_miner()

    def _restart_miner(self, wallet):
        self._kill_miner()
        if not self.assignment:
            return

        if not self.gpu_enabled_var.get():
            self._log("[GPU] Mining is disabled — skipping GPU miner", "warn")
            return

        algo      = self.assignment.get("algorithm", "")
        miner_key = select_miner(algo, self.gpus)

        if not find_miner_bin(miner_key).exists():
            self._log(f"Downloading {miner_key}...", "warn")
            if not self._download_miner(miner_key):
                return

        # Use cached auto-tune if available; auto-tune first time for T-Rex
        gpu_name = self.gpus[0]["name"] if self.gpus else self.cpu["name"]
        cached   = load_tuning().get(tuning_key(gpu_name, algo))
        if cached:
            intensity = cached["intensity_pct"]
            self.root.after(0, self.intensity_var.set, intensity)
            self.root.after(0, self.tune_lbl.config,
                            {"text": f"auto-tuned ✓ {cached['mh']:.0f}MH", "fg": "#a070f0"})
        elif miner_key == "trex":
            self._log("No tuning data for this GPU+coin — starting auto-tune…", "warn")
            self.root.after(0, self.tune_lbl.config, {"text": "tuning…", "fg": "#f0b90b"})
            if self.gpus:
                self._start_cpu_miner(wallet, self.cpu_assignment)
            self._start_tune()
            return  # tune will restart the miner when done
        else:
            intensity = self.intensity_var.get()
            self.root.after(0, self.tune_lbl.config, {"text": "untuned", "fg": "#444466"})

        core_clock = self.core_clock_var.get()
        memory_clock = self.memory_clock_var.get()
        if self.gpus and (core_clock or memory_clock):
            ok, msg = apply_locked_clocks(core_clock, memory_clock)
            self._log(msg, "ok" if ok else "warn")

        mem_oc = self.memoc_var.get()
        if mem_oc and memory_clock:
            self._log("Memory offset ignored while an absolute memory lock is set.", "warn")
        elif mem_oc:
            ok, msg = apply_memory_oc(mem_oc)
            self._log(msg, "ok" if ok else "warn")

        zil_addr = self.zil_wallet_var.get().strip() if hasattr(self, 'zil_wallet_var') else ""
        if self.zil_var.get() and not zil_addr:
            self._log("ZIL dual mine is checked but no ZIL wallet set — skipping ZIL.", "warn")
        cmd = build_miner_cmd(miner_key, self.assignment, wallet,
                               [g["index"] for g in self.gpus],
                               intensity=intensity,
                               temp_limit=self.temp_limit_var.get(),
                               power_limit=self.power_limit_var.get(),
                               enable_zil=self.zil_var.get(),
                               zil_wallet=zil_addr,
                               cpu_threads=self.cpu_threads_var.get())
        if not cmd:
            self._log(f"No command built for {miner_key}", "err")
            return

        self._log(f"[GPU] Starting {miner_key} → {self.assignment.get('coin','?')}", "ok")
        self._set_status(f"Mining {self.assignment.get('ticker','')}", "#00f5ff")

        try:
            self.miner_proc = subprocess.Popen(cmd, **miner_popen_kwargs())
            output_reader = self._read_cpu_output if miner_key == "xmrig" else self._read_gpu_output
            threading.Thread(target=output_reader,
                             args=(self.miner_proc,), daemon=True).start()
        except Exception as e:
            self._log(f"[GPU] Failed to start: {e}", "err")

        # Only dual-mine on GPU rigs. CPU-only rigs use XMRig as the primary miner.
        if self.gpus and miner_key != "xmrig":
            self._start_cpu_miner(wallet, self.cpu_assignment)
        elif miner_key == "xmrig":
            payout = self.assignment.get("payoutCoin", self.assignment.get("ticker", "SOL"))
            self.root.after(0, self.cpu_coin_lbl.config,
                            {"text": f"{self.assignment.get('algorithm', 'RandomX')} → {payout}"})

    def _start_cpu_miner(self, wallet, assignment=None):
        if not self.cpu_enabled_var.get():
            return False
        assignment = assignment or self.cpu_assignment or default_cpu_assignment()
        if time.time() < self.cpu_retry_after:
            return False

        xmrig_bin = find_miner_bin("xmrig")
        if not xmrig_bin.exists():
            self._log("[CPU] Downloading XMRig...", "warn")
            if not self._download_miner("xmrig") or not find_miner_bin("xmrig").exists():
                self.cpu_retry_after = time.time() + 300
                self._log("[CPU] XMRig download failed — retrying in 5 min", "err")
                return False

        # On Windows, XMRig (MSVC build) requires the Visual C++ 2019 Redistributable.
        # Do a quick smoke-test so the error appears in the log rather than silently crashing.
        if IS_WINDOWS:
            probe = subprocess.run(
                [str(xmrig_bin), "--version"],
                capture_output=True, text=True, timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            if probe.returncode != 0 or not probe.stdout.strip():
                self._log(
                    "[CPU] XMRig failed to start — install Visual C++ Redistributable 2019+ from microsoft.com",
                    "err"
                )
                self.cpu_retry_after = time.time() + 300
                return False

        cpu_threads = self.cpu_threads_var.get()
        cpu_cmd = build_miner_cmd(
            "xmrig", assignment, wallet, [],
            intensity=self.intensity_var.get(), cpu_threads=cpu_threads
        )
        if not cpu_cmd:
            self._log("[CPU] Could not build XMRig command", "err")
            self.cpu_retry_after = time.time() + 300
            return False
        try:
            self.cpu_proc = subprocess.Popen(cpu_cmd, **miner_popen_kwargs())
            self.cpu_retry_after = 0.0
            self.cpu_last_hashrate_at = time.time()
            suffix = "s" if cpu_threads != 1 else ""
            algorithm = assignment.get("algorithm", "RandomX")
            payout = assignment.get("payoutCoin", assignment.get("ticker", "SOL"))
            self._log(f"[CPU] XMRig started → {algorithm} / {payout} ({cpu_threads} thread{suffix})", "cpu")
            self.root.after(0, self.cpu_coin_lbl.config, {"text": f"{algorithm} → {payout}"})
            threading.Thread(target=self._read_cpu_output,
                             args=(self.cpu_proc,), daemon=True).start()
            return True
        except Exception as e:
            self._log(f"[CPU] Failed to start XMRig: {e}", "err")
            self.cpu_retry_after = time.time() + 300
            return False

    def _read_gpu_output(self, proc):
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            hr = parse_hashrate(line)
            if hr is not None:
                self.hashrate = hr
                self.root.after(0, self.hr_lbl.config, {"text": f"{hr:.2f}"})
                self._update_block_probability()
            low = line.lower()
            tag = "err" if ("error" in low or "rejected" in low or "failed" in low) else "ok"
            self.root.after(0, self._log, f"[GPU] {line[:110]}", tag)

    def _read_cpu_output(self, proc):
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            # XMRig reports H/s — parse_hashrate converts to MH/s, so undo that
            hr_mhs = parse_hashrate(line)
            if hr_mhs is not None:
                hr_hs = hr_mhs * 1e6  # back to H/s for display
                self.cpu_hashrate = hr_hs
                self.cpu_last_hashrate_at = time.time()
                self.root.after(0, self.cpu_hr_lbl.config, {"text": f"{hr_hs:.0f}"})
                self._update_block_probability()
            low = line.lower()
            tag = "err" if ("error" in low or "rejected" in low or "failed" in low) else "cpu"
            self.root.after(0, self._log, f"[CPU] {line[:110]}", tag)
        return_code = proc.wait()
        if self.running and proc is self.cpu_proc:
            self.cpu_retry_after = time.time() + 60
            self.root.after(0, self._log,
                            f"[CPU] XMRig exited with code {return_code} — retrying in 60s", "err")

    def _kill_miner(self):
        self._kill_gpu_miner()
        self._kill_cpu_miner()

    def _kill_gpu_miner(self):
        if self.miner_proc:
            try:
                self.miner_proc.terminate()
                self.miner_proc.wait(timeout=5)
            except Exception:
                try:
                    self.miner_proc.kill()
                except Exception:
                    pass
            self.miner_proc = None
        self.hashrate = 0.0
        self.root.after(0, self.hr_lbl.config, {"text": "0"})

    def _kill_cpu_miner(self):
        proc = self.cpu_proc
        self.cpu_proc = None
        if proc:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        self.cpu_hashrate = 0.0
        self.root.after(0, self.cpu_hr_lbl.config,   {"text": "0"})
        self.root.after(0, self.cpu_coin_lbl.config, {"text": "—"})

    def _download_miner(self, miner_key):
        import tarfile, tempfile, zipfile
        info    = miner_release(miner_key)
        url     = info["url"]
        dest    = MINERS_DIR / miner_key
        dest.mkdir(parents=True, exist_ok=True)
        tmp_path = None
        try:
            suffix = ".zip" if url.lower().endswith(".zip") else ".tar.gz"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                self._log(f"Downloading {url}...")
                import ssl as _ssl
                _ctx = _ssl.create_default_context()
                with request.urlopen(url, timeout=60, context=_ctx) as r:
                    tmp.write(r.read())
                tmp_path = tmp.name

            dest_root = dest.resolve()
            if suffix == ".zip":
                with zipfile.ZipFile(tmp_path) as archive:
                    for member in archive.infolist():
                        target = (dest / member.filename).resolve()
                        if os.path.commonpath([dest_root, target]) != str(dest_root):
                            raise ValueError("Unsafe path in miner archive")
                    archive.extractall(dest)
            else:
                with tarfile.open(tmp_path) as archive:
                    members = archive.getmembers()
                    for member in members:
                        target = (dest / member.name).resolve()
                        if member.issym() or member.islnk() or os.path.commonpath([dest_root, target]) != str(dest_root):
                            raise ValueError("Unsafe path in miner archive")
                    archive.extractall(dest, members=members)

            bin_path = find_miner_bin(miner_key)
            if not bin_path.exists():
                raise FileNotFoundError(f"{info['bin']} not found after extraction")
            if not IS_WINDOWS:
                bin_path.chmod(0o755)
            self._log(f"{miner_key} ready at {bin_path}")
            return True
        except Exception as e:
            self._log(f"Download failed: {e}", "err")
            return False
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    # ── Auto-tune ─────────────────────────────────────────────────────────────

    def _start_tune(self):
        if not self.assignment:
            self._log("Start mining first to fetch an assignment, then tune.", "warn")
            return
        if not self.running:
            self._log("Start mining first, then press Tune.", "warn")
            return
        self.root.after(0, self.tune_btn.config, {"state": tk.DISABLED, "text": "Tuning…"})
        threading.Thread(target=self._run_tune, daemon=True).start()

    def _run_tune(self):
        wallet    = self.wallet_var.get().strip()
        algo      = self.assignment.get("algorithm", "")
        miner_key = select_miner(algo, self.gpus)
        gpu_name  = self.gpus[0]["name"] if self.gpus else self.cpu["name"]
        temp_lim  = self.temp_limit_var.get()
        key       = tuning_key(gpu_name, algo)

        if miner_key != "trex":
            self._log("Auto-tune only supported for T-Rex (GPU) miners.", "warn")
            self.root.after(0, self.tune_btn.config, {"state": tk.NORMAL, "text": "⚡ Tune"})
            return

        self._log(f"Auto-tuning {gpu_name} for {algo} — takes ~{len(TUNE_STEPS) * (TUNE_WARMUP + TUNE_SAMPLE) // 60 + 1} min…", "warn")
        results = []

        for step_intensity in TUNE_STEPS:
            if not self.running:
                break
            pct = round(step_intensity / 25 * 100)
            self._log(f"  Step intensity {step_intensity}/25 ({pct}%)…")
            # GPU tuning must not interrupt the independent CPU miner.
            self._kill_gpu_miner()

            cmd = build_miner_cmd(miner_key, self.assignment, wallet,
                                  [g["index"] for g in self.gpus],
                                  intensity=pct,
                                  temp_limit=temp_lim,
                                  power_limit=0,
                                  cpu_threads=self.cpu_threads_var.get())
            try:
                self.miner_proc = subprocess.Popen(cmd, **miner_popen_kwargs())
                threading.Thread(target=self._read_gpu_output,
                                 args=(self.miner_proc,), daemon=True).start()
            except Exception as e:
                self._log(f"  Failed to start miner: {e}", "err")
                break

            # Wait for warmup
            time.sleep(TUNE_WARMUP)

            temp = poll_gpu_temp()
            if temp and temp >= temp_lim - 3:
                self._log(f"  {temp}°C — too hot, stopping tune early.", "warn")
                break

            # Sample
            mh_samples, w_samples = [], []
            for _ in range(TUNE_SAMPLE // 3):
                mh, w = query_trex_api()
                if mh and mh > 0:
                    mh_samples.append(mh)
                    w_samples.append(w or 1)
                time.sleep(3)

            if not mh_samples:
                self._log(f"  No data at intensity {step_intensity} — skipping.", "warn")
                continue

            avg_mh = sum(mh_samples) / len(mh_samples)
            avg_w  = sum(w_samples)  / len(w_samples)
            eff    = avg_mh / avg_w
            results.append((step_intensity, avg_mh, avg_w, eff))
            self._log(f"  → {avg_mh:.1f} MH/s at {avg_w:.0f}W  ({eff*1000:.2f} kH/W)")

        # Find the efficiency knee: last point within 95% of peak efficiency
        if results:
            peak_eff = max(r[3] for r in results)
            optimal  = results[0]
            for r in results:
                if r[3] >= peak_eff * 0.95:
                    optimal = r

            best_pct = round(optimal[0] / 25 * 100)
            tuning   = load_tuning()
            tuning[key] = {
                "intensity_pct": best_pct,
                "mh":    round(optimal[1], 2),
                "watts": round(optimal[2], 0),
                "kh_per_w": round(optimal[3] * 1000, 2),
                "tuned": time.strftime("%Y-%m-%d"),
            }
            save_tuning(tuning)

            self._log(
                f"Tune done → intensity {best_pct}%, {optimal[1]:.1f} MH/s, "
                f"{optimal[2]:.0f}W, {optimal[3]*1000:.2f} kH/W", "ok"
            )
            self.root.after(0, self.intensity_var.set, best_pct)
            self.root.after(0, self.tune_lbl.config,
                            {"text": f"auto-tuned ✓ {optimal[1]:.0f}MH", "fg": "#a070f0"})
            self._save()
            # Restart miner at optimal settings
            self._restart_miner(wallet)
        else:
            self._log("Tune produced no results.", "err")

        self.root.after(0, self.tune_btn.config, {"state": tk.NORMAL, "text": "⚡ Tune"})

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _refresh_pool_stats(self, wallet):
        # Look up UUID once, then reuse
        if not self.unmineable_uuid:
            acct = fetch_unmineable_account(wallet)
            if acct:
                self.unmineable_uuid = acct['uuid']
                bal   = acct['balance']
                thresh = acct['threshold']
                pct   = min(bal / thresh * 100, 100) if thresh else 0
                self.root.after(0, self.pool_bal_lbl.config,
                                {"text": f"{bal:.6f} SOL ({pct:.1f}%)"})
                self.root.after(0, self.pool_thresh_lbl.config,
                                {"text": f"{thresh} SOL"})
        else:
            acct = fetch_unmineable_account(wallet)
            if acct:
                bal   = acct['balance']
                thresh = acct['threshold']
                pct   = min(bal / thresh * 100, 100) if thresh else 0
                self.root.after(0, self.pool_bal_lbl.config,
                                {"text": f"{bal:.6f} SOL ({pct:.1f}%)"})

        if self.unmineable_uuid:
            workers = fetch_unmineable_workers(self.unmineable_uuid)
            if workers:
                gpu_workers = [w for w in workers if '-cpu' not in w['name']]
                gpu_rhr     = sum(w['rhr'] for w in gpu_workers)
                gpu_online  = any(w['online'] for w in gpu_workers)
                self.root.after(0, self.pool_hr_lbl.config,
                                {"text": f"{gpu_rhr:.2f} MH/s" if gpu_workers else "—"})
                color = "#10b981" if gpu_online else "#7070a0"
                self.root.after(0, self.pool_status_lbl.config,
                                {"text": "Online ●" if gpu_online else "Offline ○", "fg": color})

    def _update_assignment_ui(self, a):
        self.root.after(0, self.coin_lbl.config,
                        {"text": a.get("ticker", "—")})
        self._update_block_probability()

    def _update_block_probability(self):
        if threading.current_thread() is not threading.main_thread():
            self.root.after(0, self._update_block_probability)
            return
        assignment = self.assignment or {}
        try:
            block_time = float(assignment.get("blockTime") or 0)
            network_hashrate = float(
                assignment.get("networkHashrate") or assignment.get("nethash") or 0
            )
            worker_hashrate_hs = max(0.0, self.hashrate) * 1e6
        except (TypeError, ValueError):
            block_time = network_hashrate = worker_hashrate_hs = 0

        if block_time <= 0 or network_hashrate <= 0:
            text = "data unavailable"
        elif worker_hashrate_hs <= 0:
            text = "warming up"
        else:
            probability = theoretical_block_probability(
                worker_hashrate_hs / 1e6,
                network_hashrate,
                block_time
            )
            pct = min(probability * 100, 100)
            if pct >= 1:
                text = f"{pct:.2f}% / 24h"
            elif pct >= 0.01:
                text = f"{pct:.3f}% / 24h"
            elif pct >= 0.0001:
                text = f"{pct:.5f}% / 24h"
            else:
                text = "<0.0001% / 24h"
        self.root.after(0, self.score_lbl.config, {"text": text})

    def _set_status(self, text, color):
        self.root.after(0, self.status_dot.config,
                        {"text": f"⬤  {text}", "fg": color})

    def _tou_plan_key(self):
        label = self.tou_var.get()
        for key, (lbl, *_) in TOU_PLANS.items():
            if lbl == label:
                return key
        return "disabled"

    def _on_gpu_toggle(self):
        self._save()
        enabled = self.gpu_enabled_var.get()
        if not enabled:
            self._log("[GPU] Mining disabled — stopping GPU miner", "warn")
            self._kill_miner()
        elif self.running and self.assignment and self.gpus:
            self._log("[GPU] Mining enabled — starting GPU miner", "ok")
            threading.Thread(target=self._restart_miner,
                             args=(self.wallet_var.get().strip(),),
                             daemon=True).start()

    def _on_cpu_toggle(self):
        self._save()
        enabled = self.cpu_enabled_var.get()
        if not enabled:
            self._log("[CPU] Mining disabled — stopping CPU miner", "warn")
            self._kill_cpu_miner()
        elif self.running and self.cpu_assignment:
            self._log("[CPU] Mining enabled — starting CPU miner", "ok")
            threading.Thread(target=self._start_cpu_miner,
                             args=(self.wallet_var.get().strip(), self.cpu_assignment),
                             daemon=True).start()

    def _on_zil_toggle(self):
        if self.zil_var.get():
            self.zil_wallet_frame.pack(fill=tk.X, pady=(0, 4))
        else:
            self.zil_wallet_frame.pack_forget()
        self._save()

    def _on_cpu_threads_release(self, _event=None):
        self._save()
        if not self.running or not self.assignment:
            return

        wallet = self.wallet_var.get().strip()
        threads = self.cpu_threads_var.get()
        if self.gpus:
            if self.cpu_proc and self.cpu_proc.poll() is None:
                self._log(f"[CPU] Threads set to {threads} — restarting XMRig", "warn")
                self._kill_cpu_miner()
                self._start_cpu_miner(wallet, self.cpu_assignment)
        elif self.miner_proc and self.miner_proc.poll() is None:
            self._log(f"[CPU] Threads set to {threads} — restarting miner", "warn")
            self._restart_miner(wallet)

    def _apply_gpu_clock_settings(self):
        self._save()
        if not self.gpus:
            self._log("No NVIDIA GPU detected; clock targets were not applied.", "warn")
            return
        ok, msg = apply_locked_clocks(
            self.core_clock_var.get(),
            self.memory_clock_var.get()
        )
        self._log(msg or "GPU clock targets unchanged.", "ok" if ok else "warn")

    def _save(self):
        self.cfg["wallet"]      = self.wallet_var.get().strip()
        self.cfg["autostart"]   = self.autostart_var.get()
        self.cfg["intensity"]   = self.intensity_var.get()
        if hasattr(self, "cpu_threads_var"):
            self.cfg["cpu_threads"] = self.cpu_threads_var.get()
        if hasattr(self, "core_clock_var"):
            self.cfg["core_clock"] = self.core_clock_var.get()
        if hasattr(self, "memory_clock_var"):
            self.cfg["memory_clock"] = self.memory_clock_var.get()
        self.cfg["temp_limit"]  = self.temp_limit_var.get()
        self.cfg["power_limit"] = self.power_limit_var.get()
        self.cfg["tou_plan"]    = self._tou_plan_key()
        self.cfg["mem_oc"]      = self.memoc_var.get()
        self.cfg["zil_dual"]    = self.zil_var.get()
        self.cfg["zil_wallet"]  = self.zil_wallet_var.get().strip() if hasattr(self, 'zil_wallet_var') else ""
        self.cfg["gpu_enabled"] = self.gpu_enabled_var.get()
        self.cfg["cpu_enabled"] = self.cpu_enabled_var.get()
        save_config(self.cfg)


if __name__ == "__main__":
    root = tk.Tk()
    app  = PEGDWorker(root)
    root.mainloop()
