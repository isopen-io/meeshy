// Briques de composition du kit social : scène, téléphone, loupe, titres, sous-titres,
// signature. Tout se positionne en coordonnées LOGIQUES (inset-inline-start) : l'arabe se
// met en miroir sans une ligne de plus.
import { html, raw } from '../../lib/html.mjs'
import { icon, logo, logoMark } from '../../lib/icons.mjs'
import { cadre, tailleCadre } from '../../lib/cadres.mjs'
import { typo } from '../../lib/composants.mjs'
import { coupeLegende } from '../../lib/gabarits.mjs'
import { langue } from '../../lib/langues.mjs'
import { socialFormat } from './formats.mjs'
import { LIBELLES } from './textes/annonces.mjs'

// Typographie du kit : celle du socle, et un nombre ne se sépare jamais du mot qu'il compte
// (« 0 traducteur », « 12 personnes »).
export const ecrire = (texte, lang) => typo(texte, lang).replace(/(\d) (?=\p{L})/gu, '$1\u00A0')

const px = (n) => `${Math.round(n * 100) / 100}px`

export const tailleScene = (format) => {
  const f = socialFormat(format)
  return { largeur: f.width / f.scale, hauteur: f.height / f.scale }
}

const decorFond = () => html`<div class="gab-bg"><i class="o1"></i><i class="o2"></i><i class="o3"></i><i class="grain"></i></div>`

// La scène : fond de marque (vif, nuit ou aube), puis les calques posés par la composition.
export const scene = ({ format, ctx, fond = 'vif', classe = '', contenu }) => {
  const { largeur, hauteur } = tailleScene(format)
  return html`<div class="canvas social f-${format} fond-${fond} ${classe}" dir="${ctx.dir}" lang="${ctx.lang}" style="width:${largeur}px;height:${hauteur}px">
    ${decorFond()}${contenu}
  </div>`
}

const place = ({ x, y, largeur, hauteur, z }) =>
  [x !== undefined && `inset-inline-start:${px(x)}`, y !== undefined && `top:${px(y)}`, largeur !== undefined && `width:${px(largeur)}`, hauteur !== undefined && `height:${px(hauteur)}`, z !== undefined && `z-index:${z}`]
    .filter(Boolean)
    .join(';')

// Un iPhone (cadre CSS du socle) de `largeur` px, posé en (x, y), éventuellement incliné.
export const telephone = (ecranHtml, { largeur, x, y, rotation = 0, z = 2, classe = '' }) => {
  const nature = tailleCadre('iphone')
  const echelle = largeur / nature.width
  return html`<div class="tel ${classe}" style="${place({ x, y, largeur, hauteur: nature.height * echelle, z })};--rot:${rotation}deg">
    <div class="tel-cadre" style="width:${nature.width}px;height:${nature.height}px;transform:scale(${echelle})">${cadre('iphone', ecranHtml)}</div>
  </div>`
}

// Loupe : l'écran REPRODUIT, agrandi et recadré sur `cible` (sélecteur CSS). Le cadrage
// est calculé dans le navigateur (rendu.mjs) : il suit la mise en page réelle de chaque langue.
export const loupe = (ecranHtml, { cible, x, y, largeur, hauteur, zoom = 'auto', marge = 10, z = 4, rotation = 0, classe = '' }) =>
  html`<div class="loupe ${classe}" data-cible="${cible}" data-zoom="${zoom}" data-marge="${marge}" style="${place({ x, y, largeur, hauteur, z })};--rot:${rotation}deg">
    <div class="loupe-vue">${ecranHtml}</div>
  </div>`

// Titre en deux temps (la seconde phrase en dégradé), ajusté à sa boîte.
export const titre = (texte, ctx, { x, y, largeur, hauteur, taille, classe = '', centre = false }) => {
  const [l1, l2] = coupeLegende(ecrire(texte, ctx.lang))
  return html`<h1 class="gab-caption titre autofit ${centre ? 'centre' : ''} ${classe}" data-sur style="${place({ x, y, largeur, hauteur })};font-size:${taille}px"><span class="l1">${l1}</span>${l2 ? html`<span class="l2">${l2}</span>` : ''}</h1>`
}

// Texte simple ajusté à sa boîte (une chaîne est typographiée, un fragment passe tel quel).
export const texte = (contenu, ctx, { x, y, largeur, hauteur, taille, classe = '', balise = 'p' }) =>
  html`<${balise} class="bloc autofit ${classe}" data-sur style="${place({ x, y, largeur, hauteur })};font-size:${taille}px">${typeof contenu === 'string' ? ecrire(contenu, ctx.lang) : contenu}</${balise}>`

// Sous-titres incrustés, façon vidéo verticale : blanc sur bandeau sombre, ligne par ligne.
export const sousTitre = (contenu, ctx, { y, hauteur = 150, taille = 25, x = 40, largeur }) =>
  html`<div class="st-zone autofit" data-sur style="${place({ x, y, largeur, hauteur })};font-size:${taille}px"><p class="st"><span>${ecrire(contenu, ctx.lang)}</span></p></div>`

// Marque de plan de storyboard : « V1 · 2/4 ».
export const marquePlan = (code, n, total = 4) => html`<span class="plan-chip"><b>${code}</b> ${n}/${total}</span>`

export const drapeauxFleche = (ctx, de, vers, { x, y, taille = 30, z = 6, rotation = -4 }) => {
  const fleche = ctx.dir === 'rtl' ? 'arrowLeft' : 'arrowRight'
  return html`<div class="pastille-langues" style="${place({ x, y, z })};font-size:${taille}px;--rot:${rotation}deg"><span>${langue(de).drapeau}</span>${icon(fleche, { size: Math.round(taille * 0.62) })}<span>${langue(vers).drapeau}</span></div>`
}

// Signature de fin (le logo n'apparaît qu'à la fin d'une vidéo, § 1).
export const signature = (ctx, { x, y, largeur, taille = 52, avecLangues = true, classe = '' }) =>
  html`<div class="signature ${classe}" data-sur style="${place({ x, y, largeur })}">
    <div class="sig-marque">${logo(taille, { radius: 0.28 })}<span style="font-size:${Math.round(taille * 0.62)}px">Meeshy</span></div>
    ${avecLangues ? html`<span class="sig-langues">${icon('globe', { size: 15 })}${LIBELLES.langues76[ctx.lang]}</span>` : ''}
  </div>`

export const marqueDiscrete = (ctx, { x, y, taille = 22 }) =>
  html`<div class="marque-discrete" style="${place({ x, y })}">${logo(taille, { radius: 0.28 })}<span>Meeshy</span></div>`

export const logoSeul = (taille, couleur) => logoMark(taille, couleur)

export const puce = (contenu, { x, y, classe = '', z = 5, rotation = 0 }) =>
  html`<div class="puce ${classe}" style="${place({ x, y, z })};--rot:${rotation}deg">${contenu}</div>`
