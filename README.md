# Pi Persona Switcher（人格热切换）

版本：1.2.2  
部署日期：2026-11-08  
面板地址：`http://127.0.0.1:30142`  
配套 pi-web：`http://127.0.0.1:30141`

---

## 0. 安装

- 作为 Pi 包安装（发布到 npm 后）：`pi install npm:pi-persona-switcher`
- 从 git 安装：`pi install git:https://github.com/arttask998-beep/pi-persona-switcher`
- 单独运行控制面板：克隆仓库后 `node server.mjs`，或 Windows 双击 `start-persona-panel.cmd`

---

## 1. 它是什么

给 Pi / pi-web 加一个"人格开关"：

- 一个本地网页面板：查看、启用、停用、编辑、新建、删除人格；
- 面板里还可以调整上下文压缩阈值（`reserveTokens` / `keepRecentTokens` / 自动压缩开关）；
- 压缩提示会从 `models.json` 读取模型 `contextWindow`，可切换估算模型；
- **热切换**：点启用/停用后，**下一条消息立即生效**，不需要 `/reload`，不需要重启 pi-web；
- 不修改 pi-web 源码，不 fork，pi-web 升级不受影响；
- 人格内容只追加到 system prompt，保留 Pi 默认的工具规则。

工作原理一句话：

> 面板写 `active.json` → Pi 扩展在每次 `before_agent_start` 读取 → 把选中的人格追加到 system prompt。

---

## 2. 目录与文件

### G 盘（程序与源码）

```
<repo-dir>\
├─ server.mjs                    # 无依赖 Node 服务（端口 30142）
├─ public\index.html            # 控制面板页面（原生 HTML/CSS/JS）
├─ extension\persona-switcher.ts # Pi 扩展源码（维护时改这里）
├─ start-persona-panel.cmd       # 启动面板
├─ stop-persona-panel.cmd        # 停止面板（只结束 30142 上的 node）
├─ deploy-extension.cmd          # 把扩展复制到 Pi agent 目录
├─ docs\                         # 界面截图（人格切换 / 压缩阈值 / LM Studio / pi-web）
└─ README.md                     # 本文档
```

### C 盘（Pi 实际读取的位置）

```
%USERPROFILE%\.pi\agent\
├─ extensions\persona-switcher.ts   # 由 deploy-extension.cmd 部署
└─ personas\
   ├─ active.json                   # 当前启用状态
   ├─ default.md                    # 示例：默认
   └─ concise.md                    # 示例：极简
```

> 为什么数据在 C 盘：Pi 默认从 `~/.pi/agent` 读取扩展和人格，pi-web 也读同一个目录。这样 pi-web 和 Pi CLI 能共享人格和会话。
>
> 如果确实要把数据也放 G 盘，需要同时给 Pi 和面板设置 `PI_CODING_AGENT_DIR=G:\...`，但这会和现有 Pi 数据分离，不建议随意改。

---

## 3. 首次部署 / 更新扩展

1. 双击 `deploy-extension.cmd`，把扩展复制到：
   `%USERPROFILE%\.pi\agent\extensions\persona-switcher.ts`
2. **重启 pi-web**（扩展只在进程启动时加载）：
   - 双击 `pi-web\stop-pi-web.cmd`
   - 再双击 `pi-web\start-pi-web.cmd`
3. 启动面板：
   - 双击 `<repo-dir>\start-persona-panel.cmd`
   - 浏览器打开 `http://127.0.0.1:30142`

以后只改人格内容时，不需要重启任何东西；只有改扩展源码或 pi-web 升级后，才需要重新部署并重启 pi-web。

---

## 4. 日常使用

1. 打开面板 `http://127.0.0.1:30142`；
2. 左侧选一个人格；
3. 点「启用」→ 状态变成「已启用」，面板提示"下一条消息生效"；
4. 回到 pi-web 继续对话即可；
5. 点「停用」→ 下一条消息恢复默认 Pi 行为。

编辑人格：

- 选中左侧人格 → 右侧文本框修改 → 点「保存」；
- 如果该人格正在启用，保存后也是下一条消息生效；
- 「新建」会要求输入 ID（字母/数字/`_`/`-`）和显示名称；
- 删除前必须先停用（避免删掉正在使用的人格）。

也可以不打开面板，直接在 **pi-web 输入框** 里切换：输入 `/` → 「扩展」→ `persona`，或直接输入：

```text
/persona list
/persona use default
/persona off
```

