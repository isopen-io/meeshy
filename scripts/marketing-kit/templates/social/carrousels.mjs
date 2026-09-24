// 4:5 — carrousels Instagram C1-C4, toutes leurs slides (contenu-par-format.md § 2).
// Scène 540 × 675 : marque et compteur en haut, titre, puis l'écran reproduit qui déborde en bas.
import { html } from '../../lib/html.mjs'
import { icon, logo, meeshCoin } from '../../lib/icons.mjs'
import { contexte, ecran } from '../../lib/gabarits.mjs'
import { langue } from '../../lib/langues.mjs'
import { waveformHeights } from '../../screens/audio.mjs'
import { DEMO } from '../../textes/demo.mjs'
import { drapeauxFleche, loupe, marqueDiscrete, puce, scene, telephone, titre } from './decor.mjs'
import * as E from './ecrans-sociaux.mjs'
import { LANGUES_TRADUISIBLES } from './langues-traduisibles.mjs'
import { CARROUSELS, LIBELLES } from './textes/annonces.mjs'

const F = '4x5'
const FONDS = { C1: 'vif', C2: 'nuit', C3: 'aube', C4: 'vif' }
const AMI = { fr: 'es', en: 'es', es: 'fr', de: 'es', it: 'pt', pt: 'es', ar: 'en' }
const sc = (ctx, theme) => contexte({ lang: ctx.lang, theme })

const compteur = (i, n, ctx) =>
  html`<div class="compteur" data-sur>${i + 1}/${n}${i === 0 ? html`<span class="flip-rtl">${icon('forward', { size: 13 })}</span>` : ''}</div>`

const slide = ({ ctx, c, i, visuel, titreOpts = {}, classe = '' }) => {
  const n = CARROUSELS[c].length
  return scene({
    format: F, ctx, fond: FONDS[c], classe: `carrousel ${classe}`,
    contenu: html`${marqueDiscrete(ctx, { x: 28, y: 24 })}${compteur(i, n, ctx)}
      ${titre(CARROUSELS[c][i][ctx.lang], ctx, { x: 28, y: 66, largeur: 484, hauteur: 150, taille: 38, ...titreOpts })}
      ${visuel}`,
  })
}

const tel = (ecranHtml, options = {}) => telephone(ecranHtml, { largeur: 272, x: 134, y: 232, ...options })
const telGauche = (ecranHtml, options = {}) => tel(ecranHtml, { x: 40, ...options })

const cta = ({ ctx, c, i, extra, classe = '', titreOpts = {} }) =>
  slide({
    ctx, c, i, classe: `cta ${classe}`,
    titreOpts: { y: 120, hauteur: 200, taille: 44, centre: true, ...titreOpts },
    visuel: html`${extra}
      <div class="cta-pied" data-sur>${logo(64, { radius: 0.28 })}<b>Meeshy</b><span class="pill-store">${LIBELLES.telecharger[ctx.lang]}</span><span class="pill-langues">${icon('globe', { size: 14 })}${LIBELLES.langues76[ctx.lang]}</span></div>`,
  })

const murDeLangues = () =>
  html`<div class="mur-langues autofit" data-sur>${LANGUES_TRADUISIBLES.map((l, k) => html`<span class="p${k % 4}" lang="${l.code}" dir="auto">${l.nom}</span>`)}</div>`

const numero = (n) => puce(html`${n}`, { x: 28, y: 70, classe: 'numero' })

const audioCommentaire = (ctx) =>
  html`<div class="audio-com">
    <div class="ac-tete">${icon('comment', { size: 14 })}<b>${LIBELLES.commentaire[ctx.lang]}</b><span>${langue(ctx.lang).drapeau}</span></div>
    <div class="ac-corps"><span class="ca-play">${icon('play', { size: 16 })}</span><div class="ca-onde">${waveformHeights(30).map((h) => html`<i style="height:${(h * 1.3).toFixed(1)}px"></i>`)}</div><em>0:07</em></div>
  </div>`

