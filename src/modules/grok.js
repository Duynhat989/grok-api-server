const { randomUUID, randomBytes } = require("crypto");
const fs = require("fs");
const https = require("https");
const axios = require("axios");
const fetch = require("node-fetch");
const { HttpsProxyAgent } = require("https-proxy-agent");

function randHex(b) { return randomBytes(b).toString("hex") }
function randAlpha(l) { const c = "abcdefghijklmnopqrstuvwxyz"; return Array.from({ length: l }, () => c[Math.floor(Math.random() * c.length)]).join("") }
function randAlphaNum(l) { const c = "abcdefghijklmnopqrstuvwxyz0123456789"; return Array.from({ length: l }, () => c[Math.floor(Math.random() * c.length)]).join("") }

function genStatsigId() {
  let m
  if (Math.random() < 0.5) {
    const r = randAlphaNum(5)
    m = `e:TypeError: Cannot read properties of null (reading 'children['${r}']')`
  } else {
    const r = randAlpha(10)
    m = `e:TypeError: Cannot read properties of undefined (reading '${r}')`
  }
  return Buffer.from(m).toString("base64")
}

const SENTRY_RELEASE = "56fa4175825f69da4abcd79ba7749a0cfe10cfd4"
const SENTRY_PUBLIC_KEY = "b311e0f2690c81f25e2c4cf6d4f7ce1c"
const SENTRY_ORG_ID = "4508179396558848"

// @param {string} [options.proxyHttp] - HTTP Proxy
//  proxyHttp
//  host:port:user:pass
//  host:port
function createProxyAgent(proxy) {
  if (!proxy) return null
  if (proxy.includes("http:")) {
    return new HttpsProxyAgent(proxy)
  }
  const parts = proxy.split(":")

  // ip:port
  if (parts.length === 2) {
    const [ip, port] = parts
    return new HttpsProxyAgent(`http://${ip}:${port}`)
  }

  // ip:port:user:pass
  if (parts.length === 4) {
    const [ip, port, user, pass] = parts
    return new HttpsProxyAgent(`http://${user}:${pass}@${ip}:${port}`)
  }

  return null
}
class GrokClient {
  constructor({
    cookie,
    temporary = true,
    chromeVersion = `146.0.7680.71`,
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    proxyHttp = ""
  }) {
    if (!cookie) throw new Error("cookie is required")
    this.cookie = cookie
    this.temporary = temporary
    this.baseUrl = "https://grok.com"


    this.chromeVersion = chromeVersion
    this.userAgent = userAgent
    this.proxyHttp = proxyHttp
    // console.log({
    //   cookie: this.cookie,
    //   chromeVersion: this.chromeVersion,
    //   userAgent: this.userAgent,
    //   proxyHttp: this.proxyHttp
    // })

    // API

  }

