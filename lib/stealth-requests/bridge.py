#!/usr/bin/env python3
"""
Node.js -> Python bridge for Stealth-Requests.

Reads a JSON request spec from stdin, executes the request using
stealth_requests.StealthSession, and writes a JSON response spec to stdout.

Request spec:
{
  "method": "GET" | "POST" | ...,
  "url": "https://...",
  "headers": { "User-Agent": "...", ... },
  "body": "...",              // optional, string or base64
  "body_encoding": "utf-8" | "base64",  // default: utf-8
  "timeout": 30,              // optional
  "retry": 0                  // optional
}

Response spec:
{
  "status": 200,
  "ok": true,
  "url": "https://...",
  "headers": { "content-type": "...", ... },
  "cookies": ["sessionid=...; Path=/; ..."],  // Set-Cookie values
  "body": "...",              // base64 encoded bytes
  "body_encoding": "base64",
  "elapsed": 0.45
}
"""

import sys
import json
import re
import base64
import traceback
from datetime import timedelta, datetime
from pathlib import Path

# Add the directory containing this script to the path so that the bundled
# stealth_requests package can be imported without installing it.
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from stealth_requests import StealthSession


def read_request():
    raw = sys.stdin.read()
    if not raw:
        raise ValueError("No input received on stdin")
    return json.loads(raw)


def encode_body(body: bytes) -> str:
    return base64.b64encode(body).decode("ascii")


def decode_body(spec: dict) -> bytes:
    body = spec.get("body")
    if body is None:
        return b""
    encoding = spec.get("body_encoding", "utf-8")
    if encoding == "base64":
        return base64.b64decode(body)
    if encoding == "utf-8":
        return body.encode("utf-8")
    raise ValueError(f"Unsupported body_encoding: {encoding}")


def flatten_headers(headers) -> dict:
    """Normalize header values to strings."""
    result = {}
    for key, value in (headers or {}).items():
        if value is None:
            continue
        if isinstance(value, list):
            value = ", ".join(str(v) for v in value)
        result[key] = str(value)
    return result


class SafeJSONEncoder(json.JSONEncoder):
    """Serialize values that the default encoder cannot handle."""

    def default(self, obj):
        if isinstance(obj, timedelta):
            return obj.total_seconds()
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return obj.decode("utf-8", errors="replace")
        return super().default(obj)


def run():
    try:
        spec = read_request()
        method = spec.get("method", "GET").upper()
        url = spec["url"]
        headers = flatten_headers(spec.get("headers"))
        body = decode_body(spec)
        timeout = spec.get("timeout", 30)
        retry = spec.get("retry", 0)

        with StealthSession(timeout=timeout) as session:
            kwargs = {
                "headers": headers,
                "timeout": timeout,
                "retry": retry,
            }
            if body:
                kwargs["data"] = body

            resp = session.request(method, url, **kwargs)

            response_headers = {}
            for key, value in resp.headers.items():
                response_headers[key] = value if isinstance(value, str) else ", ".join(value)

            cookie_strings: list[str] = []

            # 1. Prefer the raw Set-Cookie header(s) if present.
            set_cookie_headers = resp.headers.get("set-cookie") or resp.headers.get("Set-Cookie")
            if set_cookie_headers:
                if isinstance(set_cookie_headers, str):
                    # curl_cffi may join multiple cookies with ", "; split them.
                    cookie_strings = [
                        c.strip() for c in re.split(r", (?=\w+=)", set_cookie_headers) if c.strip()
                    ]
                elif isinstance(set_cookie_headers, list):
                    cookie_strings = set_cookie_headers

            # 2. Fallback: reconstruct simple name=value pairs from the session jar.
            # curl_cffi stores redirect cookies in the session jar, not resp.cookies.
            if not cookie_strings:
                try:
                    cookie_strings = [f"{k}={v}" for k, v in session.cookies.get_dict().items()]
                except Exception:
                    pass

            response_body = resp.content
            out = {
                "status": resp.status_code,
                # ok = bridge itself succeeded; HTTP status is in "status".
                "ok": True,
                "url": getattr(resp, "url", url),
                "headers": response_headers,
                "cookies": cookie_strings,
                "body": encode_body(response_body),
                "body_encoding": "base64",
                "elapsed": getattr(resp, "elapsed", 0.0),
            }

        sys.stdout.write(json.dumps(out, cls=SafeJSONEncoder))
        sys.stdout.flush()

    except Exception as e:
        error_out = {
            "status": 0,
            "ok": False,
            "error": str(e),
            "trace": traceback.format_exc(),
        }
        sys.stdout.write(json.dumps(error_out))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    run()
