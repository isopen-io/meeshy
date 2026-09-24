import { raw } from './html.mjs'

// Illustrations vectorielles maison pour les médias de démo (photos, stories, vidéo d'appel) :
// aucune photo réelle, aucune personne identifiable, aucune ressource réseau.

const skyline = (seed, base, color, { width = 400, count = 14, min = 40, max = 150 } = {}) => {
  const step = width / count
  const batiments = Array.from({ length: count }, (_, i) => {
    const h = min + (((seed * (i + 3) * 37) % 101) / 100) * (max - min)
    const w = step * (0.74 + ((seed * (i + 1)) % 5) * 0.05)
    return { x: i * step, y: base - h, w, h }
  })
  const rects = batiments.map((b) => `<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="1.5"/>`)
  const fenetres = batiments.flatMap((b, i) => {
    const cols = Math.max(1, Math.floor((b.w - 6) / 8))
    const rows = Math.floor((b.h - 14) / 12)
    return Array.from({ length: cols * rows }, (_, k) => {
      const allumee = (seed * 7 + i * 13 + k * 29) % 5 === 0
      if (!allumee) return ''
      const x = b.x + 4 + (k % cols) * 8
      const y = b.y + 8 + Math.floor(k / cols) * 12
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3.5" height="5" rx=".8"/>`
    })
  })
  return `<g fill="${color}">${rects.join('')}</g><g fill="#ffd9a0" fill-opacity=".8">${fenetres.join('')}</g>`
}

