const fs = require("fs");
const path = require("path");
const { projectPath } = require("../../config");

class AccountStore {
    constructor() {
        this.accounts = new Map();

        this.filePath = path.join(projectPath, "data/temp.json");

        // load khi start
        this.load();

        // autosave mỗi 5s
        this.startAutoSave();
    }

    /**
     * LOAD từ file
     */
    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                console.log("📂 Chưa có file temp.json");
                return;
            }

            const raw = fs.readFileSync(this.filePath, "utf-8");
            const data = JSON.parse(raw);

            for (const item of data) {
                this.accounts.set(item.id, {
                    ...item,
                    processing : 0,
                    done : 0,
                });
            }

            console.log("✅ Loaded accounts:", this.accounts.size);
        } catch (err) {
            console.log("❌ Load error:", err.message);
        }
    }

    /**
     * SAVE xuống file
     */
    save() {
        try {
            const data = Array.from(this.accounts.values());

            fs.writeFileSync(
                this.filePath,
                JSON.stringify(data, null, 2),
                "utf-8"
            );

            // console.log("💾 Saved accounts");
        } catch (err) {
            console.log("❌ Save error:", err.message);
        }
    }

    /**
     * Auto save mỗi 5s
     */
    startAutoSave() {
        setInterval(() => {
            this.save();
        }, 5000);
    }

    /**
     * Thêm item
     */
    add(item) {
        if (!item.id) return false;

        if (this.accounts.has(item.id)) {
            return false;
        }

        this.accounts.set(item.id, {
            id: item.id,
            processing: item.processing || 0,
            done: item.done || 0,
            cookie: item.cookie || "",
            proxy: item.proxy || ""
        });

        return true;
    }

    has(id) {
        return this.accounts.has(id);
    }

    remove(id) {
        return this.accounts.delete(id);
    }

    get(id) {
        return this.accounts.get(id);
    }

    getNext() {
        if (this.accounts.size === 0) return null;

        let best = null;

        for (const acc of this.accounts.values()) {
            if (acc.processing > 40) {
                continue;
            }
            if (!best) {
                best = acc;
                continue;
            }
            if (acc.processing < best.processing) {
                best = acc;
                continue;
            }

            if (
                acc.processing === best.processing &&
                acc.done < best.done
            ) {
                best = acc;
            }
        }

        return best;
    }

    incProcessing(id) {
        const acc = this.accounts.get(id);
        if (acc) acc.processing++;
    }

    incDone(id) {
        const acc = this.accounts.get(id);
        if (acc) acc.done++;
    }

    decProcessing(id) {
        const acc = this.accounts.get(id);
        if (acc && acc.processing > 0) acc.processing--;
    }

    list() {
        return Array.from(this.accounts.values());
    }
}

module.exports = new AccountStore();