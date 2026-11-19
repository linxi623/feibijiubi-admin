<template>
    <main class="source-manager" aria-labelledby="sources-title">
        <h2 id="sources-title">外部视频线路与首次导入</h2>
        <p>为本地剧集新增或替换已确认线路；草稿先确认线路与统一时长，再首次导入为待审核视频。确认前不会改变当前线路。</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>

        <section aria-labelledby="episode-title">
            <h3 id="episode-title">1. 选择或创建本地作品和剧集</h3>
            <div class="row">
                <label>本地作品
                    <select :value="seriesId || ''" :disabled="busy" @change="selectSeries(Number($event.target.value))">
                        <option value="">请选择</option>
                        <option v-for="item in series" :key="item.id" :value="item.id">{{ item.title }}（#{{ item.id }}）</option>
                    </select>
                </label>
                <el-button v-if="seriesCursor !== null" :disabled="busy" @click="nextSeries">更多作品</el-button>
                <el-button v-if="!series.length" :disabled="busy" @click="initialize">重新加载作品</el-button>
                <label v-if="seriesId">本地剧集
                    <select :value="episode?.id || ''" :disabled="busy" @change="selectEpisode(Number($event.target.value))">
                        <option value="">请选择</option>
                        <option v-for="item in episodes" :key="item.id" :value="item.id">
                            {{ item.displayTitle || `剧集 #${item.id}` }}（{{ item.vid ? `已导入 vid ${item.vid}` : '草稿' }}）
                        </option>
                    </select>
                </label>
                <el-button v-if="episodeCursor !== null" :disabled="busy" @click="nextEpisodes">更多剧集</el-button>
                <el-button v-if="episode" :disabled="busy" @click="refreshState">刷新当前线路</el-button>
            </div>
            <div class="row">
                <label>新作品标题
                    <input v-model="newSeriesTitle" maxlength="200" :disabled="busy" placeholder="1..200 字符">
                </label>
                <el-button :disabled="busy" @click="createSeries">创建本地作品</el-button>
                <template v-if="seriesId">
                    <label>新剧集标题
                        <input v-model="newEpisodeTitle" maxlength="255" :disabled="busy" placeholder="可留空">
                    </label>
                    <el-button :disabled="busy" @click="createEpisode">创建本地剧集</el-button>
                </template>
            </div>
            <p v-if="episode">当前状态：{{ isDraft ? '草稿（尚未导入）' : '已导入' }}</p>
            <p v-if="state && episode">视频 ID：{{ episode.vid ?? '尚未导入' }} · 统一时长：{{ stateDurationLabel }} · 版本：{{ state.revision }}</p>
            <p v-if="state && !editableState">时长、线路或编号异常，不能在线修改。</p>
            <p v-if="busy" role="status">正在处理，请稍候…</p>
        </section>

        <section v-if="editableState" aria-labelledby="binding-title">
            <h3 id="binding-title">2. 新增或选择要替换的线路</h3>
            <el-button :disabled="busy || needsRefresh || state.bindings.length >= 32" @click="chooseTarget(null)">新增独立线路</el-button>
            <ul v-if="state.bindings.length">
                <li v-for="binding in state.bindings" :key="binding.id" class="row">
                    <span>线路 #{{ binding.id }} · {{ binding.candidate.sourceCode }} · 作品 {{ binding.candidate.workId }} · {{ binding.candidate.label || '无分集标签' }}</span>
                    <el-button :disabled="busy || needsRefresh" @click="chooseTarget(binding)">替换线路 #{{ binding.id }}</el-button>
                </li>
            </ul>
            <p v-else>当前无已确认线路。</p>
        </section>

        <section v-if="editing && editableState && !needsRefresh" aria-labelledby="candidate-title">
            <h3 id="candidate-title">3. 选择上游分集并抓取候选</h3>
            <p>{{ target ? `替换线路 #${target.id}（来源 ${target.sourceCode}，作品 ${target.workId}）` : '新增独立线路' }}</p>
            <div v-if="!target" class="row">
                <label>上游来源
                    <select :value="source" :disabled="busy" @change="selectSource($event.target.value)">
                        <option value="">请选择</option>
                        <option v-for="item in sources" :key="item.code" :value="item.code">{{ item.name }}（{{ item.code }}）</option>
                    </select>
                </label>
                <el-button :disabled="busy" @click="reloadSources">刷新来源</el-button>
            </div>
            <div v-if="catalog && !target" class="row">
                <label>上游作品
                    <select :value="detail?.workIdentity || ''" :disabled="busy" @change="loadDetail($event.target.value)">
                        <option value="">请选择</option>
                        <option v-for="item in catalog.items" :key="item.workIdentity" :value="item.workIdentity">
                            {{ item.title }}（{{ item.workIdentity }}）
                        </option>
                    </select>
                </label>
                <el-button :disabled="busy || catalog.page <= 1" @click="loadCatalog(catalog.page - 1)">上一页作品</el-button>
                <el-button :disabled="busy || catalog.page >= Math.min(100000, catalog.pageCount)" @click="loadCatalog(catalog.page + 1)">下一页作品</el-button>
                <span>第 {{ catalog.page }} 页</span>
            </div>
            <el-button v-if="target" :disabled="busy" @click="loadDetail(target.workId)">读取原上游作品</el-button>
            <div v-if="detail" class="row">
                <label>上游分集
                    <select :value="entryKey" :disabled="busy" @change="selectEntry($event.target.value)">
                        <option value="">请选择</option>
                        <option v-for="item in entries" :key="item.key" :value="item.key">
                            路线 {{ item.lineOrdinal }} · 位置 {{ item.entryOrdinal }} · {{ item.label || '无分集标签' }}
                        </option>
                    </select>
                </label>
                <el-button :disabled="busy || !captureBody" @click="capture">抓取并探测</el-button>
            </div>
            <p>目录位置只在当前快照有效。抓取会重新读取上游，请以抓取后的标签为准，重新核对是否为同一集、同一剪辑和同一时间轴。</p>
        </section>

        <section v-if="candidate && !needsRefresh" aria-labelledby="confirm-title">
            <h3 id="confirm-title">4. 人工确认</h3>
            <p>候选 #{{ candidate.id }} · 抓取后的分集标签：{{ candidate.label || '无分集标签' }}</p>
            <p>探测结果：{{ probeLabels[candidate.probeStatus] || '不可确认' }}<span v-if="candidate.candidateSeconds"> · {{ candidate.candidateSeconds }} 秒</span></p>
            <template v-if="isDraft">
                <p v-if="candidate.probeStatus !== 'SUCCEEDED'">探测未成功；草稿可由管理员人工核验并填写有限正时长，已导入剧集不允许此操作。</p>
                <p v-if="state.durationSeconds == null">首次确认后统一时长将锁定，后续来源必须使用相同时长。</p>
                <label v-if="state.durationSeconds == null" class="reason">统一时长（秒，有限正数）
                    <input v-model="draftDuration" type="number" min="0.001" step="0.001" :disabled="busy">
                </label>
                <p v-else>统一时长：{{ state.durationSeconds }} 秒（已锁定，不能修改）。</p>
            </template>
            <template v-else>
                <p v-if="!probePassed">探测未通过，不能确认；当前线路不变。</p>
                <p v-else-if="candidate.candidateSeconds !== state.durationSeconds">探测时长与统一时长不同。只有核实内容与时间轴确实一致后才能继续；实际保存统一时长 {{ state.durationSeconds }} 秒。</p>
            </template>
            <template v-if="isDraft || probePassed">
                <label class="row"><input v-model="checked" type="checkbox" :disabled="busy">已核对本地剧集与实际抓取的上游分集，是同一集、同一版本及时间轴</label>
                <label class="reason">确认理由
                    <textarea v-model="reason" maxlength="500" rows="3" :disabled="busy"></textarea>
                </label>
                <el-button type="primary" :disabled="busy || !confirmBody" @click="confirm">确认{{ target ? '替换线路' : '新增线路' }}</el-button>
            </template>
        </section>

        <section v-if="isDraft && state" aria-labelledby="import-title">
            <h3 id="import-title">5. 首次导入为待审核视频</h3>
            <p>只创建待审核外部稿件，不发布、不自动审核、不读取 CMS 封面或播放地址；旧 COS 投稿流程保持不变。</p>
            <p v-if="needsRefresh">线路状态已变化，请先点击“刷新当前线路”，再决定是否导入。</p>
            <p v-else-if="!isPositiveSeconds(state.durationSeconds) || !state.bindings.length">请先确认至少一条线路，锁定统一时长后才能首次导入。</p>
            <template v-else>
                <div class="row">
                    <label>视频标题
                        <input v-model="importForm.title" maxlength="80" :disabled="busy" placeholder="1..80 字符">
                    </label>
                    <label>父分区
                        <select v-model="importForm.mcId" :disabled="busy" @change="resetCategoryChild">
                            <option value="">请选择</option>
                            <option v-for="item in categories" :key="item.mcId" :value="item.mcId">{{ item.mcName }}（{{ item.mcId }}）</option>
                        </select>
                    </label>
                    <label>子分区
                        <select v-model="importForm.scId" :disabled="busy || !categoryChildren.length">
                            <option value="">请选择</option>
                            <option v-for="item in categoryChildren" :key="item.scId" :value="item.scId">{{ item.scName }}（{{ item.scId }}）</option>
                        </select>
                    </label>
                    <label>可见性
                        <select v-model.number="importForm.visibility" :disabled="busy">
                            <option :value="1">私密</option>
                            <option :value="0">公开</option>
                        </select>
                    </label>
                </div>
                <p v-if="categoryError" class="error" role="alert">{{ categoryError }}</p>
                <el-button v-if="categoryError" :disabled="busy" @click="loadCategories">重新加载分区</el-button>
                <div class="row">
                    <label>封面文件（JPG/PNG，≤2MB）
                        <input ref="coverInput" type="file" accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png" :disabled="busy" @change="selectCover">
                    </label>
                    <el-button :disabled="busy || !coverFile" @click="uploadCover">上传封面</el-button>
                    <span v-if="coverKey">封面已上传（临时文件仅保存在本页内存，不显示、不持久化）。</span>
                </div>
                <p>临时封面 key 不会显示、写入本地存储或日志；如上传结果不明确，请重新选择文件，不要复用未知结果。</p>
                <el-button type="primary" :disabled="busy || !importBody" @click="importEpisode">首次导入</el-button>
            </template>
        </section>

        <section v-if="importResult || recoveredImport" aria-labelledby="import-result-title">
            <h3 id="import-result-title">6. 导入结果</h3>
            <template v-if="importResult">
                <p>视频 ID：{{ importResult.vid }} · 审核状态：{{ importStatusLabel(importResult.status) }}（{{ importResult.status }}）</p>
                <p>{{ importResult.reused ? '后台返回已有视频，本次未新建。' : '首次导入已完成；本页不承诺发布，也不会自动改变审核状态。' }}</p>
                <p>统一时长：{{ importResult.durationSeconds }} 秒 · 首次导入版本：{{ importResult.importRevision ?? '无' }}</p>
            </template>
            <template v-else>
                <p>刷新后视频 ID：{{ recoveredImport.vid }} · 统一时长：{{ recoveredImport.durationSeconds ?? '未知' }} 秒</p>
                <p>未取得本次导入的审核状态；本页没有自动重发。请到视频审核页核对实际状态。</p>
            </template>
        </section>
    </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { getToken } from '@/config/app';
