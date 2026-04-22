const {
  getExperiences
} = require("../model");
const {
  normalizeText,
  tokenize,
  tokenizeTargetFile,
  unique
} = require("../core/utils");

function scoreExperience(experience, query) {
  const reasons = [];
  let score = 0;
  let direct = false;

  const mode = query.mode || "text";
  const targetFileTokens = mode === "hook"
    ? tokenizeTargetFile(query.targetFile || "")
    : tokenize(query.targetFile || "");
  const queryTokens = mode === "hook"
    ? unique([...(query.tokens || []), ...targetFileTokens])
    : unique([...(query.tokens || []), ...tokenize(query.text || ""), ...targetFileTokens]);
  const targetFile = normalizeText(query.targetFile || "");
  const anchorFiles = (((experience.anchors || {}).files) || []).map(normalizeText);
  const concepts = (((experience.anchors || {}).concepts) || []).map(normalizeText);

  if (targetFile) {
    anchorFiles.forEach((file) => {
      if (!file) {
        return;
      }

      if (targetFile.endsWith(file) || file.endsWith(targetFile)) {
        score += 12;
        direct = true;
        reasons.push(`direct file anchor: ${file}`);
      } else {
        const targetSegments = targetFile.split("/");
        const fileSegments = file.split("/");
        const sharedSegments = targetSegments.filter((segment) => fileSegments.includes(segment));
        if (sharedSegments.length >= 2) {
          score += 6;
          reasons.push(`shared path segments: ${sharedSegments.join(", ")}`);
        }
      }
    });
  }

  const searchableParts = mode === "hook"
    ? [
        experience.title,
        ...anchorFiles,
        ...concepts
      ]
    : [
        experience.title,
        experience.problem,
        experience.solution,
        experience.root_cause,
        ...(experience.tags || []),
        ...(experience.techs || []),
        ...anchorFiles,
        ...concepts
      ];
  const searchableText = normalizeText(searchableParts.join(" "));

  queryTokens.forEach((token) => {
    if (!token || token.length < 2) {
      return;
    }

    if (searchableText.includes(token)) {
      score += mode === "hook" ? 1 : 2;
      reasons.push(`text token: ${token}`);
    }

    if ((experience.tags || []).some((tag) => normalizeText(tag) === token)) {
      score += 3;
      reasons.push(`tag match: ${token}`);
    }

    if (mode !== "hook" && (experience.techs || []).some((tech) => normalizeText(tech) === token)) {
      score += 3;
      reasons.push(`tech match: ${token}`);
    }

    if (concepts.some((concept) => concept.includes(token))) {
      score += mode === "hook" ? 4 : 2;
      reasons.push(`concept match: ${token}`);
    }
  });

  return {
    experience,
    score,
    direct,
    reasons: unique(reasons)
  };
}

function queryExperiences(index, query, limit = 5) {
  const minScore = query.minScore || 1;
  return getExperiences(index)
    .filter((experience) => experience.status !== "ARCHIVED")
    .map((experience) => scoreExperience(experience, query))
    .filter((match) => match.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

module.exports = {
  scoreExperience,
  queryExperiences
};
