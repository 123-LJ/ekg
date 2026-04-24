#!/usr/bin/env node

const { main } = require("../lib/commands");

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .catch((error) => {
    console.error(`[ekg] ${error.message}`);
    process.exitCode = 1;
    });
}

module.exports = require("../lib");