import { get, post } from '@/network/request';
import {
    canReadSources, candidateMatches, importStatusLabel, isDraftEpisode, isId, isPositiveSeconds,
    makeCapture, makeConfirmation, makeDraftCapture, makeDraftConfirmation, makeImportBody, readImportResult,
} from '@/utils/externalEpisodeSources.mjs';

const series = ref([]), episodes = ref([]), sources = ref([]);
const seriesCursor = ref(null), episodeCursor = ref(null), seriesId = ref(0), episode = ref(null);
const state = ref(null), needsRefresh = ref(false), editing = ref(false), target = ref(null);
const source = ref(''), catalog = ref(null), detail = ref(null), entryKey = ref('');
const candidate = ref(null), checked = ref(false), reason = ref(''), draftDuration = ref('');
const busy = ref(false), error = ref(''), notice = ref('');
const newSeriesTitle = ref(''), newEpisodeTitle = ref('');
const categories = ref([]), categoryError = ref('');
const importForm = ref({ title: '', mcId: '', scId: '', visibility: 1 });
const coverInput = ref(null), coverFile = shallowRef(null), coverKey = ref('');
const importResult = ref(null), recoveredImport = ref(null);
const probeLabels = { SUCCEEDED: '探测成功', UNSUPPORTED_MANIFEST: '不支持的清单', FETCH_FAILED: '抓取失败', PROBE_REJECTED: '探测拒绝' };
const sourceRoot = '/admin/video-sources';
const seriesRoot = '/admin/local-video-series';
const currentPath = () => `/admin/local-video-episodes/${episode.value.id}/sources`;
const token = getToken();
const controller = new AbortController();
const live = () => !controller.signal.aborted && !!token && getToken() === token;
const isDraft = computed(() => isDraftEpisode(episode.value));
const editableState = computed(() => canReadSources(episode.value, state.value));
const stateDurationLabel = computed(() => (state.value?.durationSeconds == null
    ? '未确认' : `${state.value.durationSeconds} 秒`));
