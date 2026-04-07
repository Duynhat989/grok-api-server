
let rows = [];
let filteredStatus = 'all';
let providerFilter = 'all';
let selectedIds = new Set();
let isBusy = false;
let busyHideTimer = null;
let statsAnimationFrame = null;
let animatedStats = {
    total: 0,
    visible: 0,
    live: 0,
    die: 0,
    active: 0,
    selected: 0
};

const DOMAIN = "http://localhost:2053/";
const API = `${DOMAIN}api/manager/accounts`;

// ================== UI HELPERS ==================
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function shortText(s, max) {
    s = String(s || '');
    return s.length <= max ? esc(s) : `<span title="${esc(s)}">${esc(s.slice(0, max))}…</span>`;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function readonlyField(value, variant = 'short') {
    const text = String(value || '').trim();
    return `<input class="readonly-field ${variant}" type="text" value="${escAttr(text)}" readonly title="${escAttr(text || 'Trống')}" onclick="this.select()">`;
}

function showTableMessage(message, isLoading = false) {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="${isLoading ? 'loading-cell' : 'no-data'}">
                ${isLoading
            ? `<div class="loading-inline"><span class="loading-spinner"></span><span>${esc(message)}</span></div>`
            : esc(message)}
            </td>
        </tr>
    `;
}

function setBusyState({
    visible = true,
    title = 'Đang xử lý...',
    detail = 'Vui lòng chờ...',
    current = 0,
    total = 0
} = {}) {
    const panel = document.getElementById('loading-panel');
    const titleEl = document.getElementById('loading-title');
    const detailEl = document.getElementById('loading-detail');
    const countEl = document.getElementById('loading-count');
    const fillEl = document.getElementById('loading-progress-bar');

    if (busyHideTimer) {
        clearTimeout(busyHideTimer);
        busyHideTimer = null;
    }

    isBusy = visible;
    document.body.classList.toggle('app-busy', visible);

    if (!panel || !titleEl || !detailEl || !countEl || !fillEl) return;

    const hasProgress = total > 0;
    const safeCurrent = hasProgress ? Math.max(0, Math.min(current, total)) : 0;

    titleEl.textContent = title;
    detailEl.textContent = detail;
    countEl.textContent = hasProgress ? `${safeCurrent}/${total}` : '...';
    fillEl.style.width = hasProgress ? `${Math.max(8, Math.round((safeCurrent / total) * 100))}%` : '35%';
    fillEl.classList.toggle('indeterminate', !hasProgress);
    panel.classList.toggle('show', visible);
}

function hideBusyState(delay = 180) {
    if (busyHideTimer) clearTimeout(busyHideTimer);

    busyHideTimer = window.setTimeout(() => {
        isBusy = false;
        document.body.classList.remove('app-busy');
        document.getElementById('loading-panel')?.classList.remove('show');
    }, delay);
}

function animateDashboard(nextStats) {
    const countLabel = document.getElementById('count-label');
    const liveEl = document.getElementById('s-live');
    const dieEl = document.getElementById('s-die');
    const activeEl = document.getElementById('s-active');
    const selectedEl = document.getElementById('s-selected');

    if (!countLabel || !liveEl || !dieEl || !activeEl || !selectedEl) return;

    const startStats = { ...animatedStats };
    const duration = 260;
    const isFilteredView = filteredStatus !== 'all' || providerFilter !== 'all';

    if (statsAnimationFrame) {
        cancelAnimationFrame(statsAnimationFrame);
    }

    const startedAt = performance.now();

    const draw = now => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = {};

        Object.keys(nextStats).forEach(key => {
            current[key] = Math.round(startStats[key] + (nextStats[key] - startStats[key]) * eased);
        });

        countLabel.textContent = isFilteredView
            ? `${current.visible}/${current.total} tài khoản`
            : `${current.total} tài khoản`;
        liveEl.textContent = `Live: ${current.live}`;
        dieEl.textContent = `Die: ${current.die}`;
        activeEl.textContent = `Hoạt động: ${current.active}`;
        selectedEl.textContent = `Đã chọn: ${current.selected}`;

        if (progress < 1) {
            statsAnimationFrame = requestAnimationFrame(draw);
            return;
        }

        animatedStats = { ...nextStats };
    };

    statsAnimationFrame = requestAnimationFrame(draw);
}

async function ensureOk(responsePromise, fallbackMessage) {
    const res = await responsePromise;
    if (!res.ok) {
        throw new Error(fallbackMessage || `Yêu cầu thất bại (${res.status})`);
    }
    return res;
}

async function runSingleAction({ title, detail, request, reloadMessage = 'Đang cập nhật danh sách...' }) {
    if (isBusy) return;

    try {
        setBusyState({ visible: true, title, detail, current: 0, total: 1 });
        await ensureOk(request(), `${title} thất bại`);
        setBusyState({ visible: true, title, detail: `Hoàn tất: ${detail}`, current: 1, total: 1 });
        await loadData(reloadMessage);
    } catch (e) {
        console.error(title, e);
        alert(e.message || 'Có lỗi xảy ra khi xử lý dữ liệu.');
        hideBusyState(0);
    }
}

async function runBatchAction({
    title,
    items,
    request,
    detailBuilder,
    onProgress,
    reloadMessage = 'Đang cập nhật danh sách...'
}) {
    if (isBusy) return false;

    const total = items.length;
    if (!total) return false;

    try {
        setBusyState({ visible: true, title, detail: `0/${total} hoàn tất`, current: 0, total });

        for (let i = 0; i < total; i++) {
            const item = items[i];
            const detail = detailBuilder ? detailBuilder(item, i) : `Mục ${i + 1}`;

            setBusyState({
                visible: true,
                title,
                detail: `Đang xử lý ${i + 1}/${total}: ${detail}`,
                current: i,
                total
            });

            if (typeof onProgress === 'function') {
                onProgress(i, total, item);
            }

            await ensureOk(request(item, i), `${title} thất bại ở bước ${i + 1}/${total}`);

            setBusyState({
                visible: true,
                title,
                detail: `Đã xong ${i + 1}/${total}: ${detail}`,
                current: i + 1,
                total
            });
        }

        await loadData(reloadMessage);
        return true;
    } catch (e) {
        console.error(title, e);
        alert(e.message || 'Có lỗi xảy ra khi xử lý dữ liệu.');
        hideBusyState(0);
        return false;
    }
}

// ================== FETCH DATA ==================
async function loadData(reason = 'Đang tải danh sách tài khoản...') {
    if (!rows.length) {
        showTableMessage(reason, true);
    }

    try {
        setBusyState({
            visible: true,
            title: reason,
            detail: 'Đang kết nối máy chủ...',
            current: 0,
            total: 1
        });

        const res = await ensureOk(fetch(API), 'Không thể tải dữ liệu tài khoản.');
        const data = await res.json();
        rows = Array.isArray(data) ? data : [];

        setBusyState({
            visible: true,
            title: reason,
            detail: `Đã nhận ${rows.length} tài khoản`,
            current: 1,
            total: 1
        });

        render();
    } catch (e) {
        console.error('Load error:', e);
        rows = [];
        render();
        showTableMessage(e.message || 'Không thể tải dữ liệu');
    } finally {
        hideBusyState();
    }
}

// ================== RENDER ==================
function getVisibleRows() {
    return rows.filter(r => {
        const matchStatus = filteredStatus === 'all' || r.status === filteredStatus;
        const matchProvider = providerFilter === 'all' || String(r.provider || '').trim() === providerFilter;
        return matchStatus && matchProvider;
    });
}

function updateProviderOptions() {
    const providerSelect = document.getElementById('provider-filter');
    if (!providerSelect) return;

    const providers = [...new Set(rows.map(r => String(r.provider || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'vi'));

    providerSelect.innerHTML = '<option value="all">Tất cả Provider</option>' +
        providers.map(provider => `<option value="${esc(provider)}">${esc(provider)}</option>`).join('');

    providerSelect.value = providers.includes(providerFilter) ? providerFilter : 'all';
    if (!providers.includes(providerFilter)) {
        providerFilter = 'all';
    }
}

function render() {
    const tbody = document.getElementById('tbody');
    const n = rows.length;
    const rowIdSet = new Set(rows.map(r => String(r.id)));
    selectedIds = new Set([...selectedIds].filter(id => rowIdSet.has(id)));

    updateProviderOptions();

    const visibleRows = getVisibleRows();
    const liveCount = rows.filter(r => r.status === 'live').length;
    const dieCount = rows.filter(r => r.status === 'die').length;
    const activeCount = rows.filter(r => r.active).length;
    const selectedCount = selectedIds.size;

    document.getElementById('btn-export').disabled = n === 0;
    document.getElementById('btn-export-die').disabled = dieCount === 0;
    document.getElementById('btn-clear').disabled = n === 0;
    document.getElementById('btn-select-all').disabled = visibleRows.length === 0;
    document.getElementById('btn-clear-selection').disabled = selectedCount === 0;
    document.getElementById('btn-delete-selected').disabled = selectedCount === 0;
    document.getElementById('btn-delete-die').disabled = dieCount === 0;
    document.getElementById('provider-filter').disabled = n === 0;

    const summary = document.getElementById('summary');
    summary.style.display = n ? 'flex' : 'none';

    animateDashboard({
        total: n,
        visible: visibleRows.length,
        live: liveCount,
        die: dieCount,
        active: activeCount,
        selected: selectedCount
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.statusFilter === filteredStatus);
    });

    if (!n) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">Không có dữ liệu</td></tr>';
        return;
    }

    if (!visibleRows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="no-data">Không có tài khoản phù hợp bộ lọc</td></tr>';
        return;
    }

    tbody.innerHTML = visibleRows.map((r, i) => {
        const isLive = r.status === 'live';
        const isDie = r.status === 'die';
        const rowId = String(r.id);

        const badgeCls = isLive ? 'badge-live' : isDie ? 'badge-die' : 'badge-unknown';
        const badgeTxt = isLive ? 'Live' : isDie ? 'Die' : 'Chưa rõ';

        return `
            <tr class="${isDie ? 'row-die' : ''}">
                <td>${i + 1}</td>
                <td style="text-align:center">
                    <input type="checkbox" ${selectedIds.has(rowId) ? 'checked' : ''}
                        onchange="toggleRowSelection('${rowId}', this.checked)">
                </td>
                <td class="email-cell">${esc(r.email)}</td>
                <td>${readonlyField(r.password, 'short')}</td>
                <td class="cookie-cell">${readonlyField(r.cookie, 'long')}</td>
                <td>${readonlyField(r.proxy, 'long')}</td>
                <td>${readonlyField(r.provider, 'short')}</td>

                <td>
                    <span class="${badgeCls}" onclick="changeStatus('${r.id}', '${r.status}')">
                        ${badgeTxt}
                    </span>
                </td>

                <td style="text-align:center">
                    <label class="toggle">
                        <input type="checkbox" ${r.active ? 'checked' : ''}
                            onchange="toggleActive('${r.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </td>

                <td>
                    <button class="btn-del" onclick="deleteAcc('${r.id}')">Xóa</button>
                </td>
            </tr>
        `;
    }).join('');
}

function setStatusFilter(status) {
    filteredStatus = status;
    render();
}

function setProviderFilter(value) {
    providerFilter = value;
    render();
}

function toggleRowSelection(id, checked) {
    if (checked) {
        selectedIds.add(String(id));
    } else {
        selectedIds.delete(String(id));
    }
    render();
}

function selectAllVisible() {
    getVisibleRows().forEach(r => selectedIds.add(String(r.id)));
    render();
}

function clearSelection() {
    selectedIds.clear();
    render();
}

// ================== ACTION ==================
async function toggleActive(id, val) {
    const account = rows.find(r => String(r.id) === String(id));
    await runSingleAction({
        title: val ? 'Đang bật trạng thái hoạt động...' : 'Đang tắt trạng thái hoạt động...',
        detail: account?.email || `ID ${id}`,
        request: () => fetch(`${API}/${id}/active`, { method: 'PATCH' }),
        reloadMessage: 'Đang tải lại trạng thái tài khoản...'
    });
}

async function changeStatus(id, current) {
    const account = rows.find(r => String(r.id) === String(id));
    const next = current === 'live' ? 'die' : current === 'die' ? '' : 'live';

    await runSingleAction({
        title: 'Đang cập nhật trạng thái Live / Die...',
        detail: `${account?.email || `ID ${id}`} → ${next || 'unknown'}`,
        request: () => fetch(`${API}/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next })
        }),
        reloadMessage: 'Đang tải lại danh sách sau khi đổi trạng thái...'
    });
}

