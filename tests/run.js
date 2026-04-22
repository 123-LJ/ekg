const path = require("node:path");
const fs = require("node:fs");

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter((file) => file.endsWith(".test.js"))
  .sort();

let passed = 0;

for (const file of testFiles) {
  const fullPath = path.join(testsDir, file);
  try {
    require(fullPath)();
    console.log(`PASS ${file}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${file}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

console.log(`\n${passed}/${testFiles.length} tests passed`);
