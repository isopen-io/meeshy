// La page de motion design de l'en-tête épique (#9904) : un document HTML autonome que Chromium rend IMAGE PAR IMAGE.
// `window.poser(t)` pose l'état exact de l'instant t (secondes) — rien n'est animé par l'horloge du navigateur, donc deux
// rendus du même instant sont identiques. Les écrans de l'app sont les images des VRAIES prises de la vitrine, extraites
// par plan (`images/p<i>/0001.jpg`…) ; tout le reste — fond de la marque, lueurs, particules, typographie — est dessiné ici.
// Le canevas CSS fait 1920×823 ; il est rendu au facteur 2 : 3840×1646, la taille qu'Apple exige.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'

export const CSS_LARGEUR = 1920
export const CSS_HAUTEUR = 823
export const FACTEUR = 2

const LOGO_SVG = readFileSync(resolve(REPO_ROOT, 'apps/ios/logo_master.svg'), 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/id="gradient"/g, 'id="ee-logo-grad"')
  .replace(/url\(#gradient\)/g, 'url(#ee-logo-grad)')
  .replace(/width="1024" height="1024"/, 'width="100%" height="100%"')

// « Bonjour » dans quatorze langues : le motif du fond, qui dérive lentement derrière les écrans.
const SALUTS = [
  ['Bonjour', 'fr'], ['안녕', 'ko'], ['Hola', 'es'], ['مرحبا', 'ar'], ['Ciao', 'it'], ['こんにちは', 'ja'], ['Hello', 'en'],
  ['Olá', 'pt'], ['Hallo', 'de'], ['Jambo', 'sw'], ['नमस्ते', 'hi'], ['Merhaba', 'tr'], ['你好', 'zh'], ['Привет', 'ru'],
].map(([texte, lang]) => ({ texte, lang }))

const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; width: ${CSS_LARGEUR}px; height: ${CSS_HAUTEUR}px; overflow: hidden; background: #1E1B4B; }
body { font-family: -apple-system, 'SF Pro Display', system-ui, 'Helvetica Neue', sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
[lang='ar'] body, body[lang='ar'] { font-family: 'Geeza Pro', 'SF Arabic', 'Noto Sans Arabic', system-ui, sans-serif; }
#scene { position: absolute; inset: 0; overflow: hidden; }
#fond { position: absolute; inset: -10%; background: linear-gradient(160deg, #6366F1 0%, #4F46E5 28%, #4338CA 55%, #312E81 80%, #1E1B4B 100%); }
.halo { position: absolute; border-radius: 50%; filter: blur(60px); mix-blend-mode: screen; }
#particules { position: absolute; inset: 0; width: ${CSS_LARGEUR}px; height: ${CSS_HAUTEUR}px; }
.salut { position: absolute; white-space: nowrap; font-weight: 800; color: rgba(224,231,255,0.05); letter-spacing: -0.02em; }
.telephone .rayons { position: absolute; width: 1500px; height: 1500px; left: -750px; top: -750px; border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(199,210,254,0.16) 0deg 4deg, transparent 4deg 18deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 30%, transparent 68%); mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 30%, transparent 68%); mix-blend-mode: screen; }
.loupe { position: absolute; top: 50%; left: 0; display: none; border-radius: 34px; overflow: hidden; background: #fff;
  box-shadow: 0 40px 100px rgba(10,8,40,0.6), 0 0 0 3px rgba(255,255,255,0.85), 0 0 60px rgba(165,180,252,0.55); }
.loupe img { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#vignette { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(15,12,41,0.55) 100%); pointer-events: none; }
#flash { position: absolute; inset: 0; background: #EEF2FF; opacity: 0; mix-blend-mode: screen; }
.telephone { position: absolute; top: 50%; left: 0; width: 0; height: 0; transform-style: preserve-3d; }
.telephone .lueur { position: absolute; width: 760px; height: 760px; left: -380px; top: -380px; border-radius: 50%;
  background: radial-gradient(circle, rgba(165,180,252,0.85) 0%, rgba(129,140,248,0.35) 35%, transparent 70%); filter: blur(30px); mix-blend-mode: screen; }
.telephone .corps { position: absolute; border-radius: 52px; background: linear-gradient(145deg, #2a2760, #0b0a1f 55%);
  padding: 9px; box-shadow: 0 40px 90px rgba(10,8,40,0.65), 0 0 0 1.5px rgba(255,255,255,0.22) inset, 0 0 0 1px rgba(255,255,255,0.08); }
.telephone .ecran { position: relative; width: 100%; height: 100%; border-radius: 44px; overflow: hidden; background: #000; }
.telephone .ecran img { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.telephone .reflet { position: absolute; inset: 0; border-radius: 44px; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.06) 100%); }
.colonne { position: absolute; top: 0; height: 100%; width: 900px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 18px; }
.titre { margin: 0; font-weight: 850; font-size: 104px; line-height: 1.0; letter-spacing: -0.03em; text-wrap: balance; text-shadow: 0 6px 30px rgba(20,16,70,0.45); }
[lang='ar'] .titre { font-weight: 800; letter-spacing: 0; line-height: 1.25; }
.sous-titre { margin: 0; font-weight: 650; font-size: 52px; line-height: 1.1; color: #C7D2FE; text-wrap: balance; }
.mot { display: inline-block; white-space: pre; will-change: transform, opacity, filter; }
.puce { display: inline-flex; align-items: center; gap: 14px; padding: 14px 30px; border-radius: 999px; font-weight: 700; font-size: 34px;
  background: rgba(255,255,255,0.14); border: 1.5px solid rgba(255,255,255,0.34); box-shadow: 0 10px 30px rgba(20,16,70,0.35); backdrop-filter: blur(6px); }
.puce .fleche { color: #A5B4FC; font-weight: 800; }
.puce .cible { color: #fff; }
.puce .origine { color: #E0E7FF; }
.citation { max-width: 880px; margin-top: 8px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.citation .avant { font-size: 36px; font-weight: 600; color: #E0E7FF; opacity: 0.75; text-wrap: balance; }
.citation .apres { font-size: 60px; font-weight: 800; line-height: 1.12; text-wrap: balance; text-shadow: 0 4px 24px rgba(20,16,70,0.5); }
.slam { margin: 0; font-weight: 900; font-size: 128px; line-height: 1.0; letter-spacing: -0.035em; text-wrap: balance; text-shadow: 0 8px 34px rgba(20,16,70,0.55); }
.slam .mot, #signature .devise .mot { background: linear-gradient(180deg, #FFFFFF 35%, #C7D2FE 100%); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; }
[lang='ar'] .slam { font-weight: 800; letter-spacing: 0; line-height: 1.3; }
#signature { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
#signature .logo { width: 250px; height: 250px; border-radius: 56px; overflow: hidden;
  box-shadow: 0 30px 80px rgba(15,12,41,0.55), 0 0 0 2px rgba(255,255,255,0.35); }
#signature .marque { font-weight: 800; font-size: 72px; letter-spacing: -0.02em; }
#signature .devise { font-weight: 850; font-size: 118px; line-height: 1.05; letter-spacing: -0.03em; text-wrap: balance; text-align: center; max-width: 1500px;
  filter: drop-shadow(0 10px 36px rgba(20,16,70,0.5)); }
[lang='ar'] #signature .devise { letter-spacing: 0; font-weight: 800; }
#anneau { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; border-radius: 50%; border: 6px solid rgba(199,210,254,0.9); opacity: 0; }
`

// Le moteur de la page : il reçoit le plan (JSON) et pose chaque calque à l'instant t. Écrit en JS de navigateur.
const MOTEUR = String.raw`
const P = window.PLAN
const W = ${CSS_LARGEUR}, H = ${CSS_HAUTEUR}, FPS = ${30}
const RTL = P.dir === 'rtl'
const T = P.tempsS
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const lin = (t, a, b) => clamp((t - a) / (b - a), 0, 1)
const easeOut = (u) => 1 - Math.pow(1 - u, 3)
const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u)
const backOut = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2) }
const mix = (a, b, u) => a + (b - a) * u
const $ = (id) => document.getElementById(id)

// Graine fixe : les particules sont les mêmes à chaque rendu.
let graine = 1234567
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646 }
const POUSSIERES = Array.from({ length: 150 }, () => ({ x: alea() * W, y: alea() * H, r: 0.6 + alea() * 2.2, v: 6 + alea() * 22, p: alea() * 6.28, a: 0.25 + alea() * 0.55 }))
const ECLATS = P.coups.map((c) => ({ ...c, grains: Array.from({ length: c.force > 1 ? 90 : 48 }, () => ({ ang: alea() * 6.283, v: 140 + alea() * 520, r: 1.2 + alea() * 3.2, vie: 0.6 + alea() * 0.7, dore: alea() < 0.65 })) }))

// L'impulsion du tempo : chaque temps éclaire, la mesure plus fort.
const impulsion = (t) => {
  if (t < 0) return 0
  const k = Math.floor(t / T)
  const u = t - k * T
  return Math.exp(-u / 0.16) * (k % 4 === 0 ? 1 : 0.45)
}

const SALUTS = Array.from(document.querySelectorAll('.salut')).map((el, i) => ({ el, x: alea() * W, y: 40 + alea() * (H - 120), taille: 60 + alea() * 110, v: (8 + alea() * 18) * (i % 2 ? 1 : -1) }))
SALUTS.forEach((s) => { s.el.style.fontSize = s.taille + 'px' })
const poserSaluts = (t, eclat) => SALUTS.forEach((s) => {
  const x = ((s.x + s.v * t) % (W + 600) + (W + 600)) % (W + 600) - 300
  s.el.style.transform = 'translate(' + x + 'px,' + s.y + 'px)'
  s.el.style.color = 'rgba(224,231,255,' + (0.04 + 0.035 * eclat).toFixed(3) + ')'
})

// Un titre trop long pour sa colonne se resserre jusqu'à y tenir, une fois pour toutes.
for (const el of document.querySelectorAll('.titre, .slam, .sous-titre, .apres, .devise')) {
  const colonne = el.closest('.colonne, #signature')
  const max = colonne?.id === 'signature' ? 1500 : (parseFloat(colonne?.style.width) || 880) - 20
  el.style.display = 'block'
  let corps = parseFloat(getComputedStyle(el).fontSize)
  const parent = el.closest('.colonne, #signature, .citation')
  const caches = [parent, parent?.parentElement].filter(Boolean).map((n) => [n, n.style.display])
  caches.forEach(([n]) => { n.style.display = 'flex' })
  while (corps > 20 && (el.scrollWidth > max + 1 || el.getBoundingClientRect().width > max + 1 || el.getBoundingClientRect().height > corps * 3.4)) {
    corps -= 2; el.style.fontSize = corps + 'px'
  }
  caches.forEach(([n, d]) => { n.style.display = d })
  el.style.display = ''
}

const ctx = $('particules').getContext('2d')
const dessinerParticules = (t, intensite) => {
  ctx.setTransform(${FACTEUR}, 0, 0, ${FACTEUR}, 0, 0)
  ctx.clearRect(0, 0, W, H)
  for (const p of POUSSIERES) {
    const y = ((p.y - p.v * t) % H + H) % H
    const x = p.x + Math.sin(t * 0.7 + p.p) * 14
    const a = p.a * (0.55 + 0.45 * Math.sin(t * 2.3 + p.p)) * (0.6 + intensite)
    ctx.fillStyle = 'rgba(224,231,255,' + a.toFixed(3) + ')'
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283); ctx.fill()
  }
  for (const e of ECLATS) {
    const age = t - e.instantS
    if (age < 0 || age > 1.4) continue
    for (const g of e.grains) {
      if (age > g.vie) continue
      const u = age / g.vie
      const d = g.v * easeOut(Math.min(1, age / 0.9)) * (e.force > 1 ? 1.25 : 1)
      const x = e.x + Math.cos(g.ang) * d
      const y = e.y + Math.sin(g.ang) * d + 120 * age * age
      ctx.fillStyle = g.dore ? 'rgba(253,224,71,' + (1 - u).toFixed(3) + ')' : 'rgba(238,242,255,' + (1 - u).toFixed(3) + ')'
      ctx.beginPath(); ctx.arc(x, y, g.r * (1 - 0.5 * u), 0, 6.283); ctx.fill()
    }
  }
}

const telephones = P.plans.filter((p) => p.images).map((p, i) => ({ plan: p, el: $('tel-' + p.id), img: $('img-' + p.id), loupe: $('loupe-' + p.id), limg: $('limg-' + p.id), chargee: -1 }))

const poserTelephone = async (tel, t) => {
  const p = tel.plan
  const { el, img } = tel
  const avant = 0.30, apres = 0.20
  if (t < p.debutS - 0.001 || t >= p.finS + (p.sortie ? apres : 0)) { el.style.display = 'none'; if (tel.loupe) tel.loupe.style.display = 'none'; return }
  el.style.display = 'block'
  const local = t - p.debutS
  const duree = p.finS - p.debutS
  // L'image de la prise : l'instant du plan, tenue sur la dernière quand le clip s'achève.
  const k = clamp(Math.floor(local * FPS + 1e-6), 0, p.images.nombre - 1)
  if (tel.chargee !== k) {
    img.src = p.images.dossier + '/' + String(k + 1).padStart(4, '0') + '.jpg'
    if (tel.limg) tel.limg.src = img.src
    tel.chargee = k
    await Promise.all([img.decode().catch(() => {}), tel.limg ? tel.limg.decode().catch(() => {}) : null])
  }
  // La caméra dans l'écran natif.
  const u = easeInOut(clamp(local / duree, 0, 1))
  const cam = { x: mix(p.camera.de.x, p.camera.a.x, u), y: mix(p.camera.de.y, p.camera.a.y, u), l: mix(p.camera.de.largeur, p.camera.a.largeur, u) }
  const s = p.ecran.largeur / cam.l
  img.style.width = (1320 * s) + 'px'
  img.style.height = (2868 * s) + 'px'
  img.style.transform = 'translate(' + (-cam.x * s) + 'px,' + (-cam.y * s) + 'px)'
  // L'entrée : un coup de fouet depuis le bord (ou un coup de poing quand le plan suit un plan du même acte).
  const sens = p.cote === 'droite' ? 1 : -1
  const entree = p.entree === 'fouet' ? easeOut(lin(local, 0, avant)) : 1
  const poing = p.entree === 'poing' ? 1 + 0.07 * Math.exp(-local / 0.09) : 1
  const sortie = p.sortie ? easeInOut(lin(t, p.finS - 0.001, p.finS + apres)) : 0
  const tx = p.pose.ecranX + sens * (1 - entree) * 700 - sens * sortie * 500
  const ry = sens * -13 + sens * (1 - entree) * -38 + Math.sin(local * 1.4) * 2.2
  const rx = 3 + Math.sin(local * 0.9 + 1) * 1.5
  const echelle = (0.94 + 0.06 * easeOut(entree)) * poing * (1 + 0.025 * u)
  const secousse = p.secousses.reduce((acc, c) => { const age = t - c.instantS; return age < 0 || age > 0.35 ? acc : acc + Math.exp(-age / 0.08) * c.force }, 0)
  const sx = Math.sin(t * 90) * 9 * secousse, sy = Math.cos(t * 77) * 7 * secousse
  const flou = (1 - entree) * 16 + sortie * 14
  el.style.opacity = String(Math.min(entree * 1.6, 1) * (1 - sortie))
  el.style.filter = flou > 0.2 ? 'blur(' + flou.toFixed(1) + 'px)' : 'none'
  el.style.transform = 'translate(' + (tx + sx) + 'px,' + sy + 'px) perspective(2200px) rotateY(' + ry + 'deg) rotateX(' + rx + 'deg) scale(' + echelle + ')'
  const lueur = el.querySelector('.lueur')
  lueur.style.opacity = String(0.35 + 0.5 * impulsion(t) + 0.8 * secousse)
  const rayons = el.querySelector('.rayons')
  const jeu = t >= P.jeuS ? 1 : 0.45
  rayons.style.transform = 'rotate(' + (t * 9 * sens) + 'deg) scale(' + (1 + 0.08 * impulsion(t)) + ')'
  rayons.style.opacity = String(jeu * (0.55 + 0.45 * impulsion(t) + secousse))
  if (tel.loupe) poserLoupe(tel, t, local, entree, sortie, sens, secousse)
}

// La loupe sort de l'écran, agrandit le rectangle qui VIT (le coup, le coffre, l'anneau, le karaoké) et tient.
const poserLoupe = (tel, t, local, entree, sortie, sens, secousse) => {
  const p = tel.plan, el = tel.loupe, img = tel.limg
  const r = p.loupe
  const largeur = parseFloat(el.style.width)
  const k = largeur / r.largeur
  img.style.width = (1320 * k) + 'px'
  img.style.height = (2868 * k) + 'px'
  img.style.transform = 'translate(' + (-r.x * k) + 'px,' + (-r.y * k) + 'px)'
  const u = backOut(lin(local, 0.12, 0.5))
  const x = mix(p.pose.ecranX, p.pose.loupeX, easeOut(lin(local, 0.12, 0.5))) - sens * sortie * 300
  const y = H / 2 + 20 + Math.sin(local * 1.7) * 6
  el.style.display = local >= 0.12 ? 'block' : 'none'
  el.style.left = x + 'px'
  el.style.top = y + 'px'
  const respire = 1 + 0.015 * Math.sin(local * 2.2) + 0.04 * secousse
  el.style.transform = 'perspective(2200px) rotateY(' + (sens * 6 * (1 - u) + sens * -4) + 'deg) scale(' + (mix(0.25, 1, clamp(u, 0, 1.2)) * respire) + ')'
  el.style.opacity = String(clamp(u * 1.5, 0, 1) * (1 - sortie))
}

// La typographie : un bloc par acte, chaque mot entre en remontant, flou levé, sur un léger dépassement.
const poserMots = (bloc, t, debut, pas = 0.065, duree = 0.42) => {
  bloc.querySelectorAll('.mot').forEach((m, i) => {
    const u = lin(t, debut + i * pas, debut + i * pas + duree)
    m.style.opacity = String(easeOut(u))
    m.style.transform = 'translateY(' + ((1 - backOut(u)) * 46) + 'px) scale(' + mix(0.92, 1, backOut(u)) + ')'
    m.style.filter = u < 1 ? 'blur(' + ((1 - u) * 10).toFixed(1) + 'px)' : 'none'
  })
}

const poserBloc = (bloc, t, b) => {
  const visible = t >= b.debutS - 0.001 && t < b.finS + 0.25
  bloc.style.display = visible ? 'flex' : 'none'
  if (!visible) return
  const sortie = easeInOut(lin(t, b.finS - 0.02, b.finS + 0.22))
  bloc.style.left = (b.pose.colonneX - b.pose.colonneLargeur / 2) + 'px'
  bloc.style.width = b.pose.colonneLargeur + 'px'
  bloc.style.opacity = String(1 - sortie)
  bloc.style.transform = 'translateY(' + (-sortie * 40) + 'px)'
  bloc.style.filter = sortie > 0.01 ? 'blur(' + (sortie * 12).toFixed(1) + 'px)' : 'none'
  const titre = bloc.querySelector('.titre, .slam')
  if (titre) poserMots(titre, t, b.debutS + 0.04)
  const sous = bloc.querySelector('.sous-titre')
  if (sous) poserMots(sous, t, b.debutS + (b.sousTitreS ?? 0.32), 0.05, 0.38)
  if (b.slam && titre) {
    const age = t - b.debutS
    titre.style.transform = 'scale(' + (1 + 0.35 * Math.exp(-Math.max(0, age) / 0.07)) + ')'
  }
}

const poserPuce = (puce, t, debut, bascule) => {
  if (!puce) return
  const u = backOut(lin(t, debut, debut + 0.32))
  puce.style.opacity = String(clamp(u, 0, 1))
  puce.style.transform = 'scale(' + mix(0.6, 1, u) + ')'
  const cible = puce.querySelector('.cible'), fleche = puce.querySelector('.fleche')
  if (bascule === undefined || bascule === null) return
  const v = easeOut(lin(t, bascule, bascule + 0.3))
  cible.style.opacity = String(v); fleche.style.opacity = String(v)
  cible.style.maxWidth = (v * 420) + 'px'
  puce.style.boxShadow = '0 10px 30px rgba(20,16,70,0.35), 0 0 ' + (40 * Math.exp(-Math.max(0, t - bascule) / 0.3) * (t >= bascule ? 1 : 0)) + 'px rgba(199,210,254,0.95)'
}

const poserCitation = (c, t, debut) => {
  if (!c) return
  poserPuce(c.querySelector('.puce'), t, debut, null)
  const avant = c.querySelector('.avant'), apres = c.querySelector('.apres')
  const ua = easeOut(lin(t, debut + 0.05, debut + 0.28))
  avant.style.opacity = String(mix(0, 0.85, ua) * mix(1, 0.55, lin(t, debut + 0.45, debut + 0.7)))
  avant.style.transform = 'translateY(' + ((1 - ua) * 14) + 'px)'
  const ub = easeOut(lin(t, debut + 0.32, debut + 0.72))
  const debutBord = RTL ? 'inset(0 0 0 ' + ((1 - ub) * 100) + '%)' : 'inset(0 ' + ((1 - ub) * 100) + '% 0 0)'
  apres.style.clipPath = debutBord
  apres.style.opacity = String(Math.min(1, ub * 2))
}

const poserSignature = (t) => {
  const s = P.signature
  const el = $('signature')
  const local = t - s.debutS
  el.style.display = local >= 0 ? 'flex' : 'none'
  if (local < 0) return
  const fin = easeInOut(lin(t, P.dureeS - 0.4, P.dureeS))
  const logo = el.querySelector('.logo')
  const ul = backOut(lin(local, 0.0, 0.55))
  logo.style.transform = 'scale(' + mix(0.2, 1, ul) + ') rotate(' + ((1 - ul) * -18) + 'deg)'
  logo.style.opacity = String(clamp(ul * 1.5, 0, 1) * (1 - fin))
  const marque = el.querySelector('.marque')
  const um = easeOut(lin(local, 0.25, 0.6))
  marque.style.opacity = String(um * (1 - fin))
  marque.style.transform = 'translateY(' + ((1 - um) * 20) + 'px)'
  const devise = el.querySelector('.devise')
  poserMots(devise, t, s.debutS + 0.45, 0.08, 0.45)
  devise.style.opacity = String(1 - fin)
  const anneau = $('anneau')
  const ua = lin(local, 0, 0.9)
  const r = 40 + easeOut(ua) * 1300
  anneau.style.width = anneau.style.height = r + 'px'
  anneau.style.marginLeft = anneau.style.marginTop = (-r / 2) + 'px'
  anneau.style.opacity = String((1 - ua) * 0.9)
  anneau.style.borderWidth = (8 * (1 - ua) + 1) + 'px'
}

window.poser = async (t) => {
  // Le fond respire avec la musique, s'éclaire au fil des actes, et s'embrase au final.
  const final = lin(t, P.jeuS, P.jeuS + 0.6)
  const pouls = impulsion(t)
  $('fond').style.filter = 'brightness(' + (0.9 + 0.12 * pouls + 0.12 * final) + ') saturate(' + (1.05 + 0.15 * final) + ')'
  P.halos.forEach((h, i) => {
    const el = $('halo-' + i)
    const x = h.x + Math.sin(t * h.vx + i) * 160, y = h.y + Math.cos(t * h.vy + i * 2) * 90
    el.style.left = (x - h.r) + 'px'; el.style.top = (y - h.r) + 'px'
    el.style.opacity = String(h.a * (0.8 + 0.4 * pouls) * (1 + 0.4 * final))
  })
  const flash = P.flashs.reduce((acc, f) => { const age = t - f.instantS; return age < 0 || age > 0.4 ? acc : Math.max(acc, f.force * Math.exp(-age / 0.07)) }, 0)
  $('flash').style.opacity = String(Math.min(0.85, flash))
  dessinerParticules(t, 0.4 * pouls + final)
  poserSaluts(t, pouls * 0.6 + final * 0.5)
  await Promise.all(telephones.map((tel) => poserTelephone(tel, t)))
  for (const b of P.blocs) {
    const el = $('bloc-' + b.id)
    poserBloc(el, t, b)
    poserPuce(el.querySelector(':scope > .puce'), t, b.debutS + (b.puceS ?? 0.2), b.basculeS ?? null)
  }
  for (const c of P.citations) poserCitation($('cit-' + c.id), t, c.debutS)
  poserSignature(t)
  // La boucle d'Apple : la première et la dernière image se rejoignent sur le fond seul.
  const boucle = Math.min(lin(t, 0, 0.12), 1 - lin(t, P.dureeS - 0.12, P.dureeS))
  $('scene').style.opacity = String(clamp(boucle + 0.0, 0, 1))
}
`

// La loupe : 660 px CSS de large au plus, 430 de haut au plus, au rapport du rectangle qu'elle agrandit.
export const tailleDeLoupe = (rect) => {
  const k = Math.min(660 / rect.largeur, 430 / rect.hauteur)
  return { largeur: Math.round(rect.largeur * k), hauteur: Math.round(rect.hauteur * k), echelle: k }
}

const mots = (texte) => texte.split(/(\s+)/u).filter((m) => m.length).map((m) => (/^\s+$/u.test(m) ? m : `<span class="mot">${echapper(m)}</span>`)).join('')

const puce = (langues, { basculeAvecCible = false } = {}) => `<div class="puce" dir="ltr">
  <span class="origine" lang="${langues.origine.code}">${echapper(langues.origine.nom)}</span>
  <span class="fleche"${basculeAvecCible ? ' style="opacity:0"' : ''}>→</span>
  <span class="cible" lang="${langues.lecteur.code}"${basculeAvecCible ? ' style="opacity:0;display:inline-block;overflow:hidden;white-space:nowrap;max-width:0"' : ''}>${echapper(langues.lecteur.nom)}</span>
</div>`

// Le document : `donnees` est le modèle de la page (pageDeLEntete) — plans à écrans, blocs de texte, citations, coups.
export const documentDeLEntete = ({ lang, dir, donnees }) => {
  const telephones = donnees.plans.filter((p) => p.images).map((p) => `<div class="telephone" id="tel-${p.id}" style="display:none">
    <div class="rayons"></div><div class="lueur"></div>
    <div class="corps" style="left:${-p.ecran.largeur / 2 - 9}px;top:${-p.ecran.hauteur / 2 - 9}px;width:${p.ecran.largeur + 18}px;height:${p.ecran.hauteur + 18}px">
      <div class="ecran"><img id="img-${p.id}" alt=""></div><div class="reflet"></div>
    </div></div>`).join('\n')
  const blocs = donnees.blocs.map((b) => `<div class="colonne" id="bloc-${b.id}" style="display:none;width:${b.pose.colonneLargeur}px">
    ${b.slam ? `<h1 class="slam">${mots(b.titre)}</h1>` : `<h1 class="titre">${mots(b.titre)}</h1>`}
    ${b.sousTitre ? `<p class="sous-titre">${mots(b.sousTitre)}</p>` : ''}
    ${b.langues ? puce(b.langues, { basculeAvecCible: Number.isFinite(b.basculeS) }) : ''}
    ${(b.citations ?? []).map((c) => `<div class="citation" id="cit-${c.id}" style="display:none">${puce(c.langues)}
      <div class="avant" lang="${c.langues.origine.code}" dir="auto">${echapper(c.original)}</div>
      <div class="apres" dir="auto">${echapper(c.traduction)}</div></div>`).join('')}
  </div>`).join('\n')
  const halos = donnees.halos.map((h, i) => `<div class="halo" id="halo-${i}" style="width:${2 * h.r}px;height:${2 * h.r}px;background:${h.couleur}"></div>`).join('')
  const loupes = donnees.plans.filter((p) => p.loupe).map((p) => {
    const l = tailleDeLoupe(p.loupe)
    return `<div class="loupe" id="loupe-${p.id}" style="width:${l.largeur}px;height:${l.hauteur}px;margin-left:${-l.largeur / 2}px;margin-top:${-l.hauteur / 2}px"><img id="limg-${p.id}" alt=""></div>`
  }).join('\n')
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>${CSS}</style></head>
<body lang="${lang}"><div id="scene">
  <div id="fond"></div>${halos}
  ${SALUTS.map((m, i) => `<div class="salut" id="salut-${i}" lang="${m.lang}">${echapper(m.texte)}</div>`).join('')}
  <canvas id="particules" width="${CSS_LARGEUR * FACTEUR}" height="${CSS_HAUTEUR * FACTEUR}"></canvas>
  ${telephones}
  ${loupes}
  ${blocs}
  <div id="anneau"></div>
  <div id="signature" style="display:none"><div class="logo">${LOGO_SVG}</div><div class="marque">Meeshy</div><div class="devise">${mots(donnees.signature.titre)}</div></div>
  <div id="vignette"></div><div id="flash"></div>
</div>
<script>window.PLAN = ${JSON.stringify(donnees)};
${MOTEUR}
// Une citation n'est visible que pendant son plan.
const _poser = window.poser
window.poser = async (t) => {
  for (const c of window.PLAN.citations) document.getElementById('cit-' + c.id).style.display = t >= c.debutS - 0.001 && t < c.finS ? 'flex' : 'none'
  await _poser(t)
}
</script></body></html>`
}
