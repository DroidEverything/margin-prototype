"""Shared JPL Horizons fetch + parse helpers (stdlib only).

Sends the exact query parameters used for MARGIN's ephemeris build so the
data provenance is reproducible. Raw responses are cached under
tools/horizons_cache/ keyed by query parameters.
"""
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "horizons_cache")

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

RECORD_RE = re.compile(
    r"^\s*(2\d{6}\.\d+)\s*=\s*A\.D\.\s+(\S+.*)$"
)
VEC_RE = re.compile(
    r"^\s*X\s*=\s*(\S+)\s+Y\s*=\s*(\S+)\s+Z\s*=\s*(\S+)\s*$"
)
VEL_RE = re.compile(
    r"^\s*VX\s*=\s*(\S+)\s+VY\s*=\s*(\S+)\s+VZ\s*=\s*(\S+)\s*$"
)
SOURCE_RE = re.compile(r"\{source:\s*([^}]+)\}")
# NOTE: the `(.*?)` + optional-group form used previously matched the empty
# string, so target/center/source came back blank in every build. Capture the
# name up to the "{source: ...}" tag instead (with a no-tag fallback).
TARGET_RE = re.compile(r"Target body name:\s*([^{]*?)\s*\{source:\s*([^}]+)\}", re.M)
CENTER_RE = re.compile(r"Center body name:\s*([^{]*?)\s*\{source:\s*([^}]+)\}", re.M)
TARGET_BARE_RE = re.compile(r"Target body name:\s*([^\r\n]+)", re.M)
CENTER_BARE_RE = re.compile(r"Center body name:\s*([^\r\n]+)", re.M)
FRAME_RE = re.compile(r"Reference frame\s*:\s*([^\r\n]+)", re.M)
UNITS_RE = re.compile(r"Output units\s*:\s*([^\r\n]+)", re.M)


def query(command, center, start, stop, step, ref_plane="ecliptic", verbose=False):
    """Fetch a VECTORS table. Returns (header_info, records).

    header_info: {target, center, source_target, source_center, frame}
    records: list of {jd, date_str, pos:[x,y,z], vel:[vx,vy,vz]}
    Times are TDB (Horizons labels JDTDB + calendar TDB).
    """
    params = {
        "format": "text",
        "COMMAND": "'%s'" % command,
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'",
        "CENTER": "'%s'" % center,
        "START_TIME": "'%s'" % start,
        "STOP_TIME": "'%s'" % stop,
        "STEP_SIZE": "'%s'" % step,
        "OUT_UNITS": "'KM-S'",
        "REF_SYSTEM": "'J2000'",
        "CAL_FORMAT": "'CAL'",
        "TIME_DIGITS": "'MINUTES'",
        "CSV_FORMAT": "'NO'",
    }
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, "q_%s.txt" % key)
    if os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    else:
        url = API_URL + "?" + urllib.parse.urlencode(params)
        if verbose:
            print("GET", url[:160], "...")
        req = urllib.request.Request(url, headers={"User-Agent": "MARGIN-SpaceApps-Research/1.0"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    text = r.read().decode("utf-8", errors="replace")
                break
            except Exception as e:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        with open(cache_path, "w", encoding="utf-8") as f:
            f.write(text)
        time.sleep(1.0)  # be gentle with the public API
    return parse_vectors(text)


def parse_vectors(text):
    if "VECTORS" not in text and "$$SOE" not in text:
        raise ValueError("Horizons error or unexpected response:\n" + text[:2000])
    m = TARGET_RE.search(text)
    if m:
        target, src_t = m.group(1).strip(), m.group(2).strip()
    else:
        m = TARGET_BARE_RE.search(text)
        target = m.group(1).strip() if m else None
        src_t = (SOURCE_RE.search(text).group(1).strip() if SOURCE_RE.search(text) else "")
    m = CENTER_RE.search(text)
    if m:
        center, src_c = m.group(1).strip(), m.group(2).strip()
    else:
        m = CENTER_BARE_RE.search(text)
        center = m.group(1).strip() if m else None
        src_c = src_t
    m = FRAME_RE.search(text)
    frame = m.group(1).strip() if m else None
    m = UNITS_RE.search(text)
    units = m.group(1).strip() if m else None
    # Frame/unit contract guard (solar_system_accuracy_spec.md §2/§8/§21): the
    # vendored data is only valid if Horizons really answered in the ecliptic
    # J2000 frame with km-s units. Fail loudly instead of silently mixing frames.
    if frame and "ecliptic of j2000" not in frame.lower():
        raise ValueError("unexpected Horizons reference frame: %r" % frame)
    if units and units.lower().replace(" ", "") not in ("km-s", "kms"):
        raise ValueError("unexpected Horizons output units: %r" % units)
    try:
        body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    except IndexError:
        raise ValueError("No $$SOE/$$EOE block in response")
    records = []
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        mr = RECORD_RE.match(lines[i])
        if mr:
            jd = float(mr.group(1))
            datestr = mr.group(2).strip()
            mx = VEC_RE.match(lines[i + 1]) if i + 1 < len(lines) else None
            mv = VEL_RE.match(lines[i + 2]) if i + 2 < len(lines) else None
            if not (mx and mv):
                raise ValueError("Malformed vector record near JD %s" % mr.group(1))
            records.append({
                "jd": jd,
                "date": datestr,
                "pos": [float(mx.group(1)), float(mx.group(2)), float(mx.group(3))],
                "vel": [float(mv.group(1)), float(mv.group(2)), float(mv.group(3))],
          })
            i += 3
        else:
            i += 1
    info = {"target": target, "center": center, "source_target": src_t,
            "source_center": src_c, "frame": frame, "units": units, "n": len(records)}
    return info, records