const categoryChildren = computed(() => categories.value.find(item => item.mcId === importForm.value.mcId)?.children || []);
const entries = computed(() => (detail.value?.lines || []).flatMap(line => (line.entries || []).map(item => ({
    key: `${line.lineIndex}:${item.entryIndex}`, lineOrdinal: line.lineIndex, entryOrdinal: item.entryIndex, label: item.label,
}))));
const captureBody = computed(() => {
    if (!editableState.value) return null;
    const targetId = target.value?.id ?? null;
    return isDraft.value
        ? makeDraftCapture(episode.value, state.value, targetId, source.value, detail.value,
            entries.value.find(item => item.key === entryKey.value))
        : makeCapture(episode.value, state.value, targetId, source.value, detail.value,
            entries.value.find(item => item.key === entryKey.value));
});
const probePassed = computed(() => candidate.value?.probeStatus === 'SUCCEEDED'
    && isPositiveSeconds(candidate.value.candidateSeconds));
const confirmedDuration = computed(() => {
    if (state.value?.durationSeconds != null) return state.value.durationSeconds;
    // Vue v-model on type=number returns a number for a valid entry and an empty string when cleared.
    const value = draftDuration.value;
    return value === '' ? NaN : Number(value);
});
const confirmBody = computed(() => {
    if (!candidate.value || !captureBody.value || needsRefresh.value) return null;
    return isDraft.value
        ? makeDraftConfirmation(episode.value, state.value, candidate.value, captureBody.value,
            checked.value, confirmedDuration.value, reason.value)
        : makeConfirmation(episode.value, state.value, candidate.value, captureBody.value,
            checked.value, reason.value);
});
const importBody = computed(() => (needsRefresh.value ? null
    : makeImportBody(episode.value, state.value, importForm.value, coverKey.value)));

