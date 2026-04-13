const GrokClient = require("./grok.js");
const { randomUUID, randomBytes } = require("crypto");
class APIClientGrok {
    constructor({
        MY_COOKIE,
        chromeVersion,
        userAgent,
        proxyHttp
    } = {}) {
        try {
            this.client = new GrokClient({
                cookie: MY_COOKIE,
                temporary: true,
                chromeVersion,
                userAgent,
                proxyHttp
            });
        } catch (err) {
            console.error("❌ Init GrokClient failed:", err);
            throw err;
        }
    }
    async isCheckLive({
        imageUrl
    }) {
        try {
            let url = await this.client.uploadFile(imageUrl);
            if (!url?.fileUri) {
                return {
                    success: false,
                    error: "uploadFile failed",
                    details: JSON.stringify(url)
                }
            }
            const fileUri = `https://assets.grok.com/${url?.fileUri}`
            return {
                success: true,
                fileUri: fileUri
            }
        } catch (error) {
            console.error("❌ isCheckLive error:", error);
            return {
                success: false,
                error: error.message
            }
        }
    }
    async isCheckError(result = {}) {
        let jsonData = ""
        try {
            jsonData = JSON.parse(result)
        } catch (error) { 
            jsonData = result;
        }
        if (jsonData.status === 429) {
            return false
        }
        return true
    }
    async _2imageToVideo({
        imageUrls = [],
        promptText = "into a video",
        aspectRatio = "9:16",
        videoLength = 6,
        resolutionName = "480p",
    }) {
        // Implementation for _2imageToVideo
        let result
        try {
            const imageReferences = [];
            for (const imageUrl of imageUrls) {
                try {
                    const url = await this.client.uploadFile(imageUrl);
                    if (!url?.fileUri) {
                        return {
                            success: false,
                            error: JSON.stringify(url),
                            result: "uploadFile failed"
                        }
                    }
                    const fileUri = `https://assets.grok.com/${url?.fileUri}`
                    if (fileUri) imageReferences.push(fileUri);
                } catch (err) {
                    console.error("❌ Upload image failed:", err);
                }
            }
            console.log(imageReferences)

            const posts = await this.client.createPostVideoId(promptText);
            const parentPostId = posts?.post?.id;
            if (!parentPostId) {
                return {
                    success: false,
                    error: "createPostVideoId failed: parentPostId missing"
                }
            }
            result = await this.client._2imageToVideo({
                imageReferences,
                parentPostId,
                promptText: `${imageReferences.join(" ")} ${promptText}`,
                aspectRatio,
                videoLength,
                resolutionName
            });
            const isError = await this.isCheckError(result)
            if (!isError) {
                return {
                    success: false,
                    error: "Error response received from Grok API",
                    result
                }
            }
            try {
                const events = result
                    .trim()
                    .split("\n")
                    .map(line => JSON.parse(line));
                const videos = events.flatMap(e => {
                    const r = e?.result?.response;
                    if (!r) return [];

                    const v = r.streamingVideoGenerationResponse;

                    if (v?.videoUrl && v.progress === 100) {
                        return ["https://assets.grok.com/" + v.videoUrl];
                    }

                    return [];
                });

                return {
                    success: true,
                    videos,
                    result: videos.length > 0 ? videos : result
                };

            } catch (parseErr) {
                console.error("❌ Parse _2imageToVideo result failed:", parseErr);
                return {
                    success: false,
                    error: JSON.stringify(parseErr),
                    result
                }
            }
        } catch (error) {
            console.error("❌ _2imageToVideo error:", error);
            return {
                success: false,
                error: error?.message || JSON.stringify(error),
                result
            };

        }
        finally {
            // Clean up any temporary files if needed
            result = null; // Clear result from memory
        }

    }

