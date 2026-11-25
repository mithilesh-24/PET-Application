#!/usr/bin/env python3
"""
Minimal sandbox supervisor for pet-runner:1.
Reads stdin (passed to child), enforces wall-clock timeout, captures up to 1 MB + 1 byte
of stdout/stderr, measures peak child RSS in KB, and writes a JSON envelope to stdout.
"""

import base64
import json
import os
import resource
import signal
import subprocess
import sys
import time

MAX_OUTPUT_BYTES = 1024 * 1024  # 1 MB
TRUNCATION_NOTE = b"\n[output truncated at 1 MB]\n"


def read_capped(pipe):
    chunks = []
    total = 0
    truncated = False
    while True:
        chunk = pipe.read(65536)
        if not chunk:
            break
        remaining = MAX_OUTPUT_BYTES - total
        if remaining > 0:
            take = chunk[:remaining]
            chunks.append(take)
            total += len(take)
            if len(chunk) > remaining:
                truncated = True
        else:
            truncated = True
    out = b"".join(chunks)
    if truncated:
        out += TRUNCATION_NOTE
    return out


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: pet-supervisor.py <timeout_ms> <cmd...>\n")
        sys.exit(2)

    timeout_ms = max(100, int(sys.argv[1]))
    cmd = sys.argv[2:]

    stdin_data = sys.stdin.buffer.read()

    start_ns = time.monotonic_ns()
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )

    timed_out = False
    try:
        stdout_raw, stderr_raw = proc.communicate(input=stdin_data, timeout=timeout_ms / 1000.0)
        if len(stdout_raw) > MAX_OUTPUT_BYTES:
            stdout_raw = stdout_raw[:MAX_OUTPUT_BYTES] + TRUNCATION_NOTE
        if len(stderr_raw) > MAX_OUTPUT_BYTES:
            stderr_raw = stderr_raw[:MAX_OUTPUT_BYTES] + TRUNCATION_NOTE
    except subprocess.TimeoutExpired:
        timed_out = True
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout_raw, stderr_raw = proc.communicate()
        if len(stdout_raw) > MAX_OUTPUT_BYTES:
            stdout_raw = stdout_raw[:MAX_OUTPUT_BYTES] + TRUNCATION_NOTE
        if len(stderr_raw) > MAX_OUTPUT_BYTES:
            stderr_raw = stderr_raw[:MAX_OUTPUT_BYTES] + TRUNCATION_NOTE

    elapsed_ms = max(1, (time.monotonic_ns() - start_ns) // 1_000_000)
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    memory_kb = int(getattr(usage, "ru_maxrss", 0) or 0)

    rc = proc.returncode
    sig = None
    exit_code = rc
    if rc is not None and rc < 0:
        sig_num = -rc
        try:
            sig = signal.Signals(sig_num).name
        except ValueError:
            sig = f"SIG{sig_num}"
        exit_code = 128 + sig_num

    payload = {
        "exitCode": exit_code if exit_code is not None else 1,
        "signal": sig,
        "timedOut": timed_out,
        "ms": elapsed_ms,
        "memoryKb": memory_kb,
        "stdoutB64": base64.b64encode(stdout_raw).decode("ascii"),
        "stderrB64": base64.b64encode(stderr_raw).decode("ascii"),
    }
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
