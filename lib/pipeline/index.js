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

function buildPendingPipelineState(runtime, startedAt, stages) {
  runtime.state.pipeline = {
    name: "ekg-build",
    started_at: startedAt,
    finished_at: "",
    stages: [
      ...stages,
      {
        name: "report",
        status: "pending",
        message: "Report generation is deferred until core runtime data is saved."
      }
    ]
  };
}

function finalizePipelineState(runtime, stages, report, finishedAt) {
  runtime.state.pipeline = {
    name: "ekg-build",
    started_at: (runtime.state.pipeline || {}).started_at || finishedAt,
    finished_at: finishedAt,
    stages: [ ...stages, {
      name: report.name,
      status: report.status,
      message: report.message
    }]
  };
}

function markDerivedPipelineFailure(runtime, stages, error, finishedAt) {
  runtime.state.pipeline = {
    name: "ekg-build",
    started_at: (runtime.state.pipeline || {}).started_at || finishedAt,
    finished_at: finishedAt,
    stages: [ ...stages, {
      name: "report",
      status: "error",
      message: error.message || String(error)
    }]
  };
}

function runCorePipeline(runtime) {
  const startedAt = new Date().toISOString();
  const ingest = runIngestPass(runtime);
  const extract = runExtractPass(runtime, ingest);
  const build = runBuildPass(runtime);
  const analyze = runAnalyzePass(runtime);
  const stages = [ingest, extract, build, analyze];

  buildPendingPipelineState(runtime, startedAt, stages);

  return {
    started_at: startedAt,
    stages
  };
}

function runDerivedPipeline(runtime, coreResult = {}) {
  const stages = Array.isArray(coreResult.stages) ? coreResult.stages : [];
  const report = runReportPass(runtime);
  const finishedAt = new Date().toISOString();
  finalizePipelineState(runtime, stages, report, finishedAt);

  return {
    stages: runtime.state.pipeline.stages,
    report
  };
}

function runBuildPipeline(runtime) {
  const coreResult = runCorePipeline(runtime);
  return runDerivedPipeline(runtime, coreResult);
}

module.exports = {
  runIngestPass,
  runExtractPass,
  runBuildPass,
  runAnalyzePass,
  runReportPass,
  runCorePipeline,
  runDerivedPipeline,
  markDerivedPipelineFailure,
  runBuildPipeline
};
