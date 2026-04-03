const fs = require("fs/promises");
const path = require("path");

const FOLDER_PATH = path.join(__dirname, "storages");
const EXPIRE_TIME = 30 * 60 * 1000; // 30 phút
const INTERVAL = 5 * 60 * 1000; // chạy mỗi 5 phút

async function cleanOldFiles() {
    try {
        const files = await fs.readdir(FOLDER_PATH);
        const now = Date.now();

        for (const file of files) {
            const filePath = path.join(FOLDER_PATH, file);

            try {
                const stats = await fs.stat(filePath);

                // ưu tiên dùng mtime (ổn định hơn birthtime)
                const fileTime = stats.mtimeMs;

                if (now - fileTime > EXPIRE_TIME) {
                    await fs.unlink(filePath);
                    console.log("🗑️ Deleted:", file);
                }

            } catch (err) {
                console.error("❌ File error:", file, err.message);
            }
        }

    } catch (err) {
        console.error("❌ Folder error:", err.message);
    }
}

// chạy ngay
cleanOldFiles();

// chạy lặp
setInterval(() => {
    cleanOldFiles();
}, INTERVAL);
require("./cleanStorage");
console.log("🚀 Cleaner started...");