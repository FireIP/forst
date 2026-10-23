import { addPendingSourceEvent } from './marker.js';
import { appendLog } from './charts.js';

export function createObsSync(elements, externalStream) {
  let controller = null;
  let sequence = 0;

  function disconnect() {
    const currentController = controller;
    controller = null;
    if (currentController) currentController.abort();
    sequence = 0;
    externalStream.clearPendingSourceEvents();
    elements.connectButton.classList.remove('d-none');
    elements.disconnectButton.classList.add('d-none');
  }

  function connect() {
    disconnect();
    const value = elements.url.value.trim();
    if (!value) return;

    let endpoint;
    try {
      endpoint = new URL(value);
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error();
    } catch (_) {
      appendLog(elements.log, 'Enter a valid HTTP event URL.');
      return;
    }

    const requestController = new AbortController();
    controller = requestController;
    sequence = 0;
    appendLog(elements.log, `Connecting to OBS marker events: ${endpoint.href}`);
    elements.connectButton.classList.add('d-none');
    elements.disconnectButton.classList.remove('d-none');

    async function pollEvents() {
      let reportedError = false;
      while (controller === requestController && elements.enabled.checked) {
        try {
          const requestUrl = new URL(endpoint.href);
          requestUrl.searchParams.set('after', sequence);
          const response = await fetch(requestUrl, {
            signal: requestController.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (!Array.isArray(payload.events)) throw new Error('Invalid event response');

          for (const event of payload.events) {
            if (!event || !Number.isSafeInteger(event.id) || event.id <= sequence ||
                (event.state !== 0 && event.state !== 1) ||
                typeof event.tSrc !== 'number' || !Number.isFinite(event.tSrc)) continue;
            sequence = event.id;
            const tSrc = event.tSrc - (Date.now() - performance.now());
            externalStream.addSourceEvent(event.state, tSrc);
          }
          if (reportedError) appendLog(elements.log, 'OBS marker event connection restored.');
          reportedError = false;
        } catch (error) {
          if (requestController.signal.aborted) return;
          if (!reportedError) {
            appendLog(elements.log, `OBS marker event error: ${error.message}. Check that the browser is on the OBS computer and that ${endpoint.origin}/events is reachable.`);
          }
          reportedError = true;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    pollEvents();
  }

  function setEnabled(enabled) {
    elements.section.classList.toggle('d-none', !enabled);
    if (!enabled) disconnect();
  }

  return { connect, disconnect, setEnabled };
}