> 实测 pi-web 里 `/persona use concise` 会提示 `Persona enabled: concise`，`/persona off` 会提示 `Persona disabled`，无需重启。

### 打开面板（/panel）

在 pi-web 或 Pi CLI 输入：

```text
/panel
```

- 先检查 `http://127.0.0.1:30142/api/health`；
- 面板在运行 → 在当前会话里发一条可点击链接；
- 点击链接 → 用**当前浏览器的新标签**打开面板；
- 面板未运行 → 提示先运行 `start-persona-panel.cmd`。

不改 pi-web 源码，也不调用系统默认浏览器；链接需要手动点一下（浏览器会拦截自动 `window.open`）。Pi CLI 的 TUI 里链接可能不可点，复制下面的 URL 即可。

### 上下文压缩阈值

面板底部有「上下文压缩」设置卡：

| 字段 | 含义 | 默认 |
|---|---|---|
| `reserveTokens` | 窗口剩余多少 token 时触发自动压缩 | `16384` |
| `keepRecentTokens` | 压缩时保留最近多少 token | `20000` |
| `enabled` | 是否启用自动压缩 | `true` |

- 触发点 = 所选模型的 `contextWindow - reserveTokens`；
- 设置卡的「估算模型」从 `models.json` 读取所有带 `contextWindow` 的模型，默认选中 `settings.json` 的 `defaultModel`；
- 切换估算模型**只影响提示和百分比**，不会改动 pi-web 实际使用的模型；选择会保存在浏览器 localStorage；
- 例如选中 `lmstudio/deepseek-heretic-iq4xs`（32k）时，`reserveTokens=4096` → 触发点 28672（88%）；
- 选中 `opencode-go/deepseek-v4.1-flash`（1M）时，`reserveTokens=4096` → 触发点约 99.6%；
- 保存会写入 `~/.pi/agent/settings.json` 的 `compaction` 字段，并生成 `settings.json.bak`；
- **保存后需要重启 pi-web 才生效**；
- 想按模型单独覆盖，可以在 `settings.json` 里使用 `compaction.modelOverrides`，键为 `provider/modelId`。

示例：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 4096,
    "keepRecentTokens": 12000
  }
}
```

---

## 5. 人格文件格式

`personas/<id>.md`，纯 Markdown，建议 200–500 tokens：

```markdown
# 显示名称

你是 Pi，一个务实、直接的编程助手。
- 先给结论，再给必要说明。
- 不确定时明确说不知道。
```

- 第一行 `# 名称` 会作为面板显示名；
- 文件 ID 就是文件名（去掉 `.md`）；
- 单个文件限制 64KB（面板与扩展都会检查）；
- 内容会以 `<persona id="...">...</persona>` 追加到 system prompt 末尾。

`active.json` 结构：

```json
{
  "id": "default",
  "enabled": false,
  "updatedAt": "2026-11-08T00:00:00.000Z"
}
```

- `enabled: false`：所有人格关闭；
- `enabled: true` + `id`：启用对应人格。

---

## 6. 热切换原理与边界

Pi 扩展在 `before_agent_start` 时执行：

```ts
pi.on("before_agent_start", async (event) => {
  const active = loadActivePersona(); // 每次 run 重新读 active.json

  // pi-web 用 systemPromptOptions 构建请求；原地写 sections 才能生效
  if (!active) {
    delete event.systemPromptOptions.sections.persona;
    return;
  }
  event.systemPromptOptions.sections.persona =
    `<persona id="${active.id}">\n${active.text}\n</persona>`;
});
```

> 实现要点：直接 `return { systemPrompt: ... }` 在 Pi CLI 里有效，但 pi-web 会忽略这个返回值；必须用 `event.systemPromptOptions.sections` 原地注入。这是 v1.0.1 修过的问题。

因此：

- ✅ 切换只写一个小 JSON 文件，下一轮 run 立即读到；
- ✅ 不需要改 `APPEND_SYSTEM.md`，不需要 `/reload`；
- ✅ 不需要重启 pi-web；
- ⚠️ **不会修改正在运行的那一轮**，只影响下一次 run（下一条消息）；
- ⚠️ 扩展安装/更新后，pi-web 里**安装前创建的旧会话**可能缓存了基础提示词，看不到人格；新建一个会话即可。安装后新建的会话，同一会话内切换人格是热生效的（已实测）；
- ⚠️ 人格会占用每轮上下文，建议短小；32k 上下文下尤其注意；
- ⚠️ 人格是"追加"到 sections，不会替换 Pi 默认的工具规则；这是故意的，避免 9B 模型不会调工具。

