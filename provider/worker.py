#!/usr/bin/env python3
"""Single-provider GPU reference worker for Watchtower's ME demo.

The worker only executes the fixed matrix workload below. It never evaluates
buyer-provided code or shell commands and never signs blockchain transactions.
"""

import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

RELAY = os.environ.get("PROVIDER_RELAY_LOCAL_URL", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("PROVIDER_WORKER_TOKEN", "")
POLL_SECONDS = 3
SIDE = 384
ITERATIONS = 12


def request_json(path, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(RELAY + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read(2048).decode("utf-8", errors="replace")
        raise RuntimeError(f"Relay returned HTTP {error.code}: {detail}") from error


def run_gpu_task(job):
    import torch

    request_text = job["requestText"]
    seed = int.from_bytes(hashlib.sha256(request_text.encode("utf-8")).digest()[:8], "big") % (2**63 - 1)
    device = torch.device("cuda:0")
    generator = torch.Generator(device=device).manual_seed(seed)
    left = torch.rand((SIDE, SIDE), generator=generator, device=device, dtype=torch.float32)
    right = torch.rand((SIDE, SIDE), generator=generator, device=device, dtype=torch.float32)

    torch.cuda.synchronize(device)
    started = time.perf_counter()
    for _ in range(ITERATIONS):
        left = torch.matmul(left, right)
        left = left / torch.clamp(left.abs().max(), min=1e-12)
    torch.cuda.synchronize(device)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)

    result = left.detach().contiguous().cpu()
    output_hash = hashlib.sha256(result.numpy().tobytes()).hexdigest()
    completed_at = datetime.now(timezone.utc).isoformat()
    device_name = torch.cuda.get_device_name(0)
    receipt = {
        "schema": "watchtower-gpu-reference/v1",
        "orderId": job["orderId"],
        "requestHash": job["requestHash"],
        "execution": {
            "mode": "nvidia-cuda-reference",
            "task": "fixed-seed 384x384 float32 matrix multiplication",
            "iterations": ITERATIONS,
            "gpu": device_name,
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "elapsedMs": elapsed_ms,
            "completedAt": completed_at,
        },
        "input": {"sha256": hashlib.sha256(request_text.encode("utf-8")).hexdigest()},
        "output": {"sha256": output_hash},
        "note": "GPU execution metadata and receipt are provider claims; the on-chain receipt hash is not proof of computation.",
    }
    return {
        "result": {
            "task": "GPU matrix multiplication reference",
            "gpu": device_name,
            "elapsedMs": elapsed_ms,
            "outputSha256": output_hash,
            "preview": [round(float(value), 6) for value in result.flatten()[:8].tolist()],
        },
        "receiptText": json.dumps(receipt, indent=2, sort_keys=True),
    }


def fail(job_id, message):
    try:
        request_json(f"/internal/jobs/{job_id}/failure", "POST", {"error": message[:240]})
    except Exception as error:
        print(f"Could not report worker failure: {error}", file=sys.stderr)


def main():
    if not TOKEN or len(TOKEN) < 32:
        raise SystemExit("Set PROVIDER_WORKER_TOKEN to the relay's local token (at least 32 characters).")
    import torch
    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU unavailable. Install the NVIDIA driver and a CUDA-enabled PyTorch build first.")
    if "--check" in sys.argv:
        print(json.dumps({"gpu": torch.cuda.get_device_name(0), "torch": torch.__version__, "cuda": torch.version.cuda}))
        return

    print(f"Watchtower GPU worker online: {torch.cuda.get_device_name(0)}; relay {RELAY}")
    while True:
        try:
            response = request_json("/internal/next")
            job = response.get("job")
            if not job:
                time.sleep(POLL_SECONDS)
                continue
            print(f"Running order #{job['orderId']} on {torch.cuda.get_device_name(0)}")
            try:
                output = run_gpu_task(job)
                complete = request_json(f"/internal/jobs/{job['id']}/result", "POST", output)
                print(f"Order #{job['orderId']} complete; state={complete.get('state')}; receipt={complete.get('receiptHash')}")
            except Exception as error:
                fail(job["id"], "GPU workload failed. Check the provider machine logs.")
                print(f"Order #{job['orderId']} failed: {error}", file=sys.stderr)
        except Exception as error:
            print(f"Relay poll failed: {error}", file=sys.stderr)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
