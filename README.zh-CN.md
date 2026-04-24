---
name: ekg-readme-zh
description: EKG 中文总览与快速开始
type: overview
version: v2.0
created_at: 2026-04-21
updated_at: 2026-04-24
owner: Team Lead
status: active
---

# EKG（Experience Knowledge Graph）

EKG 是一个面向编码代理与工程协作的本地知识图谱工具。

它的目标不是替代代码搜索，而是在真正改代码之前，把已经验证过的工程经验、研究论文、项目上下文和待审查候选重新带回当前工作流，减少重复踩坑和重复试错。

## 当前阶段

当前项目可以视为 `Phase 2+ / Phase 3 preview`：

- Phase 1 已完成：基础经验记录、查询、解释、报告与 Hook 可用。
- Phase 2 大部分已完成：capture/review、SQLite 主存储、项目上下文、写锁保护、宿主安装、备份恢复与 stale-check 原型已落地。
- Phase 3 已有预览能力：图路径、Graph View、本地 Panel、论文层、survey、多语言 canonical retrieval 已可用。

## 你现在能用到什么

- 改代码前查询已有经验：`query` / `trace` / `explain`
- 记录正式经验：`add` / `review`
- 任务结束先生成候选：`capture-status` / `capture-accept` / `capture-dismiss`
- 查询和导入研究论文：`paper-query` / `paper-explain` / `paper-add` / `paper-import`
- 做方向联查：`survey`
- 做多语言概念规范化：`concept-suggest` / `concept-register`
- 管理项目上下文：`project-*`
- 查看本地面板：`panel`
- 导出和恢复备份：`backup-export` / `backup-import`

## 快速开始

```powershell
git clone https://github.com/123-LJ/ekg.git
cd ekg

# 安装到宿主
node scripts/install-host.js --host claude
node scripts/install-host.js --host codex
node scripts/install-host.js --host codex --codex-mode strong

# 基础使用
node scripts/ekg.js help
node scripts/ekg.js query "redirect"
node scripts/ekg.js paper-query "signin callback"
node scripts/ekg.js survey "agent memory"
node scripts/ekg.js panel
```

## 推荐工作流

1. 进入项目后先执行 `project-use` 或 `project-register`。
2. 改代码前先 `query`，必要时看 `trace`。
3. 做新方向前先 `paper-query` 或 `survey`。
4. 任务结束后先生成并审查 capture candidate，不要直接把自动抽取结果当成正式经验。
5. 周期性执行 `report`、`panel`、`backup-export`。

## 存储模型

当前正式主存储是 SQLite：

- 主存储：`ekg-out/ekg.sqlite`
- 导出索引：`ekg-out/ekg.json`
- 导出状态：`ekg-out/state.json`
- 导出报告：`ekg-out/reports/EKG_REPORT.md`
- Markdown 副本：`experiences/`、`papers/`

这意味着：

- 正式运行时以 SQLite 为准
- JSON/Markdown 继续用于兼容、审查、diff 和迁移

## 本地面板

生成静态面板：

```powershell
node scripts/ekg.js panel
```

直接打开：

```powershell
node scripts/ekg.js panel --open
```

本地服务模式：

```powershell
node scripts/ekg.js panel --serve --open
```

当前面板已包含：

- 总体统计
- 最近经验
- 最近论文
- 浏览器侧查询
- 详情抽屉
- 相关经验建议
- 图谱摘要与 Graph View
- 论文 topic / venue 统计
- 项目上下文
- 待审候选

## 文档索引

- [README.md](./README.md)
- [usage-guide.md](./usage-guide.md)
- [技术架构.md](./技术架构.md)
- [命令与数据模型.md](./命令与数据模型.md)
- [状态说明.md](./状态说明.md)
- [host-integration.md](./host-integration.md)
- [SKILL.md](./SKILL.md)

## 校验

```powershell
node tests/run.js
```
