const {
  runIngestPass
} = require("./ingest");
const {
  runExtractPass
} = require("./extract");
const {
  runBuildPass
} = require("./build");
const {
  runAnalyzePass
} = require("./analyze");
const {
  runReportPass
} = require("./report");

function runBuildPipeline(runtime) {
  const startedAt = new Date().toISOString();
  const ingest = runIngestPass(runtime);
  const extract = runExtractPass(runtime, ingest);
  const build = runBuildPass(runtime);
  const analyze = runAnalyzePass(runtime);
  const report = runReportPass(runtime);

  runtime.state.pipeline = {
    name: "ekg-build",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    stages: [ingest, extract, build, analyze, {
      name: report.name,
      status: report.status,
      message: report.message
    }]
  };

  return {
    stages: runtime.state.pipeline.stages,
    report
  };
}

module.exports = {
  runIngestPass,
  runExtractPass,
  runBuildPass,
  runAnalyzePass,
  runReportPass,
  runBuildPipeline
};
