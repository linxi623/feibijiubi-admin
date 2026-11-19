import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    canEditDraftSources, canEditSources, canReadSources, importStatusLabel, isDraftEpisode,
    makeConfirmation, makeDraftCapture, makeDraftConfirmation, makeImportBody, readImportResult,
} from '../src/utils/externalEpisodeSources.mjs';

const sourceCode = 'example';
const workId = '92233720368547758070';
const draft = { id: 21, vid: null, displayTitle: '草稿', durationSeconds: null };
const draftState = { revision: 0, durationSeconds: null, bindings: [] };
const detail = { sourceCode, workIdentity: workId, lines: [{ lineIndex: 2, entries: [{ entryIndex: 3 }] }] };
const entry = { lineOrdinal: 2, entryOrdinal: 3 };
const binding = { id: 11, candidate: { sourceCode, workId, label: '旧线路' } };
const confirmedState = { revision: 1, durationSeconds: 99.5, bindings: [binding] };
const confirmedDraft = { ...draft, durationSeconds: 99.5 };
const coverKey = 'temp/covers/7/20260709/cover.png';

test('reads both a draft with no locked duration and a strictly imported episode', () => {
    assert.equal(isDraftEpisode(draft), true);
    assert.equal(canReadSources(draft, draftState), true);
    assert.equal(canEditDraftSources({ ...draft, durationSeconds: 99.5 },
        { ...draftState, durationSeconds: 99.5 }), true);
    assert.equal(canReadSources(draft, { ...draftState, durationSeconds: 99.5 }), false);
    assert.equal(canReadSources({ ...draft, durationSeconds: 99.5 }, { ...draftState, durationSeconds: 99.5 }), true);
    assert.equal(canReadSources({ ...draft, durationSeconds: 99 }, { ...draftState, durationSeconds: 99.5 }), false);
    assert.equal(canReadSources({ ...draft, id: Number.MAX_SAFE_INTEGER + 1 }, draftState), false);
    assert.equal(canReadSources(draft, { ...draftState, revision: Number.MAX_SAFE_INTEGER + 1 }), false);
    assert.equal(canReadSources(draft, { ...draftState, bindings: [{ id: 1, candidate: { sourceCode: 'x', workId: '0' } }] }), false);

    const imported = { id: 21, vid: 55, durationSeconds: 120.5 };
    assert.equal(canReadSources(imported, { revision: 1, durationSeconds: 120.5, bindings: [] }), true);
    assert.equal(canReadSources(imported, { revision: 1, durationSeconds: 120, bindings: [] }), false);
    assert.equal(canEditSources(imported, { revision: 1, durationSeconds: 120.5, bindings: [] }), true);
});

test('draft capture keeps upstream IDs as text and requires an explicit target', () => {
    const capture = makeDraftCapture(draft, draftState, null, sourceCode, detail, entry);
    assert.deepEqual(capture, { sourceCode, workId, ...entry, expectedRevision: 0, targetBindingId: null });
    assert.equal(makeDraftCapture(draft, draftState, 11, sourceCode, detail, entry), null);
    assert.equal(makeDraftCapture(confirmedDraft, confirmedState, 11, sourceCode, detail, entry).targetBindingId, 11);
    assert.equal(makeDraftCapture({ ...draft, vid: 55 }, draftState, null, sourceCode, detail, entry), null);
    assert.equal(makeDraftCapture(draft, draftState, null, sourceCode, { ...detail, workIdentity: '0' }, entry), null);
    assert.equal(makeDraftCapture(draft, draftState, null, sourceCode, detail, { ...entry, entryOrdinal: 5 }), null);
    assert.equal(makeDraftCapture(draft, { ...draftState, bindings: Array.from({ length: 32 }, (_, i) => ({ ...binding, id: i + 11 })) },
        null, sourceCode, detail, entry), null);
});