---

## 7. 面板 API（维护/脚本用）

服务只监听 `127.0.0.1:30142`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，返回版本和目录 |
| GET | `/api/state` | 当前状态 + 人格列表 |
| GET | `/api/settings` | 读取 `compaction` 阈值 + `models.json` 的模型 `contextWindow` 列表（`context` 字段） |
| POST | `/api/settings` | 保存阈值 `{enabled, reserveTokens, keepRecentTokens}`，会写 `settings.json` 并生成 `.bak`；响应也带 `context` |
| GET | `/api/persona?id=xxx` | 读取人格内容 |
| POST | `/api/persona` | 保存内容 `{id, content}` |
| POST | `/api/active` | 启用/停用 `{id, enabled}` |
| POST | `/api/create` | 新建 `{id, name}` |
| POST | `/api/delete` | 删除 `{id}`（启用中会拒绝） |

示例：

```bash
curl http://127.0.0.1:30142/api/state
curl -X POST http://127.0.0.1:30142/api/active \
  -H "Content-Type: application/json" \
  -d '{"id":"default","enabled":true}'
```

写文件使用"临时文件 + rename"的原子替换，避免扩展读到半个 JSON。

---

## 8. 安全边界

- 只绑定 `127.0.0.1`，不要改成 `0.0.0.0` 暴露到局域网；
- 人格 ID 白名单：`^[a-z0-9][a-z0-9_-]{0,31}$`，防止路径穿越；
- 文件写入限制在 `~/.pi/agent/personas` 内；
- 请求体上限 256KB，单个人格上限 64KB；
- 面板没有登录，本机任何程序都能访问；不要把它当成公网服务。

---

## 9. 更新与维护

### 改人格内容

直接面板编辑保存，或改 `~/.pi/agent/personas/*.md`，下一条消息生效。

### 改扩展逻辑

1. 修改 `<repo-dir>\extension\persona-switcher.ts`；
2. 双击 `deploy-extension.cmd`；
3. 重启 pi-web（或重启 Pi CLI）；
4. 面板无需重启。

### 改面板 UI / API

1. 修改 `<repo-dir>\server.mjs` 或 `public\index.html`；
2. 用 `stop-persona-panel.cmd` 停止，再 `start-persona-panel.cmd` 启动；
3. 页面刷新即可。

### pi-web / Pi 升级后检查

- 面板和人格文件不受影响；
- 如果 Pi 的扩展 API 变了（`before_agent_start` 签名/返回结构），需要同步改扩展；
- 升级后先跑第 10 节的自测。

### 备份

需要备份的最小集合：

```
%USERPROFILE%\.pi\agent\extensions\persona-switcher.ts
%USERPROFILE%\.pi\agent\personas\*.md
%USERPROFILE%\.pi\agent\personas\active.json
<repo-dir>\
```

### 回滚

1. 面板里点「停用」；
2. 停止面板；
3. 删除 `%USERPROFILE%\.pi\agent\extensions\persona-switcher.ts`；
4. 重启 pi-web。

人格文件可以保留，不影响 Pi。

---

## 10. 自测清单（每次升级后跑）

1. 启动面板，`/api/health` 返回 `ok: true`；
2. 在面板里临时新建 `test-a` 和 `test-b`，内容分别要求"回复末尾输出 [A]"和"[B]"；
3. 启用 `test-a`，在 pi-web **新建一个会话**，发送：`你好 /no_think`，回复末尾应出现 `[A]`；
4. **不重启 pi-web**，面板切换到 `test-b`，在同一会话再发 `你好 /no_think`，回复末尾应变成 `[B]`；
5. 面板点「停用」，再发一次，回复不应再带标记；
6. 测试完成后删除 `test-a.md`、`test-b.md`，并停用或切回 `default`。

如果第 3 步没有标记：

- 确认扩展已部署到 `~/.pi/agent/extensions/`；
- 确认 pi-web 是在部署之后重启的；
- 看 pi-web 设置里的「插件」是否显示 `persona-switcher` 且状态为「已加载」；
- 用 Pi CLI 直接验证扩展是否加载（在项目目录运行 `pi`，输入 `/persona list`）；
- 确认用的是**扩展加载后新建的会话**，旧会话可能缓存了基础提示词。

