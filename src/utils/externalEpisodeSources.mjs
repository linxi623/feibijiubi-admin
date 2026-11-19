export const isId = value => Number.isSafeInteger(value) && value > 0;
export const isRevision = value => Number.isSafeInteger(value) && value >= 0;
export const isPositiveSeconds = value => Number.isFinite(value) && value > 0;
const isSeconds = isPositiveSeconds;
const isWorkId = value => typeof value === 'string' && /^[1-9][0-9]{0,190}$/.test(value);
const isBindings = bindings => Array.isArray(bindings) && bindings.length <= 32
    && bindings.every(binding => isId(binding?.id) && typeof binding?.candidate?.sourceCode === 'string'
        && isWorkId(binding.candidate.workId));
const isOptionalSeconds = value => value == null || isSeconds(value);
const text = value => (typeof value === 'string' ? value.trim() : '');

export const isDraftEpisode = episode => isId(episode?.id) && episode.vid == null;
export const isImportedEpisode = episode => isId(episode?.id) && isId(episode.vid);

export function canEditSources(episode, state) {
    return isImportedEpisode(episode) && isSeconds(episode.durationSeconds)
        && isRevision(state?.revision) && state.durationSeconds === episode.durationSeconds
        && isBindings(state.bindings);
}

export function canEditDraftSources(episode, state) {
    const sameDuration = state?.durationSeconds == null
        ? episode?.durationSeconds == null
        : episode?.durationSeconds === state.durationSeconds;
    return isDraftEpisode(episode) && isRevision(state?.revision)
        && isOptionalSeconds(state.durationSeconds) && isOptionalSeconds(episode.durationSeconds)
        && sameDuration && isBindings(state.bindings);
}

export function canReadSources(episode, state) {
    return isDraftEpisode(episode) ? canEditDraftSources(episode, state) : canEditSources(episode, state);
}

function makeCaptureFor(episode, state, targetId, source, detail, entry, allowed) {
    if (!allowed || typeof source !== 'string' || !source || detail?.sourceCode !== source
        || !isWorkId(detail.workIdentity) || !entry || !Number.isInteger(entry.lineOrdinal) || entry.lineOrdinal < 1
        || entry.lineOrdinal > 16 || !Number.isInteger(entry.entryOrdinal) || entry.entryOrdinal < 1 || entry.entryOrdinal > 1000
        || !detail.lines?.some(line => line.lineIndex === entry.lineOrdinal
            && line.entries?.some(item => item.entryIndex === entry.entryOrdinal))) return null;
    const binding = state.bindings.find(item => item.id === targetId);
    if (targetId !== null && (!binding || binding.candidate.sourceCode !== source
        || binding.candidate.workId !== detail.workIdentity)) return null;
    if (targetId === null && state.bindings.length >= 32) return null;
    return { sourceCode: source, workId: detail.workIdentity, lineOrdinal: entry.lineOrdinal,
        entryOrdinal: entry.entryOrdinal, expectedRevision: state.revision, targetBindingId: targetId };
}

export function makeCapture(episode, state, targetId, source, detail, entry) {
    return makeCaptureFor(episode, state, targetId, source, detail, entry, canEditSources(episode, state));
}

export function makeDraftCapture(episode, state, targetId, source, detail, entry) {
    return makeCaptureFor(episode, state, targetId, source, detail, entry, canEditDraftSources(episode, state));
}

export function candidateMatches(episodeId, candidate, capture) {
    return isId(episodeId) && !!capture && isId(candidate?.id) && candidate.episodeId === episodeId
        && candidate.confirmedAt == null
        && ['expectedRevision', 'targetBindingId', 'sourceCode', 'workId', 'lineOrdinal', 'entryOrdinal']
            .every(key => candidate[key] === capture[key]);
}

export function makeConfirmation(episode, state, candidate, capture, checked, reason) {
    const value = text(reason);
    if (!canEditSources(episode, state) || !candidateMatches(episode.id, candidate, capture)
        || capture.expectedRevision !== state.revision || candidate.probeStatus !== 'SUCCEEDED'
        || !isSeconds(candidate.candidateSeconds) || checked !== true || !value || value.length > 500) return null;
    return { expectedRevision: state.revision, durationSeconds: state.durationSeconds, reason: value };
}

/**
 * Draft confirmation is the only place a manager may correct a failed probe. The duration is
 * editable only until the first confirmation; afterwards the locked episode duration wins.
 */
export function makeDraftConfirmation(episode, state, candidate, capture, checked, durationSeconds, reason) {
    const value = text(reason);
    if (!canEditDraftSources(episode, state) || !candidateMatches(episode.id, candidate, capture)
        || capture.expectedRevision !== state.revision || !isSeconds(durationSeconds)
        || checked !== true || !value || value.length > 500) return null;
    if (state.durationSeconds != null && durationSeconds !== state.durationSeconds) return null;
    return { expectedRevision: state.revision, durationSeconds, reason: value };
}

/** M5 accepts only these fields; no vid/sourceType/status/duration/media keys or addresses. */
export function makeImportBody(episode, state, form, tempCoverKey) {
    const title = text(form?.title);
    const mcId = text(form?.mcId);
    const scId = text(form?.scId);
    const rawVisibility = form?.visibility == null ? 1 : form.visibility;
    const visibility = rawVisibility === 0 || rawVisibility === '0' ? 0
        : rawVisibility === 1 || rawVisibility === '1' ? 1 : null;
    if (!canEditDraftSources(episode, state) || !state.bindings.length
        || !isSeconds(state.durationSeconds) || episode.durationSeconds !== state.durationSeconds
        || title.length < 1 || title.length > 80
        || mcId.length < 1 || mcId.length > 20 || scId.length < 1 || scId.length > 20
        || visibility == null
        || typeof tempCoverKey !== 'string' || tempCoverKey.length < 1 || tempCoverKey.length > 512
        || !tempCoverKey.startsWith('temp/covers/') || /\s/.test(tempCoverKey)) return null;
    return { expectedRevision: state.revision, tempCoverKey, title, mcId, scId, visibility };
}

export function readImportResult(episodeId, value) {
    if (!isId(episodeId) || !value || value.episodeId !== episodeId || !isId(value.vid)
        || !isSeconds(value.durationSeconds) || !Number.isInteger(value.status) || value.status < 0
        || value.status > 3 || typeof value.reused !== 'boolean'
        || (value.importRevision != null && !isRevision(value.importRevision))) return null;
    return { episodeId, vid: value.vid, durationSeconds: value.durationSeconds,
        importRevision: value.importRevision ?? null, status: value.status, reused: value.reused };
}

export function importStatusLabel(status) {
    return ['待审核', '已通过', '未通过', '已移除'][status] || '未知状态';
}
