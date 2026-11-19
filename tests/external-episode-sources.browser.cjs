// Run after a production build with PLAYWRIGHT_CORE pointing to a pinned isolated playwright-core install.
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const origin = 'https://admin.example.test';
const routePath = '/content/external-episode-sources';
const sourcesPath = '/api/admin/local-video-episodes/9/sources';
const dist = path.resolve(__dirname, '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const source = { code: 'demo', name: 'Fixture source' };
const workId = '92233720368547758070';
const label = '<b>抓取后的分集</b>';

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
        const errors = [], captures = [], confirms = [];
        let revision = 5, failedProbe = true, conflict = false;
        let bindings = [{ id: 11, candidate: { sourceCode: source.code, workId, label: '当前旧线路' } }];
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
            if (p === '/api/category') return ok([]);
            const items = items => ({ items, hasMore: false, nextAfterId: null });
            if (p === '/api/admin/local-video-series') return ok(items([{ id: 1, title: '本地作品一' }]));
            if (p === '/api/admin/local-video-series/1/episodes') return ok(items([{ id: 9, vid: 55, displayTitle: '已导入剧集', durationSeconds: 120.5 }, { id: 10, vid: null, displayTitle: '草稿' }]));
            if (p === sourcesPath) return ok({ revision, durationSeconds: 120.5, bindings });
            if (p === '/api/admin/video-sources') return ok([source]);
            if (p === '/api/admin/video-sources/demo/catalog') return ok({ sourceCode: source.code, page: 1, pageCount: 1, items: [{ workIdentity: workId, title: '上游作品' }] });
            if (p === '/api/admin/video-sources/demo/detail' && url.searchParams.get('workId') === workId) {
                return ok({ sourceCode: source.code, workIdentity: workId, lines: [{ lineIndex: 2, entries: [{ entryIndex: 3, label: '预览标签' }] }] });
            }
            if (p === `${sourcesPath}/candidates` && request.method() === 'POST') {
                const body = request.postDataJSON();
                captures.push(body);
                return ok({ ...body, id: 100 + captures.length, episodeId: 9, label,
                    probeStatus: failedProbe ? 'PROBE_REJECTED' : 'SUCCEEDED', candidateSeconds: failedProbe ? null : 121 });
            }
            if (/\/candidates\/\d+\/confirm$/.test(p) && request.method() === 'POST') {
                confirms.push({ path: p, body: request.postDataJSON() });
                if (conflict) return route.fulfill({ status: 409, json: { code: 409, message: '版本过期' } });
                const captured = captures.at(-1);
                revision++;
                const next = { id: captured.targetBindingId ?? 12, candidate: { ...captured, label: '已确认新线路' } };
                bindings = captured.targetBindingId ? bindings.map(line => line.id === next.id ? next : line) : [...bindings, next];
                return ok({ revision, durationSeconds: 120.5, bindings });
            }
            return route.fulfill({ status: 404 });
        });

        const button = name => page.getByRole('button', { name, exact: true });
        const verify = () => page.getByRole('checkbox', { name: /已核对本地剧集/ }).check();
        const capture = async () => {
            await page.getByRole('combobox', { name: /^上游分集/ }).selectOption('2:3');
            await button('抓取并探测').click();
            await page.getByText(`抓取后的分集标签：${label}`, { exact: false }).waitFor();
            assert.equal(await page.locator('#confirm-title + p b').count(), 0, 'untrusted label must remain text');
        };
        await page.goto(origin + routePath);
        await page.getByRole('combobox', { name: /^本地作品/ }).selectOption('1');
        const episodeSelect = page.getByRole('combobox', { name: /^本地剧集/ });
        await episodeSelect.selectOption('9');
        assert.equal(await episodeSelect.locator('option[value="10"]').evaluate(option => option.disabled), false);
        await button('替换线路 #11').click();
        await button('读取原上游作品').click();
        await capture();
        await page.getByText('探测未通过，不能确认；当前线路不变。').waitFor();
        await page.getByText('当前旧线路', { exact: false }).waitFor();
        assert.equal(confirms.length, 0);
        assert.deepEqual(captures[0], { sourceCode: source.code, workId, lineOrdinal: 2, entryOrdinal: 3, expectedRevision: 5, targetBindingId: 11 });

        failedProbe = false;
        await capture();
        assert.equal(await button('确认替换线路').isDisabled(), true);
        await verify();
        await page.getByLabel('确认理由').fill('已核对同一版本');
        conflict = true;
        await button('确认替换线路').click();
        await page.getByText('确认发生冲突。请刷新当前线路，再重新选择和抓取。').waitFor();
        assert.equal(await button('替换线路 #11').isDisabled(), true);
        assert.equal(confirms.length, 1);
        assert.deepEqual(confirms[0], { path: `${sourcesPath}/candidates/102/confirm`, body: { expectedRevision: 5, durationSeconds: 120.5, reason: '已核对同一版本' } });
        await button('刷新当前线路').click();

        conflict = false;
        await button('替换线路 #11').click();
        await button('读取原上游作品').click();
        await capture();
        await verify();
        await page.getByLabel('确认理由').fill('批准同一版本');
        await button('确认替换线路').click();
        await page.getByText('版本：6', { exact: false }).waitFor();
        await page.getByText('已确认新线路', { exact: false }).waitFor();
        assert.equal(confirms.length, 2);
        assert.equal(bindings.length, 1);

        await button('新增独立线路').click();
        await page.getByLabel('上游来源').selectOption(source.code);
        await page.getByLabel('上游作品').selectOption(workId);
        await capture();
        await verify();
        await page.getByLabel('确认理由').fill('确认二号线路');
        await button('确认新增线路').click();
        await page.getByText('版本：7', { exact: false }).waitFor();
        await button('替换线路 #12').waitFor();
        await page.getByText('视频 ID：55', { exact: false }).waitFor();
        assert.equal(captures.at(-1).targetBindingId, null);
        assert.equal(captures.at(-1).expectedRevision, 6);
        assert.equal(confirms.length, 3);
        assert.deepEqual(errors, []);
        console.log('PASS admin browser: failed probe, explicit replacement, conflict refresh, add, stable vid, and escaped labels');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
