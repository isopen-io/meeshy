// Passes de mise en page exécutées DANS le navigateur, avant la capture :
//   1. chaque loupe se cadre sur sa cible (la mise en page réelle de la langue) ;
//   2. chaque boîte .autofit réduit sa police jusqu'à contenir son texte ;
// puis le vérificateur relève tout texte qui déborde de sa boîte, du cadre ou de la zone sûre.
import { tailleScene } from './decor.mjs'

const arrondi = (n) => Math.round(n * 10) / 10

// Zone où le texte posé par le kit doit tenir. Vidéos verticales : l'interface de l'app de
// diffusion couvre le haut, le bas (légende, boutons) et la fin de ligne. Stories Meeshy :
// les barres de progression en haut, le champ de réponse en bas.
// Couvertures : Instagram et TikTok les montrent en grille 3:4, recadrées au centre (bande
// 12,5 % → 87,5 %) — le texte y garde 2,5 % de marge de plus.
export const zoneSure = ({ format, role, dir }) => {
  const { largeur: W, hauteur: H } = tailleScene(format)
  if (format !== '9x16') return { haut: 12, bas: H - 12, gauche: 12, droite: W - 12 }
  const story = role === 'story Meeshy'
  const couverture = role === 'couverture'
  const debut = arrondi(W * (story ? 0.04 : 0.06))
  const fin = arrondi(W * (story ? 0.04 : 0.11))
  return {
    haut: arrondi(H * (story ? 0.14 : couverture ? 0.15 : 0.05)),
    bas: arrondi(H * (couverture ? 0.85 : 0.84)),
    gauche: dir === 'rtl' ? fin : debut,
    droite: arrondi(W - (dir === 'rtl' ? debut : fin)),
  }
}

const passes = () => {
  const cheminVers = (el, racine) => {
    let x = 0
    let y = 0
    let n = el
    while (n && n !== racine) {
      x += n.offsetLeft
      y += n.offsetTop
      n = n.offsetParent
    }
    return { x, y }
  }
  for (const loupe of document.querySelectorAll('.loupe')) {
    const vue = loupe.querySelector('.loupe-vue')
    const ecran = vue.firstElementChild
    const cible = ecran.querySelector(loupe.dataset.cible)
    if (!cible) throw new Error(`loupe : cible introuvable « ${loupe.dataset.cible} »`)
    const { x, y } = cheminVers(cible, ecran)
    const w = cible.offsetWidth
    const h = cible.offsetHeight
    const W = loupe.clientWidth
    const m = Number(loupe.dataset.marge)
    const zoom = loupe.dataset.zoom === 'auto' ? Math.min(W / (w + 2 * m), loupe.clientHeight / (h + 2 * m), 2.6) : Number(loupe.dataset.zoom)
    // La hauteur déclarée est un plafond : la loupe se resserre sur sa cible, sans voisins rognés.
    const H = Math.min(loupe.clientHeight, Math.ceil((h + 2 * m) * zoom))
    loupe.style.height = `${H}px`
    const borne = (v, min) => Math.max(min, Math.min(0, v))
    const tx = borne(W / (2 * zoom) - (x + w / 2), W / zoom - ecran.offsetWidth)
    const ty = borne(H / (2 * zoom) - (y + h / 2), H / zoom - ecran.offsetHeight)
    vue.style.transform = `scale(${zoom.toFixed(4)}) translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`
  }
  for (const el of document.querySelectorAll('.autofit')) {
    const deborde = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
    let taille = parseFloat(getComputedStyle(el).fontSize)
    const plancher = taille * 0.55
    while (deborde() && taille > plancher) {
      taille -= 0.5
      el.style.fontSize = `${taille}px`
    }
  }
}

const releve = (zone) => {
  const problemes = []
  const canvas = document.querySelector('.canvas.social') ?? document.body.firstElementChild
  const C = canvas.getBoundingClientRect()
  const nom = (el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48)
  const HORS_TEXTE = '.tel, .loupe, .fond-illu, .constellation, .gab-bg'
  for (const el of canvas.querySelectorAll('.autofit')) {
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) problemes.push(`déborde de sa boîte : « ${nom(el)} »`)
  }
  const marcheur = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (!n.textContent.trim()) continue
    const parent = n.parentElement
    if (parent.closest(HORS_TEXTE)) continue
    range.selectNodeContents(n)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0)
    const sur = parent.closest('[data-sur]')
    const taille = parseFloat(getComputedStyle(parent).fontSize)
    if (taille < 9) problemes.push(`texte trop petit (${taille}px) : « ${nom(parent)} »`)
    for (const r of rects) {
      if (r.left < C.left - 1 || r.right > C.right + 1 || r.top < C.top - 1 || r.bottom > C.bottom + 1) {
        problemes.push(`hors du cadre : « ${nom(parent)} »`)
        break
      }
      if (sur && (r.left < C.left + zone.gauche - 1 || r.right > C.left + zone.droite + 1 || r.top < C.top + zone.haut - 1 || r.bottom > C.top + zone.bas + 1)) {
        problemes.push(`hors zone sûre : « ${nom(parent)} »`)
        break
      }
    }
  }
  return [...new Set(problemes)]
}

export const preparer = async (page) => {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(passes)
}

export const verifier = (page, zone) => page.evaluate(releve, zone)
