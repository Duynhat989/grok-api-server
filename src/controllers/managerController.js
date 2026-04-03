const fs = require('fs');
const path = require('path');
const DATA_PATH = path.join(__dirname, '../../data/data.json');

// Biến global chứa dữ liệu
let dataGrok = [];

// ===== LOAD DATA KHI START =====
function loadData() {
    try {
        if (!fs.existsSync(DATA_PATH)) {
            fs.writeFileSync(DATA_PATH, JSON.stringify([]));
        }
        const raw = fs.readFileSync(DATA_PATH);
        dataGrok = JSON.parse(raw);
        console.log("✅ Loaded data:", dataGrok.length, "accounts");
    } catch (err) {
        console.error("❌ Load data error:", err);
        dataGrok = [];
    }
}

// ===== SAVE DATA =====
function saveData() {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(dataGrok, null, 2));
    } catch (err) {
        console.error("❌ Save data error:", err);
    }
}

// ===== AUTO SAVE MỖI 10 GIÂY =====
setInterval(() => {
    saveData();
}, 10000);

// ===== ADD ACCOUNT =====
function addAccount(data) {
    const newAcc = {
        id: Date.now(),
        email: data.email || "",
        password: data.password || "",
        cookie: data.cookie || "",
        proxy: data.proxy || "",
        provider: data.provider || "grok",
        status: "live",
        active: true
    };

    dataGrok.push(newAcc);
    return newAcc;
}

// ===== UPDATE ACCOUNT =====
function updateAccount(id, newData) {
    const index = dataGrok.findIndex(acc => acc.id == id);
    if (index === -1) return null;

    dataGrok[index] = {
        ...dataGrok[index],
        ...newData
    };

    return dataGrok[index];
}

// ===== DELETE ACCOUNT =====
function deleteAccount(id) {
    const index = dataGrok.findIndex(acc => acc.id == id);
    if (index === -1) return false;

    dataGrok.splice(index, 1);
    return true;
}

// ===== GET ALL =====
function getAllAccounts() {
    return dataGrok;
}

// ===== TOGGLE ACTIVE =====
function toggleActive(id) {
    const acc = dataGrok.find(a => a.id == id);
    if (!acc) return null;

    acc.active = !acc.active;
    return acc;
}

// ===== SET LIVE/DIE =====
function setStatus(id, status) {
    const acc = dataGrok.find(a => a.id == id);
    if (!acc) return null;

    acc.status = status; // "live" | "die"
    return acc;
}
loadData()
// ===== EXPORT =====
module.exports = {
    loadData,
    getAllAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    toggleActive,
    setStatus
};