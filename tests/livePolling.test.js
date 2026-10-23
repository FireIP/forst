import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {settings} from '../assets/js/constants.js';
import {runtime} from '../assets/js/state.js';
import {applyExternalConfig} from '../assets/js/config.js';
import {pollLiveStatuses} from '../assets/js/livePolling.js';
import {setAutoSort} from '../assets/js/ordering.js';

const originals = {
    fetch: globalThis.fetch,
    window: globalThis.window,
    document: globalThis.document,
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    warn: console.warn
};
const initialSettings = {...settings};
let cards;
let requests;
let warnings;

function card(live = false) {
    const classes = new Set(live ? ['live'] : []);
    const badge = {};
    return {
        dataset: {isLive: String(live)},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        querySelector: () => badge
    };
}

function respond(names) {
    return {ok: true, json: async () => ({statusCode: 200, response: names})};
}

beforeEach(() => {
    Object.assign(settings, initialSettings, {
        streams: [
            {id: 'one', mediaPath: '/app/one'},
            {id: 'two', mediaPath: '/app/two'}
        ]
    });
    runtime.liveCounters = {};
    runtime.autoSort = false;
    runtime.fullscreenPaused = false;
    cards = {one: card(), two: card()};
    requests = [];
    warnings = [];
    globalThis.window = {location: {href: 'https://forst.example/'}};
    globalThis.document = {
        querySelector: selector => cards[/data-stream-id="([^"]+)"/.exec(selector)[1]],
        getElementById: () => null,
        body: {addEventListener() {}, removeEventListener() {}}
    };
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {setItem() {}, getItem: () => null}
    });
    globalThis.fetch = async (url, options) => {
        requests.push({url, options});
        return respond(['one']);
    };
    console.warn = (...args) => warnings.push(args);
});

afterEach(() => {
    Object.assign(settings, initialSettings);
    for (const name of ['fetch', 'window', 'document']) {
        if (originals[name] === undefined) delete globalThis[name];
        else globalThis[name] = originals[name];
    }
    if (originals.localStorage) Object.defineProperty(globalThis, 'localStorage', originals.localStorage);
    else delete globalThis.localStorage;
    console.warn = originals.warn;
});

test('polls once per application, not once per stream, without playback probes', async () => {
    settings.streams.push({id: 'three', mediaPath: '/other/three'});
    cards.three = card();
    await pollLiveStatuses();
    assert.deepEqual(requests.map(r => r.url).sort(), ['/api/live/app', '/api/live/other']);
    assert.equal(runtime.liveCounters.one, 1);
    assert.equal(runtime.liveCounters.two, -1);
    assert.equal(runtime.liveCounters.three, -1);
    assert.equal(requests[0].options.method, 'GET');
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(warnings.length, 0);
});

test('preserves hysteresis, badges and live classes for online/offline transitions', async () => {
    await pollLiveStatuses();
    assert.equal(cards.one.dataset.isLive, 'false');
    await pollLiveStatuses();
    assert.equal(cards.one.dataset.isLive, 'true');
    assert.equal(cards.one.classList.contains('live'), true);
    assert.equal(cards.one.querySelector().textContent, 'Live');
    globalThis.fetch = async () => respond([]);
    for (let i = 0; i < 3; i++) await pollLiveStatuses();
    assert.equal(cards.one.dataset.isLive, 'true');
    await pollLiveStatuses();
    assert.equal(cards.one.dataset.isLive, 'false');
    assert.equal(cards.one.classList.contains('live'), false);
    assert.equal(cards.one.querySelector().textContent, 'Preview');
});

test('handles encoded names, trailing slashes and playback query parameters', async () => {
    applyExternalConfig({liveStatusApiBaseUrl: '/status/'});
    settings.streams = [{id: 'one', mediaPath: '/my%20app/stream%20one/?token=private'}];
    globalThis.fetch = async url => {
        requests.push(url);
        return respond(['stream one']);
    };
    await pollLiveStatuses();
    assert.deepEqual(requests, ['/status/my%20app']);
    assert.equal(runtime.liveCounters.one, 1);
});

test('matches renamed outputs to their configured input stream', async () => {
    settings.streams[0] = {
        id: 'one', mediaPath: '/app/one_output', sourceStreamName: 'one'
    };
    await pollLiveStatuses();
    assert.equal(runtime.liveCounters.one, 1);
});

test('API errors preserve previous states and counters and are explicitly reported', async () => {
    cards.one = card(true);
    runtime.liveCounters = {one: 2, two: -1};
    const failures = [
        async () => ({ok: false, status: 401}),
        async () => ({ok: false, status: 404}),
        async () => ({ok: false, status: 503}),
        async () => { throw new TypeError('Network failure'); },
        async () => ({ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); }}),
        async () => ({ok: true, json: async () => null}),
        async () => ({ok: true, json: async () => ({statusCode: 500, response: []})}),
        async () => respond([{}])
    ];
    for (const failure of failures) {
        globalThis.fetch = failure;
        await pollLiveStatuses();
        assert.deepEqual(runtime.liveCounters, {one: 2, two: -1});
        assert.equal(cards.one.dataset.isLive, 'true');
    }
    assert.equal(warnings.length, failures.length);
});

test('one failed application does not prevent other applications from updating', async () => {
    settings.streams[1].mediaPath = '/other/two';
    globalThis.fetch = async url => {
        if (url.endsWith('/other')) throw new Error('Unavailable application');
        return respond(['one']);
    };
    await pollLiveStatuses();
    assert.equal(runtime.liveCounters.one, 1);
    assert.equal(runtime.liveCounters.two, undefined);
    assert.equal(warnings.length, 1);
});

test('coalesces overlapping polls into one request and one counter update', async () => {
    let resolve;
    globalThis.fetch = async url => {
        requests.push(url);
        return new Promise(done => { resolve = done; });
    };
    const first = pollLiveStatuses();
    const second = pollLiveStatuses();
    assert.equal(first, second);
    resolve(respond(['one']));
    await Promise.all([first, second]);
    assert.equal(requests.length, 1);
    assert.equal(runtime.liveCounters.one, 1);
});

test('timeout covers response body reading and leaves status unchanged', async () => {
    settings.LIVE_FETCH_TIMEOUT_MS = 5;
    globalThis.fetch = async (_url, {signal}) => ({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {once: true});
        })
    });
    await pollLiveStatuses();
    assert.deepEqual(runtime.liveCounters, {});
    assert.equal(warnings.length, 1);
});

test('invalid paths are reported without probing a manifest or blocking valid streams', async () => {
    settings.streams[1].mediaPath = '/invalid';
    await pollLiveStatuses();
    assert.equal(runtime.liveCounters.one, 1);
    assert.equal(runtime.liveCounters.two, undefined);
    assert.equal(requests.length, 1);
    assert.equal(warnings.length, 1);
});

test('auto-sort toggles never start a second polling interval', () => {
    const original = globalThis.setInterval;
    globalThis.setInterval = () => assert.fail('Unexpected additional polling interval');
    try {
        setAutoSort(true);
        assert.equal(runtime.autoSort, true);
        setAutoSort(false);
        assert.equal(runtime.autoSort, false);
    } finally {
        globalThis.setInterval = original;
    }
});
