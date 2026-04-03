const fs = require("fs");
const path = require("path");

const { projectPath } = require("../../config");


function findChrome() {
  // chrome bundled trong project
  const localChrome = path.join(projectPath, "resfresh/browser", "chrome.exe");

  if (fs.existsSync(localChrome)) {
    return localChrome;
  }
  return null
}

module.exports = findChrome;