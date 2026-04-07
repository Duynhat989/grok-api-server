const APIClientGrok = require('../src/modules/APIClientGrok');
const AccountStore = require('../src/services/AccountStore');
const ChromeLauncher = require('./chrome/ChromeLauncher');
const { getStringBase64 } = require('./data');
const grokDataStore = require('../src/services/GrokDataStore');



const delay = (ms) => new Promise(res => setTimeout(res, ms));

const chromeData = {
    version: "138.0.7204.184",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
}
const getNewCookie = async ({
    email,
    password,
    cookie,
    proxy,
    profile
}) => {

    const chrome = new ChromeLauncher();
    const coverProxy = (proxyBase) => {
        const parts = proxyBase.split(":")
        if (parts.length === 2) {
            const [ip, port] = parts
            return `http://${ip}:${port}`
        }

        if (parts.length === 4) {
            const [ip, port, user, pass] = parts
            console.log({
                ip, port, user, pass
            })
            return `http://${user}:${pass}@${ip}:${port}`
        }
        return null
    }
    // 1. mở browser
    const openRes = await chrome.open({ proxy: coverProxy(proxy), profile });

    if (!openRes.success) {
        return openRes;
    }

    console.log("🚀 Chrome started");

    let finalCookie = null;

    // 2. loop xử lý flow
    for (let i = 0; i < 20; i++) { // thử ~20 lần (~40-60s)
        try {
            const result = await chrome.handleFlow({
                email,
                password,
                cookie
            });

            // nếu handleFlow trả cookie
            if (result) {
                finalCookie = result;
                break;
            }

        } catch (err) {
            console.log("Flow error:", err.message);
            if (err.message.includes("connect ECONNREFUSED")) {
                return false
            }
        }

        await delay(10 * 1000);
    }

    // 3. fallback: thử get cookie lần cuối
    if (!finalCookie) {
        finalCookie = await chrome.getCookies();
    }
    chrome.close()
    const imageUrl = await getStringBase64()
    const grok = new APIClientGrok({
        MY_COOKIE: finalCookie,
        chromeVersion: chromeData.version,
        userAgent: chromeData.userAgent,
        proxyHttp: proxy
    });
    const isLive = await grok.isCheckLive({
        imageUrl
    })
    console.log(isLive)
    return {
        success: isLive,
        cookie: finalCookie,
        proxy
    }
};

const cookieLiveDie = async ({
    cookie,
    proxy
}) => {
    const imageUrl = await getStringBase64()
    const grok = new APIClientGrok({
        MY_COOKIE: cookie,
        chromeVersion: chromeData.version,
        userAgent: chromeData.userAgent,
        proxyHttp: proxy
    });
    const isLive = await grok.isCheckLive({
        imageUrl
    })
    console.log(isLive)
    if (isLive && JSON.stringify(isLive).includes("Unauthorized")) {
        console.log("---Unauthorized")
        // 
        return {
            success: false,
            details: "Unauthorized",
            cookie: cookie,
            proxy
        }
    }
    return {
        success: !!isLive?.success,
        cookie: cookie,
        proxy
    }
};
let dataGrok = []
function loadData() {
    dataGrok = grokDataStore.readAccounts();
    console.log("✅ Loaded data:", dataGrok.length, "accounts");
}
const CRON_JOB_REFRESH = async () => {
    const AUTO_REFRESH_COOKIE = process.env.AUTO_REFRESH_COOKIE
    if (AUTO_REFRESH_COOKIE !== "YES") {
        console.log("AUTO_REFRESH_COOKIE OFF")
        return
    }
    while (true) {
        // Xử lý lại dữ liệu
        loadData()
        console.log("🔄 Starting refresh cycle. Total accounts:", dataGrok.length)
        let rowIndex = 0
        for (const grokItem of dataGrok) {
            rowIndex++
            const latestItem = grokDataStore.getAccountById(grokItem.id);
            if (!latestItem) {
                console.log("Account deleted, skip:", `${rowIndex}/${dataGrok.length}`)
                await delay(50)
                continue
            }

            if (!AccountStore.has(latestItem.id) && latestItem.active === true) {
                console.log(`Checking cookie for account ${latestItem.id} (${rowIndex}/${dataGrok.length})...`);
                const isLive = await cookieLiveDie({
                    cookie: latestItem.cookie,
                    proxy: latestItem.proxy,
                })
                if (isLive && isLive?.success) {
                    AccountStore.add({
                        id: latestItem.id,
                        processing: 0,
                        done: 0,
                        cookie: isLive.cookie,
                        proxy: isLive.proxy
                    })

                    grokDataStore.updateAccountById(latestItem.id, {
                        cookie: isLive.cookie || latestItem.cookie,
                        proxy: isLive.proxy || latestItem.proxy,
                        status: 'live',
                        active: true
                    })

                    const list = AccountStore.list()
                    console.log(list.length)
                } else {
                    console.log("Cookie is dead, skip: ", `${rowIndex}/${dataGrok.length}`)
                    grokDataStore.updateAccountById(latestItem.id, {
                        active: false,
                        status: 'die'
                    })
                }
                await delay(100)
            }
        }
        await delay(20 * 1000)

    }
}

module.exports = {
    CRON_JOB_REFRESH
}