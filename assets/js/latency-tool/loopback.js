import { CFG } from './config.js';
import { calcStats } from './stats.js';
import { appendLog, exportCsv, renderHistogram, renderStatBadges, renderTimeline } from './charts.js';
import { addPendingSourceEvent, avgLuminance, takeUnambiguousSourceEvent } from './marker.js';

export function createLoopback(elements) {
  const context = elements.srcCanvas.getContext('2d');
  const detectContext = elements.detectCanvas.getContext('2d');
  const state = {
    pc1: null,
    pc2: null,
    stream: null,
    sourceFrame: null,
    detectFrame: null,
    statsTimer: null,
    sourceState: -1,
    detectedState: -1,
    pendingSourceEvents: [],
    warmupLeft: 0,
    samples: [],
  };

  function getInterval() {
    return parseInt(elements.toggleInterval.value, 10) || 1500;
  }

  function getWarmupCount() {
    return parseInt(elements.warmupCount.value, 10) || 0;
  }

  function updateStats() {
    const latencies = state.samples.map(sample => sample.latency);
    elements.sampleBadge.textContent = `${state.samples.length} samples`;
    renderStatBadges(elements.statsBadges, calcStats(latencies));
    renderHistogram(elements.histogram, latencies);
    renderTimeline(elements.timeline, state.samples);
  }

  function drawSource(timestamp) {
    const width = elements.srcCanvas.width;
    const height = elements.srcCanvas.height;
    const interval = getInterval();

    context.fillStyle = '#0b1020';
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 7; i++) {
      const x = (Math.sin(timestamp / 1000 + i * 1.1) * 0.4 + 0.5) * (width - 120) + 60;
      const y = (Math.cos(timestamp / 1000 * 0.75 + i * 0.9) * 0.32 + 0.5) * (height - 120) + 60;
      context.fillStyle = `hsl(${(timestamp / 45 + i * 55) % 360} 80% 55%)`;
      context.beginPath();
      context.arc(x, y, 14 + (i * 6) % 22, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = '#fff';
    context.font = 'bold 34px system-ui';
    context.fillText('G2G Source', 80, 88);
    context.font = '22px monospace';
    context.fillStyle = '#1de9b6';
    context.fillText(`t = ${(timestamp / 1000).toFixed(2)} s`, 80, 128);
    context.fillStyle = '#adb5bd';
    context.fillText(`samples: ${state.samples.length}`, 80, 162);

    const nextState = Math.floor(timestamp / interval) % 2;
    if (nextState !== state.sourceState) {
      state.sourceState = nextState;
      addPendingSourceEvent(state.pendingSourceEvents, nextState, performance.now());
    }

    context.fillStyle = state.sourceState === 1 ? '#ffffff' : '#000000';
    context.fillRect(0, 0, CFG.MARKER_PX, CFG.MARKER_PX);
    context.fillStyle = state.sourceState === 1 ? '#000' : '#fff';
    context.font = 'bold 14px monospace';
    context.textAlign = 'center';
    context.fillText(state.sourceState === 1 ? 'W' : 'B', CFG.MARKER_PX / 2, CFG.MARKER_PX / 2 + 5);
    context.textAlign = 'left';

    state.sourceFrame = requestAnimationFrame(drawSource);
  }

  function detectFrame() {
    if (!elements.remoteVideo.videoWidth || !elements.remoteVideo.videoHeight) {
      state.detectFrame = requestAnimationFrame(detectFrame);
      return;
    }

    detectContext.drawImage(
      elements.remoteVideo,
      0, 0, CFG.MARKER_PX, CFG.MARKER_PX,
      0, 0, CFG.DETECT_W, CFG.DETECT_H
    );
    const luminance = avgLuminance(detectContext.getImageData(0, 0, CFG.DETECT_W, CFG.DETECT_H));

    let nextState = state.detectedState;
    if (luminance > CFG.BRIGHT_HI) nextState = 1;
    else if (luminance < CFG.BRIGHT_LO) nextState = 0;

    if (nextState !== state.detectedState && nextState !== -1) {
      state.detectedState = nextState;
      const tPlay = performance.now();
      const { event, ambiguous } = takeUnambiguousSourceEvent(state.pendingSourceEvents, nextState);
      if (ambiguous) {
        appendLog(elements.log, 'Ambiguous marker match discarded.');
      } else if (event) {
        const { tSrc } = event;
        const latency = tPlay - tSrc;

        if (latency >= CFG.MIN_LATENCY_MS && latency <= CFG.MAX_LATENCY_MS) {
          if (state.warmupLeft > 0) {
            state.warmupLeft--;
            appendLog(elements.log, `Warm-up sample discarded: ${latency.toFixed(1)} ms (${state.warmupLeft} left)`);
          } else {
            state.samples.push({ tSrc, tPlay, latency });
            if (state.samples.length > CFG.MAX_SAMPLES) state.samples.shift();
            updateStats();
            appendLog(elements.log, `Sample #${state.samples.length}: ${latency.toFixed(1)} ms (→ ${nextState ? 'white' : 'black'})`);
          }
        } else {
          appendLog(elements.log, `Discarded outlier: ${latency.toFixed(1)} ms`);
        }
      }
    }

    state.detectFrame = requestAnimationFrame(detectFrame);
  }

  function stop() {
    if (state.sourceFrame !== null) {
      cancelAnimationFrame(state.sourceFrame);
      state.sourceFrame = null;
    }
    if (state.detectFrame !== null) {
      cancelAnimationFrame(state.detectFrame);
      state.detectFrame = null;
    }
    if (state.statsTimer) {
      clearInterval(state.statsTimer);
      state.statsTimer = null;
    }
    state.pendingSourceEvents = [];
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    if (state.pc1) {
      state.pc1.close();
      state.pc1 = null;
    }
    if (state.pc2) {
      state.pc2.close();
      state.pc2 = null;
    }
    elements.remoteVideo.srcObject = null;
    elements.startButton.disabled = false;
    elements.stopButton.disabled = true;
  }

  async function start() {
    stop();
    elements.log.textContent = '';
    appendLog(elements.log, 'Starting loopback test...');

    state.warmupLeft = getWarmupCount();
    state.sourceState = -1;
    state.detectedState = -1;
    state.pendingSourceEvents = [];

    const preferredCodec = elements.codecSelect.value;
    try {
      state.stream = elements.srcCanvas.captureStream(30);
      state.sourceFrame = requestAnimationFrame(drawSource);

      const previousOwner = window.__g2gPeerConnectionOwner;
      window.__g2gPeerConnectionOwner = 'loopback';
      try {
        state.pc1 = new RTCPeerConnection();
        state.pc2 = new RTCPeerConnection();
      } finally {
        if (previousOwner === undefined) delete window.__g2gPeerConnectionOwner;
        else window.__g2gPeerConnectionOwner = previousOwner;
      }

      state.pc1.onicecandidate = event => {
        if (event.candidate && state.pc2) state.pc2.addIceCandidate(event.candidate).catch(() => {});
      };
      state.pc2.onicecandidate = event => {
        if (event.candidate && state.pc1) state.pc1.addIceCandidate(event.candidate).catch(() => {});
      };
      state.pc2.ontrack = event => {
        elements.remoteVideo.srcObject = event.streams[0];
        appendLog(elements.log, 'Remote track attached → starting detection loop.');
        state.detectFrame = requestAnimationFrame(detectFrame);
      };
      state.pc1.onconnectionstatechange = () => {
        if (state.pc1) appendLog(elements.log, `pc1 connection: ${state.pc1.connectionState}`);
      };

      const track = state.stream.getVideoTracks()[0];
      const transceiver = state.pc1.addTransceiver(track, {
        direction: 'sendonly',
        streams: [state.stream],
      });
      const capabilities = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
      const wantedCodecs = capabilities.filter(codec =>
        (codec.mimeType ?? '').toLowerCase() === `video/${preferredCodec.toLowerCase()}`
      );
      if (wantedCodecs.length) {
        try {
          transceiver.setCodecPreferences(wantedCodecs);
        } catch (error) {
          appendLog(elements.log, `setCodecPreferences failed: ${error.message}`);
        }
      } else {
        appendLog(elements.log, `Warning: ${preferredCodec} not found in RTCRtpSender.getCapabilities — using browser default.`);
      }

      const offer = await state.pc1.createOffer();
      await state.pc1.setLocalDescription(offer);
      await state.pc2.setRemoteDescription(offer);
      const answer = await state.pc2.createAnswer();
      await state.pc2.setLocalDescription(answer);
      await state.pc1.setRemoteDescription(answer);

      state.statsTimer = setInterval(async () => {
        if (!state.pc2) return;
        try {
          const stats = await state.pc2.getStats();
          stats.forEach(report => {
            if (report.type !== 'inbound-rtp' || report.kind !== 'video') return;
            const jitterBuffer = report.jitterBufferDelay && report.jitterBufferEmittedCount
              ? (report.jitterBufferDelay / report.jitterBufferEmittedCount * 1000).toFixed(1)
              : '?';
            const decodeTime = report.totalDecodeTime && report.framesDecoded
              ? (report.totalDecodeTime / report.framesDecoded * 1000).toFixed(2)
              : '?';
            appendLog(elements.log, `getStats ▸ framesDecoded=${report.framesDecoded ?? '?'}  jitterBuf=${jitterBuffer} ms  decodeTime=${decodeTime} ms/frame`);
          });
        } catch (_) {}
      }, 5000);

      elements.startButton.disabled = true;
      elements.stopButton.disabled = false;
      appendLog(elements.log, `Codec pref: ${preferredCodec}${wantedCodecs.length ? '' : ' (ignored)'}  Toggle interval: ${getInterval()} ms  Warm-up: ${getWarmupCount()}`);
    } catch (error) {
      appendLog(elements.log, `Signalling error: ${error}`);
      stop();
    }
  }

  function clearSamples() {
    state.samples = [];
    state.pendingSourceEvents = [];
    elements.sampleBadge.textContent = '0 samples';
    updateStats();
    appendLog(elements.log, 'Samples cleared.');
  }

  function exportSamples() {
    if (!state.samples.length) {
      appendLog(elements.log, 'No samples to export.');
      return;
    }
    exportCsv(state.samples, `loopback-latency-${Date.now()}.csv`);
    appendLog(elements.log, `Exported ${state.samples.length} samples.`);
  }

  return { start, stop, clearSamples, exportSamples };
}