async function deleteAcc(id) {
    if (!confirm('Xóa tài khoản này?')) return;

    selectedIds.delete(String(id));
    const account = rows.find(r => String(r.id) === String(id));

    await runSingleAction({
        title: 'Đang xóa tài khoản...',
        detail: account?.email || `ID ${id}`,
        request: () => fetch(`${API}/${id}`, { method: 'DELETE' }),
        reloadMessage: 'Đang tải lại danh sách sau khi xóa...'
    });
}

async function clearAll() {
    if (!rows.length || !confirm('Xóa tất cả?')) return;

    selectedIds.clear();
    await runBatchAction({
        title: 'Đang xóa toàn bộ tài khoản...',
        items: [...rows],
        request: row => fetch(`${API}/${row.id}`, { method: 'DELETE' }),
        detailBuilder: row => row.email || `ID ${row.id}`,
        reloadMessage: 'Đang tải lại danh sách sau khi xóa toàn bộ...'
    });
}

async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Xóa ${ids.length} tài khoản đã chọn?`)) return;

    const selectedRows = rows.filter(r => ids.includes(String(r.id)));
    selectedIds.clear();

    await runBatchAction({
        title: 'Đang xóa tài khoản đã chọn...',
        items: selectedRows,
        request: row => fetch(`${API}/${row.id}`, { method: 'DELETE' }),
        detailBuilder: row => row.email || `ID ${row.id}`,
        reloadMessage: 'Đang tải lại danh sách sau khi xóa lựa chọn...'
    });
}

async function deleteDieAccounts() {
    const dieRows = rows.filter(r => r.status === 'die');
    if (!dieRows.length) return;
    if (!confirm(`Xóa ${dieRows.length} tài khoản die?`)) return;

    dieRows.forEach(row => selectedIds.delete(String(row.id)));

    await runBatchAction({
        title: 'Đang xóa tài khoản die...',
        items: dieRows,
        request: row => fetch(`${API}/${row.id}`, { method: 'DELETE' }),
        detailBuilder: row => row.email || `ID ${row.id}`,
        reloadMessage: 'Đang tải lại danh sách sau khi xóa tài khoản die...'
    });
}

// ================== IMPORT XLSX ==================
function importFile(input) {
    const file = input.files[0];
    if (!file || isBusy) return;

    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = `Đang đọc file: <span class="file-badge">${esc(file.name)}</span>`;

    const reader = new FileReader();
    reader.onload = async e => {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const existingEmails = new Set(rows.map(r => normalizeEmail(r.email)).filter(Boolean));
        const uniqueRows = new Map();
        let replacedExisting = 0;
        let replacedInFile = 0;

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row.length) continue;

            const email = String(row[0] || '').trim();
            if (!email) continue;

            const normalizedEmail = normalizeEmail(email);
            const activeValue = String(row[6] || '').trim().toLowerCase();

            if (uniqueRows.has(normalizedEmail)) {
                replacedInFile++;
            } else if (existingEmails.has(normalizedEmail)) {
                replacedExisting++;
            }

            uniqueRows.set(normalizedEmail, {
                email,
                password: String(row[1] || '').trim(),
                cookie: String(row[2] || '').trim(),
                proxy: String(row[3] || '').trim(),
                provider: String(row[4] || '').trim(),
                status: String(row[5] || '').trim().toLowerCase(),
                active: activeValue === '' ? true : activeValue === 'true'
            });
        }

        const list = [...uniqueRows.values()];
        const replacedCount = replacedExisting + replacedInFile;

        if (!list.length) {
            fileInfo.textContent = 'Không có tài khoản hợp lệ để import';
            alert('File không có dữ liệu hợp lệ để import.');
            input.value = '';
            return;
        }

        const ok = await runBatchAction({
            title: 'Đang import tài khoản từ XLSX...',
            items: list,
            request: acc => fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(acc)
            }),
            detailBuilder: acc => acc.email || acc.provider || 'Tài khoản mới',
            onProgress: (index, total, acc) => {
                fileInfo.innerHTML = `Đang nhập <span class="file-badge">${index + 1}/${total}</span> • ${esc(acc.email || 'Tài khoản')}`;
            },
            reloadMessage: 'Đang tải lại danh sách sau khi import...'
        });

        if (!ok) {
            fileInfo.textContent = 'Import thất bại';
            input.value = '';
            return;
        }

        fileInfo.innerHTML = `Đã nhập <span class="file-badge">${list.length}</span> tài khoản${replacedCount ? `, thay mới ${replacedCount} email trùng` : ''}`;
        alert(`Import xong ${list.length} tài khoản${replacedCount ? `, thay mới ${replacedCount} email trùng` : ''}`);
        input.value = '';
    };

    reader.readAsBinaryString(file);
}

// ================== EXPORT ==================
function exportRowsToXLSX(dataRows, fileName, sheetName = 'Accounts') {
    if (!dataRows.length) return;

    const wsData = [
        ['email', 'password', 'cookie', 'proxy', 'provider', 'status', 'active'],
        ...dataRows.map(r => [
            r.email,
            r.password,
            r.cookie,
            r.proxy,
            r.provider,
            r.status,
            r.active ? 'true' : 'false'
        ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
}

function exportXLSX() {
    exportRowsToXLSX(rows, 'accounts.xlsx');
}

function exportDieXLSX() {
    const dieRows = rows.filter(r => r.status === 'die');
    if (!dieRows.length) {
        alert('Không có tài khoản die để tải.');
        return;
    }

    exportRowsToXLSX(dieRows, 'accounts-die.xlsx', 'DieAccounts');
}

// ================== INIT ==================
loadData();