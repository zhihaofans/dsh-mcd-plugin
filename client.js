window.__ModuleLoader__.load({
  id: '@local/mcd-mcp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'mcdMcp'

    const zh = {
      summary: '麦当劳中国 MCP token 设置',
      description:
        '在此填写 MCD_MCP_TOKEN（从 https://open.mcd.cn/mcp 获取）。值不会回显；保存后重启 Harness 让 MCP 连接生效。',
      label: 'MCD_MCP_TOKEN',
      placeholder: '粘贴 token；留空表示不修改',
      save: '保存',
      saving: '保存中…',
      saved: '已保存。请重启 Harness 让 MCP 连接使用新 token。',
      clear: '清除',
      cleared: '已清除；将回退到启动环境变量（如有）。重启 Harness 生效。',
      failed: '保存失败，请稍后重试。',
      loading: '正在读取设置…',
      unavailable: '当前 profile 不可写，或设置尚未加载。',
    }

    const en = {
      summary: "McDonald's China MCP token",
      description:
        'Enter MCD_MCP_TOKEN from https://open.mcd.cn/mcp. The value is never echoed back; restart Harness after saving so the MCP connection uses it.',
      label: 'MCD_MCP_TOKEN',
      placeholder: 'Paste the token; leave empty to keep the current one',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved. Restart Harness so the MCP connection uses the new token.',
      clear: 'Clear',
      cleared: 'Cleared. The launch environment token, if any, applies again after a Harness restart.',
      failed: 'Could not save. Please try again.',
      loading: 'Loading settings…',
      unavailable: 'This profile is not writable, or settings are not loaded yet.',
    }

    const styles = {
      wrap: {
        display: 'grid',
        gap: 10,
        maxWidth: 560,
        color: 'var(--dsw-alias-label-primary)',
      },
      hint: {
        margin: 0,
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 13,
        lineHeight: 1.5,
      },
      label: {
        fontWeight: 600,
        fontSize: 13,
      },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'inherit',
        font: 'inherit',
      },
      row: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      },
      primary: {
        padding: '7px 14px',
        borderRadius: 6,
        border: 'none',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        font: 'inherit',
        cursor: 'pointer',
      },
      secondary: {
        padding: '7px 14px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
      },
      ok: {
        margin: 0,
        color: 'var(--dsw-alias-state-success-primary)',
        fontSize: 13,
        lineHeight: 1.5,
      },
      error: {
        margin: 0,
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 13,
        lineHeight: 1.5,
      },
    }

    function translate(t, key) {
      return typeof t === 'function' ? t(key) : key
    }

    function TokenSettings({ view, form, t }) {
      const [draft, setDraft] = React.useState('')
      const [status, setStatus] = React.useState('idle')
      const tr = (key) => translate(t, key)

      if (view !== 'page') return h('span', null, tr('summary'))

      const state = form && form.state
      if (!form || !state || state.status === 'loading') {
        return h('p', { style: styles.hint }, tr('loading'))
      }
      if (state.status === 'unavailable' || state.writable === false) {
        return h('p', { style: styles.hint }, tr('unavailable'))
      }

      const busy = status === 'saving'
      const canSave = draft.trim().length > 0 && !busy

      const save = async () => {
        if (!canSave) return
        setStatus('saving')
        try {
          const ok = await form.mutate(
            [{ op: 'set', path: ['token'], value: draft.trim() }],
            state.revision,
          )
          setStatus(ok ? 'saved' : 'failed')
          if (ok) setDraft('')
        } catch {
          setStatus('failed')
        }
      }

      const clear = async () => {
        if (busy) return
        setStatus('saving')
        try {
          const ok = await form.mutate(
            [{ op: 'unset', path: ['token'] }],
            state.revision,
          )
          setStatus(ok ? 'cleared' : 'failed')
        } catch {
          setStatus('failed')
        }
      }

      return h('div', { style: styles.wrap }, [
        h('p', { key: 'description', style: styles.hint }, tr('description')),
        h('label', { key: 'label', style: styles.label, htmlFor: 'mcd-mcp-token' }, tr('label')),
        h('input', {
          key: 'input',
          id: 'mcd-mcp-token',
          type: 'password',
          value: draft,
          placeholder: tr('placeholder'),
          autoComplete: 'new-password',
          spellCheck: false,
          disabled: busy,
          onChange: (event) => {
            setDraft(event.target.value)
            if (status !== 'idle') setStatus('idle')
          },
          style: styles.input,
        }),
        h('div', { key: 'actions', style: styles.row }, [
          h(
            'button',
            {
              key: 'save',
              type: 'button',
              onClick: save,
              disabled: !canSave,
              style: canSave
                ? styles.primary
                : { ...styles.primary, opacity: 0.55, cursor: 'default' },
            },
            tr(busy ? 'saving' : 'save'),
          ),
          h(
            'button',
            {
              key: 'clear',
              type: 'button',
              onClick: clear,
              disabled: busy,
              style: styles.secondary,
            },
            tr('clear'),
          ),
        ]),
        status === 'saved'
          ? h('p', { key: 'saved', style: styles.ok, role: 'status' }, tr('saved'))
          : null,
        status === 'cleared'
          ? h('p', { key: 'cleared', style: styles.ok, role: 'status' }, tr('cleared'))
          : null,
        status === 'failed'
          ? h('p', { key: 'failed', style: styles.error, role: 'alert' }, tr('failed'))
          : null,
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mcd-mcp: settings dictionaries')
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.row.config',
              key: '@local/mcd-mcp#mcd-mcp-skill',
              locale: NS,
            },
            TokenSettings,
          ),
        )
      },
    }
  },
})
