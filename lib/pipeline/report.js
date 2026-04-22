const {
  generateReport
} = require("../report");

function runReportPass(runtime) {
  return {
    name: "report",
    status: "ok",
    content: generateReport(runtime.index, runtime.state),
    message: "Generated markdown report content."
  };
}

module.exports = {
  runReportPass
};