const statTuiles = (ctx) => {
  const P = DEMO.progression
  return html`<div class="stat-tuiles" data-sur>
    <div class="st-t flamme">${icon('flame', { size: 28 })}<b>${P.serie}</b><span>${ctx.ui('progression.streak.days', P.serie)}</span></div>
    <div class="st-t niveau">${icon('sparkles', { size: 26 })}<b>${P.niveau}</b><span>${ctx.ui('progression.level', P.niveau)}</span></div>
    <div class="st-t badges">${icon('rosette', { size: 26 })}<b>${P.badges[0]}/${P.badges[1]}</b><span>${ctx.ui('progression.section.badges')}</span></div>
    <div class="st-t meesh">${meeshCoin(28)}<b>${P.meesh}</b><span>${ctx.ui('progression.meesh.title')}</span></div>
  </div>`
}

const storyMiniature = (ctx) =>
  html`<div class="story-mini" data-sur><div class="sm-barres"><i></i><i></i></div><div class="flamme-embleme petit"><span class="fl-ico">${icon('flame', { size: 70 })}</span><b>${DEMO.progression.serie}</b></div><span>${ctx.ui('progression.streak.days', DEMO.progression.serie)}</span></div>`

export const CARROUSELS_4x5 = {
  C1: [
    (ctx) => slide({ ctx, c: 'C1', i: 0, visuel: html`${telGauche(ecran('dm', sc(ctx, 'dark')))}${loupe(ecran('dm', sc(ctx, 'dark')), { cible: '.msg-row.mine .bubble', x: 190, y: 420, largeur: 330, hauteur: 110, rotation: -2 })}` }),
    (ctx) => slide({ ctx, c: 'C1', i: 1, visuel: html`${telGauche(E.ecranChezLAmi(AMI[ctx.lang], ctx.lang))}${loupe(E.ecranChezLAmi(AMI[ctx.lang], ctx.lang), { cible: '.bubble.theirs', x: 190, y: 420, largeur: 330, hauteur: 120, rotation: 2 })}${drapeauxFleche(ctx, ctx.lang, AMI[ctx.lang], { x: 300, y: 330, taille: 28 })}` }),
    (ctx) => slide({ ctx, c: 'C1', i: 2, visuel: html`${telGauche(ecran('dm', sc(ctx, 'dark')))}${loupe(ecran('dm', sc(ctx, 'dark')), { cible: '.bubble.audio', x: 170, y: 380, largeur: 350, hauteur: 230, rotation: -2 })}` }),
    (ctx) => slide({ ctx, c: 'C1', i: 3, titreOpts: { taille: 34 }, visuel: tel(E.ecranConsentementVoix(sc(ctx, 'light'))) }),
    (ctx) => slide({ ctx, c: 'C1', i: 4, visuel: murDeLangues() }),
    (ctx) => cta({ ctx, c: 'C1', i: 5, extra: '' }),
  ],
  C2: [
    (ctx) => slide({ ctx, c: 'C2', i: 0, visuel: tel(ecran('global', sc(ctx, 'dark'))) }),
    (ctx) => slide({ ctx, c: 'C2', i: 1, visuel: html`${telGauche(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 0, saisie: true }))}${loupe(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 0, saisie: true }), { cible: '.composer', x: 130, y: 470, largeur: 390, hauteur: 90, rotation: -2 })}` }),
    (ctx) => slide({ ctx, c: 'C2', i: 2, visuel: html`${telGauche(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 }))}${loupe(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 }), { cible: '.messages .msg-row:last-child .bubble', x: 170, y: 440, largeur: 350, hauteur: 120, rotation: 2 })}` }),
    (ctx) => slide({ ctx, c: 'C2', i: 3, visuel: tel(E.ecranRevelation(sc(ctx, 'dark'), { type: 'succes', valeur: 'first_content' })) }),
    (ctx) => slide({ ctx, c: 'C2', i: 4, visuel: html`${telGauche(E.ecranProgressionAvec(sc(ctx, 'light'), { serie: 1, record: 1, serieJalon: 7 }))}${loupe(E.ecranProgressionAvec(sc(ctx, 'light'), { serie: 1, record: 1, serieJalon: 7 }), { cible: '.p-card.flamme', x: 170, y: 420, largeur: 350, hauteur: 150, rotation: -2 })}` }),
    (ctx) => cta({ ctx, c: 'C2', i: 5, extra: puce(html`${icon('flame', { size: 22 })}<b>1</b>`, { x: 226, y: 330, classe: 'pill-flamme' }) }),
  ],
  C3: [
    (ctx) => slide({
      ctx, c: 'C3', i: 0, titreOpts: { y: 250, hauteur: 190, taille: 44 },
      visuel: html`${puce('5', { x: 28, y: 60, classe: 'cinq' })}<div class="icones-cinq" data-sur>${['globe', 'camera', 'mic', 'people', 'link'].map((n) => html`<span>${icon(n, { size: 26 })}</span>`)}</div>`,
    }),
    (ctx) => slide({ ctx, c: 'C3', i: 1, titreOpts: { x: 104, largeur: 408 }, visuel: html`${numero(1)}${tel(ecran('global', sc(ctx, 'dark')))}` }),
    (ctx) => slide({ ctx, c: 'C3', i: 2, titreOpts: { x: 104, largeur: 408 }, visuel: html`${numero(2)}${tel(E.ecranMaStory(sc(ctx, 'dark')))}` }),
    (ctx) => slide({ ctx, c: 'C3', i: 3, titreOpts: { x: 104, largeur: 408 }, visuel: html`${numero(3)}${telGauche(E.ecranFilMaVille(sc(ctx, 'light')))}${puce(audioCommentaire(ctx), { x: 200, y: 470, rotation: -2, classe: 'com-puce' })}` }),
    (ctx) => slide({ ctx, c: 'C3', i: 4, titreOpts: { x: 104, largeur: 408 }, visuel: html`${numero(4)}${tel(ecran('groupe', sc(ctx, 'light')))}` }),
    (ctx) => slide({ ctx, c: 'C3', i: 5, titreOpts: { x: 104, largeur: 408, taille: 34 }, visuel: html`${numero(5)}${tel(ecran('invitation', sc(ctx, 'light')))}` }),
    (ctx) => cta({ ctx, c: 'C3', i: 6, extra: '' }),
  ],
  C4: [
    (ctx) => slide({ ctx, c: 'C4', i: 0, visuel: statTuiles(ctx) }),
    (ctx) => slide({ ctx, c: 'C4', i: 1, visuel: html`${telGauche(ecran('progression', sc(ctx, 'light')))}${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-card.flamme', x: 170, y: 420, largeur: 350, hauteur: 170, rotation: -2 })}` }),
    (ctx) => slide({ ctx, c: 'C4', i: 2, visuel: tel(E.ecranBadges(sc(ctx, 'light'))) }),
    (ctx) => slide({ ctx, c: 'C4', i: 3, titreOpts: { taille: 34 }, visuel: tel(ecran('succes', sc(ctx, 'dark'))) }),
    (ctx) => slide({ ctx, c: 'C4', i: 4, visuel: html`${telGauche(ecran('progression', sc(ctx, 'light')))}${loupe(ecran('progression', sc(ctx, 'light')), { cible: '.p-card.meesh', x: 170, y: 400, largeur: 350, hauteur: 190, rotation: 2 })}` }),
    (ctx) => cta({ ctx, c: 'C4', i: 5, extra: storyMiniature(ctx), classe: 'mini', titreOpts: { y: 76, hauteur: 190 } }),
  ],
}