async function request(method, path, value) {
    const config = { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } };
    const response = method === get ? await get(path, { ...config, params: value }) : await post(path, value, config);
    if (!live()) throw new Error('stale session');
    if (response.data?.code !== 200) throw { status: response.data?.code };
    return response.data.data;
}

function failureStatus(failure) {
    return failure?.status ?? failure?.response?.status;
}

function isAmbiguous(failure) {
    const status = failureStatus(failure);
    return status == null || status >= 500;
}

async function run(action, fallback, onError) {
    if (busy.value || !live()) return;
    busy.value = true;
    error.value = '';
    notice.value = '';
    try {
        await action();
    } catch (failure) {
        if (!live()) return;
        const status = failureStatus(failure);
        error.value = onError?.(status) || sourceFailureMessage(status) || fallback;
    } finally {
        if (live()) busy.value = false;
    }
}

function sourceFailureMessage(status) {
    if (status === 503) return '外部来源预览未开放或暂时不可用。';
    if (status === 502) return '上游来源暂时不可用，本次未更新线路。';
    return '';
}

function clearCandidate() {
    candidate.value = null;
    checked.value = false;
    reason.value = '';
    draftDuration.value = '';
}

function clearPreview() {
    detail.value = null;
    entryKey.value = '';
    clearCandidate();
}

function resetEdit() {
    editing.value = false;
    target.value = null;
    source.value = '';
    catalog.value = null;
    clearPreview();
}

function resetImport() {
    importResult.value = null;
    recoveredImport.value = null;
    importForm.value = { title: '', mcId: '', scId: '', visibility: 1 };
    coverFile.value = null;
    coverKey.value = '';
    if (coverInput.value) coverInput.value.value = '';
}

function isSeriesRow(item) {
    return isId(item?.id) && typeof item?.title === 'string';
}

function isEpisodeRow(item) {
    return isId(item?.id) && (item.vid == null || isId(item.vid))
        && (item.durationSeconds == null || isPositiveSeconds(item.durationSeconds))
        && (item.displayTitle == null || typeof item.displayTitle === 'string');
}

function mergeEpisode(item) {
    const index = episodes.value.findIndex(row => row.id === item.id);
    if (index >= 0) episodes.value[index] = { ...episodes.value[index], ...item };
    if (episode.value?.id === item.id) episode.value = { ...episode.value, ...item };
}

async function loadLocalPage(path, list, cursor, afterId, validate) {
    const page = await request(get, path, { afterId, limit: 20 });
    if (!Array.isArray(page?.items) || page.items.some(item => !validate(item))
        || (page.hasMore && (!isId(page.nextAfterId) || page.nextAfterId <= afterId))) throw new Error('invalid local page');
    const known = new Set(list.value.map(item => item.id));
    const additions = page.items.filter(item => !known.has(item.id));
    list.value = afterId ? [...list.value, ...additions] : page.items;
    cursor.value = page.hasMore ? page.nextAfterId : null;
}

