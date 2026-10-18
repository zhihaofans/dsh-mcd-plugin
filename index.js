/**
 * Host half of the DeepSeek Harness `mcd-mcp` bundle.
 *
 * The MCP tools themselves are owned by the shipped native bridge
 * (`@deepseek-ai/dsh-mcp-client`, inserted by `cordis.patch.yml`); this module
 * only publishes the bundled safety/units/rate-limit instructions as a skill.
 * Registering them through the skill registry (instead of copying a file into
 * `~/.dsh/skills`) keeps the skill versioned with the bundle and visible in
 * the normal session catalog and `skill` tool.
 *
 * Deliberately dependency-free: only Node built-ins are imported, so a linked
 * checkout mounts without installing packages.
 */

import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'mcd-mcp'
const PROVIDER_NAME = 'mcd-mcp'
/** Bundled-skill precedence, matching the skill registry's packaged roots. */
const BUNDLED_RANK = 600

/** Cordis plugin identity. */
export const name = 'mcd-mcp'
/** The registry this provider registers on; Cordis waits for it before apply(). */
export const inject = ['skills']

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
 * Register the bundled skill. Cordis calls this once when the bundle mounts.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - context carrying `skills`.
 */
export function apply(ctx) {
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
