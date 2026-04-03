const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const CDP = require("chrome-remote-interface");

const ProxyExtension = require("./ProxyExtension");
const findChrome = require("./findChrome");
const { projectPath } = require("../../config");

class ChromeLauncher {
    constructor() {
        this.debugPort = this.randomPort();
    }

    randomPort() {
        return Math.floor(10000 + Math.random() * 50000);
    }

    async getClient() {
        const targets = await CDP.List({ port: this.debugPort });
        const page = targets.find(t => t.url.includes("grok.com"));
        if (!page) return null;

        return await CDP({
            target: page,
            port: this.debugPort
        });
    }

    async getCookies() {
        const client = await this.getClient();
        if (!client) return null;

        const { Network } = client;
        await Network.enable();

        const { cookies } = await Network.getAllCookies();
        const grokCookies = cookies.filter(c => c.domain.includes("grok"));

        if (!grokCookies.length) return null;

        return grokCookies.map(c => `${c.name}=${c.value}`).join("; ");
    }

    async importCookie(cookieStr) {
        const client = await this.getClient();
        if (!client) return false;

        const { Network, Page } = client;

        await Network.enable();
        await Page.enable();

        try {
            // convert string → object
            const cookies = cookieStr.split(";").map(c => {
                const [name, ...rest] = c.trim().split("=");
                const value = rest.join("=");

                return {
                    name,
                    value,
                    domain: ".grok.com",
                    path: "/",
                    httpOnly: false,
                    secure: true
                };
            });

            // set cookie
            await Network.setCookies({ cookies });

            console.log("✅ Imported cookie vào browser");

            return true;
        } catch (err) {
            console.log("❌ Import cookie lỗi:", err.message);
            return false;
        }
    }

    async reload() {
        const client = await this.getClient();
        if (!client) return;

        const { Page } = client;
        await Page.enable();
        await Page.reload();
    }

    async checkLoginState() {
        const client = await this.getClient();
        if (!client) return null;

        const { Runtime } = client;

        const result = await Runtime.evaluate({
            expression: `
            (function(){
                const hasLoginForm = document.querySelector('input[type="password"]');
                const hasCookieInput = document.querySelector('#grok-cookie');
                const avatar = document.querySelector('div[data-sidebar*="footer"]');

                return {
                    hasLoginForm: !!hasLoginForm,
                    hasCookieInput: !!hasCookieInput,
                    isLoggedIn: !!avatar
                }
            })()
            `,
            returnByValue: true
        });

        return result.result.value;
    }

    async login(email, pass) {
        const client = await this.getClient();
        if (!client) return;

        const { Runtime } = client;

        const js = `
        (async function(){
            const emailInput = document.querySelector('input[type="email"]');
            const passInput = document.querySelector('input[type="password"]');
            const btn = document.querySelector('button[type="submit"]');

            if(emailInput && passInput){
                emailInput.value = '${email}';
                emailInput.dispatchEvent(new Event('input', { bubbles: true }));

                passInput.value = '${pass}';
                passInput.dispatchEvent(new Event('input', { bubbles: true }));

                if(btn) btn.click();
            }
        })()
        `;

        await Runtime.evaluate({ expression: js });
    }

    async handleFlow({ email, password, cookie }) {
        const state = await this.checkLoginState();

        if (!state) return;

        console.log("STATE:", state);

        // ✅ Đã login → lấy cookie
        if (state.isLoggedIn) {
            const ck = await this.getCookies();
            return ck;
        }

        // ✅ Có input cookie → import cookie
        if (state.hasCookieInput && cookie) {
            console.log("👉 Import cookie...");
            await this.importCookie(cookie);
            await this.reload();
            return;
        }

        // // ✅ Có form login → login
        // if (state.hasLoginForm && email && password) {
        //     console.log("👉 Login bằng email...");
        //     await this.login(email, password);
        //     return;
        // }

        console.log("❌ Không xác định được trạng thái");
    }

    open({ proxy, profile }) {
        return new Promise((resolve) => {
            const chromeBin = findChrome();
            if (!chromeBin) {
                return resolve({
                    success: false,
                    message: "Không tìm thấy Chrome"
                });
            }

            const safeProfile = (profile || "Default")
                .replace(/[^a-zA-Z0-9_-]/g, "_");

            const profileDir = path.join(
                projectPath,
                "profiles",
                safeProfile
            );

            fs.mkdirSync(profileDir, { recursive: true });

            const args = [
                `--user-data-dir=${profileDir}`,
                `--remote-debugging-port=${this.debugPort}`,
                "--no-first-run",
                "--no-default-browser-check",
                // 👇 set kích thước
                "--window-size=1200,800",
            ];

            if (proxy && proxy.includes("@")) {
                const extDir = path.join(profileDir, "proxy-ext");
                ProxyExtension.create(extDir, proxy);

                const url = new URL(proxy);

                args.push(
                    `--proxy-server=${url.protocol}//${url.hostname}:${url.port}`
                );

                args.push(`--load-extension=${extDir}`);
            } else if (proxy) {
                args.push(`--proxy-server=${proxy}`);
            }

            const child = spawn(chromeBin, args, {
                detached: true,
                stdio: "ignore"
            });

            child.unref();

            // ✅ LƯU PROCESS
            this.process = child;
            this.pid = child.pid;

            setTimeout(() => {
                resolve({
                    success: true,
                    message: `Chrome opened · port=${this.debugPort}`,
                    pid: this.pid
                });
            }, 2000);
        });
    }
    close() {
        try {
            if (!this.pid) {
                console.log("⚠️ Không có PID");
                return;
            }

            if (process.platform === "win32") {
                // ✅ Windows dùng taskkill
                spawn("taskkill", ["/PID", this.pid, "/T", "/F"]);
            } else {
                // ✅ Linux / macOS
                process.kill(-this.pid);
            }

            console.log("🛑 Chrome closed:", this.pid);
        } catch (err) {
            if (err.code === "ESRCH") {
                console.log("⚠️ Process đã chết trước đó");
            } else {
                console.log("❌ Lỗi khi đóng Chrome:", err.message);
            }
        }
    }
}

module.exports = ChromeLauncher;