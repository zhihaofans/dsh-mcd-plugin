# mcd-mcp — 麦当劳中国 MCP（DeepSeek Harness 插件）

把麦当劳中国 MCP（<https://mcp.mcd.cn>）接入 DeepSeek Harness：查门店/菜单、
算价、优惠券、下单与订单查询。

这是一个 **Cordis bundle**（Host 半 + Client 半），主要文件如下：

| 文件 | 作用 |
| --- | --- |
| `package.json` | bundle 清单：`dsh.bundle.patch`、locale/icon 导出、打包文件列表 |
| `cordis.patch.yml` | 插入两个 Host 行：原生 MCP 客户端 `mcd-mcp`，以及本包的技能提供者 `mcd-mcp-skill` |
| `index.js` | Host 半：读取 `skills/mcd-mcp/SKILL.md`，通过 `ctx.skills.registerProvider` 注册为可加载技能；同时把 Plugins 设置里的 token 发布到 `process.env` |
| `client.js` | Client 半：向 Plugins 页面的 `plugins.row.config` 注册 `mcd-mcp-skill` 行的 Configure 页面（secret 输入 + 保存/清除） |
| `skills/mcd-mcp/SKILL.md` | 模型行为规则：写操作确认、分/元单位、600 次/分钟限流与 429 退避 |
| `locale/{en,zh}.json`、`icon.svg` | Plugins 页面的标题、说明和图标 |

> **与 Hermes 的区别**：DeepSeek Harness 没有 `plugin.yaml`、`requires_env` 或
> `register(ctx)` 这些格式。这里用 `package.json` + `cordis.patch.yml` 声明 bundle，
> 用 `index.js` 注册技能；MCP 工具完全交给原生 `@deepseek-ai/dsh-mcp-client`
> 在运行时发现，**不硬编码那“约 33 个”工具**。

## 前置条件：MCD_MCP_TOKEN

在 <https://open.mcd.cn/mcp> 控制台获取 token。有两种提供方式，**Plugins 设置优先**：

### 方式 A（推荐）：在 Plugins 设置里输入

1. 打开 Harness 的 **Plugins** 页面，展开 `mcd-mcp`，在 **`mcd-mcp-skill`** 行点
   **Configure**（配置）；
2. 在 **token**（secret，输入内容不回显）里填入 token 并保存；
3. 重启 Harness（MCP 行在挂载时读取 token，见下）。

本 bundle 的 `mcd-mcp-skill` 行声明了一个 volatile + secret 的 `token` 字段：

```js
export const Config = z.object({
  token: z.string().role('secret').volatile().description('...').default(''),
})
```

`client.js` 把这个字段渲染成 Configure 页面，保存时调用页面提供的 `form.mutate`；
DSH 把值写入当前 profile 的 `cordis.patch.yml`（仅本机，UI 中脱敏），`index.js`
的 `apply()` 再把它发布到 `process.env.MCD_MCP_TOKEN`。仓库里没有明文 token；如果
你连本机 profile 也不想落盘，请改用方式 B。

### 方式 B（备选）：启动环境变量

`MCD_MCP_TOKEN` 也可以来自 Harness 进程的**启动环境**，适合 CI/无头启动：

- **CLI**：`export MCD_MCP_TOKEN='…'` 后启动 `dsh …`，或 `MCD_MCP_TOKEN='…' dsh …`。
- **Desktop（macOS）**：运行 `./scripts/set-token.sh`（隐藏输入），然后完全退出并
  重开 DeepSeek Harness；不再需要时 `./scripts/set-token.sh --unset`。
  也可以手动 `launchctl setenv MCD_MCP_TOKEN '…'`。
- **想用 `.env`**：在启动前 source 它，例如
  `set -a; . ~/.dsh/.env; set +a; dsh …`（bash），让变量进入进程环境。
  `~/.dsh/.env` 本身不会被凭据存储注入 `process.env`。

### 两种方式的优先级

1. Plugins 设置里的 token；
2. 启动环境变量 `MCD_MCP_TOKEN`；
3. 都没有 → MCP 行保持禁用（fail closed），不会发送 `Bearer undefined`。

清空设置会回落到启动环境变量。原生 MCP 行在挂载时求值：

```yaml
headers:
  Authorization: !!js '`Bearer ${process.env.MCD_MCP_TOKEN}`'
disabled: !!js '!process.env.MCD_MCP_TOKEN'
```

所以**修改 token 后需要重启 Harness**（或重新挂载 bundle），让 MCP 行重新读取；
token 存在但无效时，`failOnStartupError: true` 会让该行明确失败。

## 安装

本 bundle 的 `index.js` 用 `@deepseek-ai/schemastery` 声明 Settings 表单，因此先在
本仓库安装依赖（`link:` 本目录时 Harness 不会替你安装 workspace 依赖）：

```bash
pnpm install
```

然后在仓库根目录执行 `pwd`，把输出作为 target（必须是绝对路径）：

```text
install_bundle target=/absolute/path/to/dsh-mcd-plugin
```

也可以在 Web 的 **Plugins** 页面安装本目录，或让 agent 调 `plugin_manager`。
bundle 的 patch 会插入：

| 行 id | 包 | 说明 |
| --- | --- | --- |
| `mcd-mcp-skill` | `@local/mcd-mcp` | 始终挂载；注册技能，并提供带 Configure 页面的 `token` 设置 |
| `mcd-mcp` | `@deepseek-ai/dsh-mcp-client` | 有 token 时挂载，连接 `https://mcp.mcd.cn` |

