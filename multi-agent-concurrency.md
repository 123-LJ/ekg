# EKG 多 Agent 接入与并发控制

## 1. 结论

可以。

当前这套 `EKG` 已经可以作为多个 agent 共享使用的本地知识库，但前提是所有 agent 都接入同一个 `tools/ekg` 目录，并且所有写操作都统一走 `scripts/ekg.js` 或其导出的加锁方法，不能绕过脚本直接改 `ekg.json`、`state.json` 和 `experiences/`。

## 2. 当前实现

### 2.1 共享读

以下命令是读操作，可以被多个 agent 并发执行：

- `node scripts/ekg.js stats`
- `node scripts/ekg.js query <keyword>`
- `node scripts/ekg.js explain <node>`
- `node scripts/ekg.js path <from> <to>`
- `node scripts/ekg.js lock-status`

读操作默认不加锁，目的是保证查询和 Hook 提示速度。

### 2.2 串行写

以下操作已经改为串行写入：

- `add`
- `review` 的状态变更
- `report` / `build`
- `hooks/pre-edit.js` 对 `state.json` 的更新

写入时会先申请 `tools/ekg/.ekg.lock` 文件锁，拿到锁后才会重新加载最新运行时并落盘。

## 3. 并发策略

### 3.1 锁文件

锁文件默认是：

```text
tools/ekg/.ekg.lock
```

锁元数据包含：

- `ownerToken`
- `pid`
- `reason`
- `writer`
- `acquiredAt`

其中 `writer` 用来标记当前写入者身份。

### 3.2 过期锁恢复

如果持锁进程异常退出，锁不会永久卡死。当前配置支持两种恢复：

- 超过 `staleLockMs` 自动视为陈旧锁
- 锁记录的 `pid` 已不存在时自动清理

相关配置在 [config.json](/C:/Users/Administrator/Desktop/skill/tools/ekg/config.json)：

- `concurrency.staleLockMs`
- `concurrency.retryIntervalMs`
- `concurrency.maxWaitMs`
- `concurrency.readRetryCount`
- `concurrency.readRetryIntervalMs`

### 3.3 读重试

为了减少某个 agent 正在写文件时另一个 agent 瞬时读到半截 JSON 的概率，`readJson()` 已加入短暂重试。

这解决的是“瞬时读失败”，不是“业务级冲突”。业务级冲突仍然靠写锁保证。

## 4. 多 Agent 接入规范

### 4.1 推荐接入方式

多个 agent 共用一个 EKG 时，统一约束如下：

- 共享同一个 `tools/ekg` 根目录
- 查询走 CLI 或只读 API
- 写入必须走 `mutateRuntime()` / `withWriteLock()`
- 禁止直接手写 `ekg.json`
- 禁止多个进程各自缓存整份运行时后再直接覆盖保存

### 4.2 写入者标识

为了追踪是谁写入了经验，`add` 现在支持：

```text
node scripts/ekg.js add ... --agent-id agent-a --session-id session-20260421
```

也支持通过环境变量注入：

```powershell
$env:EKG_AGENT_ID = "agent-a"
$env:EKG_SESSION_ID = "session-20260421"
node scripts/ekg.js add --title "..." --problem "..." --solution "..."
```

写入后会在经验节点里保留 `writer` 字段，锁文件里也会保留当前持锁者信息。

## 5. 推荐宿主模式

### 5.1 单机多 Agent

这是当前最适合的模式。

示例：

- Agent A 负责 `query/explain`
- Agent B 负责 `add/review`
- Hook 负责 `pre-edit` 注入

它们都指向同一个 `C:\Users\Administrator\Desktop\skill\tools\ekg`。

### 5.2 同一宿主下的多个子代理

如果一个主代理再派生多个子代理，共享这一份 EKG 也是可以的，但要遵守一条规则：

只允许通过 EKG CLI 或锁包装函数写入，不允许子代理自己拼 JSON 落盘。

## 6. 当前边界

### 6.1 已覆盖

- 同机多进程并发写入
- Hook 与 CLI 同时写 `state.json`
- `E00x` ID 分配冲突
- 锁超时和陈旧锁回收

### 6.2 还没覆盖

- 跨机器的分布式锁
- 网络文件系统下的锁语义差异
- 大规模高频写入队列
- 经验内容级冲突合并

如果未来要支持“不同机器上的多个 agent 同时写”，本地文件锁就不够了，需要升级为：

- SQLite
- PostgreSQL
- Redis 分布式锁
- 或事件队列 + 单写入器

## 7. 对外开发约束

如果后续新增脚本或 MCP 工具，需要遵守下面这条最重要的规则：

```text
任何会修改 EKG 持久化文件的逻辑，都必须包在 mutateRuntime() 或 withWriteLock() 内。
```

不要直接复用旧的 `runtime` 快照去覆盖保存，否则仍然可能把别的 agent 刚写入的数据冲掉。

## 8. 当前建议

现阶段可以把 EKG 定位成：

- 单机共享知识库
- 多 agent 共用读能力
- 有限并发写入
- 可追踪写入者

这个阶段足够支撑你现在的 skill / hook / 多 agent 协作场景。

如果你下一步要做 MCP Server 或跨项目共享，我建议下一轮直接把存储层从纯 JSON 升级成 SQLite。
