export function calcStats(latencies) {
  if (!latencies.length) return null;
  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  const percentile = fraction => sorted[Math.min(Math.floor(count * fraction), count - 1)];
  const median = count % 2
    ? sorted[Math.floor(count / 2)]
    : (sorted[count / 2 - 1] + sorted[count / 2]) / 2;

  return {
    count,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[count - 1],
    median,
    p75: percentile(0.75),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}
