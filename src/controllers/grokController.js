
const APIClientGrok = require("../modules/APIClientGrok");
const { randomUUID } = require("crypto");
const AccountStore = require("../services/AccountStore");
const { error } = require("console");
const TASK_MANAGERS = {};
const CONNECT_ERROR_COUNTS = new Map();
const RETRY = 40
const CONNECT_ERROR_LIMIT = 3

const increaseConnectErrorCount = (accountId) => {
    const key = String(accountId || '');
    const nextCount = (CONNECT_ERROR_COUNTS.get(key) || 0) + 1;
    CONNECT_ERROR_COUNTS.set(key, nextCount);
    return nextCount;
};

const resetConnectErrorCount = (accountId) => {
    if (!accountId) return;
    CONNECT_ERROR_COUNTS.delete(String(accountId));
};

const clearUuid = (uuid) => {
    console.log("TaskId: ", uuid)
    setTimeout(() => {
        delete TASK_MANAGERS[uuid];
    }, 25 * 60 * 1000);
};

const chromeData = {
    version: "138.0.7204.184",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const systemReport = {
    success: 0,
    error: 0,
    processing: 0
}
const generateVideo = async (req, res) => {
    try {
        const { promptText, imageUrls = [], videoLength, resolutionName, aspectRatio = "9:16" } = req.body;
        const taskId = randomUUID();
        TASK_MANAGERS[taskId] = {
            success: false,
            code: "pending",
            msg: "Video generation is in progress"
        };
        clearUuid(taskId);
        (async () => {
            // Xử lý logic tạo video ở đây
            for (let index = 0; index <= RETRY; index++) {
                if(!TASK_MANAGERS[taskId]){
                    return false
                }
                TASK_MANAGERS[taskId].step = index
                if (index == RETRY) {
                    TASK_MANAGERS[taskId] = {
                        success: false,
                        code: "error",
                        msg: "max retry"
                    };
                    systemReport.error++
                    console.log("Error: Max retry reached")
                    return false
                }

                systemReport.processing++

                const accNew = await AccountStore.getNext()
                try {
                    if (!accNew?.id) {
                        console.log("---NO ACCOUNT WAIT")
                        await delay(10 * 1000)
                        continue
                    }
                    console.log(accNew.id)
                    // Cộng thêm phần xử lý
                    AccountStore.incProcessing(accNew.id)
                    // Xử lý nội dung
                    const grok = new APIClientGrok({
                        MY_COOKIE: accNew?.cookie,
                        chromeVersion: chromeData.version,
                        userAgent: chromeData.userAgent,
                        proxyHttp: accNew.proxy
                    });
                    let resVideo = null
                    if (imageUrls && imageUrls.length > 1) {
                        resVideo = await grok._2imageToVideo({
                            imageUrls,
                            promptText,
                            aspectRatio,
                            videoLength: videoLength || 10,
                            resolutionName: resolutionName || "720p"
                        })
                    } else {
                        const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null
                        resVideo = await grok.generateVideo({
                            promptText,
                            imageUrl,
                            aspectRatio,
                            videoLength: videoLength || 10,
                            resolutionName: resolutionName || "720p"
                        });
                    }
                    const resVideoText = JSON.stringify(resVideo)
                    if (!resVideo.success) {
                        if (resVideoText.includes("ended before receiving CONNECT response")) {
                            const connectErrorCount = increaseConnectErrorCount(accNew.id)
                            console.log(`---receiving CONNECT (${connectErrorCount}/${CONNECT_ERROR_LIMIT})`)

                            if (connectErrorCount >= CONNECT_ERROR_LIMIT) {
                                console.log("---Remove acccount after consecutive CONNECT errors")
                                resetConnectErrorCount(accNew.id)
                                AccountStore.remove(accNew.id)
                            }
                            continue
                        }

                        resetConnectErrorCount(accNew.id)

                        if (resVideoText.includes("Too Many Requests")) {
                            console.log("---RETRY")
                            continue
                        }
                        if (resVideoText.includes("Unauthorized")) {
                            console.log("---Remove acccount")
                            AccountStore.remove(accNew.id)
                            continue
                        }
                        if (resVideoText.includes("Forbidden")) {
                            console.log("---Forbidden, remove acccount")
                            AccountStore.remove(accNew.id)
                            continue
                        }
                        if (resVideoText.includes("Proxy Authentication Required")) {
                            console.log("---Authentication Required")
                            AccountStore.remove(accNew.id)
                            continue
                        }
                        if (resVideoText.includes("reason: socket hang up")) {
                            console.log("---Hangup")
                            continue
                        }
                        if (resVideoText.includes("ECONNRESET")) {
                            console.log("---ECONNRESET")
                            continue
                        }
                        else {
                            TASK_MANAGERS[taskId] = {
                                success: false,
                                code: "error",
                                msg: resVideo.error,
                                data: resVideo?.result || `Video generation failed without specific error message`
                            };
                            console.log("Error: ", resVideo)
                            systemReport.error++
                            return false
                        }
                    } else {
                        resetConnectErrorCount(accNew.id)
                        const pathUrls = [];
                        for (const video of resVideo.videos) {

                            const file = await grok.downloadAsset(video, "mp4");

                            if (file) {
                                pathUrls.push(`http://${req.headers.host}/storages/${file}`);
                            }

                        }
                        console.log("Finish: ", pathUrls)
                        if (pathUrls.length > 0) {
                            TASK_MANAGERS[taskId] = {
                                success: true,
                                code: "success",
                                msg: "Video generated successfully",
                                data: pathUrls,
                                step: index
                            };
                            systemReport.success++
                        } else {
                            TASK_MANAGERS[taskId] = {
                                success: false,
                                code: "error",
                                msg: "Video generation failed",
                                data: resVideo?.result || `No video URL found in response`
                            };
                            console.log("Error: Video generation failed")
                            systemReport.error++
                        }
                        return false
                    }
                } catch (err) {
                    console.log(err)
                    const errText = JSON.stringify(err)
                    TASK_MANAGERS[taskId] = {
                        success: false,
                        code: "error",
                        msg: "Video generation error",
                        data:err?.message || errText 
                    };
                    console.error("generate-video error:", err);

                } finally {
                    console.log("---Clear---")
                    // Finish task
                    if (accNew && accNew?.id) {
                        setTimeout(() => {
                            AccountStore.decProcessing(accNew.id)
                            AccountStore.incDone(accNew.id)
                        }, 10 * 1000)
                    }
                    systemReport.processing--
                }
            }


        })();
        return res.json({
            success: true,
            taskId,
            msg: "Task created successfully"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });

    }
}

const generateImage = async (req, res) => {
    try {

        const { promptText, imageUrls, numImages } = req.body;

        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {

            return res.status(400).json({
                success: false,
                msg: "imageUrls must contain at least one image."
            });

        }

        const accNew = await AccountStore.getNext()
        const grok = new APIClientGrok({
            MY_COOKIE: accNew?.cookie,
            chromeVersion: chromeData.version,
            userAgent: chromeData.userAgent,
            proxyHttp: accNew.proxy
        });

        const taskId = randomUUID();
        TASK_MANAGERS[taskId] = {
            success: false,
            code: "pending",
            msg: "Image generation is in progress"
        };

        (async () => {
            let images
            try {

                images = await grok.generateImage({
                    promptText,
                    imageUrls,
                    numImages: numImages || 1
                });

                const pathUrls = [];

                for (const image of images) {

                    const file = await grok.downloadAsset(image);

                    if (file) {
                        pathUrls.push(`http://${req.headers.host}/storages/${file}`);
                    }

                }

                if (pathUrls.length > 0) {
                    TASK_MANAGERS[taskId] = {
                        success: true,
                        code: "success",
                        msg: "Images generated successfully",
                        data: pathUrls
                    };

                } else {
                    TASK_MANAGERS[taskId] = {
                        success: false,
                        code: "error",
                        msg: "Image generation failed",
                        data: images?.result || `No image URL found in response`
                    };

                }

            } catch (err) {
                TASK_MANAGERS[taskId] = {
                    success: false,
                    code: "error",
                    msg: "Image generation error",
                    error: err.message,
                    data: images || `No additional error information available`
                };

                console.error("generate-image error:", err);

            } finally {
                clearUuid(taskId);
            }

        })();

        res.json({
            success: true,
            taskId,
            msg: "Task created successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });

    }
}

const getTask = async (req, res) => {
    const taskId = req.query.taskId;

    if (!taskId) {

        return res.status(400).json({
            success: false,
            msg: "taskId is required"
        });

    }

    const task = TASK_MANAGERS[taskId];

    if (!task) {

        return res.status(404).json({
            success: false,
            msg: "Task not found"
        });

    }

    res.json({
        success: true,
        taskId,
        system: systemReport,
        ...task
    });
}


module.exports = {
    generateVideo,
    getTask,
    generateImage
}