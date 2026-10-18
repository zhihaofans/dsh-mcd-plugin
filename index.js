/**
 * Host half of the DeepSeek Harness `mcd-mcp` bundle.
 *
 * The MCP tools themselves are owned by the shipped native bridge
 * (`@deepseek-ai/dsh-mcp-client`, inserted by `cordis.patch.yml`); this module
 * publishes the bundled safety/units/rate-limit skill and exposes the MCP
 * token as a plugin setting.
 *
 * Token flow
 * ----------
 * `Config.token` is a volatile, `role('secret')` field, so Plugins settings
 * renders a write-only input and stores the value in the active profile's
 * patch (redacted in the UI, never in this repository). `apply()` copies it
 * into `process.env.MCD_MCP_TOKEN`; the MCP client row's `!!js` header reads
 * that variable when it mounts. The launch environment remains a fallback for
 * CI or shell launches. The MCP row is inserted after this row, so on startup
 * the variable is already present when its configuration is evaluated.
 *
 * Changing the token in Settings reloads this row only. The native MCP client
 * evaluates its header once when it mounts, so restart Harness (or remount the
 * bundle) for an existing connection to pick up a new token.
 */

import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

const SKILL_NAME = 'mcd-mcp'
const PROVIDER_NAME = 'mcd-mcp'
/** Bundled-skill precedence, matching the skill registry's packaged roots. */
const BUNDLED_RANK = 600
const TOKEN_ENV = 'MCD_MCP_TOKEN'

/**
 * Remember the value that came from the Harness launch environment. It may be
 * undefined; the symbol survives HMR module re-evaluation so a settings token
 * is never mistaken for the launch fallback. Clearing the setting restores it.
 */
const LAUNCH_TOKEN_KEY = Symbol.for('mcd-mcp.launchToken')
if (!(LAUNCH_TOKEN_KEY in globalThis)) {
  globalThis[LAUNCH_TOKEN_KEY] = process.env[TOKEN_ENV]
}

/** Cordis plugin identity. */
export const name = 'mcd-mcp'
/** The registry this provider registers on; Cordis waits for it before apply(). */
export const inject = ['skills']

/**
 * Settings form for this bundle. `volatile()` makes the field editable without
 * remounting the whole profile; `role('secret')` keeps its value out of every
 * settings response while still reporting whether it is set.
 */
export const Config = z.object({
  token: z
    .string()
    .role('secret')
    .volatile()
    .description(
      '麦当劳中国 MCP token，从 https://open.mcd.cn/mcp 获取。保存在本机 profile（UI 中脱敏，不写入本仓库）；保存后重启 Harness 让 MCP 连接使用新 token。',
    )
    .default(''),
})

/**
 * Split a SKILL.md into its required description and its instruction body.
 * The bundle owns this file, so a deliberately small frontmatter reader is
 * enough; it avoids pulling in a YAML dependency for one line.
 *
 * @param {string} raw - complete SKILL.md text.
 * @param {string} path - file path used in diagnostics.
 * @returns {{ description: string, content: string }}
 */
function parseSkill(raw, path) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter === null) throw new Error(`mcd-mcp: ${path} has no YAML frontmatter`)

  const line = frontmatter[1].match(/^description:[ \t]*(.+)$/m)
  if (line === null) throw new Error(`mcd-mcp: ${path} has no description`)

  let description = line[1].trim()
  if (
    description.length >= 2 &&
    ((description.startsWith('"') && description.endsWith('"')) ||
      (description.startsWith("'") && description.endsWith("'")))
  ) {
    description = description.slice(1, -1).trim()
  }
  if (description.length === 0) throw new Error(`mcd-mcp: ${path} has an empty description`)

  return {
    description,
    content: raw.slice(frontmatter[0].length).trim(),
  }
}

/**
 * Read a Config field that may be a plain value (tests/manual rows) or the
 * live reference schemastery creates for a `volatile()` field.
 *
 * @param {unknown} value - configured field value.
 * @returns {string}
 */
function readConfiguredToken(value) {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    const current = value.get()
    return typeof current === 'string' ? current : ''
  }
  return ''
}

/**
 * Resolve the effective token and publish it to the environment for the MCP
 * row that mounts after this one.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ token?: string | { get(): string } }} config - validated plugin config.
 */
function applyToken(ctx, config) {
  const configured = readConfiguredToken(config.token).trim()
  const launch = globalThis[LAUNCH_TOKEN_KEY]
  const next = configured || (typeof launch === 'string' ? launch : undefined)
  const previous = process.env[TOKEN_ENV]

  if (next === undefined) delete process.env[TOKEN_ENV]
  else if (process.env[TOKEN_ENV] !== next) process.env[TOKEN_ENV] = next

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      // A newer apply owns the variable; only undo the value this one set.
      if (process.env[TOKEN_ENV] !== next) return
      if (previous === undefined) delete process.env[TOKEN_ENV]
      else process.env[TOKEN_ENV] = previous
    })
  }
}

/**
 * Register the bundled skill and publish the token. Cordis calls this when the
 * bundle mounts; its row is inserted before the MCP client row.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - context carrying `skills`.
 * @param {{ token?: string | { get(): string } }} [config] - validated plugin config.
 */
export function apply(ctx, config = {}) {
  applyToken(ctx, config)

  const skillDir = join(dirname(fileURLToPath(import.meta.url)), 'skills', SKILL_NAME)
  const skillPath = join(skillDir, 'SKILL.md')
  const { description } = parseSkill(readFileSync(skillPath, 'utf8'), skillPath)

  const candidate = {
    name: SKILL_NAME,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    rank: BUNDLED_RANK,
    resourceBase: { kind: 'directory', path: skillDir.split(sep).join('/') },
    path: skillPath,
    locator: skillPath,
  }

  ctx.skills.registerProvider(() => ({
    name: PROVIDER_NAME,
    list: () => Promise.resolve([candidate]),
    async get(selected, options = {}) {
      // `rank` and `locator` are provider bookkeeping, not skill metadata.
      const { rank: _rank, locator, ...summary } = selected
      const loaded = await readFile(locator, {
        encoding: 'utf8',
        signal: options.signal,
      })
      return { ...summary, content: parseSkill(loaded, locator).content }
    },
  }))
}
