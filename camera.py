"""USB webcam capture and MJPEG streaming for the dashboard.

Frames are grabbed with OpenCV (V4L2 on Linux) by a single background thread
that writes the latest JPEG into a shared buffer. Any number of browser tabs
can then watch the same stream without fighting over ``/dev/video0``. The
thread starts lazily on the first viewer and stops itself after a short idle
period, so the camera isn't held open (or its LED lit) 24/7.

Everything degrades gracefully: if OpenCV isn't installed, or no camera is
plugged in, the public methods simply report an error and the rest of the
dashboard keeps working.
"""

import threading
import time

try:
    import cv2
    OPENCV_AVAILABLE = True
except Exception:  # ImportError, or a broken native build
    cv2 = None
    OPENCV_AVAILABLE = False

# Seconds with no viewers before the camera device is released.
IDLE_TIMEOUT = 15
# How long frames()/snapshot() will wait for the first frame after opening.
FIRST_FRAME_TIMEOUT = 5

_BOUNDARY = b"--frame\r\n"


class CameraStream:
    """A single shared USB camera, read by a background thread."""

    def __init__(self, device=0, width=1280, height=720, fps=15):
        self.device = device
        self.width = width
        self.height = height
        self.fps = max(1, int(fps)) if fps else 15
        self._lock = threading.Lock()
        self._frame = None          # latest JPEG bytes
        self._thread = None
        self._running = False
        self._viewers = 0
        self._error = None

    # ── lifecycle ──────────────────────────────────────────────────────────────
    def _ensure_running(self):
        with self._lock:
            if self._running:
                return
            self._running = True
            self._error = None
            self._frame = None
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()

    def _capture_loop(self):
        cap = cv2.VideoCapture(self.device)
        if self.width:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        if self.height:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)

        if not cap.isOpened():
            cap.release()
            with self._lock:
                self._error = f"Could not open camera device {self.device!r}"
                self._running = False
            return

        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 80]
        frame_interval = 1.0 / self.fps
        idle_since = time.time()
        try:
            while self._running:
                ok, frame = cap.read()
                if not ok:
                    with self._lock:
                        self._error = "Lost connection to the camera"
                    break
                ok, buf = cv2.imencode(".jpg", frame, encode_params)
                if ok:
                    with self._lock:
                        self._frame = buf.tobytes()

                if self._viewers > 0:
                    idle_since = time.time()
                elif time.time() - idle_since > IDLE_TIMEOUT:
                    break  # nobody's watching — release the device
                time.sleep(frame_interval)
        finally:
            cap.release()
            with self._lock:
                self._frame = None
                self._running = False

    def _wait_for_frame(self):
        deadline = time.time() + FIRST_FRAME_TIMEOUT
        while self._frame is None and self._running and time.time() < deadline:
            time.sleep(0.05)

    # ── public API ─────────────────────────────────────────────────────────────
    def frames(self):
        """Yield MJPEG multipart chunks for a streaming HTTP response."""
        self._ensure_running()
        with self._lock:
            self._viewers += 1
        try:
            self._wait_for_frame()
            frame_interval = 1.0 / self.fps
            while self._running:
                frame = self._frame
                if frame is None:
                    time.sleep(0.05)
                    continue
                yield _BOUNDARY + b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
                time.sleep(frame_interval)
        finally:
            with self._lock:
                self._viewers = max(0, self._viewers - 1)

    def snapshot(self):
        """Return a single JPEG frame (bytes), or ``None`` if unavailable."""
        self._ensure_running()
        with self._lock:
            self._viewers += 1
        try:
            self._wait_for_frame()
            return self._frame
        finally:
            with self._lock:
                self._viewers = max(0, self._viewers - 1)

    @property
    def error(self):
        return self._error