  _buildHeaders(extra = {}) {
    const sentryTraceId = randHex(16)
    const sentrySpanId = randHex(8)
    const traceId = randHex(16)
    const spanId = randHex(8)
    const sampleRand = Math.random().toFixed(16)

    return {
      accept: "*/*",
      "accept-language": "en,en-US;q=0.9,vi;q=0.8",
      baggage: [
        `sentry-environment=production`,
        `sentry-release=${SENTRY_RELEASE}`,
        `sentry-public_key=${SENTRY_PUBLIC_KEY}`,
        `sentry-trace_id=${sentryTraceId}`,
        `sentry-org_id=${SENTRY_ORG_ID}`,
        `sentry-sampled=false`,
        `sentry-sample_rand=${sampleRand}`,
        `sentry-sample_rate=0`
      ].join(","),
      "content-type": "application/json",
      Cookie: this.cookie,
      origin: this.baseUrl,
      priority: "u=1, i",
      referer: `${this.baseUrl}/imagine`,
      "sec-ch-ua": `"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="${this.chromeVersion}", "Chromium";v="${this.chromeVersion}"`,
      "sec-ch-ua-arch": '"x86"',
      "sec-ch-ua-bitness": '"64"',
      "sec-ch-ua-full-version": `"${this.chromeVersion}"`,
      "sec-ch-ua-full-version-list": `"Not:A-Brand";v="99.0.0.0", "Google Chrome";v="${this.chromeVersion}", "Chromium";v="${this.chromeVersion}"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-model": '""',
      "sec-ch-ua-platform": '"Windows"',
      "sec-ch-ua-platform-version": '"10.0.0"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sentry-trace": `${sentryTraceId}-${sentrySpanId}-0`,
      traceparent: `00-${traceId}-${spanId}-00`,
      "user-agent": this.userAgent,
      "x-statsig-id": genStatsigId(),
      "x-xai-request-id": randomUUID(),
      ...extra
    }
  }

  async _post(path, body) {
    const url = `${this.baseUrl}${path}`
    const headers = this._buildHeaders()

    try {
      const agent = createProxyAgent(this.proxyHttp)
      const res = await axios({
        method: "POST",
        url,
        headers,
        data: body,
        httpsAgent: agent,
        responseType: "stream"
      })

      let result = ""

      const decoder = new TextDecoder()

      for await (const chunk of res.data) {
        result += decoder.decode(chunk)
      }

      return result

    } catch (err) {

      if (err.response) {
        console.log({
          status: err.response.status,
          statusText: err.response.statusText
        })

        return {
          status: err.response.status,
          statusText: err.response.statusText
        }
      }

      throw err
    }
  }


  async __post(path, body) {
    const url = `${this.baseUrl}${path}`
    const headers = this._buildHeaders()

    let agent = null

    // PROXY 
    if (this.proxyHttp) {

      if (this.proxyHttp.includes("http:")) {
        agent = new HttpsProxyAgent(proxy)
      } else {

        // ip:port hoặc ip:port:user:pass
        const parts = this.proxyHttp.split(":")
        if (parts.length === 2) {
          const [ip, port] = parts
          agent = new HttpsProxyAgent(`http://${ip}:${port}`)
        }

        if (parts.length === 4) {
          const [ip, port, user, pass] = parts
          agent = new HttpsProxyAgent(`http://${user}:${pass}@${ip}:${port}`)
        }
      }
    }


    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      agent
    })

    if (!res.ok) {
      return {
        status: res.status,
        statusText: res.statusText
      }
    }
    const data = await res.text()
    return JSON.parse(data) || {}
  }
  async uploadFile(base64Content) {
    const cleanBase64 = base64Content.replace(/^data:image\/\w+;base64,/, "");
    const payload = {
      fileName: `upload_A${Date.now()}.jpg`,
      fileMimeType: "image/jpeg",
      content: cleanBase64,
      fileSource: "IMAGINE_SELF_UPLOAD_FILE_SOURCE"
    };

    return await this.__post("/rest/app-chat/upload-file", payload)
  }

  async createImageId(mediaUrl) {
    const payload = { "mediaType": "MEDIA_POST_TYPE_IMAGE", "mediaUrl": mediaUrl }
    return await this.__post("/rest/media/post/create", payload)
    // const headers = this._buildHeaders()
    // const r = await fetch(`${this.baseUrl}/rest/media/post/create`, {
    //   method: "POST",
    //   headers: headers,
    //   body: JSON.stringify(payload)
    // });

    // const res = await r.json();
    // if (!r.ok) throw new Error("Upload failed: " + JSON.stringify(res));
    // return res;
  }
  async createPostId(promptText) {
    const payload = { "mediaType": "MEDIA_POST_TYPE_IMAGE", "prompt": promptText }
    return await this.__post("/rest/media/post/create", payload)
    // const headers = this._buildHeaders()
    // const r = await fetch(`${this.baseUrl}/rest/media/post/create`, {
    //   method: "POST",
    //   headers: headers,
    //   body: JSON.stringify(payload)
    // });

    // const res = await r.json();
    // if (!r.ok) throw new Error("Upload failed: " + JSON.stringify(res));
    // return res;
  }
  async createPostVideoId(promptText) {
    const payload = { "mediaType": "MEDIA_POST_TYPE_VIDEO", "prompt": promptText }
    return await this.__post("/rest/media/post/create", payload)
    // const headers = this._buildHeaders()
    // const r = await fetch(`${this.baseUrl}/rest/media/post/create`, {
    //   method: "POST",
    //   headers: headers,
    //   body: JSON.stringify(payload)
    // });

    // const res = await r.json();
    // if (!r.ok) throw new Error("Upload failed: " + JSON.stringify(res));
    // return res;
  }
  async downloadVideo(videoUrl, outputPath) {
    if (!videoUrl) throw new Error("videoUrl is required")
    if (!videoUrl.startsWith("http")) videoUrl = `https://assets.grok.com/${videoUrl}`

    const headers = this._buildHeaders({ accept: "*/*" })
    const file = fs.createWriteStream(outputPath)

    return new Promise((resolve, reject) => {
      const req = https.get(videoUrl, { headers }, res => {
        if (res.statusCode !== 200) {
          reject(new Error("Download failed: " + res.statusCode))
          return
        }
        res.pipe(file)
        file.on("finish", () => file.close(() => resolve(outputPath)))
      })
      req.on("error", err => {
        fs.unlink(outputPath, () => { })
        reject(err)
      })
    })
  }

  async generateImage({
    promptText,
    numImages = 4,
    aspectRatio = "1:1",
    modelName = "imagine-image-edit",
    imageReferences = [],
    parentPostId = ""
  } = {}) {
    if (!promptText) throw new Error("prompt is required")
    const bodyJson = {
      "temporary": this.temporary,
      "modelName": modelName,
      "message": promptText,
      "enableImageGeneration": true,
      "returnImageBytes": false,
      "returnRawGrokInXaiRequest": false,
      "enableImageStreaming": true,
      "imageGenerationCount": numImages,
      "forceConcise": false,
      "toolOverrides": {
        "imageGen": true
      },
      "enableSideBySide": true,
      "sendFinalMetadata": true,
      "isReasoning": false,
      "disableTextFollowUps": true,
      "responseMetadata": {
        "modelConfigOverride": {
          "modelMap": {
            "imageEditModelConfig": {
              "imageReferences": imageReferences,
              "parentPostId": parentPostId
            },
            "imageEditModel": "imagine"
          }
        }
      },
      "disableMemory": false,
      "forceSideBySide": false
    }
    return this._post("/rest/app-chat/conversations/new", bodyJson)
  }

  async generateVideo({
    promptText,
    aspectRatio = "9:16",
    videoLength = 6,
    resolutionName = "480p",
    parentPostId = "",
    modelName = 'grok-3',
    fileId
  } = {}) {
    if (!promptText) throw new Error("prompt is required")

    const body = {
      temporary: this.temporary,
      modelName: modelName,
      message: promptText.trim(),
      fileAttachments: fileId ? [fileId] : [],
      toolOverrides: { videoGen: true },
      enableSideBySide: true,
      responseMetadata: {
        experiments: [],
        modelConfigOverride: {
          modelMap: {
            videoGenModelConfig: {
              parentPostId,
              aspectRatio,
              videoLength,
              resolutionName
            }
          }
        }
      }
    }
    return this._post("/rest/app-chat/conversations/new", body)
  }
  async generateAI({
    promptText,
    aspectRatio = "9:16",
    videoLength = 6,
    resolutionName = "480p",
    parentPostId = "",
    modelName = 'grok-3',
    fileId } = {}) {
    if (!promptText) throw new Error("prompt is required")

    const body = {
      temporary: this.temporary,
      modelName: modelName,
      message: promptText.trim(),
      fileAttachments: fileId ? [fileId] : [],
      toolOverrides: { videoGen: true },
      enableSideBySide: true,
      responseMetadata: {
        experiments: [],
        modelConfigOverride: {
          modelMap: {
            videoGenModelConfig: {
              parentPostId,
              aspectRatio,
              videoLength,
              resolutionName
            }
          }
        }
      }
    }
    return this._post("/rest/app-chat/conversations/new", body)
  }
  async chatAI({
    promptText,
    aspectRatio = "9:16",
    videoLength = 6,
    resolutionName = "480p",
    parentPostId = "",
    modelName = 'grok-3',
    fileIds = [] } = {}) {
    if (!promptText) throw new Error("prompt is required")

    const body = {
      "temporary": false,
      "message": "mô tả hifnha nrh này",
      "fileAttachments": fileIds,
      "imageAttachments": [],
      "disableSearch": false,
      "enableImageGeneration": true,
      "returnImageBytes": false,
      "returnRawGrokInXaiRequest": false,
      "enableImageStreaming": true,
      "imageGenerationCount": 2,
      "forceConcise": false,
      "toolOverrides": {},
      "enableSideBySide": true,
      "sendFinalMetadata": true,
      "isReasoning": false,
      "disableTextFollowUps": false,
      "responseMetadata": {},
      "disableMemory": false,
      "forceSideBySide": false,
      "modelMode": "MODEL_MODE_AUTO",
      "isAsyncChat": false,
      "disableSelfHarmShortCircuit": false,
      "deviceEnvInfo": {
        "darkModeEnabled": false,
        "devicePixelRatio": 1,
        "screenWidth": 1920,
        "screenHeight": 1080,
        "viewportWidth": 1065,
        "viewportHeight": 945
      },
      "enable420": false
    }
    return this._post("/rest/app-chat/conversations/new", body)
  }
}

module.exports = GrokClient