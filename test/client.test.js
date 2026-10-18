import assert from 'node:assert/strict'
import test from 'node:test'

let entry
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      entry = value
    },
  },
}
await import('../client.js')

const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity) }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
}

function collect(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  out.push(node)
  for (const child of node.children ?? []) collect(child, out)
  return out
}

test('client module loads under the package id', () => {
  assert.equal(entry.id, '@local/mcd-mcp')
  assert.equal(typeof entry.factory, 'function')
})

test('client registers the row config page and its dictionaries', () => {
  const mod = entry.factory((name) => {
    if (name === 'react') return fakeReact
    throw new Error(`unexpected require: ${name}`)
  })
  assert.deepEqual(mod.inject, ['slots', 'locale'])

  let locale
  let slot
  const effects = []
  const ctx = {
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
    locale: {
      register(ns, dictionaries) {
        locale = { ns, dictionaries }
        return () => {}
      },
    },
    slots: {
      inject(name, register) {
        assert.equal(name, 'plugins.row.config')
        register()
      },
      register(options, component) {
        slot = { options, component }
        return () => {}
      },
    },
  }

  mod.apply(ctx)

  assert.equal(locale.ns, 'mcdMcp')
  assert.equal(typeof locale.dictionaries.zh.save, 'string')
  assert.equal(typeof locale.dictionaries.en.save, 'string')
  assert.ok(slot)
  assert.equal(slot.options.name, 'plugins.row.config')
  assert.equal(slot.options.key, '@local/mcd-mcp#mcd-mcp-skill')
  assert.equal(slot.options.locale, 'mcdMcp')
  assert.equal(typeof slot.component, 'function')
  assert.equal(effects.length, 1)

  const summary = slot.component({ view: 'summary', t: (key) => key })
  assert.equal(summary.type, 'span')

  const page = slot.component({
    view: 'page',
    t: (key) => key,
    form: {
      state: { status: 'ready', writable: true, revision: 3, value: {} },
      mutate: async () => true,
    },
  })
  assert.equal(page.type, 'div')
  const types = collect(page).map((node) => node.type)
  assert.ok(types.includes('input'))
  assert.ok(types.includes('button'))
  assert.ok(types.includes('label'))
  const input = collect(page).find((node) => node.type === 'input')
  assert.equal(input.props.type, 'password')
  assert.equal(input.props.autoComplete, 'new-password')
})
