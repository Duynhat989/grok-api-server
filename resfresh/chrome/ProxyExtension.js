const fs = require("fs")
const path = require("path")

class ProxyExtension {

  static create(dir, proxy) {

    const url = new URL(proxy)

    const host = url.hostname
    const port = parseInt(url.port)
    const username = url.username
    const password = url.password

    const manifest = {
      manifest_version: 3,
      name: "Grok Helper + Proxy",
      version: "4.0",
      permissions: [
        "proxy",
        "storage",
        "tabs",
        "webRequest",
        "webRequestBlocking",
        "webRequestAuthProvider",
        "cookies"
      ],
      host_permissions: [
        "*://*.grok.com/*"
      ],
      background: {
        service_worker: "background.js"
      },
      content_scripts: [
        {
          matches: ["*://*.grok.com/*"],
          js: ["content.js"],
          run_at: "document_idle"
        }
      ]
    }

    const background = `

const config = {
  mode: "fixed_servers",
  rules: {
    singleProxy: {
      scheme: "http",
      host: "${host}",
      port: ${port}
    },
    bypassList: ["localhost"]
  }
}

chrome.runtime.onInstalled.addListener(() => {

  chrome.proxy.settings.set(
    { value: config, scope: "regular" },
    () => {}
  )

  chrome.tabs.create({
    url: "https://grok.com"
  })

})

chrome.webRequest.onAuthRequired.addListener(
  () => ({
    authCredentials: {
      username: "${username}",
      password: "${password}"
    }
  }),
  { urls: ["<all_urls>"] },
  ["blocking"]
)

function captureHeaders(details){

  const headers = details.requestHeaders || []

  let chromeVersion = ""
  let ua = ""

  for(const h of headers){

    const name = h.name.toLowerCase()

    if(name === "sec-ch-ua-full-version") chromeVersion = h.value
    if(name === "user-agent") ua = h.value

  }

  chrome.storage.local.set({
    chromeVersion,
    userAgent: ua
  })

}

chrome.webRequest.onBeforeSendHeaders.addListener(

  captureHeaders,

  {
    urls: ["*://*.grok.com/*"]
  },

  ["requestHeaders","extraHeaders"]

)

function getGrokCookies(){

  chrome.cookies.getAll(
    { domain: "grok.com" },
    (cookies)=>{

      if(!cookies || !cookies.length) return

      const cookieStr = cookies
        .map(c => c.name + "=" + c.value)
        .join("; ")

      chrome.storage.local.set({
        grokCookie: cookieStr
      })

    }
  )

}

setInterval(getGrokCookies,2000)
getGrokCookies()

`

    const content = `

function createPanel(){

  let box = document.getElementById("grok-helper")

  if(!box){

    box = document.createElement("div")

    box.id = "grok-helper"

    Object.assign(box.style,{
      position:"fixed",
      bottom:"20px",
      right:"20px",
      width:"480px",
      background:"#111",
      color:"#0f0",
      zIndex:"999999",
      padding:"10px",
      borderRadius:"8px",
      fontSize:"12px",
      fontFamily:"monospace"
    })

    box.innerHTML = \`

      <div style="font-weight:bold;margin-bottom:6px">
        Grok Helper
      </div>

      Chrome Version
      <input id="grok-version"
      style="width:100%;background:#000;color:#0f0;border:none;margin-bottom:6px"/>

      User Agent
      <textarea id="grok-ua"
      style="width:100%;height:50px;background:#000;color:#0f0;border:none;margin-bottom:6px"></textarea>

      Cookie
      <textarea id="grok-cookie"
      style="width:100%;height:150px;background:#000;color:#0f0;border:none"></textarea>

    \`

    document.body.appendChild(box)

  }

  return{
    version:document.getElementById("grok-version"),
    ua:document.getElementById("grok-ua"),
    cookie:document.getElementById("grok-cookie")
  }

}

function updatePanel(){

  const panel = createPanel()

  chrome.storage.local.get(
    ["grokCookie","chromeVersion","userAgent"],
    (data)=>{

      if(data.chromeVersion)
        panel.version.value = data.chromeVersion

      if(data.userAgent)
        panel.ua.value = data.userAgent
      else
        panel.ua.value = navigator.userAgent

      if(data.grokCookie)
        panel.cookie.value = data.grokCookie

    }
  )

}

setInterval(updatePanel,2000)
updatePanel()

`

    fs.mkdirSync(dir, { recursive: true })

    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    fs.writeFileSync(
      path.join(dir, "background.js"),
      background
    )

    fs.writeFileSync(
      path.join(dir, "content.js"),
      content
    )

  }

}

module.exports = ProxyExtension