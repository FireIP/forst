import { createLoopback } from './loopback.js';
import { createExternalStream } from './external.js';
import { createObsSync } from './obs-sync.js';

const byId = id => document.getElementById(id);

const loopback = createLoopback({
  srcCanvas: byId('srcCanvas'),
  remoteVideo: byId('remoteVideo'),
  detectCanvas: byId('detectCanvas'),
  log: byId('lbLog'),
  startButton: byId('lbStartBtn'),
  stopButton: byId('lbStopBtn'),
  clearButton: byId('lbClearBtn'),
  exportButton: byId('lbExportBtn'),
  codecSelect: byId('codecSelect'),
  toggleInterval: byId('toggleInterval'),
  warmupCount: byId('warmupCount'),
  statsBadges: byId('lbStatBadges'),
  sampleBadge: byId('lbSampleBadge'),
  histogram: byId('histCanvas'),
  timeline: byId('timelineCanvas'),
});

const externalStream = createExternalStream({
  log: byId('extLog'),
  startButton: byId('extStartBtn'),
  stopButton: byId('extStopBtn'),
  clearButton: byId('extClearBtn'),
  exportButton: byId('extExportBtn'),
  streamUrl: byId('streamUrl'),
  playerWrap: byId('ovpPlayerWrap'),
  pixelDetect: byId('extPixelDetect'),
  markerX: byId('mX'),
  markerY: byId('mY'),
  markerWidth: byId('mW'),
  markerHeight: byId('mH'),
  detectCanvas: byId('extDetectCanvas'),
  pollBadge: byId('extPollBadge'),
  statsTableBody: byId('statsTableBody'),
  statsBadges: byId('extStatBadges'),
  sampleBadge: byId('extSampleBadge'),
  latencyCard: byId('extLatencyCard'),
  histogram: byId('extHistCanvas'),
  timeline: byId('extTimelineCanvas'),
});

const obsSync = createObsSync({
  log: byId('extLog'),
  enabled: byId('wsEnable'),
  section: byId('wsSection'),
  url: byId('wsUrl'),
  connectButton: byId('wsConnectBtn'),
  disconnectButton: byId('wsDisconnectBtn'),
}, externalStream);

byId('lbStartBtn').addEventListener('click', () => loopback.start());
byId('lbStopBtn').addEventListener('click', () => loopback.stop());
byId('lbClearBtn').addEventListener('click', () => loopback.clearSamples());
byId('lbExportBtn').addEventListener('click', () => loopback.exportSamples());

byId('extStartBtn').addEventListener('click', () => externalStream.start());
byId('extStopBtn').addEventListener('click', () => externalStream.stop());
byId('extPixelDetect').addEventListener('change', event =>
  externalStream.setDetectionEnabled(event.currentTarget.checked)
);
byId('extClearBtn').addEventListener('click', () => externalStream.clearSamples());
byId('extExportBtn').addEventListener('click', () => externalStream.exportSamples());

byId('wsEnable').addEventListener('change', event =>
  obsSync.setEnabled(event.currentTarget.checked)
);
byId('wsConnectBtn').addEventListener('click', () => obsSync.connect());
byId('wsDisconnectBtn').addEventListener('click', () => obsSync.disconnect());
byId('copyMarkerScriptBtn').addEventListener('click', async () => {
  const status = byId('markerScriptCopyStatus');
  try {
    await navigator.clipboard.writeText(byId('markerScript').textContent);
    status.textContent = 'OBS Python script copied to clipboard.';
  } catch (_) {
    status.textContent = 'Copy unavailable here; select the script above and copy it manually.';
  }
});
