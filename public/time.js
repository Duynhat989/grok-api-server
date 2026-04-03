
let rows = [];


const DOMAIN = "http://localhost:2053/";
const API = `${DOMAIN}api/manager/accounts`;

// ================== FETCH DATA ==================
async function loadData() {
    try {
        const res = await fetch(API);
        rows = await res.json();
        render();
    } catch (e) {
        console.error("Load error:", e);
    }
}

// ================== RENDER ==================
function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortText(s, max) {
    s = String(s || '');
    return s.length <= max ? esc(s) : `<span title="${esc(s)}">${esc(s.slice(0, max))}…</span>`;
}

function render() {
    const tbody = document.getElementById('tbody');
    const n = rows.length;

    document.getElementById('count-label').textContent = n + ' tài khoản';
    document.getElementById('btn-export').disabled = n === 0;
    document.getElementById('btn-clear').disabled = n === 0;

    if (!n) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">Không có dữ liệu</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r, i) => {
        const isLive = r.status === 'live';
        const isDie = r.status === 'die';

        const badgeCls = isLive ? 'badge-live' : isDie ? 'badge-die' : 'badge-unknown';
        const badgeTxt = isLive ? '🟢 Live' : isDie ? '🔴 Die' : '⚪';

        return `
            <tr class="${isDie ? 'row-die' : ''}">
                <td>${i + 1}</td>
                <td class="email-cell">${esc(r.email)}</td>
                <td>${esc(r.password)}</td>
                <td class="cookie-cell">${shortText(r.cookie, 80)}</td>
                <td>${esc(r.proxy)}</td>
                <td>${esc(r.provider)}</td>

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
                    <button class="btn-del" onclick="deleteAcc('${r.id}')">✕</button>
                </td>
            </tr>
            `;
    }).join('');
}

// ================== ACTION ==================

async function toggleActive(id, val) {
    await fetch(`${API}/${id}/active`, {
        method: "PATCH"
    });
    loadData();
}

async function changeStatus(id, current) {
    let next = current === 'live' ? 'die' : current === 'die' ? '' : 'live';

    await fetch(`${API}/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
    });

    loadData();
}

async function deleteAcc(id) {
    if (!confirm("Xóa tài khoản này?")) return;

    await fetch(`${API}/${id}`, {
        method: "DELETE"
    });

    loadData();
}

async function clearAll() {
    if (!confirm("Xóa tất cả?")) return;

    for (let r of rows) {
        await fetch(`${API}/${r.id}`, { method: "DELETE" });
    }

    loadData();
}

// ================== IMPORT XLSX ==================

function importFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        let list = [];

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row.length) continue;

            list.push({
                email: row[0],
                password: row[1],
                cookie: row[2],
                proxy: row[3],
                provider: row[4],
                status: row[5] || '',
                active: String(row[6]).toLowerCase() === 'true'
            });
        }

        // gửi từng account lên server
        for (let acc of list) {
            await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(acc)
            });
        }

        alert("Import xong " + list.length + " tài khoản");
        loadData();
    };

    reader.readAsBinaryString(file);
}

// ================== EXPORT ==================

function exportXLSX() {
    if (!rows.length) return;

    const wsData = [
        ['email', 'password', 'cookie', 'proxy', 'provider', 'status', 'active'],
        ...rows.map(r => [
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
    XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
    XLSX.writeFile(wb, 'accounts.xlsx');
}

// ================== INIT ==================
loadData();