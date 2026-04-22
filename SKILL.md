# EKG — Experience Knowledge Graph

## 类型
tool

## 触发
- `/ekg` — 构建或更新经验知识图谱
- `/ekg query <关键词>` — 查询相关经验
- `/ekg path <节点A> <节点B>` — 查找两个概念之间的经验路径
- `/ekg explain <概念>` — 解释某个概念相关的所有经验
- `/ekg add <描述>` — 手动添加一条经验
- `/ekg review` — 审核待确认的经验（UNCERTAIN → CONFIRMED）

## 概述

EKG 是一个自进化的经验知识图谱系统。它不记录代码结构（那是 Graphify 的事），而是记录**写代码过程中积累的经验**——踩过的坑、发现的惯例、做出的设计决策。

核心目标：**让 AI 越用越聪明，减少重复探索的 token 消耗。**

## 与 Graphify 的关系

| | Graphify | EKG |
|---|---|---|
| 记录什么 | 代码结构（空间地图） | 开发经验（时间地图） |
| 数据来源 | 代码文件 | 对话、git log、手动添加 |
| 会成长吗 | 不会，要手动重建 | 会，每次交互都可能新增 |
| 解决什么问题 | "代码长什么样" | "之前踩过什么坑、为什么这样设计" |

两者互补，不替代。

## 相关文档

- `README.md` — 文档导航与当前阶段结论
- `需求文档.md` — 业务目标、范围、模块、验收标准
- `技术架构.md` — 选型、Pipeline、目录结构、Hook 与缓存策略
- `任务分解.md` — Phase 规划、Gate、执行顺序
- `命令与数据模型.md` — `/ekg` 命令面、节点/边模型、状态枚举与注入协议

## 核心原则

1. **只记高价值信息** — 踩坑记录、项目惯例、设计决策，不记废话
2. **能不花 token 就不花** — Pass 1 纯规则解析零成本，Pass 2 才用 LLM
3. **靠机制不靠自觉** — 用 Hook 强制注入，不依赖 AI 主动去查
4. **增量而非全量** — 缓存机制，不重复处理已知内容
5. **可移植** — 整个 ekg/ 目录独立，可复制到任何项目

## Pipeline

```
Pass 1: 结构化解析（零 LLM 成本）
  ├── 解析 git log / git diff → 识别改了什么模块
  ├── 解析 commit message → 识别 fix:/feat:/refactor:
  ├── 解析代码注释中的 WHY:/HACK:/NOTE: → 提取设计意图
  └── 判断是否需要触发 Pass 2

Pass 2: LLM 提取经验（按需触发）
  ├── 从对话/commit 中提取：问题、解法、根因
  ├── 打标签（tags）
  ├── 标注置信度（CONFIRMED / INFERRED / UNCERTAIN）
  └── 识别关联关系

Pass 3: 图构建 + 聚类
  ├── 合并到 NetworkX 图
  ├── Leiden 社区发现（按领域聚类）
  ├── 识别 hotspots（高频问题）
  └── 生成 EKG_REPORT.md + ekg.json + ekg.html
```

## 查询流程

```
收到任务
  → PreToolUse Hook 触发
  → Level 0: 无相关经验 → 静默
  → Level 1: 有相关经验 → 注入一句话摘要（~50 token）
  → Level 2: 用户主动查询或高置信度匹配 → 注入完整内容（200-400 token）
  → 执行任务
  → 任务完成后 → 评估是否值得记录 → 写入新经验
```

## 经验层级

- **L1 实例级** — 绑定具体项目，如 "bbs-web-pc 的 loginRedirect 死循环"
- **L2 模式级** — 绑定技术栈，如 "Vue beforeEach 守卫与重定向的循环问题"
- **L3 原则级** — 技术栈无关，如 "全局拦截逻辑要排除自身触发的路径"

写入时默认 L1，积累足够同类经验后可提炼为 L2/L3。跨项目移植时只带 L2+L3。

## 经验锚定

不使用行号（太容易变），使用语义锚点：

| 锚定方式 | 可靠性 | 示例 |
|---|---|---|
| 函数名/组件名 | 高 | `loginRedirect` |
| 文件路径 | 高 | `src/views/loginRedirect.vue` |
| commit hash | 高 | `59c3d1f` |
| 模块/目录 | 中 | `src/views/auth/` |
| 行号范围 | 低 | 避免使用 |

文件变更时通过 SHA256 对比检测 STALE 状态。
