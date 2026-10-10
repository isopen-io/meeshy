// La page de motion design de la vidéo de statut (#9988) : un document HTML autonome que Chromium rend IMAGE PAR IMAGE.
// `window.poser(t)` pose l'état exact de l'instant t (secondes) : rien n'est animé par l'horloge du navigateur, deux
// rendus du même instant sont identiques. Les écrans sont les images des VRAIES prises de la vitrine (`images/<plan>/`)
// ou les écrans du kit chargés dans un cadre ; Mee et Meo sont leurs SVG du web, figés à l'instant. Le canevas CSS fait
// 540×960, rendu au facteur 2 : 1080×1920.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { AMOURS, RIRES } from '../textes/statut-amour.mjs'

export const CSS_LARGEUR = 540
export const CSS_HAUTEUR = 960
export const FACTEUR = 2

// La carte : la face montre l'écran natif sans sa barre d'état (1320×2703), au même rapport.
export const CARTE = { cx: 270, cy: 592, face: 290, marge: 6 }
CARTE.hauteurFace = Math.round((CARTE.face * 2703) / 1320 * 10) / 10

const LOGO_SVG = readFileSync(resolve(REPO_ROOT, 'apps/ios/logo_master.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/id="gradient"/g, 'id="sa-logo-grad"')
  .replace(/url\(#gradient\)/g, 'url(#sa-logo-grad)')
  .replace(/width="1024" height="1024"/, 'width="100%" height="100%"')

const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const attribut = (texte) => String(texte).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const mots = (texte) => texte.split(/(\s+)/u).filter((m) => m.length).map((m) => (/^\s+$/u.test(m) ? m : `<span class="mot">${echapper(m)}</span>`)).join('')

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; width: ${CSS_LARGEUR}px; height: ${CSS_HAUTEUR}px; overflow: hidden; background: #2A1458; }
body { font-family: -apple-system, 'SF Pro Display', system-ui, 'Helvetica Neue', sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
body[lang='ar'] { font-family: 'SF Arabic', 'Geeza Pro', 'Noto Sans Arabic', system-ui, sans-serif; }
#scene { position: absolute; inset: 0; overflow: hidden; }
#fond { position: absolute; inset: 0; }
.lueur-fond { position: absolute; border-radius: 50%; filter: blur(50px); mix-blend-mode: screen; }
.mot-fond { position: absolute; white-space: nowrap; font-weight: 800; color: rgba(255,255,255,0.07); letter-spacing: -0.01em; }
canvas.plein { position: absolute; inset: 0; width: ${CSS_LARGEUR}px; height: ${CSS_HAUTEUR}px; pointer-events: none; }
.plan { position: absolute; inset: 0; display: none; transform-origin: 50% 60%; }
.titres { position: absolute; left: 30px; right: 30px; top: 86px; height: 176px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; }
.titre { margin: 0; font-weight: 850; font-size: 52px; line-height: 1.04; letter-spacing: -0.025em; text-wrap: balance; text-shadow: 0 4px 22px rgba(40,10,70,0.45); }
body[lang='ar'] .titre { font-weight: 800; letter-spacing: 0; line-height: 1.3; }
.sous-titre { margin: 0; font-weight: 650; font-size: 27px; line-height: 1.15; color: #FBCFE8; text-wrap: balance; }
.mot { display: inline-block; white-space: pre; }
.puce { display: inline-flex; align-items: center; gap: 8px; padding: 7px 16px; border-radius: 999px; font-weight: 700; font-size: 17px; margin-top: 4px;
  background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.36); box-shadow: 0 6px 18px rgba(40,10,70,0.3); }
.puce .fleche { color: #F9A8D4; font-weight: 800; }
.ombre { position: absolute; left: ${CARTE.cx - 150}px; top: ${CARTE.cy + 250}px; width: 300px; height: 70px; border-radius: 50%; background: rgba(25,5,45,0.75); filter: blur(22px); }
.carte { position: absolute; left: ${CARTE.cx}px; top: ${CARTE.cy}px; width: 0; height: 0; transform-style: preserve-3d; }
.carte .epaisseur, .carte .cadre { position: absolute; left: ${-(CARTE.face / 2 + CARTE.marge)}px; top: ${-(CARTE.hauteurFace / 2 + CARTE.marge)}px;
  width: ${CARTE.face + 2 * CARTE.marge}px; height: ${CARTE.hauteurFace + 2 * CARTE.marge}px; border-radius: 34px; }
.carte .epaisseur { background: linear-gradient(160deg, #9D174D, #3B0764); transform: translateZ(-16px); box-shadow: 0 0 0 1px rgba(255,255,255,0.08); }
.carte .cadre { padding: ${CARTE.marge}px; background: linear-gradient(150deg, rgba(255,255,255,0.95), rgba(251,207,232,0.85) 45%, rgba(196,181,253,0.9));
  box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset, 0 30px 60px rgba(30,6,60,0.45), 0 8px 18px rgba(30,6,60,0.35); }
.carte .face { position: relative; width: 100%; height: 100%; border-radius: 28px; overflow: hidden; background: #fff; }
.carte .face img, .carte .face iframe { position: absolute; left: 0; top: 0; transform-origin: 0 0; border: 0; }
.carte .reflet { position: absolute; inset: 0; border-radius: 28px; pointer-events: none; mix-blend-mode: screen; }
.chip { position: absolute; padding: 8px 15px; border-radius: 999px; font-weight: 800; font-size: 22px; white-space: nowrap;
  background: linear-gradient(135deg, #EC4899, #A855F7); box-shadow: 0 10px 24px rgba(60,10,70,0.45), 0 0 0 2px rgba(255,255,255,0.85); }
.mee { position: absolute; display: none; transform-origin: 50% 85%; filter: drop-shadow(0 14px 18px rgba(30,6,60,0.35)); }
.mee svg { display: block; width: 100%; height: 100%; }
.reaction { position: absolute; font-size: 30px; display: none; }
#signature { position: absolute; inset: 0; display: none; }
#signature .logo { position: absolute; left: ${270 - 62}px; top: 128px; width: 124px; height: 124px; border-radius: 30px; overflow: hidden;
  box-shadow: 0 18px 44px rgba(30,6,60,0.5), 0 0 0 2px rgba(255,255,255,0.45); }
#signature .marque { position: absolute; left: 0; right: 0; top: 266px; text-align: center; font-weight: 800; font-size: 46px; letter-spacing: -0.02em; }
#signature .devise .ligne { display: block; }
#signature .devise { position: absolute; left: 34px; right: 34px; top: 336px; height: 170px; display: flex; align-items: center; justify-content: center; text-align: center;
  font-weight: 850; font-size: 44px; line-height: 1.1; letter-spacing: -0.02em; text-wrap: balance; text-shadow: 0 4px 22px rgba(40,10,70,0.5); }
body[lang='ar'] #signature .devise { letter-spacing: 0; line-height: 1.35; font-weight: 800; }
#signature .adresse { position: absolute; left: 50%; top: 520px; transform: translateX(-50%); padding: 9px 22px; border-radius: 999px; font-weight: 800; font-size: 24px;
  background: #fff; color: #BE185D; box-shadow: 0 10px 26px rgba(30,6,60,0.4); }
#flash { position: absolute; inset: 0; background: #FFF7FB; opacity: 0; }
#vignette { position: absolute; inset: 0; background: radial-gradient(130% 90% at 50% 45%, transparent 60%, rgba(20,4,40,0.5) 100%); pointer-events: none; }
`

// Le moteur : il reçoit le modèle (JSON) et pose chaque calque à l'instant t. Écrit en JS de navigateur.
const MOTEUR = String.raw`
const M = window.MODELE
const W = ${CSS_LARGEUR}, H = ${CSS_HAUTEUR}, FPS = 30, F = ${FACTEUR}
const C = ${JSON.stringify(CARTE)}
const RTL = M.dir === 'rtl'
const SENS = RTL ? -1 : 1
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lin = (t, a, b) => clamp((t - a) / (b - a), 0, 1)
const easeOut = (u) => 1 - Math.pow(1 - u, 3)
const easeIn = (u) => u * u * u
const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u)
const backOut = (u) => { const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2) }
const mix = (a, b, u) => a + (b - a) * u
const $ = (id) => document.getElementById(id)
const planDe = (id) => M.plans.find((p) => p.id === id)

let graine = 20261010
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646 }

// L'impulsion du tempo : chaque temps éclaire, la mesure plus fort.
const impulsion = (t) => {
  let k = 0
  while (k + 1 < M.temps.length && M.temps[k + 1] <= t) k += 1
  return Math.exp(-(t - M.temps[k]) / 0.15) * (k % 4 === 0 ? 1 : 0.5)
}

// ── Le fond : un dégradé qui glisse de l'indigo de Meeshy vers le rose à mesure que l'amour grandit ──────
const teinte = (t) => lin(t, 4, 20)
const poserFond = (t) => {
  const u = teinte(t), p = impulsion(t)
  const a = 'hsl(' + mix(248, 322, u) + ',' + mix(62, 70, u) + '%,' + mix(38, 44, u) + '%)'
  const b = 'hsl(' + mix(268, 338, u) + ',' + mix(55, 72, u) + '%,' + mix(22, 30, u) + '%)'
  const c = 'hsl(' + mix(232, 286, u) + ',60%,' + mix(14, 18, u) + '%)'
  $('fond').style.background = 'linear-gradient(165deg,' + a + ' 0%,' + b + ' 55%,' + c + ' 100%)'
  $('fond').style.filter = 'brightness(' + (0.95 + 0.08 * p) + ')'
  M.lueurs.forEach((l, i) => {
    const el = $('lueur-' + i)
    el.style.left = (l.x + Math.sin(t * l.vx + i) * 70 - l.r) + 'px'
    el.style.top = (l.y + Math.cos(t * l.vy + i * 2) * 60 - l.r) + 'px'
    el.style.opacity = String(l.a * (0.85 + 0.3 * p))
  })
}

// Les mots du fond — le rire, puis l'amour — dérivent lentement : le plan le plus lointain de la parallaxe.
const MOTS_FOND = Array.from(document.querySelectorAll('.mot-fond')).map((el, i) => ({ el, famille: el.dataset.famille, x: alea() * W, y: 30 + alea() * (H - 60), taille: 26 + alea() * 46, v: (6 + alea() * 10) * (i % 2 ? 1 : -1) }))
MOTS_FOND.forEach((m) => { m.el.style.fontSize = m.taille + 'px' })
const poserMotsFond = (t, derive) => MOTS_FOND.forEach((m) => {
  const amour = lin(t, 10.2, 12.2)
  const a = m.famille === 'rire' ? 1 - amour : amour
  const x = ((m.x + m.v * t + derive * 0.25) % (W + 300) + (W + 300)) % (W + 300) - 150
  m.el.style.transform = 'translate(' + x + 'px,' + (m.y - t * 3) + 'px)'
  m.el.style.opacity = String(a)
})

// Les cœurs en bokeh : le plan du milieu, plus nombreux à mesure que l'histoire avance.
const BOKEH = Array.from({ length: 34 }, () => ({ x: alea() * W, y: alea() * H, r: 6 + alea() * 20, v: 8 + alea() * 18, p: alea() * 6.28, seuil: alea() }))
const coeur = (ctx, x, y, r) => {
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.35)
  ctx.bezierCurveTo(x - r * 1.2, y - r * 0.5, x - r * 0.45, y - r * 1.25, x, y - r * 0.45)
  ctx.bezierCurveTo(x + r * 0.45, y - r * 1.25, x + r * 1.2, y - r * 0.5, x, y + r * 0.35)
  ctx.closePath()
}
const cBokeh = $('bokeh').getContext('2d')
const poserBokeh = (t, derive) => {
  cBokeh.setTransform(F, 0, 0, F, 0, 0); cBokeh.clearRect(0, 0, W, H)
  const densite = mix(0.25, 1, lin(t, 4, 18))
  for (const b of BOKEH) {
    if (b.seuil > densite) continue
    const y = ((b.y - b.v * t) % (H + 80) + H + 80) % (H + 80) - 40
    const x = b.x + Math.sin(t * 0.8 + b.p) * 18 + derive * 0.5
    cBokeh.globalAlpha = 0.10 + 0.10 * Math.sin(t * 1.7 + b.p) ** 2
    cBokeh.fillStyle = '#FBCFE8'
    coeur(cBokeh, x, y, b.r)
    cBokeh.fill()
  }
  cBokeh.globalAlpha = 1
}

// ── Les titres : chaque mot entre en remontant, flou levé ; un titre trop large se resserre une fois pour toutes ──
for (const el of document.querySelectorAll('.titre, .sous-titre, .devise')) {
  const max = el.classList.contains('devise') ? 470 : 478
  let corps = parseFloat(getComputedStyle(el).fontSize)
  const limite = el.classList.contains('titre') ? 2.25 : el.classList.contains('devise') ? 3.4 : 1.25
  while (corps > 14 && (el.scrollWidth > max + 1 || el.getBoundingClientRect().height > corps * limite * (el.classList.contains('titre') && RTL ? 1.2 : 1))) {
    corps -= 1; el.style.fontSize = corps + 'px'
  }
}
const poserMots = (bloc, t, debut, pas = 0.07, duree = 0.42) => bloc.querySelectorAll('.mot').forEach((m, i) => {
  const u = lin(t, debut + i * pas, debut + i * pas + duree)
  m.style.opacity = String(easeOut(u))
  m.style.transform = 'translateY(' + ((1 - backOut(u)) * 26) + 'px) scale(' + mix(0.9, 1, backOut(u)) + ')'
  m.style.filter = u < 1 ? 'blur(' + ((1 - u) * 6).toFixed(1) + 'px)' : 'none'
})

// ── Les cartes ───────────────────────────────────────────────────────────────────────────────────────────
const PLANS = M.plans.filter((p) => p.id !== 'signature').map((p) => ({
  p,
  copies: (p.id === 'rire' ? ['a', 'b'] : ['a']).map((c) => {
    const el = $('plan-' + p.id + '-' + c)
    return { el, carte: el.querySelector('.carte'), cadre: el.querySelector('.cadre'), epaisseur: el.querySelector('.epaisseur'), media: el.querySelector('.face img, .face iframe'), reflet: el.querySelector('.reflet'), ombre: el.querySelector('.ombre'),
      titres: el.querySelector('.titres'), titre: el.querySelector('.titre'), sous: el.querySelector('.sous-titre'), puce: el.querySelector('.puce'), chip: el.querySelector('.chip'), toile: el.querySelector('canvas.toile'), chargee: -1 }
  }),
}))

const posePrise = async (copie, p, local) => {
  if (!p.images) return
  const k = clamp(Math.floor(local * FPS + 1e-6), 0, p.images.nombre - 1)
  if (copie.chargee === k) return
  copie.media.src = p.images.dossier + '/' + String(k + 1).padStart(4, '0') + '.jpg'
  copie.chargee = k
  await copie.media.decode().catch(() => {})
}

// Les bulles d'un écran du kit paraissent une à une, comme elles arrivent.
const poserBulles = (copie, p, local) => {
  if (!p.revelations) return
  const doc = copie.media.contentDocument
  if (!doc) return
  const rangs = Array.from(doc.querySelectorAll('.msg-row'))
  const avant = Math.max(0, rangs.length - p.revelations.length)
  rangs.forEach((r, i) => {
    const debut = i < avant ? -1 : p.revelations[i - avant]
    const u = debut < 0 ? 1 : lin(local, debut, debut + 0.3)
    r.style.opacity = String(easeOut(u))
    r.style.transformOrigin = (r.classList.contains('mine') !== RTL ? '100%' : '0%') + ' 100%'
    r.style.transform = 'translateY(' + ((1 - easeOut(u)) * 30) + 'px) scale(' + mix(0.7, 1, backOut(u)) + ')'
  })
}

// La caméra dans l'écran natif (1320×2703 sans barre d'état), d'un cadrage à l'autre au fil du plan.
const poserCamera = (copie, p, local) => {
  const u = easeInOut(clamp(local / (p.finS - p.debutS), 0, 1))
  const cam = { x: mix(p.camera.de.x, p.camera.a.x, u), y: mix(p.camera.de.y, p.camera.a.y, u), l: mix(p.camera.de.largeur, p.camera.a.largeur, u) }
  const s = C.face / cam.l
  if (p.images) {
    copie.media.style.width = (1320 * s) + 'px'
    copie.media.style.height = (2868 * s) + 'px'
    copie.media.style.transform = 'translate(' + (-cam.x * s) + 'px,' + (-cam.y * s) + 'px)'
  } else {
    copie.media.style.width = '440px'
    copie.media.style.height = '956px'
    copie.media.style.transform = 'translate(' + (-cam.x * s) + 'px,' + (-cam.y * s) + 'px) scale(' + (3 * s) + ')'
  }
}

// Le relief : la carte penche et respire en 3D, son ombre glisse à l'opposé, un reflet passe sur sa face.
const poserRelief = (copie, p, t, local, extra) => {
  const i = M.plans.indexOf(p)
  const cote = (i % 2 ? -1 : 1) * SENS
  const ry = cote * (9 + 3 * Math.sin(local * 0.8)) + (extra.ry ?? 0)
  const rx = 7 + 2 * Math.sin(local * 0.65 + 1) + (extra.rx ?? 0)
  const rz = cote * -1.5 + (extra.rz ?? 0)
  const pouls = 1 + 0.012 * impulsion(t)
  const s = (extra.echelle ?? 1) * pouls
  copie.carte.style.transform = 'translate(' + (extra.dx ?? 0) + 'px,' + ((extra.dy ?? 0) + Math.sin(local * 1.1) * 4) + 'px) perspective(1300px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) rotateZ(' + rz + 'deg) scale(' + s + ')'
  copie.ombre.style.transform = 'translate(' + (-ry * 2.2 + (extra.dx ?? 0) * 0.9) + 'px,' + ((extra.dy ?? 0) * 0.9) + 'px) scale(' + (s * (extra.ombre ?? 1)) + ',' + s + ')'
  copie.ombre.style.opacity = String(0.85 * (extra.ombre ?? 1))
  const bande = 50 + ry * 4
  copie.reflet.style.background = 'linear-gradient(' + (110 + rz * 3) + 'deg, rgba(255,255,255,0) ' + (bande - 22) + '%, rgba(255,255,255,0.20) ' + bande + '%, rgba(255,255,255,0) ' + (bande + 20) + '%)'
  return { ry, rx, rz, s }
}

const poserTitres = (copie, p, t, decalage = 0) => {
  poserMots(copie.titre, t, p.debutS + 0.05 + decalage)
  if (copie.sous) poserMots(copie.sous, t, p.debutS + 0.42 + decalage, 0.05, 0.38)
  if (copie.puce) {
    const u = backOut(lin(t, p.debutS + 0.75 + decalage, p.debutS + 1.05 + decalage))
    copie.puce.style.opacity = String(clamp(u, 0, 1))
    copie.puce.style.transform = 'scale(' + mix(0.5, 1, u) + ')'
    const cible = copie.puce.querySelector('.cible'), fleche = copie.puce.querySelector('.fleche')
    const bascule = p.basculeS ?? p.debutS + 1.2
    const v = easeOut(lin(t, bascule, bascule + 0.3))
    cible.style.opacity = String(v); fleche.style.opacity = String(v)
    cible.style.maxWidth = (v * 200) + 'px'
  }
}

// ── Les transitions ─────────────────────────────────────────────────────────────────────────────────────
const amis = planDe('amis'), complices = planDe('complices'), amour = planDe('amour'), rire = planDe('rire'), signature = planDe('signature')
const T_ECLAIR = amis.debutS, T_TOILE = complices.debutS, T_POUSSE = amour.debutS

// a) L'éclair : un trait brisé de haut en bas, puis l'écran se fend le long du trait, les deux moitiés s'écartent.
const ECLAIR = (() => {
  const pts = [[270 + (alea() - 0.5) * 40, -30]]
  for (let k = 1; k <= 11; k += 1) pts.push([270 + (alea() - 0.5) * 120, -30 + k * 92])
  const branches = [3, 6, 8].map((k) => { const [x, y] = pts[k]; const d = alea() < 0.5 ? -1 : 1; return [[x, y], [x + d * 50, y + 40], [x + d * 80, y + 95]] })
  return { pts, branches }
})()
const cEclair = $('eclair').getContext('2d')
const trait = (ctx, pts, u) => {
  const n = Math.max(2, Math.ceil(pts.length * u))
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
  for (let k = 1; k < n; k += 1) ctx.lineTo(pts[k][0], pts[k][1])
  ctx.stroke()
}
const poserEclair = (t) => {
  cEclair.setTransform(F, 0, 0, F, 0, 0); cEclair.clearRect(0, 0, W, H)
  const age = t - T_ECLAIR
  if (age < -0.22 || age > 0.6) return
  const trace = lin(t, T_ECLAIR - 0.22, T_ECLAIR - 0.02)
  const vie = 1 - lin(age, 0.05, 0.6)
  const scintille = 0.75 + 0.25 * Math.sin(t * 120)
  cEclair.lineCap = 'round'; cEclair.lineJoin = 'round'
  for (const [l, c, a] of [[26, '196,181,253', 0.18], [12, '244,114,182', 0.45], [4, '255,255,255', 1]]) {
    cEclair.strokeStyle = 'rgba(' + c + ',' + (a * vie * scintille) + ')'
    cEclair.lineWidth = l
    cEclair.shadowColor = 'rgba(244,114,182,0.9)'; cEclair.shadowBlur = 24
    trait(cEclair, ECLAIR.pts, trace)
    cEclair.lineWidth = l * 0.5
    ECLAIR.branches.forEach((b) => trait(cEclair, b, lin(trace, 0.4, 1)))
  }
  cEclair.shadowBlur = 0
}
const polygoneDuCote = (cote) => {
  const bord = cote < 0 ? -80 : W + 80
  const pts = [[bord, -60], ...ECLAIR.pts.map(([x, y]) => [x, y]), [ECLAIR.pts.at(-1)[0], H + 60], [bord, H + 60]]
  return 'polygon(' + pts.map(([x, y]) => x.toFixed(1) + 'px ' + y.toFixed(1) + 'px').join(',') + ')'
}
const CLIP_GAUCHE = polygoneDuCote(-1), CLIP_DROITE = polygoneDuCote(1)

// b) Les toiles : des fils de soie partent des bords, tissent un filet sur la carte et l'emportent vers le haut.
const ANCRES = [[-10, 90], [130, -10], [270, -10], [410, -10], [W + 10, 90], [-10, 330], [W + 10, 330]]
const cToile = $('toile-globale').getContext('2d')
const levee = (t) => easeIn(lin(t, T_TOILE - 0.3, T_TOILE + 0.45))
const pointDeLaCarte = (fx, fy, dy, rot, s) => {
  const x = (fx - 0.5) * (C.face + 12) * s, y = (fy - 0.5) * (C.hauteurFace + 12) * s
  const c = Math.cos(rot), sn = Math.sin(rot)
  return [C.cx + x * c - y * sn, C.cy + dy + x * sn + y * c]
}
const etatDeLevee = (t) => {
  const u = levee(t)
  return { u, dy: -u * 980, rot: Math.sin(u * 3.2) * 0.12 * SENS, s: 1 - 0.18 * u }
}
const poserToiles = (t) => {
  cToile.setTransform(F, 0, 0, F, 0, 0); cToile.clearRect(0, 0, W, H)
  const debut = T_TOILE - 1.05
  if (t < debut || t > T_TOILE + 0.6) return
  const { dy, rot, s } = etatDeLevee(t)
  const cibles = [[0, 0], [0.3, 0], [0.5, 0], [0.7, 0], [1, 0], [0, 0.45], [1, 0.45]]
  cToile.lineCap = 'round'
  ANCRES.forEach((a, k) => {
    const u = easeOut(lin(t, debut + k * 0.05, debut + k * 0.05 + 0.28))
    if (u <= 0) return
    const [cx, cy] = pointDeLaCarte(cibles[k][0], cibles[k][1], dy, rot, s)
    const x = mix(a[0], cx, u), y = mix(a[1], cy, u)
    const mx = (a[0] + x) / 2, my = (a[1] + y) / 2 + 26 * (1 - levee(t))
    cToile.strokeStyle = 'rgba(255,255,255,0.85)'; cToile.lineWidth = 1.6
    cToile.shadowColor = 'rgba(251,207,232,0.95)'; cToile.shadowBlur = 8
    cToile.beginPath(); cToile.moveTo(a[0], a[1]); cToile.quadraticCurveTo(mx, my, x, y); cToile.stroke()
    if (u < 1) { cToile.fillStyle = '#fff'; cToile.beginPath(); cToile.arc(x, y, 3, 0, 6.283); cToile.fill() }
  })
  cToile.shadowBlur = 0
}
// Le filet, tissé sur la carte elle-même : rayons depuis le centre, puis la spirale.
const poserFilet = (copie, t) => {
  const ctx = copie.toile?.getContext('2d')
  if (!ctx) return
  ctx.setTransform(F, 0, 0, F, 0, 0); ctx.clearRect(0, 0, W, H)
  const debut = T_TOILE - 0.78
  if (t < debut) return
  const rayons = 14, cx = C.cx, cy = C.cy - 40
  const R = (a) => { const dx = Math.cos(a), dy = Math.sin(a); return Math.min((C.face / 2 + 30) / Math.abs(dx || 1e-6), (C.hauteurFace / 2 + 30) / Math.abs(dy || 1e-6)) }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3; ctx.shadowColor = 'rgba(251,207,232,1)'; ctx.shadowBlur = 6
  for (let k = 0; k < rayons; k += 1) {
    const a = (k / rayons) * 6.283 + 0.2
    const u = easeOut(lin(t, debut + k * 0.012, debut + k * 0.012 + 0.22))
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R(a) * u, cy + Math.sin(a) * R(a) * u); ctx.stroke()
  }
  const spirale = lin(t, debut + 0.18, debut + 0.62)
  ctx.beginPath()
  const tours = 5, pas = rayons * tours
  const n = Math.floor(pas * spirale)
  for (let k = 0; k <= n; k += 1) {
    const a = (k / rayons) * 6.283 + 0.2
    const f = 0.16 + 0.84 * (k / pas)
    const x = cx + Math.cos(a) * R(a) * f, y = cy + Math.sin(a) * R(a) * f
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke(); ctx.shadowBlur = 0
}

// c) La poussée : le nouveau titre arrive du bord, heurte l'ancien et le pousse, carte comprise, hors de l'écran.
const poussee = (t) => {
  const avant = lin(t, T_POUSSE - 0.32, T_POUSSE)
  const apres = lin(t, T_POUSSE, T_POUSSE + 0.6)
  const xNouveau = t < T_POUSSE ? mix(-W - 220, -W, easeIn(avant)) : mix(-W, 0, easeOut(apres))
  return { xNouveau: xNouveau * SENS, xAncien: Math.max(0, xNouveau + W) * SENS, choc: t >= T_POUSSE ? Math.exp(-(t - T_POUSSE) / 0.12) : 0 }
}

// d) Le festin : Mee et Meo surgissent, croquent la carte en trois bouchées, l'avalent, puis le titre.
const FESTIN = M.festin
const morsures = (t) => FESTIN.bouchees.map((b, i) => ({ i, age: t - b })).filter((m) => m.age >= 0)
const MORSURES = [
  { x: 0.02, y: 0.5, r: 70 },
  { x: 0.98, y: 0.56, r: 74 },
  { x: 0.02, y: 0.78, r: 82 },
]
const masqueDeMorsures = (t) => {
  const faites = morsures(t)
  if (!faites.length) return 'none'
  const L = C.face + 2 * C.marge, Hc = C.hauteurFace + 2 * C.marge
  const couches = faites.flatMap(({ i }) => {
    const m = MORSURES[i]
    const x = (RTL ? 1 - m.x : m.x) * L, y = m.y * Hc
    return [[x, y, m.r], [x + (x < L / 2 ? 34 : -34), y + 46, m.r * 0.62], [x + (x < L / 2 ? 30 : -30), y - 44, m.r * 0.55]]
  })
  return couches.map(([x, y, r]) => 'radial-gradient(circle ' + r + 'px at ' + x.toFixed(1) + 'px ' + y.toFixed(1) + 'px, transparent 97%, #000 100%)').join(',')
}

// ── Les particules : réactions, miettes, cœurs ─────────────────────────────────────────────────────────
const cFx = $('fx').getContext('2d')
const MIETTES = FESTIN.bouchees.map((b, i) => ({ instantS: b, x: (i === 1) !== RTL ? 410 : 130, y: i === 2 ? 760 : 600, grains: Array.from({ length: 26 }, () => ({ a: alea() * 6.283, v: 60 + alea() * 220, r: 2 + alea() * 4, c: ['#FFFFFF', '#FBCFE8', '#C4B5FD', '#F472B6'][Math.floor(alea() * 4)] })) }))
const ECLATS_COEUR = M.eclats.map((e) => ({ ...e, grains: Array.from({ length: 16 }, () => ({ a: alea() * 6.283, v: 70 + alea() * 160, r: 5 + alea() * 7 })) }))
const poserFx = (t) => {
  cFx.setTransform(F, 0, 0, F, 0, 0); cFx.clearRect(0, 0, W, H)
  for (const m of MIETTES) {
    const age = t - m.instantS
    if (age < 0 || age > 1.1) continue
    for (const g of m.grains) {
      const d = g.v * easeOut(Math.min(1, age / 0.8))
      cFx.globalAlpha = 1 - age / 1.1
      cFx.fillStyle = g.c
      cFx.fillRect(m.x + Math.cos(g.a) * d, m.y + Math.sin(g.a) * d + 260 * age * age, g.r, g.r)
    }
  }
  for (const e of ECLATS_COEUR) {
    const age = t - e.instantS
    if (age < 0 || age > 1.2) continue
    for (const g of e.grains) {
      const d = g.v * easeOut(Math.min(1, age / 0.9))
      cFx.globalAlpha = (1 - age / 1.2) * 0.95
      cFx.fillStyle = e.couleur ?? '#F472B6'
      coeur(cFx, (RTL ? W - e.x : e.x) + Math.cos(g.a) * d, e.y + Math.sin(g.a) * d - 40 * age, g.r)
      cFx.fill()
    }
  }
  cFx.globalAlpha = 1
}

// Les réactions du réel : des emoji qui montent de la carte, comme en direct.
const REACTIONS = Array.from(document.querySelectorAll('.reaction')).map((el, i) => ({ el, debut: 0.9 + i * 0.42, x: 360 + alea() * 120, v: 120 + alea() * 70, b: alea() * 6.28 }))
const poserReactions = (t) => REACTIONS.forEach((r) => {
  const age = t - r.debut
  if (age < 0 || age > 1.8 || t > T_ECLAIR) { r.el.style.display = 'none'; return }
  r.el.style.display = 'block'
  const x = (RTL ? W - r.x : r.x) + Math.sin(age * 4 + r.b) * 14
  r.el.style.transform = 'translate(' + (x - 15) + 'px,' + (800 - age * r.v) + 'px) scale(' + backOut(lin(age, 0, 0.25)) + ')'
  r.el.style.opacity = String(1 - lin(age, 1.2, 1.8))
})

// ── Mee et Meo ──────────────────────────────────────────────────────────────────────────────────────────
document.getAnimations().forEach((a) => a.pause())
const figer = (el, ms) => el.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = Math.max(0, ms) })
const poserAmoureux = (t, derive) => M.amoureux.forEach((m) => {
  const el = $('mee-' + m.id)
  const age = t - m.de
  if (age < 0 || t > m.a + 0.25) { el.style.display = 'none'; return }
  el.style.display = 'block'
  figer(el, age * 1000)
  const entree = backOut(lin(age, 0, 0.42))
  const sortie = easeIn(lin(t, m.a - 0.05, m.a + 0.25))
  const depuisCote = m.depuis === 'cote' ? (m.x < 270 ? -1 : 1) : 0
  const dx = depuisCote * (1 - lin(age, 0, 0.42)) * 220 + derive * 1.4
  const dy = (m.depuis === 'bas' ? (1 - entree) * 160 : 0) + sortie * 200 + Math.sin(age * 5) * 4
  const rebond = 1 + 0.06 * Math.exp(-((age - 0.42) ** 2) / 0.01)
  el.style.left = (m.x - m.taille / 2) + 'px'
  el.style.top = (m.y - m.taille / 2) + 'px'
  el.style.width = el.style.height = m.taille + 'px'
  el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + (clamp(entree, 0, 1.2) * rebond) + ') rotate(' + (Math.sin(age * 2.4) * 3) + 'deg)'
  el.style.opacity = String(clamp(entree * 2, 0, 1) * (1 - sortie))
})

const poserGloutons = (t) => {
  const debut = FESTIN.debutS, fin = FESTIN.finS
  ;['mee', 'meo'].forEach((qui, j) => {
    const el = $('glouton-' + qui)
    const age = t - debut
    if (age < -0.05 || t > fin + 0.3) { el.style.display = 'none'; return }
    el.style.display = 'block'
    const cote = (j === 0 ? -1 : 1) * SENS
    const arrivee = backOut(lin(age, 0, 0.2))
    // Chaque bouchée : le glouton qui croque se jette vers la carte, s'écrase, revient.
    const elan = FESTIN.bouchees.reduce((acc, b, i) => {
      const croque = i === 2 || (i === 0 ? j === 0 : j === 1)
      const a = t - b + 0.1
      return croque && a > 0 && a < 0.32 ? Math.max(acc, Math.sin((a / 0.32) * Math.PI)) : acc
    }, 0)
    const depart = easeIn(lin(t, fin - 0.12, fin + 0.25))
    const x = 270 + cote * (mix(380, 160, clamp(arrivee, 0, 1.1)) - 95 * elan) + cote * depart * 40
    const y = 600 - depart * 120
    const taille = 270
    el.style.left = (x - taille / 2) + 'px'; el.style.top = (y - taille / 2) + 'px'
    el.style.width = el.style.height = taille + 'px'
    el.style.transform = 'scale(' + ((1 + 0.22 * elan) * (1 - depart)) + ',' + ((1 - 0.12 * elan) * (1 - depart)) + ') scaleX(' + (cote < 0 ? 1 : -1) + ') rotate(' + (-cote * 10 * elan) + 'deg)'
    el.style.opacity = String(clamp(arrivee * 2, 0, 1))
  })
}

// ── La signature ────────────────────────────────────────────────────────────────────────────────────────
const poserSignature = (t) => {
  const el = $('signature')
  const local = t - signature.debutS
  el.style.display = local >= 0 ? 'block' : 'none'
  if (local < 0) return
  const logo = el.querySelector('.logo')
  const ul = backOut(lin(local, 0, 0.5))
  logo.style.transform = 'scale(' + mix(0.2, 1, ul) + ') rotate(' + ((1 - ul) * -16) + 'deg)'
  logo.style.opacity = String(clamp(ul * 1.6, 0, 1))
  const marque = el.querySelector('.marque')
  const um = easeOut(lin(local, 0.2, 0.55))
  marque.style.opacity = String(um)
  marque.style.transform = 'translateY(' + ((1 - um) * 16) + 'px)'
  poserMots(el.querySelector('.devise'), t, signature.debutS + 0.4, 0.09, 0.42)
  const adresse = el.querySelector('.adresse')
  const ua = backOut(lin(local, 1.35, 1.7))
  adresse.style.opacity = String(clamp(ua * 1.5, 0, 1))
  adresse.style.transform = 'translateX(-50%) scale(' + mix(0.5, 1, ua) + ')'
}

// ── Une image ───────────────────────────────────────────────────────────────────────────────────────────
window.poser = async (t) => {
  const derive = Math.sin(t * 0.5) * 12
  poserFond(t)
  poserMotsFond(t, derive)
  poserBokeh(t, derive)
  const attentes = []
  const pousse = poussee(t)
  for (const { p, copies } of PLANS) {
    let fenetre
    if (p.id === 'rire') fenetre = [0, T_ECLAIR + 0.7]
    else if (p.id === 'amis') fenetre = [T_ECLAIR - 0.01, T_TOILE + 0.5]
    else if (p.id === 'complices') fenetre = [T_TOILE - 0.15, T_POUSSE + 0.65]
    else fenetre = [T_POUSSE - 0.34, FESTIN.finS]
    copies.forEach((copie, c) => {
      const visible = t >= fenetre[0] && t < fenetre[1] && !(c === 1 && t < T_ECLAIR)
      copie.el.style.display = visible ? 'block' : 'none'
      if (!visible) return
      const local = t - p.debutS
      const extra = {}
      let opacite = 1, transforme = '', clip = 'none', decalageTitres = 0
      if (p.id === 'rire') {
        const entree = easeOut(lin(t, 0, 0.55))
        extra.dy = (1 - entree) * 700; extra.rx = (1 - entree) * 30; extra.rz = (1 - entree) * -8 * SENS
        if (t >= T_ECLAIR) {
          const u = easeOut(lin(t, T_ECLAIR, T_ECLAIR + 0.65))
          const cote = c === 0 ? -1 : 1
          clip = c === 0 ? CLIP_GAUCHE : CLIP_DROITE
          transforme = 'translate(' + (cote * u * 360) + 'px,' + (u * u * 140) + 'px) rotate(' + (cote * u * 11) + 'deg)'
          opacite = 1 - lin(t, T_ECLAIR + 0.35, T_ECLAIR + 0.7)
        }
      } else if (p.id === 'amis') {
        const u = easeOut(lin(t, T_ECLAIR, T_ECLAIR + 0.6))
        extra.echelle = mix(0.86, 1, u); extra.rx = (1 - u) * -10
        decalageTitres = 0.15
        const lv = etatDeLevee(t)
        if (lv.u > 0) {
          transforme = 'translate(0px,' + lv.dy + 'px) rotate(' + (lv.rot * 57.3) + 'deg) scale(' + lv.s + ')'
          copie.el.style.transformOrigin = C.cx + 'px ' + C.cy + 'px'
        }
        poserFilet(copie, t)
      } else if (p.id === 'complices') {
        const u = easeOut(lin(t, T_TOILE - 0.15, T_TOILE + 0.45))
        extra.dy = (1 - u) * 760; extra.rx = (1 - u) * 26
        decalageTitres = 0.2
        if (t >= T_POUSSE - 0.32) {
          transforme = 'translateX(' + pousse.xAncien + 'px)'
          copie.titres.style.transform = 'scaleX(' + (1 - 0.16 * pousse.choc) + ')'
          copie.titres.style.transformOrigin = RTL ? '0% 50%' : '100% 50%'
        } else copie.titres.style.transform = 'none'
        if (copie.chip) {
          const d = p.debutS + 2.2
          const uc = backOut(lin(t, d, d + 0.35))
          copie.chip.style.opacity = String(clamp(uc, 0, 1))
          copie.chip.style.transform = 'rotate(' + (-6 * SENS) + 'deg) scale(' + mix(0.3, 1, uc) * (1 + 0.04 * impulsion(t)) + ')'
        }
      } else if (p.id === 'amour') {
        if (t < T_POUSSE + 0.6) transforme = 'translateX(' + pousse.xNouveau + 'px)'
        copie.titres.style.transform = 'translateX(' + (SENS * 40 * (1 - easeOut(lin(t, T_POUSSE - 0.32, T_POUSSE + 0.6)))) + 'px)'
        decalageTitres = -0.25
        const avale = easeIn(lin(t, FESTIN.bouchees[2], FESTIN.bouchees[2] + 0.28))
        extra.echelle = 1 - avale
        extra.dy = -avale * 60
        const masque = masqueDeMorsures(t)
        for (const couche of [copie.cadre, copie.epaisseur]) { couche.style.maskImage = masque; couche.style.maskComposite = 'intersect' }
        copie.carte.style.opacity = String(1 - lin(t, FESTIN.bouchees[2] + 0.15, FESTIN.bouchees[2] + 0.3))
        const secousse = FESTIN.bouchees.reduce((a, b) => { const g = t - b; return g < 0 || g > 0.3 ? a : a + Math.exp(-g / 0.07) }, 0)
        extra.dx = Math.sin(t * 95) * 7 * secousse
        // Le titre aussi : aspiré vers Mee après la dernière bouchée.
        const aspire = easeIn(lin(t, FESTIN.bouchees[2] + 0.1, FESTIN.bouchees[2] + 0.45))
        copie.titres.style.transform += ' translate(' + (-SENS * aspire * 120) + 'px,' + (aspire * 380) + 'px) scale(' + (1 - aspire) + ')'
        copie.titres.style.opacity = String(1 - aspire)
      }
      copie.el.style.zIndex = String({ rire: 5, amis: 3, complices: 2, amour: 4 }[p.id])
      copie.el.style.clipPath = clip
      copie.el.style.transform = transforme || 'none'
      copie.el.style.opacity = String(opacite)
      poserTitres(copie, p, t, decalageTitres)
      poserCamera(copie, p, local)
      poserRelief(copie, p, t, local, extra)
      poserBulles(copie, p, local)
      attentes.push(posePrise(copie, p, local))
    })
  }
  poserEclair(t)
  poserToiles(t)
  poserReactions(t)
  poserAmoureux(t, derive)
  poserGloutons(t)
  poserSignature(t)
  poserFx(t)
  const flash = M.flashs.reduce((acc, f) => { const age = t - f.instantS; return age < 0 || age > 0.4 ? acc : Math.max(acc, f.force * Math.exp(-age / 0.07)) }, 0)
  $('flash').style.opacity = String(Math.min(0.85, flash))
  await Promise.all(attentes)
}
`

const puce = (langues) => `<div class="puce" dir="ltr">
  <span class="origine" lang="${langues.origine.code}">${echapper(langues.origine.nom)}</span>
  <span class="fleche" style="opacity:0">→</span>
  <span class="cible" lang="${langues.lecteur.code}" style="opacity:0;display:inline-block;overflow:hidden;white-space:nowrap;max-width:0">${echapper(langues.lecteur.nom)}</span>
</div>`

// Un plan : ses titres, l'ombre portée, la carte en relief (épaisseur, cadre, face, reflet) et, pour celui que les toiles
// emportent, le canevas du filet. `copie` : le plan de l'éclair existe deux fois, une par moitié.
const planHtml = (p, copie, { srcdoc }) => `<div class="plan" id="plan-${p.id}-${copie}">
  <div class="titres"><h1 class="titre">${mots(p.titre)}</h1><p class="sous-titre">${mots(p.sousTitre)}</p>${p.langues ? puce(p.langues) : ''}</div>
  <div class="ombre"></div>
  <div class="carte"><div class="epaisseur"></div><div class="cadre"><div class="face">${p.images ? '<img alt="">' : `<iframe srcdoc="${attribut(srcdoc)}" width="440" height="956" scrolling="no"></iframe>`}<div class="reflet"></div></div></div>
    ${p.compte ? `<div class="chip" style="left:${p.dir === 'rtl' ? -175 : 30}px;top:-330px;opacity:0" dir="auto">${echapper(p.compte)}</div>` : ''}</div>
  ${p.id === 'amis' ? `<canvas class="toile plein" width="${CSS_LARGEUR * FACTEUR}" height="${CSS_HAUTEUR * FACTEUR}"></canvas>` : ''}
</div>`

// Le modèle de la page : le plan d'une langue, les images extraites, les écrans du kit et les SVG de Mee et Meo.
export const modeleDeLaPage = ({ plan, images, ecrans }) => {
  const p = (id) => plan.plans.find((x) => x.id === id)
  return {
    dir: plan.dir, dureeS: plan.dureeS, temps: plan.temps,
    plans: plan.plans.map((x) => ({ ...x, dir: plan.dir, images: images[x.id] ?? null, srcdoc: ecrans[x.id] ?? null })),
    festin: plan.festin, amoureux: plan.amoureux,
    flashs: [{ instantS: p('amis').debutS, force: 0.75 }, { instantS: p('signature').debutS, force: 0.5 }],
    eclats: [
      { instantS: 1.6, x: 270, y: 800, couleur: '#F472B6' },
      { instantS: 8.3, x: 400, y: 760 },
      { instantS: 12.75, x: 160, y: 760 },
      { instantS: 14.75, x: 400, y: 760, couleur: '#FB7185' },
      { instantS: 17.4, x: 140, y: 760 },
      { instantS: 22.95, x: 250, y: 690, couleur: '#FDE68A' },
      { instantS: 23.0, x: 270, y: 700 },
    ],
    lueurs: [
      { x: 90, y: 160, r: 260, vx: 0.3, vy: 0.2, a: 0.55, couleur: 'radial-gradient(circle, rgba(236,72,153,0.8), transparent 70%)' },
      { x: 470, y: 780, r: 300, vx: 0.2, vy: 0.27, a: 0.5, couleur: 'radial-gradient(circle, rgba(129,140,248,0.75), transparent 70%)' },
      { x: 300, y: 480, r: 220, vx: 0.35, vy: 0.15, a: 0.3, couleur: 'radial-gradient(circle, rgba(251,207,232,0.7), transparent 70%)' },
    ],
  }
}

export const documentDuStatut = ({ lang, dir, modele, svgs }) => {
  const signature = modele.plans.find((p) => p.id === 'signature')
  const plans = modele.plans.filter((p) => p.id !== 'signature').flatMap((p) => (p.id === 'rire' ? ['a', 'b'] : ['a']).map((c) => planHtml(p, c, { srcdoc: p.srcdoc })))
  const stickers = modele.amoureux.map((m) => `<div class="mee" id="mee-${m.id}">${svgs[m.id]}</div>`).join('')
  const gloutons = ['mee', 'meo'].map((qui) => `<div class="mee" id="glouton-${qui}">${svgs[`glouton-${qui}`]}</div>`).join('')
  const motsFond = [...RIRES.map((m) => ['rire', m]), ...AMOURS.map((m) => ['amour', m])].map(([famille, m]) => `<div class="mot-fond" data-famille="${famille}">${echapper(m)}</div>`).join('')
  const lueurs = modele.lueurs.map((l, i) => `<div class="lueur-fond" id="lueur-${i}" style="width:${2 * l.r}px;height:${2 * l.r}px;background:${l.couleur}"></div>`).join('')
  const reactions = ['😂', '🤣', '❤️', '😆', '😂', '🔥', '🤣', '😍', '😂'].map((e) => `<div class="reaction">${e}</div>`).join('')
  const plein = (id) => `<canvas class="plein" id="${id}" width="${CSS_LARGEUR * FACTEUR}" height="${CSS_HAUTEUR * FACTEUR}"></canvas>`
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body lang="${lang}"><div id="scene">
  <div id="fond"></div>${lueurs}${motsFond}
  ${plein('bokeh')}
  ${plans.join('\n')}
  ${plein('toile-globale')}
  ${plein('eclair')}
  ${reactions}
  ${stickers}${gloutons}
  <div id="signature"><div class="logo">${LOGO_SVG}</div><div class="marque">Meeshy</div><div class="devise"><span class="ligne">${mots(signature.devise)}</span></div><div class="adresse" dir="ltr">${echapper(signature.adresse)}</div></div>
  ${plein('fx')}
  <div id="vignette"></div><div id="flash"></div>
</div>
<script>window.MODELE = ${JSON.stringify({ ...modele, plans: modele.plans.map(({ srcdoc, ...x }) => x) })};
${MOTEUR}
</script></body></html>`
}