### 实测记录（2026-11-08）

| 场景 | 结果 |
|---|---|
| Pi CLI `你好 /no_think`（test-a） | `你好！[A]` ✅ |
| pi-web 新建会话（test-a） | `你好！[A]` ✅ |
| 同一会话切到 test-b，再发消息 | `你好！[B]` ✅（未重启、未 reload） |
| 扩展安装前的旧会话 | 不显示标记；新建会话后正常 |

结论：**扩展加载后新建的会话支持热切换**；旧会话需要新建一次。这个限制来自 pi-web 的会话提示词缓存，不是扩展逻辑。

---

## 11. 故障排查

| 现象 | 排查 |
|---|---|
| 面板打不开 | 30142 是否被占用：`netstat -ano \| findstr :30142`；先 `stop-persona-panel.cmd` 再启动 |
| 面板能开但列表为空 | 确认 `%USERPROFILE%\.pi\agent\personas` 下有 `.md` 文件 |
| 切换后没变化 | 确认是"下一条消息"；确认 pi-web 已重启加载扩展；确认 `active.json` 已更新 |
| pi-web 不加载扩展 | 查看 pi-web 设置 →「插件」；确认扩展文件在 agent 目录；重启 pi-web |
| 模型不遵守人格 | 9B 模型指令遵循有限；把人格写得短、具体、可执行；必要时在提示词里重复 |
| 面板 404 | `public\index.html` 是否存在；server.mjs 是否从 <repo-dir> 启动 |
| 改了压缩阈值没生效 | 保存后需要重启 pi-web；确认 `settings.json` 的 `compaction` 字段；看同目录 `settings.json.bak` |
| settings.json 被覆盖 | 面板保存前会写 `.bak`；避免和 pi-web 设置页同时改；必要时从 `.bak` 恢复 |
| 端口冲突 | 改 `PERSONA_PANEL_PORT` 环境变量，或停止占用 30142 的程序 |

---

## 12. 变更记录

### 2026-11-08 · v1.2.2

- `/panel` 改为在当前会话发送可点击链接，不再调用系统默认浏览器；
- 点击链接后在当前浏览器新标签打开面板；不改 pi-web 源码。

### 2026-11-08 · v1.2.1

- 扩展新增 `/panel` 命令：检查 30142 健康状态后，用系统默认浏览器打开人格面板；
- 不改 pi-web 源码；远程 pi-web 场景会在服务端机器打开浏览器（README 有说明）。

### 2026-11-08 · v1.2.0

- 面板服务读取 `models.json`，返回所有模型的 `contextWindow`；
- 压缩设置卡新增「估算模型」下拉，默认选中 `settings.json` 的 `defaultModel`；
- 触发点提示按所选模型的窗口动态计算；选择只影响估算，不改实际模型；
- `GET/POST /api/settings` 响应新增 `context` 字段；
- 更新界面截图。

### 2026-11-08 · v1.1.0

- 面板新增「上下文压缩」设置卡：`reserveTokens`、`keepRecentTokens`、自动压缩开关；
- 新增 `GET /api/settings` 和 `POST /api/settings`；
- 保存写入 `~/.pi/agent/settings.json`，并生成 `settings.json.bak`；保存后需重启 pi-web；
- 面板显示按 32k 窗口估算的压缩触发点和百分比。

### 2026-11-08 · v1.0.1

- 修复 pi-web 不生效：把人格注入从 `return { systemPrompt }` 改为
  `event.systemPromptOptions.sections.persona` 原地写入；
- 实测 Pi CLI、pi-web 新建会话、以及同一会话内 A→B 热切换均通过；
- 清理测试人格，默认状态恢复为未启用。

### 2026-11-08 · v1.0.0

- 新增 `persona-switcher.ts` 扩展，基于 `before_agent_start` 动态追加人格；
- 新增 G 盘控制面板（列表、启用/停用、编辑、新建、删除）；
- 新增 `active.json` 原子状态文件；
- 新增启动/停止/部署脚本与本 README；
- 预留 `test-a` / `test-b` 用于热切换自测。

---

## 13. 相关链接

- Pi 扩展文档：https://pi.dev/docs/latest/extensions
- Pi 官方示例 `pirate.ts`（动态改 system prompt）：
  https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/pirate.ts
- pi-web 项目：https://github.com/agegr/pi-web
- 本地面板：`<repo-dir>`
- pi-web 部署：`pi-web`

---

