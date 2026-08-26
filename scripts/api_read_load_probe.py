#!/usr/bin/env python3
import argparse
import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request


def percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def request_once(url, token):
    started = time.perf_counter()
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            status = response.status
        json.loads(body)
        error = None
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exception:
        status = getattr(exception, "code", 0) or 0
        error = type(exception).__name__
    return (time.perf_counter() - started) * 1000, status, error


def main():
    parser = argparse.ArgumentParser(description="Concurrent authenticated read probe for IOT API")
    parser.add_argument("--base-url", default="http://127.0.0.1:5050/api/v1")
    parser.add_argument("--token", required=True)
    parser.add_argument("--requests", type=int, default=120)
    parser.add_argument("--concurrency", type=int, default=12)
    args = parser.parse_args()
    if args.requests < 1 or args.concurrency < 1:
        parser.error("requests and concurrency must be positive")

    paths = ["analysis/benchmarks", "analysis/catalog", "analysis/history"]
    jobs = [paths[index % len(paths)] for index in range(args.requests)]
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(request_once, f"{args.base_url}/{path}", args.token)
            for path in jobs
        ]
        raw_results = [future.result() for future in futures]
    elapsed = time.perf_counter() - started

    endpoint_results = {}
    for path in paths:
        measurements = [result for job, result in zip(jobs, raw_results) if job == path]
        durations = [result[0] for result in measurements]
        endpoint_results[path] = {
            "requests": len(measurements),
            "errors": sum(1 for _, status, error in measurements if status != 200 or error),
            "p50_ms": round(statistics.median(durations), 2),
            "p95_ms": round(percentile(durations, 0.95), 2),
            "max_ms": round(max(durations), 2),
        }

    total_errors = sum(item["errors"] for item in endpoint_results.values())
    result = {
        "test": "api_authenticated_read_load",
        "requests": args.requests,
        "concurrency": args.concurrency,
        "elapsed_seconds": round(elapsed, 3),
        "throughput_rps": round(args.requests / elapsed, 2),
        "errors": total_errors,
        "endpoints": endpoint_results,
    }
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(1 if total_errors else 0)


if __name__ == "__main__":
    main()
