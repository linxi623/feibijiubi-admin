// Run after a production build with PLAYWRIGHT_CORE pointing to a pinned isolated playwright-core install.
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const origin = 'https://admin.example.test';
const routePath = '/content/external-episode-sources';
const source = { code: 'demo', name: 'Fixture source' };
const workId = '92233720368547758070';
const label = '<b>首次导入候选</b>';
const dist = path.resolve(__dirname, '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [], captures = [], confirms = [], imports = [], covers = [], seriesCreates = [], episodeCreates = [];
        let series = [{ id: 1, title: '已有作品' }];
        let episodes = [];
        const states = new Map();
        const nextEpisode = () => 22 + episodes.filter(item => item.seriesId === 2).length;
        const nextBinding = () => 10 + confirms.length;
        states.set(22, { revision: 0, durationSeconds: null, bindings: [] });
        states.set(23, { revision: 5, durationSeconds: 50, bindings: [{
            id: 31, candidate: { sourceCode: source.code, workId, label: '已有确认线路' },
        }] });

        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('feibijiubi_token', 'fixture-token'));
        await page.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            const p = url.pathname;
            if (!p.startsWith('/api/')) {
                const file = p === routePath ? path.join(dist, 'index.html') : path.resolve(dist, '.' + p);
                if (!file.startsWith(dist + path.sep)) return route.abort();
                try { return route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
                catch { return route.fulfill({ status: 404, body: '' }); }
            }
            const ok = data => route.fulfill({ json: { code: 200, data } });
            if (request.headers().authorization !== 'Bearer fixture-token') return route.fulfill({ status: 401 });
            if (p === '/api/users/me') return ok({ role: 1, uid: 7, nickname: 'QA' });
            if (p === '/api/category') return ok([{
                mcId: 'douga', mcName: '动画',
                children: [{ scId: 'mad', scName: 'MAD·AMV', description: 'fixture', rcmTags: [] }],
            }]);
            if (p === '/api/admin/local-video-series' && request.method() === 'GET') {
                const afterId = Number(url.searchParams.get('afterId') || 0);
                const items = series.filter(item => item.id > afterId).slice(0, 20);
                return ok({ items, afterId, limit: 20, hasMore: false, nextAfterId: null });
            }
            if (p === '/api/admin/local-video-series' && request.method() === 'POST') {
                const body = request.postDataJSON();
                seriesCreates.push(body);
                const created = { id: 2, localIdentity: 'fixture-series', title: body.title, createdBy: 7, createdAt: null };
                series = [...series, created];
                return ok(created);
            }
            const episodesMatch = p.match(/^\/api\/admin\/local-video-series\/(\d+)\/episodes$/);
            if (episodesMatch) {
                const seriesId = Number(episodesMatch[1]);
                if (request.method() === 'POST') {
                    const body = request.postDataJSON();
                    episodeCreates.push({ seriesId, body });
                    const id = nextEpisode();
                    const preset = states.get(id);
                    const created = { id, localIdentity: `fixture-episode-${id}`, seriesId, displayTitle: body.displayTitle ?? null,
                        vid: null, durationSeconds: preset?.durationSeconds ?? null, createdBy: 7, createdAt: null };
                    episodes.push(created);
                    if (!preset) states.set(id, { revision: 0, durationSeconds: null, bindings: [] });
                    return ok(created);
                }
                const afterId = Number(url.searchParams.get('afterId') || 0);
                const limit = Number(url.searchParams.get('limit') || 20);
                const items = episodes.filter(item => item.seriesId === seriesId && item.id > afterId).slice(0, limit);
                return ok({ items, afterId, limit, hasMore: false, nextAfterId: null });
            }
            const sourceMatch = p.match(/^\/api\/admin\/local-video-episodes\/(\d+)\/sources$/);
            if (sourceMatch && request.method() === 'GET') {
                const state = states.get(Number(sourceMatch[1]));
                return state ? ok(state) : route.fulfill({ status: 404 });
            }
            if (p === '/api/admin/video-sources') return ok([source]);
            if (p === '/api/admin/video-sources/demo/catalog') {
                return ok({ sourceCode: source.code, page: 1, pageCount: 1, items: [{ workIdentity: workId, title: '上游作品' }] });
            }
            if (p === '/api/admin/video-sources/demo/detail' && url.searchParams.get('workId') === workId) {
                return ok({ sourceCode: source.code, workIdentity: workId, lines: [{ lineIndex: 2, entries: [{ entryIndex: 3, label: '预览标签' }] }] });
            }
            const captureMatch = p.match(/^\/api\/admin\/local-video-episodes\/(\d+)\/sources\/candidates$/);
            if (captureMatch && request.method() === 'POST') {
                const body = request.postDataJSON();
                captures.push({ episodeId: Number(captureMatch[1]), body });
                const id = 100 + captures.length;
                return ok({ ...body, id, episodeId: Number(captureMatch[1]), label,
                    probeStatus: 'PROBE_REJECTED', candidateSeconds: null, capturedAt: null,
                    confirmedSeconds: null, confirmedBy: null, confirmedAt: null, reason: null });
            }
            const confirmMatch = p.match(/^\/api\/admin\/local-video-episodes\/(\d+)\/sources\/candidates\/(\d+)\/confirm$/);
            if (confirmMatch && request.method() === 'POST') {
                const episodeId = Number(confirmMatch[1]);
                const body = request.postDataJSON();
                confirms.push({ episodeId, candidateId: Number(confirmMatch[2]), body });
                const state = states.get(episodeId);
                state.revision += 1;
                state.durationSeconds = body.durationSeconds;
                const bindingId = nextBinding();
                state.bindings = [...state.bindings, { id: bindingId, candidate: {
                    id: Number(confirmMatch[2]), episodeId, expectedRevision: body.expectedRevision, targetBindingId: null,
                    sourceCode: source.code, workId, lineOrdinal: 2, entryOrdinal: 3, label,
                    probeStatus: 'PROBE_REJECTED', candidateSeconds: null, capturedAt: null,
                    confirmedSeconds: body.durationSeconds, confirmedBy: 7, confirmedAt: 'fixture', reason: body.reason,
                } }];
                episodes = episodes.map(item => item.id === episodeId ? { ...item, durationSeconds: body.durationSeconds } : item);
                return ok(state);
            }
            if (p === '/api/videos/cover' && request.method() === 'POST') {
                const body = request.postDataBuffer?.()?.toString() || request.postData() || '';
                covers.push({ contentType: request.headers()['content-type'] || '', body });
                return ok(`temp/covers/7/20260709/cover-${covers.length}.png`);
            }
            const importMatch = p.match(/^\/api\/admin\/local-video-episodes\/(\d+)\/import$/);
            if (importMatch && request.method() === 'POST') {
                const episodeId = Number(importMatch[1]);
                const body = request.postDataJSON();
                imports.push({ episodeId, body });
                const state = states.get(episodeId);
                episodes = episodes.map(item => item.id === episodeId
                    ? { ...item, vid: 77, durationSeconds: state.durationSeconds } : item);
                return ok({ episodeId, vid: 77, durationSeconds: state.durationSeconds,
                    importRevision: state.revision, status: 0, reused: false });
            }
            return route.fulfill({ status: 404 });
        });

        const button = name => page.getByRole('button', { name, exact: true });
        const verify = () => page.locator('section[aria-labelledby="confirm-title"] input[type="checkbox"]').check();

        await page.goto(origin + routePath);
        await page.getByRole('combobox', { name: /^本地作品/ }).selectOption('1');
        await page.getByLabel('新作品标题').fill('首次导入作品');
        await button('创建本地作品').click();
        await page.getByText('本地作品已创建（#2）。').waitFor();
        assert.deepEqual(seriesCreates[0], { title: '首次导入作品' });

        await page.getByLabel('新剧集标题').fill('第一集');
        await button('创建本地剧集').click();
        await page.getByText('本地剧集已创建（#22）。').waitFor();
        await page.getByText('当前状态：草稿（尚未导入）').waitFor();
        assert.deepEqual(episodeCreates[0], { seriesId: 2, body: { displayTitle: '第一集' } });

        await button('新增独立线路').click();
        await page.getByLabel('上游来源').selectOption(source.code);
        await page.getByLabel('上游作品').selectOption(workId);
        await page.getByRole('combobox', { name: /^上游分集/ }).selectOption('2:3');
        await button('抓取并探测').click();
        await page.getByText('探测未成功；草稿可由管理员人工核验并填写有限正时长，已导入剧集不允许此操作。').waitFor();
        await page.getByText(`抓取后的分集标签：${label}`, { exact: false }).waitFor();
        assert.equal(await page.locator('#confirm-title + p b').count(), 0, 'untrusted label must remain text');
        assert.equal(await button('确认新增线路').isDisabled(), true);
        assert.deepEqual(captures[0].body, {
            sourceCode: source.code, workId, lineOrdinal: 2, entryOrdinal: 3, expectedRevision: 0, targetBindingId: null,
        });

        await page.getByLabel(/统一时长（秒/).fill('99.5');
        await verify();
        await page.getByLabel('确认理由').fill('人工核验失败探测');
        await button('确认新增线路').click();
        await page.getByText('线路已确认，统一时长 99.5 秒已锁定。').waitFor();
        await page.getByText('版本：1', { exact: false }).waitFor();
        assert.deepEqual(confirms[0].body, { expectedRevision: 0, durationSeconds: 99.5, reason: '人工核验失败探测' });

        await page.getByLabel('视频标题').fill('导入标题');
        await page.getByLabel('父分区').selectOption('douga');
        await page.getByLabel('子分区').selectOption('mad');
        assert.equal(await page.getByLabel('可见性').inputValue(), '1');
        await page.getByLabel(/封面文件/).setInputFiles({
            name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
        });
        await button('上传封面').click();
        await page.getByText('封面已上传。临时文件仅保存在本页内存，不显示、不持久化。').waitFor();
        assert.equal(await page.getByText('temp/covers/7/20260709/cover-1.png').count(), 0, 'temporary cover key must not be displayed');
        assert.match(covers[0].contentType, /^multipart\/form-data; boundary=/);
        assert.match(covers[0].body, /name="file"; filename="cover.png"/);

        await button('首次导入').click();
        await page.getByText('视频 ID：77 · 审核状态：待审核（0）').waitFor();
        await page.getByText('当前状态：已导入').waitFor();
        assert.equal(await button('首次导入').count(), 0);
        assert.deepEqual(imports[0].body, {
            expectedRevision: 1,
            tempCoverKey: 'temp/covers/7/20260709/cover-1.png',
            title: '导入标题',
            mcId: 'douga',
            scId: 'mad',
            visibility: 1,
        });
        assert.deepEqual(Object.keys(imports[0].body).sort(), [
            'expectedRevision', 'mcId', 'scId', 'tempCoverKey', 'title', 'visibility',
        ]);
        assert.equal(await page.getByText('temp/covers/7/20260709/cover-1.png').count(), 0, 'temporary cover key must stay hidden');

        await page.getByLabel('新剧集标题').fill('第二集');
        await button('创建本地剧集').click();
        await page.getByText('本地剧集已创建（#23）。').waitFor();
        await page.getByText('当前状态：草稿（尚未导入）').waitFor();
        await page.getByLabel('视频标题').fill('冲突草稿');
        await page.getByLabel('父分区').selectOption('douga');
        await page.getByLabel('子分区').selectOption('mad');
        await page.getByLabel(/封面文件/).setInputFiles({
            name: 'second.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
        });
        await button('上传封面').click();
        await page.getByText('封面已上传。临时文件仅保存在本页内存，不显示、不持久化。').waitFor();
        episodes = episodes.map(item => item.id === 23 ? { ...item, vid: 99 } : item);
        await button('首次导入').click();
        await page.getByText('该剧集已在其他会话导入。已刷新为已导入，不能按草稿继续操作。').waitFor();
        await page.getByText('刷新后视频 ID：99', { exact: false }).waitFor();
        assert.equal(imports.length, 1, 'a concurrent import must not trigger a second import request');
        assert.deepEqual(errors, []);
        console.log('PASS admin browser: draft creation, failed-probe manual duration, fixed timeline, cover/category import and concurrent-import recovery');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