function initialize() {
    return run(() => loadLocalPage(seriesRoot, series, seriesCursor, 0, isSeriesRow), '本地作品加载失败，请重新加载。');
}

function nextSeries() {
    return run(() => loadLocalPage(seriesRoot, series, seriesCursor, seriesCursor.value, isSeriesRow), '下一页本地作品加载失败。');
}

async function loadSeriesSelection(id) {
    seriesId.value = series.value.some(item => item.id === id) ? id : 0;
    episode.value = null;
    episodes.value = [];
    episodeCursor.value = null;
    state.value = null;
    resetEdit();
    resetImport();
    if (seriesId.value) {
        // Failed first page can be retried via the same paging control.
        episodeCursor.value = 0;
        await loadLocalPage(`${seriesRoot}/${seriesId.value}/episodes`, episodes, episodeCursor, 0, isEpisodeRow);
    }
}

function selectSeries(id) {
    return run(() => loadSeriesSelection(id), '本地剧集加载失败，请用“更多剧集”重试。');
}

function nextEpisodes() {
    return run(() => loadLocalPage(`${seriesRoot}/${seriesId.value}/episodes`, episodes, episodeCursor, episodeCursor.value, isEpisodeRow), '剧集加载失败，请重试。');
}

async function readState() {
    state.value = null;
    const result = await request(get, currentPath());
    if (!canReadSources(episode.value, result)) throw new Error('invalid source state');
    state.value = result;
    needsRefresh.value = false;
}

async function readEpisodeStatus() {
    const current = episode.value;
    if (!current) return;
    const page = await request(get, `${seriesRoot}/${seriesId.value}/episodes`, { afterId: Math.max(0, current.id - 1), limit: 1 });
    if (!page || !Array.isArray(page.items) || page.items.some(item => !isEpisodeRow(item))) throw new Error('invalid episode page');
    const row = page.items.find(item => item.id === current.id);
    if (!row) throw new Error('episode missing');
    // A stable binding cannot revert to draft or change vid after it is known.
    if (isId(current.vid) && row.vid !== current.vid) throw new Error('inconsistent episode binding');
    mergeEpisode(row);
}

async function selectEpisodeDirect(id) {
    episode.value = episodes.value.find(item => item.id === id) || null;
    state.value = null;
    resetEdit();
    resetImport();
    if (!episode.value) return;
    importForm.value.title = typeof episode.value.displayTitle === 'string'
        && episode.value.displayTitle.trim().length > 0 && episode.value.displayTitle.trim().length <= 80
        ? episode.value.displayTitle.trim() : '';
    await readEpisodeStatus();
    await readState();
}

function selectEpisode(id) {
    return run(() => selectEpisodeDirect(id), '当前线路读取失败或编号、时长异常。请刷新当前线路。');
}

function refreshState() {
    return run(async () => {
        resetEdit();
        state.value = null;
        if (!episode.value) return;
        await readEpisodeStatus();
        await readState();
    }, '未能刷新当前线路，请重试。');
}

async function recoverEpisodes() {
    if (!seriesId.value) return;
    episodeCursor.value = 0;
    episode.value = null;
    state.value = null;
    resetEdit();
    resetImport();
    try {
        await loadLocalPage(`${seriesRoot}/${seriesId.value}/episodes`, episodes, episodeCursor, 0, isEpisodeRow);
    } catch {
        // Keep the old list; the message tells the manager to reload manually.
    }
}

function createSeries() {
    return run(async () => {
        const title = newSeriesTitle.value.trim();
        if (title.length < 1 || title.length > 200) {
            error.value = '作品标题需为 1..200 字符。';
            return;
        }
        let created;
        try {
            created = await request(post, seriesRoot, { title });
        } catch (failure) {
            if (isAmbiguous(failure)) {
                try { await loadLocalPage(seriesRoot, series, seriesCursor, 0, isSeriesRow); } catch { /* manual reload remains */ }
                error.value = '本地作品创建结果不明确。已尝试刷新作品列表；新作品可能在后页，请用“更多作品”核对，不要重复提交。';
            } else {
                error.value = '本地作品创建失败，请核对标题后重试。';
            }
            return;
        }
        if (!isSeriesRow(created)) {
            try { await loadLocalPage(seriesRoot, series, seriesCursor, 0, isSeriesRow); } catch { /* manual reload remains */ }
            error.value = '本地作品创建结果不明确。已尝试刷新作品列表；新作品可能在后页，请用“更多作品”核对，不要重复提交。';
            return;
        }
        series.value = [...series.value, created];
        newSeriesTitle.value = '';
        notice.value = `本地作品已创建（#${created.id}）。`;
        try { await loadSeriesSelection(created.id); } catch {
            if (live()) error.value = '作品已创建，但剧集列表加载失败。请用“更多剧集”重试。';
        }
    }, '创建流程未完成，请先刷新作品列表核对。');
}

