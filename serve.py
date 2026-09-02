#!/usr/bin/env python3
"""Tiny loopback server for the Squawkr Omarchy panel.

Serves the static app (like `python3 -m http.server`) and adds two control routes the panel
uses for standard toolbar-panel behaviour:

  GET /__open?url=<https squawkr url>[&close=1]  → open the URL in the user's real browser
                                                    (xdg-open); with close=1, then shut the panel.
  GET /__close                                   → shut the panel.

"Shut the panel" closes the chromium --app window by terminating that chromium instance (matched
by its unique `--app=…/index.html` flag, so this server, xdg-open and pkill never match themselves).
The server itself keeps running, so the next toolbar click reopens instantly.

Bound to 127.0.0.1 only; /__open only accepts http(s) URLs on squawkr.se / squawkr.net.
"""
import os, re, sys, time, signal, threading, urllib.parse, http.server, socketserver

DIRECTORY = sys.argv[1] if len(sys.argv) > 1 else "."
PORT = int(os.environ.get("SQUAWKR_WIDGET_PORT", "8770"))
ALLOWED_HOST = re.compile(r"^([a-z0-9-]+\.)?squawkr\.(se|net)$", re.I)
APP_FLAG = ("--app=http://127.0.0.1:%d/index.html" % PORT).encode()


def close_panel(delay=0.0):
    """Terminate the chromium --app panel window (only), after an optional delay so an HTTP
    response can flush first. Never matches this server or xdg-open (they lack --app=…/index.html)."""
    def _do():
        if delay:
            time.sleep(delay)
        me = os.getpid()
        for pid in os.listdir("/proc"):
            if not pid.isdigit() or int(pid) == me:
                continue
            try:
                cl = open("/proc/%s/cmdline" % pid, "rb").read()
            except OSError:
                continue
            if APP_FLAG in cl:
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except OSError:
                    pass
    threading.Thread(target=_do, daemon=True).start()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRECTORY, **k)

    def _noContent(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/__open":
            q = urllib.parse.parse_qs(u.query)
            url = (q.get("url") or [""])[0]
            p = urllib.parse.urlparse(url)
            if p.scheme in ("http", "https") and ALLOWED_HOST.match(p.hostname or ""):
                import subprocess
                subprocess.Popen(["xdg-open", url],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self._noContent()
                if (q.get("close") or ["0"])[0] == "1":
                    try:
                        self.wfile.flush()
                    except OSError:
                        pass
                    close_panel(delay=0.25)
            else:
                self.send_response(400)
                self.send_header("Content-Length", "0")
                self.end_headers()
            return
        if u.path == "/__close":
            self._noContent()
            try:
                self.wfile.flush()
            except OSError:
                pass
            close_panel(delay=0.25)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass


def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
