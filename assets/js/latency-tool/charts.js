import { CFG } from './config.js';

export function renderStatBadges(container, stats) {
  if (!stats) {
    container.innerHTML = '<div class="col text-muted small">No samples yet.</div>';
    return;
  }

  const fields = [
    ['Count', stats.count, '', 'bg-secondary'],
    ['Mean', stats.mean.toFixed(1), ' ms', 'bg-info text-dark'],
    ['Median', stats.median.toFixed(1), ' ms', 'bg-primary'],
    ['p95', stats.p95.toFixed(1), ' ms', 'bg-warning text-dark'],
    ['p99', stats.p99.toFixed(1), ' ms', 'bg-danger'],
    ['Min', stats.min.toFixed(1), ' ms', 'bg-success'],
    ['Max', stats.max.toFixed(1), ' ms', 'bg-secondary'],
    ['StdDev', stats.stddev.toFixed(1), ' ms', 'bg-secondary'],
  ];
  container.innerHTML = fields.map(([label, value, unit, className]) => `
    <div class="col-auto text-center">
      <div class="text-muted" style="font-size:.68rem;letter-spacing:.05em">${label}</div>
      <span class="badge ${className} stat-val">${value}${unit}</span>
    </div>`).join('');
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr) || canvas.offsetWidth * dpr || 400;
  const height = Math.round(rect.height * dpr) || canvas.offsetHeight * dpr || 120;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

export function renderHistogram(canvas, latencies) {
  const { width, height } = resizeCanvas(canvas);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  if (latencies.length < 2) return;

  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const range = max - min || 1;
  const binSize = range / CFG.HIST_BINS;
  const bins = new Array(CFG.HIST_BINS).fill(0);
  latencies.forEach(value => {
    const index = Math.min(Math.floor((value - min) / binSize), CFG.HIST_BINS - 1);
    bins[index]++;
  });
  const maxBin = Math.max(...bins) || 1;
  const padding = 18;
  const barWidth = (width - 4) / CFG.HIST_BINS;

  bins.forEach((count, index) => {
    const barHeight = ((count / maxBin) * (height - padding - 4)) | 0;
    const x = 2 + index * barWidth;
    const hue = 130 - (index / CFG.HIST_BINS) * 100;
    context.fillStyle = `hsl(${hue} 75% 50%)`;
    context.fillRect(x + 1, height - padding - barHeight, barWidth - 2, barHeight);
  });

  context.fillStyle = '#6c757d';
  const dpr = window.devicePixelRatio || 1;
  context.font = `${10 * dpr}px monospace`;
  const format = value => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value.toFixed(0)}ms`;
  context.fillText(format(min), 2, height - 2);
  context.fillText(format((min + max) / 2), width / 2 - 20, height - 2);
  context.fillText(format(max), width - 42, height - 2);
}

export function renderTimeline(canvas, samples) {
  const { width, height } = resizeCanvas(canvas);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  const recent = samples.slice(-120);
  if (recent.length < 2) return;

  const latencies = recent.map(sample => sample.latency);
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const range = max - min || 1;
  const padding = 4;

  context.strokeStyle = '#1de9b6';
  context.lineWidth = 1.5;
  context.beginPath();
  recent.forEach((sample, index) => {
    const x = (index / (recent.length - 1)) * width;
    const y = height - padding - ((sample.latency - min) / range) * (height - padding * 2);
    index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
  });
  context.stroke();

  const last = latencies[latencies.length - 1];
  context.fillStyle = '#1de9b6';
  const dpr = window.devicePixelRatio || 1;
  context.font = `${11 * dpr}px monospace`;
  context.fillText(`${last.toFixed(1)} ms`, width - 62 * dpr, 14 * dpr);
}

export function appendLog(element, message) {
  const timestamp = performance.now().toFixed(0).padStart(8, ' ');
  element.textContent += `[${timestamp}ms] ${message}\n`;
  element.scrollTop = element.scrollHeight;
}

export function exportCsv(samples, filename) {
  const header = 'sample,t_src_ms,t_play_ms,latency_ms\n';
  const rows = samples.map((sample, index) =>
    `${index + 1},${sample.tSrc.toFixed(3)},${sample.tPlay.toFixed(3)},${sample.latency.toFixed(3)}`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