const SCENES = {
  'coucher-osaka': (id) => `
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#312e81"/><stop offset=".38" stop-color="#8b5cf6"/>
        <stop offset=".68" stop-color="#f28482"/><stop offset="1" stop-color="#fbbf24"/>
      </linearGradient>
      <radialGradient id="${id}u" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7d6"/><stop offset=".45" stop-color="#fcd34d"/><stop offset="1" stop-color="#fcd34d" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="300" fill="url(#${id}s)"/>
    <circle cx="250" cy="186" r="90" fill="url(#${id}u)"/>
    <circle cx="250" cy="186" r="30" fill="#fff4c2"/>
    <path d="M0 150 Q60 138 120 150 T240 146 T400 152" stroke="#fff" stroke-opacity=".18" stroke-width="10" fill="none"/>
    <g fill="#2e1065" fill-opacity=".85"><path d="M70 236h60v-14l-8-6h-44l-8 6z M84 216l16-18 16 18z M92 198l8-9 8 9z"/></g>
    <g opacity=".7">${skyline(4, 256, '#4c1d95', { count: 20, min: 40, max: 110 })}</g>${skyline(7, 262, '#1e1b4b', { count: 14, min: 24, max: 80 })}
    <rect y="252" width="400" height="48" fill="#1e1b4b"/>
    <g stroke="#fbbf24" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"><path d="M40 270h40M120 282h60M230 270h50M300 286h70"/></g>`,
  paulista: (id) => `
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1e1b4b"/><stop offset=".35" stop-color="#6366f1"/>
        <stop offset=".62" stop-color="#f4845f"/><stop offset=".82" stop-color="#fbbf24"/><stop offset="1" stop-color="#f28482"/>
      </linearGradient>
    </defs>
    <rect width="400" height="700" fill="url(#${id}s)"/>
    <circle cx="200" cy="430" r="62" fill="#fff1c1" fill-opacity=".95"/>
    <circle cx="200" cy="430" r="130" fill="#fde68a" fill-opacity=".18"/>
    <g opacity=".75">${skyline(3, 575, '#6d4aa8', { count: 22, min: 70, max: 230 })}</g>
    ${skyline(11, 590, '#2a2566', { count: 14, min: 40, max: 150 })}
    <rect y="586" width="400" height="120" fill="#1e1b4b"/>
    <path d="M0 700 L175 586 H225 L400 700z" fill="#15123a"/>
    <g stroke="#fbbf24" stroke-width="4" stroke-linecap="round" stroke-opacity=".8"><path d="M200 580v12M200 610v18M200 648v26"/></g>
    <g fill="#fde68a" fill-opacity=".9"><circle cx="150" cy="620" r="3"/><circle cx="120" cy="650" r="4"/><circle cx="260" cy="630" r="3"/><circle cx="290" cy="664" r="4"/></g>`,
  madrid: (id) => `
    <defs><linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4a261"/><stop offset=".5" stop-color="#e76f51"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
    <rect width="400" height="700" fill="url(#${id}s)"/>
    ${skyline(5, 640, '#2e1065', { count: 9, min: 90, max: 240 })}
    <rect y="636" width="400" height="64" fill="#2e1065"/>`,
  'appel-seoul': (id) => `
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0c29"/><stop offset=".55" stop-color="#312e81"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient>
      <radialGradient id="${id}l" cx=".75" cy=".22" r=".55"><stop offset="0" stop-color="#f28482" stop-opacity=".5"/><stop offset="1" stop-color="#f28482" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e76f51"/><stop offset="1" stop-color="#8b2d4f"/></linearGradient>
      <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d2b4"/><stop offset="1" stop-color="#d9a37f"/></linearGradient>
      <filter id="${id}b"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    <rect width="400" height="860" fill="url(#${id}s)"/>
    <rect width="400" height="860" fill="url(#${id}l)"/>
    <g filter="url(#${id}b)">
      ${[[40, 120, 22, '#fbbf24'], [90, 190, 14, '#f28482'], [300, 100, 26, '#818cf8'], [350, 210, 16, '#fbbf24'], [60, 300, 18, '#a5b4fc'], [330, 330, 20, '#f4845f'], [150, 80, 12, '#fde68a'], [250, 170, 10, '#fde68a']]
        .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity=".45"/>`).join('')}
    </g>
    <path d="M40 860 C46 580 110 496 200 496 C290 496 354 580 360 860z" fill="url(#${id}h)"/>
    <path d="M150 506 Q200 556 250 506 L240 496 Q200 524 160 496z" fill="#6b2140" fill-opacity=".6"/>
    <rect x="176" y="430" width="48" height="74" rx="22" fill="#d9a37f"/>
    <ellipse cx="200" cy="360" rx="74" ry="90" fill="url(#${id}f)"/>
    <ellipse cx="126" cy="372" rx="12" ry="20" fill="#d9a37f"/>
    <ellipse cx="274" cy="372" rx="12" ry="20" fill="#d9a37f"/>
    <circle cx="124" cy="392" r="7" fill="#fff"/><circle cx="276" cy="392" r="7" fill="#fff"/>
    <path d="M122 356 C112 270 160 238 206 240 C262 242 292 282 280 350 C270 310 244 298 214 300 C176 302 150 300 132 330z" fill="#1a1740"/>
    <path d="M150 262 C176 246 214 246 240 262 C214 256 180 258 150 276z" fill="#fff" fill-opacity=".08"/>
    <path d="M182 404 Q200 414 218 404" stroke="#a05a45" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M40 860 C46 580 110 496 200 496" stroke="#fff" stroke-opacity=".08" stroke-width="10" fill="none"/>`,
}

const TAILLES = { 'coucher-osaka': [400, 300], paulista: [400, 700], madrid: [400, 700], 'appel-seoul': [400, 860] }

export const illustration = (nom, { className = '', fit = 'slice' } = {}) => {
  const scene = SCENES[nom]
  if (!scene) throw new Error(`illustration inconnue : ${nom}`)
  const [w, h] = TAILLES[nom]
  const id = `il-${nom}-${Math.abs([...className].reduce((n, c) => n * 31 + c.charCodeAt(0), 3)) % 9973}`
  return raw(`<svg class="illu ${className}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid ${fit}" aria-hidden="true">${scene(id)}</svg>`)
}