function createEpisode() {
    return run(async () => {
        if (!seriesId.value) {
            error.value = '请先选择本地作品。';
            return;
        }
        const title = newEpisodeTitle.value.trim();
        if (title.length > 255) {
            error.value = '剧集标题最多 255 字符。';
            return;
        }
        let created;
        try {
            created = await request(post, `${seriesRoot}/${seriesId.value}/episodes`, title ? { displayTitle: title } : {});
        } catch (failure) {
            if (isAmbiguous(failure)) {
                await recoverEpisodes();
                error.value = '本地剧集创建结果不明确。已尝试刷新剧集列表；新剧集可能在后页，请用“更多剧集”核对，不要重复提交。';
            } else {
                error.value = '本地剧集创建失败，请核对标题后重试。';
            }
            return;
        }
        if (!isEpisodeRow(created) || created.seriesId !== seriesId.value) {
            await recoverEpisodes();
            error.value = '本地剧集创建结果不明确。已尝试刷新剧集列表；新剧集可能在后页，请用“更多剧集”核对，不要重复提交。';
            return;
        }
        episodes.value = [...episodes.value, created];
        newEpisodeTitle.value = '';
        notice.value = `本地剧集已创建（#${created.id}）。`;
        try { await selectEpisodeDirect(created.id); } catch {
            if (live()) error.value = '剧集已创建，但线路加载失败。请点击“刷新当前线路”。';
        }
    }, '创建流程未完成，请先刷新剧集列表核对。');
}

async function readSources() {
    const rows = await request(get, sourceRoot);
    sources.value = Array.isArray(rows) ? rows : [];
}

function chooseTarget(binding) {
    return run(async () => {
        if (!editableState.value || needsRefresh.value) return;
        resetEdit();
        editing.value = true;
        if (binding) {
            target.value = { id: binding.id, sourceCode: binding.candidate.sourceCode, workId: binding.candidate.workId };
            source.value = target.value.sourceCode;
        } else {
            await readSources();
        }
    }, '不能读取可选来源，请重试。');
}

function reloadSources() {
    return run(async () => {
        source.value = '';
        catalog.value = null;
        clearPreview();
        await readSources();
    }, '不能读取可选来源，请重试。');
}

async function readCatalog(page) {
    clearPreview();
    const result = await request(get, `${sourceRoot}/${encodeURIComponent(source.value)}/catalog`, { page });
    if (result?.sourceCode !== source.value || !Array.isArray(result.items)) throw new Error('invalid catalog');
    catalog.value = result;
}

function selectSource(value) {
    return run(async () => {
        source.value = value;
        catalog.value = null;
        clearPreview();
        if (value) await readCatalog(1);
    }, '无法加载上游目录，请刷新来源后重试。');
}

function loadCatalog(page) {
    return run(() => readCatalog(page), '无法加载该目录页，请重试。');
}

function loadDetail(workId) {
    return run(async () => {
        clearPreview();
        if (!workId) return;
        const result = await request(get, `${sourceRoot}/${encodeURIComponent(source.value)}/detail`, { workId });
        if (result?.sourceCode !== source.value || result.workIdentity !== workId || !Array.isArray(result.lines)) {
            throw new Error('invalid upstream detail');
        }
        detail.value = result;
    }, '无法加载上游分集，请重新选择作品。');
}

function selectEntry(key) {
    clearCandidate();
    entryKey.value = key;
}

async function ensureDraftStillDraft() {
    if (!isDraft.value) return true;
    await readEpisodeStatus();
    if (isDraft.value) return true;
    needsRefresh.value = true;
    resetEdit();
    recoveredImport.value = { vid: episode.value.vid, durationSeconds: episode.value.durationSeconds };
    try {
        await readState();
        error.value = '该剧集已在其他会话导入。已刷新为已导入，不能按草稿继续操作。';
    } catch {
        error.value = '该剧集已在其他会话导入，但状态刷新失败。请刷新当前线路后再操作。';
    }
    return false;
}

