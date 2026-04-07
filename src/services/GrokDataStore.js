const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/data.json');

function ensureDataFile() {
    const dirPath = path.dirname(DATA_PATH);

    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    if (!fs.existsSync(DATA_PATH)) {
        fs.writeFileSync(DATA_PATH, '[]', 'utf-8');
    }
}

function readAccounts() {
    try {
        ensureDataFile();
        const raw = fs.readFileSync(DATA_PATH, 'utf-8') || '[]';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('❌ Read data error:', err);
        return [];
    }
}

function writeAccounts(accounts) {
    try {
        ensureDataFile();
        const tempPath = `${DATA_PATH}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(accounts, null, 2), 'utf-8');
        fs.renameSync(tempPath, DATA_PATH);
        return true;
    } catch (err) {
        console.error('❌ Write data error:', err);
        return false;
    }
}

function findAccountIndex(accounts, id) {
    return accounts.findIndex(acc => String(acc.id) === String(id));
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeAccountPatch(data = {}) {
    const patch = { ...data };
    delete patch.id;

    if ('email' in patch) patch.email = String(patch.email || '').trim();
    if ('password' in patch) patch.password = String(patch.password || '').trim();
    if ('cookie' in patch) patch.cookie = String(patch.cookie || '').trim();
    if ('proxy' in patch) patch.proxy = String(patch.proxy || '').trim();
    if ('provider' in patch) patch.provider = String(patch.provider || '').trim();
    if ('status' in patch) patch.status = String(patch.status || '').trim().toLowerCase();
    if ('active' in patch) {
        patch.active = typeof patch.active === 'boolean'
            ? patch.active
            : String(patch.active || '').trim().toLowerCase() === 'true';
    }

    return patch;
}

function getAccountById(id) {
    const accounts = readAccounts();
    return accounts.find(acc => String(acc.id) === String(id)) || null;
}

function updateAccountById(id, updates) {
    const accounts = readAccounts();
    const index = findAccountIndex(accounts, id);

    if (index === -1) {
        return null;
    }

    const patchSource = typeof updates === 'function'
        ? updates({ ...accounts[index] })
        : updates;

    if (!patchSource || typeof patchSource !== 'object') {
        return accounts[index];
    }

    const patch = normalizeAccountPatch(patchSource);

    accounts[index] = {
        ...accounts[index],
        ...patch
    };

    writeAccounts(accounts);
    return accounts[index];
}

function deleteAccountById(id) {
    const accounts = readAccounts();
    const index = findAccountIndex(accounts, id);

    if (index === -1) {
        return false;
    }

    accounts.splice(index, 1);
    writeAccounts(accounts);
    return true;
}
function random5Digit() {
    return Math.floor(Math.random() * 90000) + 10000;
}

function generateUniqueAccountId(accounts = []) {
    const usedIds = new Set(accounts.map(acc => String(acc.id)));
    let attempt = 0;
    let id = '';

    do {
        attempt += 1;
        id = `${Date.now()}${random5Digit()}${attempt}`;
    } while (usedIds.has(String(id)));

    return id;
}

function addAccount(data) {
    const accounts = readAccounts();
    const normalized = normalizeAccountPatch(data);
    const normalizedEmail = normalizeEmail(normalized.email);

    const nextAccounts = normalizedEmail
        ? accounts.filter(acc => normalizeEmail(acc.email) !== normalizedEmail)
        : [...accounts];

    const replacedExisting = nextAccounts.length !== accounts.length;

    const newAcc = {
        id: generateUniqueAccountId(nextAccounts),
        email: normalized.email || '',
        password: normalized.password || '',
        cookie: normalized.cookie || '',
        proxy: normalized.proxy || '',
        provider: normalized.provider || 'grok',
        status: normalized.status || 'live',
        active: typeof normalized.active === 'boolean' ? normalized.active : true
    };

    nextAccounts.push(newAcc);
    writeAccounts(nextAccounts);

    return {
        ...newAcc,
        replacedExisting
    };
}

module.exports = {
    DATA_PATH,
    readAccounts,
    writeAccounts,
    getAccountById,
    updateAccountById,
    deleteAccountById,
    addAccount
};