    async generateImage({
        promptText = "",
        imageUrls = [],
        aspectRatio = "16:9",
        numImages = 4
    }) {
        let imgResult
        try {
            const imageReferences = [];
            for (const imageUrl of imageUrls) {
                try {
                    const url = await this.client.uploadFile(imageUrl);
                    const fileUri = `https://assets.grok.com/${url?.fileUri}`
                    if (fileUri) imageReferences.push(fileUri);
                } catch (err) {
                    console.error("❌ Upload image failed:", err);
                }
            }
            console.log(imageReferences)
            const posts = await this.client.createPostId(promptText);
            const parentPostId = posts?.post?.id;
            if (!parentPostId) {
                throw new Error("createPostId failed: parentPostId missing");
            }


            imgResult = await this.client.generateImage({
                imageReferences,
                parentPostId,
                promptText,
                numImages,
                aspectRatio
            });

            const isError = await this.isCheckError(imgResult)
            if (!isError) {
                return {
                    success: false,
                    error: "Error response received from Grok API Image Generation",
                    result: imgResult
                }
            }
            try {
                const events = imgResult
                    .trim()
                    .split("\n")
                    .map(line => JSON.parse(line));

                const images = events
                    .flatMap(e => {
                        const r = e?.result?.response;
                        if (!r) return [];

                        if (r.modelResponse?.generatedImageUrls)
                            return r.modelResponse.generatedImageUrls;

                        if (
                            r.streamingImageGenerationResponse?.imageUrl &&
                            !r.streamingImageGenerationResponse.imageUrl.includes("-part-")
                        ) {
                            return [r.streamingImageGenerationResponse.imageUrl];
                        }

                        return [];
                    })
                    .map(u => "https://assets.grok.com/" + u);

                const uniqueImages = [...new Set(images)];
                return uniqueImages;

            } catch (parseErr) {
                console.error("❌ Parse image result failed:", parseErr);
                return {
                    success: false,
                    error: JSON.stringify(parseErr),
                    result: imgResult
                };
            }

        } catch (err) {
            console.error("❌ generateImage error:", err);
            return {
                success: false,
                error: err?.message || JSON.stringify(err),
                result: imgResult
            };
        }
        finally {
            // Clean up any temporary files if needed
            imgResult = null; // Clear result from memory
        }

    }

    async generateVideo({
        promptText = "",
        imageUrl = "",
        aspectRatio = "9:16",
        videoLength = 6,
        resolutionName = "480p",
    }) {
        let result
        try {
            let parentPostId = ''
            let url = undefined
            let fileId = undefined
            if (imageUrl && imageUrl.length > 4) {
                url = await this.client.uploadFile(imageUrl);
                console.log(url)
                if (!url?.fileUri) {
                    return {
                        success: false,
                        error: JSON.stringify(url),
                        result: "uploadFile failed"
                    }
                }
                const fileUri = `https://assets.grok.com/${url?.fileUri}`
                url = fileUri
                const imgs = await this.client.createImageId(url);
                parentPostId = imgs?.post?.id;

                if (!parentPostId) {
                    return {
                        success: false,
                        error: "createImageId failed: parentPostId missing"
                    }
                }
                const fileIdMatch = url.match(/users\/[^/]+\/([^/]+)/);
                if (!fileIdMatch) {
                    return {
                        success: false,
                        error: "fileId parse failed"
                    }
                }

                fileId = fileIdMatch[1];

            } else {
                const posts = await this.client.createPostVideoId(promptText);
                parentPostId = posts?.post?.id;
            }

            result = await this.client.generateVideo({
                fileId,
                promptText: `${url || ''} ${promptText}`,
                aspectRatio,
                videoLength,
                resolutionName,
                parentPostId
            });
            
            const isError = await this.isCheckError(result)
            if (!isError) {
                return {
                    success: false,
                    error: "Error response received from Video API",
                    result
                }
            }
            try {
                const events = result
                    .trim()
                    .split("\n")
                    .map(line => JSON.parse(line));

                const videos = events.flatMap(e => {
                    const r = e?.result?.response;
                    if (!r) return [];

                    const v = r.streamingVideoGenerationResponse;

                    if (v?.videoUrl && v.progress === 100) {
                        return ["https://assets.grok.com/" + v.videoUrl];
                    }
                    return [];
                });

                return {
                    success: true,
                    videos,
                    result: videos.length > 0 ? videos : result
                };

            } catch (parseErr) {
                console.error("❌ Parse video result failed:", parseErr);
                return {
                    success: false,
                    error: JSON.stringify(parseErr),
                    result
                }
            }

        } catch (err) {
            return {
                success: false,
                error: JSON.stringify(err),
                result: result
            }
        }
    }

    async downloadAsset(assetUrl, type = "img") {
        try {
            let ext = type !== "img" ? "mp4" : "jpg";
            const uuid = randomUUID();

            await this.client.downloadVideo(assetUrl, `./storages/geminigen_${uuid}.${ext}`);

            return `geminigen_${uuid}.${ext}`;

        } catch (err) {
            console.error("❌ downloadAsset error:", assetUrl, err);
            return null;
        }
    }
}

module.exports = APIClientGrok