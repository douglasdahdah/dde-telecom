"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|cjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
for (const dir of ["src", "public", "scripts", "test"])
  walk(path.join(__dirname, "..", dir));
console.log("Sintaxe de todos os JavaScripts verificada.");
