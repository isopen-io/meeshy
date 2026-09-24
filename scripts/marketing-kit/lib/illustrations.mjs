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
  // Vidéo d'appel en basse lumière : une chambre le soir, une lampe chaude, et le correspondant
  // en silhouette FLOUTÉE — aucun trait de visage, personne d'identifiable. Ses initiales sont
  // posées dessus par l'écran (CallView), comme une caméra qui n'a pas encore fait le point.
  'appel-seoul': (id) => `
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140f33"/><stop offset=".5" stop-color="#2b2360"/><stop offset="1" stop-color="#1a1440"/></linearGradient>
      <radialGradient id="${id}l" cx=".82" cy=".2" r=".6"><stop offset="0" stop-color="#fbbf24" stop-opacity=".55"/><stop offset=".45" stop-color="#f28482" stop-opacity=".22"/><stop offset="1" stop-color="#f28482" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}p" cx=".62" cy=".28" r=".75"><stop offset="0" stop-color="#b08ab8"/><stop offset=".5" stop-color="#6b5596"/><stop offset="1" stop-color="#3a2d66"/></radialGradient>
      <linearGradient id="${id}r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fcd34d" stop-opacity=".95"/><stop offset=".4" stop-color="#f4845f" stop-opacity="0"/></linearGradient>
      <filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="11"/></filter>
      <filter id="${id}g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>
    </defs>
    <rect width="400" height="860" fill="url(#${id}s)"/>
    <rect width="400" height="860" fill="url(#${id}l)"/>
    <ellipse cx="200" cy="380" rx="190" ry="230" fill="#8b5cf6" fill-opacity=".14" filter="url(#${id}f)"/>
    <g filter="url(#${id}b)">
      <rect x="292" y="120" width="70" height="210" rx="10" fill="#fcd34d" fill-opacity=".16"/>
      ${[[330, 150, 26, '#fbbf24'], [60, 140, 18, '#a5b4fc'], [96, 250, 12, '#f28482'], [352, 330, 16, '#fde68a'], [40, 420, 22, '#818cf8'], [360, 470, 14, '#f4845f'], [150, 110, 10, '#fde68a']]
        .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity=".5"/>`).join('')}
    </g>
    <g filter="url(#${id}f)">
      <path d="M30 860 C40 610 110 540 200 536 C290 540 360 610 370 860z" fill="url(#${id}p)"/>
      <rect x="170" y="440" width="60" height="110" rx="28" fill="#5a4a8c"/>
      <ellipse cx="200" cy="370" rx="92" ry="112" fill="url(#${id}p)"/>
      <path d="M200 262 C262 262 296 316 292 380 L290 420 C300 330 250 286 200 286z" fill="url(#${id}r)"/>
      <path d="M322 860 C318 660 300 590 262 560 C318 580 356 640 362 860z" fill="url(#${id}r)"/>
    </g>
    <rect width="400" height="860" filter="url(#${id}g)"/>`,
}

const TAILLES = { 'coucher-osaka': [400, 300], paulista: [400, 700], madrid: [400, 700], 'appel-seoul': [400, 860] }

export const illustration = (nom, { className = '', fit = 'slice' } = {}) => {
  const scene = SCENES[nom]
  if (!scene) throw new Error(`illustration inconnue : ${nom}`)
  const [w, h] = TAILLES[nom]
  const id = `il-${nom}-${Math.abs([...className].reduce((n, c) => n * 31 + c.charCodeAt(0), 3)) % 9973}`
  return raw(`<svg class="illu ${className}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid ${fit}" aria-hidden="true">${scene(id)}</svg>`)
}
