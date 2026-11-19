import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditSources, candidateMatches, makeCapture, makeConfirmation } from '../src/utils/externalEpisodeSources.mjs';

const episode = { id: 9, vid: 55, durationSeconds: 120.5 };
const sourceCode = 'example';
const workId = '92233720368547758070';
const state = { revision: 3, durationSeconds: 120.5, bindings: [{ id: 11, candidate: { sourceCode, workId } }] };
const detail = { sourceCode, workIdentity: workId, lines: [{ lineIndex: 2, entries: [{ entryIndex: 3 }] }] };
const entry = { lineOrdinal: 2, entryOrdinal: 3 };
const pick = target => makeCapture(episode, state, target, sourceCode, detail, entry);

test('explicitly targets an existing binding or uses null for a new one; keeps upstream ID as text', () => {
    const capture = pick(null);
    assert.deepEqual(capture, { sourceCode, workId, ...entry, expectedRevision: 3, targetBindingId: null });
    assert.deepEqual(pick(11), { ...capture, targetBindingId: 11 });
    assert.equal(pick(999), null);
    assert.equal(makeCapture(episode, state, 11, sourceCode, { ...detail, workIdentity: '7' }, entry), null);
    assert.equal(makeCapture(episode, state, null, sourceCode, detail, { ...entry, entryOrdinal: 5 }), null);
});

test('fails closed for drafts, stale local timeline or unsafe JSON IDs and revisions', () => {
    assert.equal(canEditSources({ ...episode, vid: null }, state), false);
    assert.equal(canEditSources({ ...episode, id: Number.MAX_SAFE_INTEGER + 1 }, state), false);
    assert.equal(canEditSources(episode, { ...state, revision: Number.MAX_SAFE_INTEGER + 1 }), false);
    assert.equal(canEditSources(episode, { ...state, durationSeconds: 120 }), false);
});

test('only binds identical episode, revision, target and snapshot positions', () => {
    const capture = pick(11);
    const candidate = { ...capture, id: 91, episodeId: 9 };
    assert.equal(candidateMatches(9, candidate, capture), true);
    for (const patch of [{ episodeId: 10 }, { expectedRevision: 4 }, { targetBindingId: null }, { entryOrdinal: 2 }, { confirmedAt: 'timestamp' }]) {
        assert.equal(candidateMatches(9, { ...candidate, ...patch }, capture), false);
    }
});

test('only confirms successful probe after manual same-timeline check and sends local fixed duration', () => {
    const capture = pick(11);
    const candidate = { ...capture, id: 91, episodeId: 9, probeStatus: 'SUCCEEDED', candidateSeconds: 121 };
    const confirm = (c, checked, reason, version = state) => makeConfirmation(episode, version, c, capture, checked, reason);
    assert.equal(confirm(candidate, false, 'checked'), null);
    assert.equal(confirm(candidate, true, '  '), null);
    assert.equal(confirm({ ...candidate, probeStatus: 'PROBE_REJECTED' }, true, 'checked'), null);
    assert.equal(confirm({ ...candidate, candidateSeconds: null }, true, 'checked'), null);
    assert.equal(confirm(candidate, true, 'checked', { ...state, revision: 4 }), null);
    assert.deepEqual(confirm(candidate, true, ' checked '), { expectedRevision: 3, durationSeconds: 120.5, reason: 'checked' });
});

test('at the line limit, replacement remains possible but adding is disabled', () => {
    const full = { ...state, bindings: Array.from({ length: 32 }, (_, i) => ({ id: i + 11, candidate: { sourceCode, workId } })) };
    assert.equal(makeCapture(episode, full, null, sourceCode, detail, entry), null);
    assert.equal(makeCapture(episode, full, 11, sourceCode, detail, entry).targetBindingId, 11);
});