安装或更新代码/token 后重启 Harness，让新模块与 MCP 行重新挂载。

## 验证

1. Plugins 页面能看到 `mcd-mcp`；展开后打开 `mcd-mcp-skill` 的配置表单，应出现
   **token**（secret）字段。
2. 填入 token 并保存后重启 Harness；MCP 行应变为启用。
3. 在会话中让 agent 加载技能：`skill(name="mcd-mcp")`，应返回本 bundle 的
   `SKILL.md` 正文。
4. 有有效 token 时，`Tool.listTools` 或让 agent“列出你现在可用的麦当劳工具”
   应出现 `mcp__mcd-mcp__*`。工具数量随服务端变化，不要在提示或代码里写死。
5. 没有 token 时，MCP 行保持禁用，技能仍可加载并解释如何配置——这是有意的：
   技能本身不含 secret，且能帮助排查。

## 工具命名

原生 bridge 使用 `mcp__<serverName>__<rawName>`：

- `create-order` → `mcp__mcd-mcp__create_order`
- `calculate-price` → `mcp__mcd-mcp__calculate_price`

原始名中的 `-` 会保留；超过 64 字符或含非法字符时，bridge 会追加 12 位哈希后缀
以保证唯一。以当前会话实际注册名为准。

## 安全与行为

- **Token**：优先在 Plugins 设置里输入（`volatile` + `role('secret')`，UI 脱敏），
  DSH 把它存到本机 profile 的 `cordis.patch.yml`；也可改用启动环境变量。仓库里
  永远没有明文。不要把 token 写进 `README.md`、`SKILL.md`、locale、日志或回答。
- **写操作确认**：`create-order`、`auto-bind-coupons` 以及任何 create/submit/pay/
  cancel/refund/update/delete/bind 语义的工具，调用前必须向用户展示门店、商品、
  数量、金额（带单位）、优惠券与取餐信息，并取得**明确确认**。一次确认只对应
  一次写操作。
- **金额单位**：`calculate-price` 可能是分（fen），其他工具可能是元（yuan）。
  按字段名/schema/响应一致性判断；拿不准标注“单位未确认”，不要静默除以 100。
  展示为 `¥12.50（1250 分）`。
- **限流**：服务端约 600 次/分钟。429 时遵守 `Retry-After`，否则指数退避
  （1/2/4/8/16 秒 + 抖动，最多 5 次）。写操作不盲目重试，先查订单/券状态。

完整规则见 [`skills/mcd-mcp/SKILL.md`](skills/mcd-mcp/SKILL.md)。

## 为什么没有 `__init__.py` 动态 `list_tools`

DSH 的 `@deepseek-ai/dsh-mcp-client` 已经完成：连接、MCP 握手、`tools/list`
分页、工具名校验与去重、重连、工具列表变更通知、结果投影和审批/超时。插件层再
注册一遍会重复工具、绕过 bridge 的过滤与命名，并在服务端增删工具时漂移。

因此这里只做三件事：配置原生 MCP 行、注册行为技能、把 Plugins 设置里的 token
发布到环境。需要拦截/改写某个工具时，应在 DSH 的 tool/guard 扩展点上做
（例如 `ctx.tools.guard`），而不是另起 MCP 客户端。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| Plugins 页面 `mcd-mcp` 行是禁用的 | Plugins 设置和启动环境都没有 token；在设置里填写并保存，或 export 后重启 Harness |
| 行是 failed / 401 / 403 | token 无效或过期；在 Plugins 设置更新，或更新启动环境后重启 |
| 设置里没有 Configure / token 字段 | 依赖未安装，或 Host/Client 新模块未重载：在仓库执行 `pnpm install`，重启 Harness |
| 技能能加载，但没有 `mcp__mcd-mcp__*` | MCP 行未挂载或连接失败；看 Plugins 页面与 Harness 日志 |
| 工具名对不上 | 用 `Tool.listTools` 看实际名；`-` 会保留，超长会加哈希 |
| 429 / 限流 | 降低频率、串行/合并请求，遵守 `Retry-After` 与指数退避 |
| 改了 `cordis.patch.yml` 没生效 | 重新挂载 bundle / 重启 Harness（取决于 HMR 状态） |

## 卸载

用 `plugin_manager` 的 `remove_bundle`（或 Web Plugins 页面）移除
`@local/mcd-mcp`。移除后，`mcd-mcp-skill` 与 `mcd-mcp` 两个插入行会随 bundle 层
一起消失；启动环境中的变量和 profile patch 里可能残留的 token 覆盖不会被自动
清除，可手动删除。

## 开发与测试

```bash
node --check index.js
node --test test/
sed -E "s/!!js '[^']*'/__JS__/g" cordis.patch.yml > /tmp/patch-check.yml
ruby -ryaml -e 'YAML.load_file("/tmp/patch-check.yml")'
```

测试使用 Node 内置模块和 `@deepseek-ai/schemastery`（先 `pnpm install`）：验证
提供者候选、技能正文、Config 的 secret/volatile 字段、token 注入与回退、Client
半的 `plugins.row.config` 注册与表单渲染、patch 中的 URL/传输/环境引用，以及
locale 元数据。

---

作者：[zhihaofans](https://github.com/zhihaofans)