function capture() {
    return run(async () => {
        if (!(await ensureDraftStillDraft())) return;
        const body = captureBody.value;
        if (!body) {
            needsRefresh.value = true;
            error.value = '当前线路或剧集状态已变化，请先刷新当前线路。';
            return;
        }
        clearCandidate();
        let result;
        try {
            result = await request(post, `${currentPath()}/candidates`, body);
        } catch (failure) {
            if (sourceFailureMessage(failureStatus(failure)) || !isAmbiguous(failure)) throw failure;
            const refreshed = await recoverAfterWrite();
            error.value = refreshed
                ? '抓取结果不明确。已刷新线路与剧集状态；请核对后重新抓取，不要直接重复提交。'
                : '抓取结果不明确，且刷新失败。请先刷新当前线路，不要直接重复提交。';
            return;
        }
        if (!candidateMatches(episode.value.id, result, body)) {
            const refreshed = await recoverAfterWrite();
            error.value = refreshed
                ? '抓取结果不明确。已刷新线路与剧集状态；请核对后重新抓取，不要直接重复提交。'
                : '抓取结果不明确，且刷新失败。请先刷新当前线路，不要直接重复提交。';
            return;
        }
        candidate.value = result;
        draftDuration.value = isPositiveSeconds(result.candidateSeconds) ? String(result.candidateSeconds) : '';
    }, '未能获取可确认的候选；旧线路未因抓取而变更。', status => {
        if (status !== 409) return undefined;
        needsRefresh.value = true;
        resetEdit();
        return '剧集或线路版本已变化。请刷新当前线路，再重新选择和抓取。';
    });
}

function confirm() {
    return run(async () => {
        if (!(await ensureDraftStillDraft())) return;
        const body = confirmBody.value;
        if (!body) {
            needsRefresh.value = true;
            error.value = '当前候选或剧集状态已变化，请先刷新当前线路。';
            return;
        }
        const path = `${currentPath()}/candidates/${candidate.value.id}/confirm`;
        needsRefresh.value = true;
        resetEdit();
        // Never retry a write automatically. A lost response may mean it committed.
        try {
            await request(post, path, body);
        } catch (failure) {
            if (sourceFailureMessage(failureStatus(failure))) throw failure;
            if (isAmbiguous(failure)) {
                const refreshed = await recoverAfterWrite();
                error.value = refreshed
                    ? '确认结果不明确。已刷新线路与剧集状态；请核对当前线路，不要直接重复提交。'
                    : '确认结果不明确，且刷新失败。请重试刷新，不要直接重复提交。';
                return;
            }
            error.value = failureStatus(failure) === 409
                ? '确认发生冲突。请刷新当前线路，再重新选择和抓取。'
                : '未能完成确认或核对结果。请先刷新当前线路，不要重复提交。';
            return;
        }
        notice.value = isDraft.value
            ? `线路已确认，统一时长 ${body.durationSeconds} 秒已锁定。`
            : '线路已确认，视频 ID 不变。';
        if (!(await recoverAfterWrite())) {
            error.value = '确认已提交，但刷新线路失败。请点击“刷新当前线路”核对，不要重复提交。';
        }
    }, '未能完成确认或核对结果。请先刷新当前线路，不要重复提交。');
}

async function recoverAfterWrite() {
    const wasDraft = isDraft.value;
    try {
        await readEpisodeStatus();
        if (wasDraft && !isDraft.value) {
            resetEdit();
            recoveredImport.value = { vid: episode.value.vid, durationSeconds: episode.value.durationSeconds };
        }
        await readState();
        return true;
    } catch {
        needsRefresh.value = true;
        return false;
    }
}

function selectCover(event) {
    const file = event.target.files?.[0] || null;
    coverKey.value = '';
    coverFile.value = null;
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type) || !/\.(jpe?g|png)$/i.test(file.name)
        || file.size <= 0 || file.size > 2 * 1024 * 1024) {
        error.value = '封面必须是 JPG 或 PNG，且不超过 2MB。';
        event.target.value = '';
        return;
    }
    coverFile.value = file;
}

function uploadCover() {
    return run(async () => {
        const file = coverFile.value;
        if (!file || !isDraft.value) return;
        const form = new FormData();
        form.append('file', file, file.name);
        let key;
        try {
            key = await request(post, '/videos/cover', form);
        } catch (failure) {
            coverKey.value = '';
            error.value = isAmbiguous(failure)
                ? '封面上传结果不明确。请重新选择文件上传，不要复用未知结果。'
                : '封面上传失败，请重新选择 JPG/PNG 文件。';
            return;
        }
        if (typeof key !== 'string' || key.length < 1 || key.length > 512
            || !key.startsWith('temp/covers/') || /\s/.test(key)) {
            coverKey.value = '';
            error.value = '封面上传结果不明确。请重新选择文件上传，不要复用未知结果。';
            return;
        }
        coverKey.value = key;
        notice.value = '封面已上传。临时文件仅保存在本页内存，不显示、不持久化。';
    }, '封面上传失败，请重试。');
}

