import { CFG } from './config.js';

export function avgLuminance(imageData) {
  const data = imageData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

export function addPendingSourceEvent(events, state, tSrc) {
  if (events.length < CFG.MAX_PENDING_SOURCE_EVENTS) {
    events.push({ state, tSrc });
  }
}

export function takeUnambiguousSourceEvent(events, state) {
  if (!events.length) return { event: null, ambiguous: false };
  if (events.length === 1 && events[0].state === state) {
    return { event: events.shift(), ambiguous: false };
  }
  events.length = 0;
  return { event: null, ambiguous: true };
}
