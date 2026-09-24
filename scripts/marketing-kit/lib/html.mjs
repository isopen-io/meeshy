const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c])

const RAW = Symbol('raw')

export const raw = (value) => ({ [RAW]: String(value) })

const render = (value) => {
  if (value === null || value === undefined || value === false) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  if (typeof value === 'object' && RAW in value) return value[RAW]
  return escape(value)
}

export const html = (strings, ...values) =>
  raw(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''))

export const toString = (fragment) => render(fragment)

// Un mot latin (Meesh, un pseudo) dans une phrase arabe : isolé, pour ne pas casser l'ordre bidi.
export const bidi = (text) => html`<bdi>${text}</bdi>`