test('a failed probe may be manually confirmed only while the draft timeline is still unlocked', () => {
    const capture = makeDraftCapture(draft, draftState, null, sourceCode, detail, entry);
    const candidate = { ...capture, id: 91, episodeId: 21, probeStatus: 'PROBE_REJECTED', candidateSeconds: null };
    const confirm = (state, value = 90, checked = true, reason = ' 人工核验 ') =>
        makeDraftConfirmation(draft, state, candidate, capture, checked, value, reason);
    assert.deepEqual(confirm(draftState), { expectedRevision: 0, durationSeconds: 90, reason: '人工核验' });
    assert.equal(confirm(draftState, 0), null);
    assert.equal(confirm(draftState, Number.POSITIVE_INFINITY), null);
    assert.equal(confirm(draftState, 90, false), null);
    assert.equal(confirm(draftState, 90, true, '   '), null);
    assert.equal(confirm(draftState, 90, true, 'x'.repeat(501)), null);
    assert.equal(makeDraftConfirmation(draft, { ...draftState, revision: 1 }, candidate, capture, true, 90, '版本变化'), null);
    const revisedCapture = makeDraftCapture(draft, { ...draftState, revision: 1 }, null, sourceCode, detail, entry);
    const revisedCandidate = { ...revisedCapture, id: 93, episodeId: 21, probeStatus: 'PROBE_REJECTED', candidateSeconds: null };
    assert.deepEqual(makeDraftConfirmation(draft, { ...confirmedState, durationSeconds: null }, revisedCandidate,
        revisedCapture, true, 91, '人工核验'), {
        expectedRevision: 1, durationSeconds: 91, reason: '人工核验',
    });
    const lockedCapture = makeDraftCapture(confirmedDraft, confirmedState, null, sourceCode, detail, entry);
    const lockedCandidate = { ...lockedCapture, id: 92, episodeId: 21, probeStatus: 'SUCCEEDED', candidateSeconds: 100 };
    assert.deepEqual(makeDraftConfirmation(confirmedDraft, confirmedState, lockedCandidate, lockedCapture, true, 99.5, '锁定'), {
        expectedRevision: 1, durationSeconds: 99.5, reason: '锁定',
    });
    assert.equal(makeDraftConfirmation(confirmedDraft, confirmedState, lockedCandidate, lockedCapture, true, 99, '锁定'), null);
    assert.equal(makeConfirmation(confirmedDraft, confirmedState, lockedCandidate, lockedCapture, true, '导入后仍严格'), null);
});

test('first import submits only the M5 fields after duration, cover, category and title checks', () => {
    const form = { title: ' 标题 ', mcId: ' douga ', scId: ' mad ', visibility: 1 };
    assert.deepEqual(makeImportBody(confirmedDraft, confirmedState, form, coverKey), {
        expectedRevision: 1, tempCoverKey: coverKey, title: '标题', mcId: 'douga', scId: 'mad', visibility: 1,
    });
    assert.deepEqual(Object.keys(makeImportBody(confirmedDraft, confirmedState, form, coverKey)).sort(), [
        'expectedRevision', 'mcId', 'scId', 'tempCoverKey', 'title', 'visibility',
    ]);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, visibility: undefined }, coverKey).visibility, 1);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, visibility: '0' }, coverKey).visibility, 0);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, title: 'x'.repeat(81) }, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, title: '   ' }, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, mcId: 'x'.repeat(21) }, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, { ...form, visibility: 2 }, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, form, 'cover.png'), null);
    assert.equal(makeImportBody(confirmedDraft, confirmedState, form, 'temp/covers/7/20260709/x y.png'), null);
    assert.equal(makeImportBody({ ...confirmedDraft, vid: 55 }, confirmedState, form, coverKey), null);
    assert.equal(makeImportBody({ ...confirmedDraft, durationSeconds: 90 }, confirmedState, form, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, { ...confirmedState, bindings: [] }, form, coverKey), null);
    assert.equal(makeImportBody(confirmedDraft, { ...confirmedState, revision: Number.MAX_SAFE_INTEGER + 1 }, form, coverKey), null);
});

test('import result stays on the returned status and rejects unsafe or unknown values', () => {
    assert.deepEqual(readImportResult(21, {
        episodeId: 21, vid: 77, durationSeconds: 99.5, importRevision: 1, status: 0, reused: false,
    }), { episodeId: 21, vid: 77, durationSeconds: 99.5, importRevision: 1, status: 0, reused: false });
    assert.equal(readImportResult(21, {
        episodeId: 21, vid: 77, durationSeconds: 99.5, importRevision: null, status: 1, reused: true,
    }).reused, true);
    assert.equal(readImportResult(21, {
        episodeId: 21, vid: 77, durationSeconds: 99.5, importRevision: 1, status: 4, reused: false,
    }), null);
    assert.equal(readImportResult(21, {
        episodeId: 21, vid: Number.MAX_SAFE_INTEGER + 1, durationSeconds: 99.5, importRevision: 1, status: 0, reused: false,
    }), null);
    assert.equal(readImportResult(21, {
        episodeId: 21, vid: 77, durationSeconds: 99.5, importRevision: 1, status: 0,
    }), null);
    assert.equal(importStatusLabel(0), '待审核');
    assert.equal(importStatusLabel(1), '已通过');
    assert.equal(importStatusLabel(2), '未通过');
    assert.equal(importStatusLabel(3), '已移除');
    assert.equal(importStatusLabel(9), '未知状态');
});
