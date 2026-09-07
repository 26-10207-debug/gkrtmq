// Aggregate timings only: do not record search terms, user IDs or document text.
export function requestTiming() {
  const start = performance.now();
  let last = start;
  const values: string[] = [];
  return {
    mark(name: string) { const now = performance.now(); values.push(`${name};dur=${(now - last).toFixed(1)}`); last = now; },
    headers() { return { "Server-Timing": [...values, `total;dur=${(performance.now() - start).toFixed(1)}`].join(", "), "Cache-Control": "private, no-store" }; },
  };
}
