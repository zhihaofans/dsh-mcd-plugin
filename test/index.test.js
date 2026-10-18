import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { apply, inject, name } from '../index.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function registerWithFakeContext() {
  let factory
  const ctx = {
    skills: {
      registerProvider(create) {
        factory = create
        return () => {}
      },
    },
  }
  apply(ctx)
  assert.equal(typeof factory, 'function', 'apply() must register exactly one provider')
  return factory({ signal: undefined, invalidate() {} })
}

test('plugin identity declares the skills injection', () => {
  assert.equal(name, 'mcd-mcp')
  assert.deepEqual(inject, ['skills'])
})

test('provider publishes the bundled skill and loads its body', async () => {
  const provider = registerWithFakeContext()
  assert.equal(provider.name, 'mcd-mcp')

  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  const [candidate] = candidates
  assert.equal(candidate.name, 'mcd-mcp')
  assert.equal(candidate.provider, 'mcd-mcp')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, 600)
  assert.equal(candidate.invocation.modelInvocable, true)
  assert.equal(candidate.invocation.userInvocable, true)
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.match(candidate.description, /麦当劳/)
  assert.ok(candidate.path.endsWith(join('skills', 'mcd-mcp', 'SKILL.md')))

  const loaded = await provider.get(candidate, {})
  assert.equal(loaded.name, 'mcd-mcp')
  assert.equal(loaded.description, candidate.description)
  assert.match(loaded.content, /create-order/)
  assert.match(loaded.content, /auto-bind-coupons/)
  assert.match(loaded.content, /calculate-price/)
  assert.match(loaded.content, /600 次\/分钟/)
  assert.match(loaded.content, /Retry-After/)
  assert.doesNotMatch(loaded.content, /^---/) // frontmatter stripped
})

test('patch uses the native client, env gate, and no literal token', () => {
  const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /@deepseek-ai\/dsh-mcp-client/)
  assert.match(patch, /serverName: mcd-mcp/)
  assert.match(patch, /transport: streamable-http/)
  assert.match(patch, /https:\/\/mcp\.mcd\.cn/)
  assert.match(patch, /Authorization: !!js/)
  assert.match(patch, /process\.env\.MCD_MCP_TOKEN/)
  assert.match(patch, /disabled: !!js/)
  // The only Bearer occurrence must be the Loader expression.
  assert.equal((patch.match(/Bearer /g) ?? []).length, 1)
  assert.doesNotMatch(patch, /Bearer (?!\$\{)/)
})

test('package metadata exports the runtime, locales, and icon', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.author.name, 'zhihaofans')
  assert.equal(pkg.author.url, 'https://github.com/zhihaofans')
  assert.equal(pkg.homepage, 'https://github.com/zhihaofans')
  assert.ok(pkg.files.includes('skills/**/*.md'))
  for (const locale of ['en', 'zh']) {
    const meta = JSON.parse(readFileSync(join(ROOT, 'locale', `${locale}.json`), 'utf8')).meta
    assert.ok(meta.title.length > 0)
    assert.ok(meta.description.length > 0)
  }
})
