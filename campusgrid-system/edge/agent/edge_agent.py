"""
CampusGrid Agent — RFID + webcam integrity

Rules:
  - Normal taps (>= 200ms apart): log only, no flag
  - Rapid cluster (2+ taps with gaps < 200ms):
      capture webcam headcount (+ photo)
      if headcount >= tap_count  -> OK / ignore (more people than taps is OK)
      if headcount <  tap_count  -> FLAG and send photo to admin server

Posts to the single CampusGrid server :3000
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import threading
import time
from pathlib import Path

import cv2
import requests
import serial
import serial.tools.list_ports

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

if not hasattr(cv2, "CascadeClassifier"):
    print("Broken OpenCV. pip install opencv-python==4.10.0.84", file=sys.stderr)
    sys.exit(1)


class SharedCam:
    def __init__(self, index: int = 0):
        self.index = index
        self.lock = threading.Lock()
        self.frame = None
        self.cap = None
        self.running = False

    def start(self) -> bool:
        cap = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(self.index)
        if not cap.isOpened():
            return False
        self.cap = cap
        self.running = True
        threading.Thread(target=self._loop, daemon=True).start()
        return True

    def _loop(self) -> None:
        while self.running:
            ok, frame = self.cap.read()
            if ok:
                with self.lock:
                    self.frame = frame
            else:
                time.sleep(0.02)

    def snapshot(self):
        with self.lock:
            if self.frame is None:
                return None
            return self.frame.copy()

    def stop(self) -> None:
        self.running = False
        if self.cap:
            self.cap.release()


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        example = ROOT / "config.example.json"
        CONFIG_PATH.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def pick_port(preferred: str | None) -> str:
    if preferred:
        return preferred
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        raise SystemExit("No serial ports. Plug in Arduino.")
    for p in ports:
        d = (p.description or "").lower()
        if "arduino" in d or "ch340" in d or "usb serial" in d:
            return p.device
    return ports[0].device


def post_json(cfg: dict, path: str, body: dict) -> dict | None:
    url = cfg["gateway_url"].rstrip("/") + path
    try:
        r = requests.post(
            url,
            json=body,
            headers={"X-Device-Key": cfg["device_key"], "X-Edge-Key": cfg["device_key"]},
            timeout=8,
        )
        if r.status_code >= 300:
            print(f"Server error {r.status_code}: {r.text[:160]}")
            return None
        return r.json() if r.content else {}
    except requests.RequestException as e:
        print(f"Server unreachable: {e}")
        return None


def count_heads(frame_bgr, cascade) -> int:
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    return len(faces)


def frame_to_jpeg_b64(frame) -> str:
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")


def parse_arduino_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None
    if line.startswith("TAP:") and ":INTERVAL:" in line:
        parts = line.split(":")
        try:
            return {
                "uid": parts[2].upper(),
                "interval_ms": int(parts[4]),
                "flagged": parts[6] == "1",
            }
        except (IndexError, ValueError):
            return None
    if line.startswith("TAP:") and "," in line:
        try:
            uid, interval_s, flag_s = line[4:].split(",")
            return {
                "uid": uid.strip().upper(),
                "interval_ms": int(interval_s),
                "flagged": flag_s.strip() == "1",
            }
        except ValueError:
            return None
    if line.startswith("UID:"):
        return {"uid": line[4:].strip().upper(), "interval_ms": None, "flagged": False}
    return None


def preview_loop(cam: SharedCam, cascade, stop: threading.Event, show: bool) -> None:
    if not show:
        return
    while not stop.is_set():
        frame = cam.snapshot()
        if frame is None:
            time.sleep(0.05)
            continue
        count = count_heads(frame, cascade)
        preview = frame.copy()
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        for x, y, w, h in cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60)):
            cv2.rectangle(preview, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(
            preview,
            f"Headcount: {count}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2,
        )
        cv2.imshow("CampusGrid Doorway Cam", preview)
        if cv2.waitKey(1) & 0xFF == 27:
            stop.set()
            break
    cv2.destroyAllWindows()


def evaluate_cluster(cfg, cam, cascade, cluster: list[dict]) -> None:
    """cluster entries: {uid, interval_ms, ts_ms}"""
    if len(cluster) < 2:
        return

    tap_count = len(cluster)
    uids = [c["uid"] for c in cluster]
    intervals = [c["interval_ms"] for c in cluster if c.get("interval_ms") is not None]
    min_interval = min(intervals) if intervals else None

    frame = cam.snapshot()
    headcount = 0
    photo_b64 = ""
    if frame is not None:
        headcount = count_heads(frame, cascade)
        photo_b64 = frame_to_jpeg_b64(frame)

    # Rule: more heads than taps => ignore (OK). Fewer heads => FLAG.
    if headcount >= tap_count:
        verdict = "ok"
        reason = f"{tap_count} rapid taps, camera sees {headcount} (>= taps) — OK/ignore"
        print(f"[INTEGRITY OK] taps={tap_count} heads={headcount} uids={uids}")
    else:
        verdict = "flagged"
        reason = (
            f"{tap_count} rapid taps (<200ms), camera sees only {headcount} — FLAG"
        )
        print(f"[INTEGRITY FLAG] taps={tap_count} heads={headcount} uids={uids}")

    body = {
        "uids": uids,
        "tap_count": tap_count,
        "headcount": headcount,
        "interval_ms": min_interval,
        "verdict": verdict,
        "reason": reason,
        "doorway": cfg.get("doorway"),
        "facility_slug": cfg.get("facility_slug"),
        "source": "arduino-usb+webcam",
        "photo_jpeg_base64": photo_b64 if verdict == "flagged" else "",
    }
    post_json(cfg, "/api/edge/integrity", body)


def serial_loop(cfg, port: str, cam: SharedCam, cascade, stop: threading.Event) -> None:
    baud = int(cfg.get("baud", 115200))
    min_ms = int(cfg.get("min_tap_interval_ms", 200))
    settle_ms = int(cfg.get("cluster_settle_ms", 350))

    print(f"Opening {port} @ {baud}")
    ser = serial.Serial(port, baud, timeout=1)
    time.sleep(2)

    last_uid = None
    last_ms = None
    cluster: list[dict] = []
    last_cluster_change = 0

    print("Listening for RFID taps (integrity mode)...")
    try:
        while not stop.is_set():
            # Settle rapid cluster after quiet period
            if cluster and len(cluster) >= 2:
                if (time.time() * 1000) - last_cluster_change >= settle_ms:
                    evaluate_cluster(cfg, cam, cascade, cluster)
                    cluster = []

            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line:
                continue
            print(f"[SERIAL] {line}")

            parsed = parse_arduino_line(line)
            if not parsed:
                continue

            uid = parsed["uid"]
            now_ms = int(time.time() * 1000)
            interval = parsed.get("interval_ms")
            if interval is None:
                interval = (now_ms - last_ms) if last_ms is not None else 10_000

            # Always log tap (not a student-facing live stream)
            post_json(
                cfg,
                "/api/edge/tap",
                {
                    "uid": uid,
                    "interval_ms": interval,
                    "flagged": False,  # final flag only after headcount check
                    "source": "arduino-usb",
                    "doorway": cfg.get("doorway"),
                    "facility_slug": cfg.get("facility_slug"),
                    "prev_uid": last_uid,
                    "admin_only": True,
                },
            )

            rapid = interval < min_ms and last_uid is not None
            if rapid:
                if not cluster:
                    # include previous tap as start of cluster
                    cluster = [
                        {"uid": last_uid, "interval_ms": None, "ts_ms": last_ms},
                        {"uid": uid, "interval_ms": interval, "ts_ms": now_ms},
                    ]
                else:
                    cluster.append({"uid": uid, "interval_ms": interval, "ts_ms": now_ms})
                last_cluster_change = now_ms
                print(f"[CLUSTER] size={len(cluster)} last_gap={interval}ms")
            else:
                # gap normal — close previous cluster first
                if len(cluster) >= 2:
                    evaluate_cluster(cfg, cam, cascade, cluster)
                cluster = []
                last_cluster_change = now_ms

            last_uid = uid
            last_ms = now_ms
    finally:
        if len(cluster) >= 2:
            evaluate_cluster(cfg, cam, cascade, cluster)
        ser.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", help="Arduino COM port")
    args = parser.parse_args()

    cfg = load_config()
    port = pick_port(args.port or cfg.get("serial_port") or None)
    stop = threading.Event()
    cascade = cv2.CascadeClassifier(CASCADE_PATH)

    cam = SharedCam(int(cfg.get("webcam_index", 0)))
    if not cam.start():
        print("Webcam not available — cannot run integrity headcount.")
        sys.exit(1)

    show = bool(cfg.get("show_preview", True))
    threading.Thread(
        target=preview_loop, args=(cam, cascade, stop, show), daemon=True
    ).start()

    try:
        serial_loop(cfg, port, cam, cascade, stop)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        stop.set()
        cam.stop()


if __name__ == "__main__":
    main()
