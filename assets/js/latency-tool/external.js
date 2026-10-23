import { CFG } from './config.js';
import { calcStats } from './stats.js';
import { appendLog, exportCsv, renderHistogram, renderStatBadges, renderTimeline } from './charts.js';
import { addPendingSourceEvent, avgLuminance, takeUnambiguousSourceEvent } from './marker.js';

export function createExternalStream(elements) {
  const detectContext = elements.detectCanvas.getContext('2d');
  const state = {
    player: null,
    peerConnection: null,
    statsTimer: null,
    detectFrame: null,
    detectRetryTimer: null,
    detectGeneration: 0,
    detectedState: -1,
    pendingSourceEvents: [],
    samples: [],
  };

  function addSourceEvent(markerState, tSrc) {
    addPendingSourceEvent(state.pendingSourceEvents, markerState, tSrc);
  }

  function startStats() {
    if (!state.peerConnection || state.statsTimer) return;
    elements.pollBadge.textContent = 'Polling';
    elements.pollBadge.className = 'badge bg-success';
    state.statsTimer = setInterval(async () => {
      if (!state.peerConnection) return;
      try {
        renderStats(await state.peerConnection.getStats());
      } catch (_) {}
    }, CFG.STATS_POLL_MS);
  }

  function renderStats(stats) {
    const rows = [];
    stats.forEach(report => {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        const jitterBuffer = report.jitterBufferDelay && report.jitterBufferEmittedCount
          ? `${(report.jitterBufferDelay / report.jitterBufferEmittedCount * 1000).toFixed(2)} ms`
          : '—';
        const decodeTime = report.totalDecodeTime && report.framesDecoded
          ? `${(report.totalDecodeTime / report.framesDecoded * 1000).toFixed(2)} ms`
          : '—';
        const packetsReceived = Math.max(0, report.packetsReceived ?? 0);
        const packetsLost = Math.max(0, report.packetsLost ?? 0);
        const expectedPackets = packetsReceived + packetsLost;
        const lossRate = expectedPackets > 0
          ? `${(packetsLost / expectedPackets * 100).toFixed(2)} %`
          : '—';

        rows.push(
          ['Jitter buffer delay (avg)', jitterBuffer],
          ['Avg decode time / frame', decodeTime],
          ['Frames decoded', report.framesDecoded ?? '—'],
          ['Frames dropped', report.framesDropped ?? '—'],
          ['Frames / second', report.framesPerSecond?.toFixed(1) ?? '—'],
          ['Network jitter', report.jitter !== undefined ? `${(report.jitter * 1000).toFixed(1)} ms` : '—'],
          ['Packets received', report.packetsReceived ?? '—'],
          ['Packets lost', report.packetsLost ?? '—'],
          ['Packet loss rate', lossRate],
          ['NACK count', report.nackCount ?? '—'],
          ['PLI count', report.pliCount ?? '—'],
          ['FIR count', report.firCount ?? '—'],
        );

        if (report.estimatedPlayoutTimestamp) {
          const difference = Date.now() - report.estimatedPlayoutTimestamp;
          rows.push(
            ['estimatedPlayoutTimestamp', report.estimatedPlayoutTimestamp],
            ['Est. playout latency (NTP)', `${difference.toFixed(0)} ms ⚠ needs NTP sync`],
          );
        }
      }

      if (report.type === 'candidate-pair' && report.nominated) {
        if (report.currentRoundTripTime !== undefined) {
          rows.push(['Network RTT', `${(report.currentRoundTripTime * 1000).toFixed(1)} ms`]);
        }
        if (report.availableOutgoingBitrate !== undefined) {
          rows.push(['Available bw (out)', `${(report.availableOutgoingBitrate / 1000).toFixed(0)} kbps`]);
        }
      }
    });

    if (!rows.length) return;
    elements.statsTableBody.innerHTML = rows.map(([label, value]) =>
      `<tr><td class="ps-3 text-muted">${label}</td><td class="font-monospace">${value}</td></tr>`
    ).join('');
  }

  function updateLatencyStats() {
    const latencies = state.samples.map(sample => sample.latency);
    elements.sampleBadge.textContent = `${state.samples.length} samples`;
    renderStatBadges(elements.statsBadges, calcStats(latencies));
    if (state.samples.length) elements.latencyCard.style.removeProperty('display');
    renderHistogram(elements.histogram, latencies);
    renderTimeline(elements.timeline, state.samples);
  }

  function runDetection(video, generation, player) {
    const isCurrent = () =>
      state.detectGeneration === generation &&
      state.player === player &&
      elements.pixelDetect.checked;

    function detectFrame() {
      if (!isCurrent()) return;
      if (!video.videoWidth || !video.videoHeight) {
        state.detectFrame = requestAnimationFrame(detectFrame);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      const x = parseInt(elements.markerX.value, 10) / 100 * width;
      const y = parseInt(elements.markerY.value, 10) / 100 * height;
      const regionWidth = parseInt(elements.markerWidth.value, 10) / 100 * width;
      const regionHeight = parseInt(elements.markerHeight.value, 10) / 100 * height;
      detectContext.drawImage(
        video, x, y, regionWidth, regionHeight,
        0, 0, elements.detectCanvas.width, elements.detectCanvas.height
      );
      const imageData = detectContext.getImageData(
        0, 0, elements.detectCanvas.width, elements.detectCanvas.height
      );
      const luminance = avgLuminance(imageData);

      let nextState = state.detectedState;
      if (luminance > CFG.BRIGHT_HI) nextState = 1;
      else if (luminance < CFG.BRIGHT_LO) nextState = 0;

      if (nextState !== state.detectedState && nextState !== -1) {
        state.detectedState = nextState;
        const tPlay = performance.now();
        appendLog(elements.log, `Ext marker → ${nextState ? 'white' : 'black'} detected at t=${tPlay.toFixed(1)} ms`);

        const { event, ambiguous } = takeUnambiguousSourceEvent(state.pendingSourceEvents, nextState);
        if (ambiguous) {
          appendLog(elements.log, '  ↳ ambiguous source event match discarded.');
        } else if (event) {
          const { tSrc } = event;
          const latency = tPlay - tSrc;
          if (latency >= CFG.MIN_LATENCY_MS && latency <= CFG.MAX_LATENCY_MS) {
            state.samples.push({ tSrc, tPlay, latency });
            if (state.samples.length > CFG.MAX_SAMPLES) state.samples.shift();
            updateLatencyStats();
            appendLog(elements.log, `  ↳ latency = ${latency.toFixed(1)} ms (source-synced)`);
          } else {
            appendLog(elements.log, `  ↳ outlier discarded: ${latency.toFixed(1)} ms`);
          }
        }
      }

      state.detectFrame = requestAnimationFrame(detectFrame);
    }

    state.detectFrame = requestAnimationFrame(detectFrame);
  }

  function cancelDetection() {
    state.detectGeneration++;
    if (state.detectRetryTimer !== null) {
      clearTimeout(state.detectRetryTimer);
      state.detectRetryTimer = null;
    }
    if (state.detectFrame !== null) {
      cancelAnimationFrame(state.detectFrame);
      state.detectFrame = null;
    }
  }

  function scheduleDetection() {
    cancelDetection();
    const generation = state.detectGeneration;
    const player = state.player;
    if (!player || !elements.pixelDetect.checked) return;

    const isCurrent = () =>
      state.detectGeneration === generation &&
      state.player === player &&
      elements.pixelDetect.checked;

    function tryStart(attempt) {
      if (!isCurrent()) return;
      const video = document.querySelector('#ovpPlayer video');
      if (video) {
        appendLog(elements.log, 'Pixel detection started on external stream.');
        runDetection(video, generation, player);
      } else if (attempt < CFG.DETECT_RETRY_ATTEMPTS) {
        state.detectRetryTimer = setTimeout(() => {
          state.detectRetryTimer = null;
          tryStart(attempt + 1);
        }, CFG.DETECT_RETRY_INTERVAL_MS);
      } else {
        appendLog(elements.log, `Pixel detection: could not find <video> element after ${CFG.DETECT_RETRY_ATTEMPTS} attempts (${CFG.DETECT_RETRY_ATTEMPTS * CFG.DETECT_RETRY_INTERVAL_MS / 1000} s).`);
      }
    }

    tryStart(0);
  }

  function onPeerConnectionCreated(event) {
    const detail = event.detail;
    if (detail?.owner === 'loopback' || !state.player) return;
    state.peerConnection = detail?.pc ?? detail;
    appendLog(elements.log, 'RTCPeerConnection captured → getStats polling starting.');
    startStats();
  }
  document.addEventListener('_pc_created', onPeerConnectionCreated);

  function start() {
    stop();
    elements.log.textContent = '';
    const url = elements.streamUrl.value.trim();
    if (!url) {
      appendLog(elements.log, 'Enter a stream URL first.');
      return;
    }

    appendLog(elements.log, `Connecting to ${url} …`);
    try {
      state.player = OvenPlayer.create('ovpPlayer', {
        autoStart: true,
        mute: true,
        sources: [{ label: 'webrtc', type: 'webrtc', file: url }],
        webrtcConfig: { timeoutMaxRetry: 6, connectionTimeout: 10000 },
      });

      state.player.on('ready', () => appendLog(elements.log, 'OvenPlayer ready.'));
      state.player.on('stateChanged', info => appendLog(elements.log, `Player state: ${JSON.stringify(info)}`));
      state.player.on('error', error => appendLog(elements.log, `Player error: ${JSON.stringify(error)}`));
      elements.startButton.disabled = true;
      elements.stopButton.disabled = false;
      if (elements.pixelDetect.checked) scheduleDetection();
    } catch (error) {
      appendLog(elements.log, `Player error: ${error}`);
      stop();
    }
  }

  function stop() {
    cancelDetection();
    if (state.statsTimer) {
      clearInterval(state.statsTimer);
      state.statsTimer = null;
    }
    if (state.player) {
      try {
        state.player.remove();
      } catch (_) {}
      state.player = null;
      elements.playerWrap.innerHTML = '<div id="ovpPlayer" style="width:100%;height:100%"></div>';
    }
    state.peerConnection = null;
    state.detectedState = -1;
    state.pendingSourceEvents = [];
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
    elements.pollBadge.textContent = 'Not polling';
    elements.pollBadge.className = 'badge bg-secondary';
    elements.statsTableBody.innerHTML =
      '<tr><td colspan="2" class="text-muted text-center ps-3 py-3">Connect to a stream to see stats.</td></tr>';
  }

  function setDetectionEnabled(enabled) {
    if (enabled && state.player) {
      scheduleDetection();
    } else if (!enabled) {
      cancelDetection();
      appendLog(elements.log, 'Pixel detection disabled.');
    }
  }

  function clearSamples() {
    state.samples = [];
    state.pendingSourceEvents = [];
    elements.sampleBadge.textContent = '0 samples';
    updateLatencyStats();
    appendLog(elements.log, 'Samples cleared.');
  }

  function exportSamples() {
    if (!state.samples.length) {
      appendLog(elements.log, 'No samples to export.');
      return;
    }
    exportCsv(state.samples, `ext-latency-${Date.now()}.csv`);
    appendLog(elements.log, `Exported ${state.samples.length} samples.`);
  }

  return {
    start,
    stop,
    setDetectionEnabled,
    clearSamples,
    exportSamples,
    addSourceEvent,
    clearPendingSourceEvents() {
      state.pendingSourceEvents = [];
    },
  };
}
