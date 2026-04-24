---
id: P001
type: paper
title: When Prompts Override Vision: Prompt-Induced Hallucinations in LVLMs
year: 2026
venue: arXiv
url: https://arxiv.org/html/2604.21911v1
doi: 
arxiv_id: 2604.21911v1
source: manual/web-analysis
status: ACTIVE
created_at: 2026-04-24T09:54:48.036Z
updated_at: 2026-04-24T09:54:48.036Z
authors:
  - Pegah Khayatan
  - Jayneel Parekh
  - Arnaud Dapogny
  - Mustafa Shukor
  - Alasdair Newson
  - Matthieu Cord
topics:
  - LVLM hallucination
  - multimodal grounding
  - prompt priors
  - vision-language models
keywords:
  - HalluScope
  - HalluVL-DPO
  - prompt-induced hallucinations
  - visual grounding
  - preference optimization
aliases:
  - When Prompts Override Vision: Prompt-Induced Hallucinations in LVLMs
  - LVLM hallucination
  - multimodal grounding
  - prompt priors
  - vision-language models
canonical_terms:
suggested_canonical_terms:
relations:
---

## Abstract

Despite impressive progress in capabilities of large vision-language models (LVLMs), these systems remain vulnerable to hallucinations, i.e., outputs that are not grounded in the visual input. Prior work has attributed hallucinations in LVLMs to factors such as limitations of the vision backbone or the dominance of the language component, yet the relative importance of these factors remains unclear. To resolve this ambiguity, the paper proposes HalluScope, a benchmark to better understand the extent to which different factors induce hallucinations, and finds that hallucinations largely stem from excessive reliance on textual priors and background knowledge, especially information introduced through textual instructions. To mitigate hallucinations induced by textual instruction priors, it proposes HalluVL-DPO, a framework for fine-tuning off-the-shelf LVLMs toward more visually grounded responses.

## Summary

This paper argues that many LVLM hallucinations are driven more by prompt and language priors than by weak visual perception.

## Findings

The main finding is that prompt presuppositions and textual priors can outweigh visual evidence in modern LVLMs. HalluScope shows that models often reject random absent objects but fail more often when a plausible absent object is presupposed in the question. HalluVL-DPO reduces this targeted failure mode through preference optimization on grounded versus hallucinated responses.

## Limitations

The method depends heavily on model-generated preference data, so data quality depends on the source LVLM. It also uses sentence-embedding distance as a proxy for semantic contrast, which is imperfect and can be influenced by answer length or phrasing.

## Notes

For EKG, this paper is a strong reminder that text context can override evidence. In system design terms, retrieval context, prompts, or compressed summaries should guide decisions but should not silently replace grounded evidence from source files, graph links, or reviewed records.
