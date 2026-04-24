---
name: ekg-skill
description: EKG 技能说明，面向代理在项目中查询、记录、审查和复用经验与论文知识
type: skill
version: v2.0
created_at: 2026-04-21
updated_at: 2026-04-24
owner: Team Lead / Architect
status: active
---

# EKG Skill

## 1. 这个 skill 是做什么的

EKG（Experience Knowledge Graph）用于管理“编码过程中产生的已验证经验”和“与实现方向相关的研究论文”。

它不负责描述代码结构本身，而是负责回答这些问题：

- 这个问题以前踩过吗
- 当时为什么出错
- 最后哪种解法验证有效
- 这个方向有没有相关研究论文或历史实现经验

## 2. 适用场景

在下面这些场景里优先使用 EKG：

1. 改一个已知热点文件、功能区或 bug 区域之前
2. 一次修复已经验证完成，准备沉淀经验时
3. 想了解某个方向是否已有论文或实现经验时
4. 多 agent 协作，需要共享项目记忆时

## 3. 标准工作流

### 3.1 修改前先查询

```powershell
cd C:/Users/Administrator/Desktop/skill/tools/ekg
node scripts/ekg.js query "<keyword-or-file>"
```

如果是在新方向探索阶段，再补一轮：

```powershell
node scripts/ekg.js paper-query "<topic>"
node scripts/ekg.js survey "<topic>"
```

### 3.2 验证后再沉淀

不要把未确认结论直接写成正式经验。

优先生成 capture candidate：

```powershell
cd C:/Users/Administrator/Desktop/skill/tools/ekg
node hooks/task-complete.js --task "<task>" --summary "<verified result>" --file <changed-file>
node scripts/ekg.js capture-status
node scripts/ekg.js capture-accept C001 --confirm
```

如果是噪声候选：

```powershell
node scripts/ekg.js capture-dismiss C001
```

## 4. 关键命令

### 4.1 经验层

- `node scripts/ekg.js query "<keyword>"`
- `node scripts/ekg.js trace "<keyword>"`
- `node scripts/ekg.js explain <node>`
- `node scripts/ekg.js add --title "..." --problem "..." --solution "..."`
- `node scripts/ekg.js review`

### 4.2 论文层

- `node scripts/ekg.js paper-query "<keyword>"`
- `node scripts/ekg.js paper-explain <paper>`
- `node scripts/ekg.js paper-add ...`
- `node scripts/ekg.js paper-import --source openalex --query "<keyword>"`
- `node scripts/ekg.js survey "<topic>"`

### 4.3 概念规范化

- `node scripts/ekg.js concept-suggest "<text>"`
- `node scripts/ekg.js concept-register --canonical <key> --alias "<text>"`

### 4.4 项目上下文

- `node scripts/ekg.js project-register --name "<name>" --root <path> --activate`
- `node scripts/ekg.js project-use <id>`
- `node scripts/ekg.js project-status`
- `node scripts/ekg.js project-resolve <file-or-path>`

### 4.5 导出与运行态

- `node scripts/ekg.js report`
- `node scripts/ekg.js panel`
- `node scripts/ekg.js panel --serve --open`
- `node scripts/ekg.js storage-status`
- `node scripts/ekg.js backup-export`

## 5. 数据原则

### 5.1 只记录高价值知识

优先记录：

- 已验证的 bug 修复
- 设计决策
- 可复用的工程模式
- 与方向选择强相关的论文

不要记录：

- 模糊猜测
- 未验证结论
- 纯过程噪声

### 5.2 正式知识与候选知识分离

- 正式知识：Experience / Paper
- 待审知识：Capture Candidate

只有经过 review/accept 的候选才应进入正式图谱。

### 5.3 不直接手改受管文件

不要直接编辑这些文件：

- `ekg-out/ekg.sqlite`
- `ekg.json`
- `state.json`

必须通过 CLI / runtime / hook 工作流来写入。

## 6. 与 Graphify 的关系

Graphify 更偏“代码结构和空间关系”。

EKG 更偏“工程经验和时间维度上的复用知识”。

两者互补，而不是替代关系：

- Graphify 回答“代码长什么样”
- EKG 回答“以前在这里踩过什么坑、做过什么决策”

## 7. 当前实现状态

EKG 当前已具备：

- SQLite 主存储
- JSON / Markdown 镜像
- 经验层查询、解释、审查
- 论文层查询、导入和联查
- multilingual canonical retrieval
- 项目上下文
- Claude / Codex 集成
- 本地 panel 与 graph view

仍在继续增强的方向：

- 更强的 stale 检测
- 经验演化链
- 更系统的研究工作流
- MCP / query server