function resetCategoryChild() {
    importForm.value.scId = '';
}

async function loadCategories() {
    try {
        const rows = await request(get, '/category');
        if (!Array.isArray(rows) || rows.some(item => typeof item?.mcId !== 'string' || !item.mcId
            || !Array.isArray(item.children) || item.children.some(child => typeof child?.scId !== 'string' || !child.scId))) {
            throw new Error('invalid categories');
        }
        categories.value = rows;
        categoryError.value = '';
    } catch {
        if (live()) categoryError.value = '分区加载失败，暂不能首次导入。请重新加载分区。';
    }
}

function importEpisode() {
    return run(async () => {
        if (needsRefresh.value) {
            error.value = '线路状态已变化，请先刷新当前线路，再决定是否导入。';
            return;
        }
        if (!(await ensureDraftStillDraft())) return;
        const body = importBody.value;
        if (!body) {
            needsRefresh.value = true;
            error.value = '当前线路或剧集状态已变化，请先刷新当前线路。';
            return;
        }
        const id = episode.value.id;
        let result;
        try {
            result = await request(post, `/admin/local-video-episodes/${id}/import`, body);
        } catch (failure) {
            const status = failureStatus(failure);
            const refreshed = await recoverAfterImport();
            if (status === 409) {
                error.value = refreshed
                    ? '首次导入发生冲突（版本、封面或剧集状态已变化）。已刷新剧集与线路；请核对后重新上传封面或重试，本次不会自动重发。'
                    : '首次导入发生冲突，且刷新失败。请刷新后核对，不要直接重复提交。';
            } else if (isAmbiguous(failure)) {
                error.value = refreshed
                    ? '首次导入结果不明确。已刷新剧集与线路；请核对 vid/审核状态后再决定，不要直接重复提交。'
                    : '首次导入结果不明确，且刷新失败。请先刷新剧集与线路，不要直接重复提交。';
            } else {
                error.value = '首次导入失败，剧集未改变。请核对标题、分类、封面与线路。';
            }
            return;
        }
        const accepted = readImportResult(id, result);
        if (!accepted) {
            await recoverAfterImport();
            error.value = '首次导入结果不明确。已尝试刷新剧集与线路；请核对 vid/审核状态，不要直接重复提交。';
            return;
        }
        importResult.value = accepted;
        recoveredImport.value = null;
        mergeEpisode({ id, vid: accepted.vid, durationSeconds: accepted.durationSeconds });
        coverKey.value = '';
        coverFile.value = null;
        if (coverInput.value) coverInput.value.value = '';
        notice.value = accepted.reused
            ? '该剧集已由其他请求导入，后台返回已有视频，本次未新建。'
            : '首次导入完成，视频保持待审核；本页没有发布或修改审核状态。';
        if (!(await recoverAfterImport())) {
            error.value = '导入已返回结果，但刷新剧集或线路失败。请刷新核对，不要重复提交。';
        }
    }, '首次导入失败，请核对信息后重试。');
}

async function recoverAfterImport() {
    let refreshed = true;
    try {
        await readEpisodeStatus();
    } catch {
        needsRefresh.value = true;
        return false;
    }
    if (!importResult.value && isId(episode.value?.vid)) {
        recoveredImport.value = { vid: episode.value.vid, durationSeconds: episode.value.durationSeconds };
    }
    try {
        await readState();
    } catch {
        needsRefresh.value = true;
        refreshed = false;
    }
    return refreshed;
}

onMounted(() => {
    initialize();
    loadCategories();
});
onUnmounted(() => controller.abort());
</script>

<style scoped>
.source-manager { max-width: 1100px; padding: 24px; line-height: 1.65; }
section { border-top: 1px solid var(--el-border-color); padding: 14px 0; }
section h3 { margin-bottom: 10px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 8px 0; }
select, input, textarea { border: 1px solid var(--el-border-color); border-radius: 4px; padding: 6px; max-width: 100%; }
select { min-width: 130px; width: min(350px, 65vw); }
input { width: min(260px, 60vw); }
input[type="checkbox"] { width: auto; }
input[type="file"] { width: auto; }
.reason { display: grid; max-width: 540px; margin: 10px 0; }
.error { color: var(--el-color-danger); }
</style>
