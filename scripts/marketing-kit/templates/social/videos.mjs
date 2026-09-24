// 9:16 — couverture + 3 images-clés de storyboard pour V1-V8 (contenu-par-format.md § 1).
// Scène 540 × 960 ; zone sûre des vidéos verticales : texte entre 5 % et 84 % de la hauteur,
// 11 % libres côté fin de ligne (boutons de l'app de diffusion). Logo en carte de fin seulement.
import { html } from '../../lib/html.mjs'
import { icon } from '../../lib/icons.mjs'
import { avatar, typo } from '../../lib/composants.mjs'
import { contexte, ecran } from '../../lib/gabarits.mjs'
import { langue } from '../../lib/langues.mjs'
import { profilDe } from '../../textes/demo.mjs'
import { drapeauxFleche, loupe, marquePlan, puce, scene, signature, sousTitre, telephone, texte, titre } from './decor.mjs'
import * as E from './ecrans-sociaux.mjs'
import { BONJOURS } from './textes/demo-social.mjs'
import { HASHTAG } from './textes/langues.mjs'
import { LIBELLES } from './textes/annonces.mjs'
import { VIDEOS } from './textes/videos.mjs'

const F = '9x16'
const sc = (ctx, theme) => contexte({ lang: ctx.lang, theme })
const dm = (ctx) => ecran('dm', sc(ctx, 'dark'))

// Téléphone « plan » : centré, en haut, le bas libre pour les sous-titres.
const telPlan = (ecranHtml, options = {}) => telephone(ecranHtml, { largeur: 304, x: 118, y: 64, ...options })
const telFin = (ecranHtml, options = {}) => telephone(ecranHtml, { largeur: 290, x: 125, y: 430, rotation: -3, ...options })
const telCouv = (ecranHtml, options = {}) => telephone(ecranHtml, { largeur: 310, x: 115, y: 350, rotation: -3, ...options })

const couverture = ({ ctx, code, fond = 'vif', visuel, taille = 46, hauteur = 270 }) =>
  scene({ format: F, ctx, fond, classe: 'couverture', contenu: html`${titre(VIDEOS[code].hook[ctx.lang], ctx, { x: 34, y: 96, largeur: 440, hauteur, taille })}${visuel}` })

const plan = ({ ctx, code, n, fond = 'nuit', visuel, sous, stY = 718, stH = 88, chipEnBas = false }) =>
  scene({
    format: F, ctx, fond, classe: 'plan',
    contenu: html`<div class="plan-pos${chipEnBas ? ' bas' : ''}">${marquePlan(code, n)}</div>${visuel}${sous ? sousTitre(sous, ctx, { y: stY, hauteur: stH, x: 40, largeur: 420 }) : ''}`,
  })

const carteFin = ({ ctx, code, visuel, extra = '', cta, titreH = 190 }) =>
  scene({
    format: F, ctx, fond: 'vif', classe: 'fin',
    contenu: html`${signature(ctx, { x: 32, y: 70, largeur: 448, classe: 'centre' })}${titre(cta ?? VIDEOS[code].cta[ctx.lang], ctx, { x: 36, y: 196, largeur: 444, hauteur: titreH, taille: 46, centre: true })}${extra}${visuel}`,
  })

const sous = (code, i, ctx) => VIDEOS[code].sous[i][ctx.lang]

const nuageBonjours = (positions) =>
  positions.map(([mot, x, y, r, c]) => puce(html`<span>${mot}</span>`, { x, y, rotation: r, classe: `bonjour ${c ?? ''}` }))

const langsQuatre = (lang) => [lang, ...['es', 'ar', 'de', 'fr', 'pt', 'it', 'en'].filter((l) => l !== lang)].slice(0, 4)

const drapeauxRencontres = ['🇰🇷', '🇪🇸', '🇯🇵', '🇧🇷', '🇸🇳', '🇯🇴', '🇩🇪', '🇮🇹', '🇬🇭', '🇮🇳', '🇨🇦', '🇲🇽', '🇹🇷', '🇳🇬', '🇵🇱', '🇻🇳', '🇲🇦', '🇰🇪', '🇵🇭', '🇦🇷', '🇺🇦', '🇪🇬', '🇨🇴', '🇹🇭', '🇮🇩', '🇨🇲', '🇵🇹', '🇸🇪', '🇨🇩', '🇫🇷']

const emblemeFlamme = (ctx, jours, { x, y, taille = 230 }) =>
  puce(html`<div class="flamme-embleme" style="width:${taille}px;height:${taille}px;--n:${Math.round(taille * 0.3)}px"><span class="fl-ico">${icon('flame', { size: Math.round(taille * 0.78) })}</span><b>${jours}</b></div>
    <div class="flamme-legende">${ctx.ui('progression.streak.days', jours)}</div>`, { x, y, classe: 'flamme-bloc' })

// Carte « audio » : l'original, puis la piste traduite (V7).
// Onde décorative (pas la forme de repli de l'app) : une voix, des syllabes, des respirations.
const ondeVoix = (n, graine) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i + graine) / n
    const enveloppe = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 3.2 + graine))
    return 4 + 22 * enveloppe * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + graine * 3)))
  })

const carteAudio = (ctx, { libelle, drapeau, duree, active, graine = 0 }) => {
  const barres = ondeVoix(44, graine + 1)
  return html`<div class="carte-audio${active ? ' active' : ''}">
    <div class="ca-tete"><span class="ca-drapeau">${drapeau}</span><b>${libelle}</b><span class="ca-duree">${duree}</span></div>
    <div class="ca-corps"><span class="ca-play">${icon(active ? 'pause' : 'play', { size: 20 })}</span><div class="ca-onde">${barres.map((h, i) => html`<i class="${active && i < 26 ? 'on' : ''}" style="height:${h.toFixed(1)}px"></i>`)}</div></div>
  </div>`
}

const commentaireFlottant = (ctx, c) => {
  const p = profilDe(c.auteur)
  return html`<div class="com-flottant">${avatar(p, 34)}<div><b>${p.prenom} ${p.drapeau}</b><span>${typo(c.translations[ctx.lang] ?? c.text, ctx.lang)}</span></div><em>${icon('translate', { size: 13 })}</em></div>`
}

export const VIDEOS_9x16 = {
  V1: [
    (ctx) => couverture({ ctx, code: 'V1', visuel: html`${telCouv(dm(ctx))}${drapeauxFleche(ctx, ctx.lang, 'ko', { x: 22, y: 420, taille: 34 })}` }),
    (ctx) => plan({ ctx, code: 'V1', n: 2, visuel: html`${telPlan(E.ecranEnregistrement(sc(ctx, 'dark')))}${loupe(E.ecranEnregistrement(sc(ctx, 'dark')), { cible: '.composer.enregistre', x: 24, y: 500, largeur: 492, hauteur: 120, marge: 8, rotation: -2 })}`, sous: sous('V1', 0, ctx) }),
    (ctx) => plan({ ctx, code: 'V1', n: 3, visuel: html`${telPlan(dm(ctx), { x: 60 })}${loupe(dm(ctx), { cible: '.bubble.audio', x: 136, y: 350, largeur: 390, hauteur: 260, rotation: 2 })}`, sous: sous('V1', 1, ctx) }),
    (ctx) => carteFin({ ctx, code: 'V1', visuel: html`${telFin(dm(ctx))}${drapeauxFleche(ctx, ctx.lang, 'ko', { x: 24, y: 560, taille: 28 })}` }),
  ],
  V2: [
    (ctx) => couverture({
      ctx, code: 'V2',
      visuel: html`${telCouv(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 }))}${nuageBonjours([[BONJOURS[2], 20, 380, -6], [BONJOURS[4], 400, 420, 5, 'ar'], [BONJOURS[3], 10, 560, 4], [BONJOURS[5], 412, 600, -5], [BONJOURS[9], 18, 730, -3], [BONJOURS[10], 404, 770, 6]])}`,
    }),
    (ctx) => plan({ ctx, code: 'V2', n: 2, visuel: telPlan(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 0, saisie: true })), sous: sous('V2', 0, ctx) }),
    (ctx) => plan({
      ctx, code: 'V2', n: 3,
      visuel: html`${telPlan(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 }))}${loupe(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 }), { cible: '.messages .msg-row:last-child .bubble', x: 50, y: 470, largeur: 440, hauteur: 160, rotation: -2 })}`,
      sous: sous('V2', 1, ctx),
    }),
    (ctx) => carteFin({ ctx, code: 'V2', visuel: telFin(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 3 })) }),
  ],
  V3: [
    (ctx) => couverture({
      ctx, code: 'V3', fond: 'nuit',
      visuel: html`<div class="orbite">${drapeauxRencontres.slice(0, 12).map((d, i) => html`<span style="--a:${-132 + i * 24}deg">${d}</span>`)}</div>${emblemeFlamme(ctx, 30, { x: 120, y: 390, taille: 300 })}`,
    }),
    (ctx) => plan({
      ctx, code: 'V3', n: 2,
      visuel: html`${telPlan(E.ecranProgressionAvec(sc(ctx, 'light'), { serie: 30, record: 30, serieJalon: 60 }))}${loupe(E.ecranProgressionAvec(sc(ctx, 'light'), { serie: 30, record: 30, serieJalon: 60 }), { cible: '.p-card.flamme', x: 60, y: 450, largeur: 420, hauteur: 190, rotation: -2 })}`,
      sous: sous('V3', 0, ctx),
    }),
    (ctx) => plan({
      ctx, code: 'V3', n: 3,
      visuel: html`<div class="mosaique-jours">${drapeauxRencontres.map((d, i) => html`<div class="jour${i === 29 ? ' fin' : ''}"><em>${LIBELLES.jour[ctx.lang]} ${i + 1}</em><span>${d}</span></div>`)}</div>`,
      sous: sous('V3', 1, ctx),
    }),
    (ctx) => carteFin({ ctx, code: 'V3', visuel: telFin(E.ecranRevelation(sc(ctx, 'dark'), { type: 'serie', valeur: 30 })) }),
  ],
  V4: [
    (ctx) => couverture({
      ctx, code: 'V4',
      visuel: html`<div class="eventail">${langsQuatre(ctx.lang).map((l, i) => html`<div class="ev-tel" style="--i:${i}">${puce(html`${langue(l).drapeau}`, { x: 0, y: 0, classe: 'ev-drapeau' })}${telephone(ecran('groupe', contexte({ lang: l, theme: 'light' })), { largeur: 200, x: 0, y: 40 })}</div>`)}</div>`,
    }),
    (ctx) => plan({ ctx, code: 'V4', n: 2, visuel: telPlan(ecran('groupe', sc(ctx, 'light'))), sous: sous('V4', 0, ctx) }),
    (ctx) => plan({
      ctx, code: 'V4', n: 3, chipEnBas: true, stY: 52, stH: 104,
      visuel: html`<div class="grille-4">${langsQuatre(ctx.lang).map((l) => html`<div class="g4-cell"><span class="g4-lang">${langue(l).drapeau} ${langue(l).nom}</span>${telephone(ecran('groupe', contexte({ lang: l, theme: 'light' })), { largeur: 244, x: -2, y: -30 })}</div>`)}</div>`,
      sous: sous('V4', 1, ctx),
    }),
    (ctx) => carteFin({ ctx, code: 'V4', visuel: telFin(ecran('groupe', sc(ctx, 'light'))) }),
  ],
  V5: [
    (ctx) => couverture({
      ctx, code: 'V5', hauteur: 300, taille: 42,
      visuel: html`${telCouv(E.ecranMaStory(sc(ctx, 'dark')), { y: 360, x: 150, largeur: 290 })}${E.commentairesPour(sc(ctx, 'dark'), 3).map((c, i) => puce(commentaireFlottant(ctx, c), { x: [14, 196, 26][i], y: [430, 610, 770][i], rotation: [-3, 2, -2][i], classe: 'com-puce' }))}`,
    }),
    (ctx) => plan({ ctx, code: 'V5', n: 2, visuel: telPlan(E.ecranMaStory(sc(ctx, 'dark'))), sous: sous('V5', 0, ctx) }),
    (ctx) => plan({
      ctx, code: 'V5', n: 3,
      visuel: html`${telPlan(E.ecranFilMaVille(sc(ctx, 'light')), { x: 40 })}${E.commentairesPour(sc(ctx, 'light'), 3).map((c, i) => puce(commentaireFlottant(ctx, c), { x: 150 + (i % 2) * 20, y: 250 + i * 120, rotation: [2, -2, 1][i], classe: 'com-puce' }))}`,
      sous: sous('V5', 1, ctx),
    }),
    (ctx) => carteFin({ ctx, code: 'V5', visuel: telFin(ecran('decouverte', sc(ctx, 'dark'))) }),
  ],
  V6: [
    (ctx) => couverture({ ctx, code: 'V6', hauteur: 300, taille: 42, visuel: html`${telCouv(ecran('appel', sc(ctx, 'dark')), { y: 380, rotation: 3 })}${puce('😂', { x: 30, y: 500, classe: 'emoji-geant', rotation: -10 })}${loupe(ecran('appel', sc(ctx, 'dark')), { cible: '.call-captions', x: 36, y: 650, largeur: 468, hauteur: 190, rotation: -2 })}` }),
    (ctx) => plan({ ctx, code: 'V6', n: 2, visuel: telPlan(ecran('appel', sc(ctx, 'dark'))), sous: sous('V6', 0, ctx) }),
    (ctx) => plan({
      ctx, code: 'V6', n: 3,
      visuel: html`${telPlan(ecran('appel', sc(ctx, 'dark')), { classe: 'estompe' })}${loupe(ecran('appel', sc(ctx, 'dark')), { cible: '.call-captions', x: 24, y: 250, largeur: 492, hauteur: 250, rotation: -1 })}${puce('😂', { x: 360, y: 150, classe: 'emoji-geant', rotation: 12 })}${puce('😂', { x: 30, y: 520, classe: 'emoji-moyen', rotation: -8 })}`,
      sous: sous('V6', 1, ctx),
    }),
    (ctx) => carteFin({ ctx, code: 'V6', visuel: telFin(ecran('appel', sc(ctx, 'dark'))) }),
  ],
  V7: [
    (ctx) =>
      scene({
        format: F, ctx, fond: 'nuit', classe: 'couverture',
        contenu: html`<div class="stitch" data-sur><div class="st-tete"><span class="st-av">?</span><b>${LIBELLES.commentaire[ctx.lang]}</b></div><p>${typo(VIDEOS.V7.hook[ctx.lang].replace(VIDEOS.V7.ecoute[ctx.lang], '').trim(), ctx.lang)}</p></div>
          ${titre(VIDEOS.V7.ecoute[ctx.lang], ctx, { x: 34, y: 330, largeur: 440, hauteur: 110, taille: 84, classe: 'ecoute' })}
          <div class="pile-audio">${carteAudio(ctx, { libelle: LIBELLES.original[ctx.lang], drapeau: langue(ctx.lang).drapeau, duree: '0:12' })}${carteAudio(ctx, { libelle: LIBELLES.traduit[ctx.lang], drapeau: langue('ko').drapeau, duree: '0:12', active: true, graine: 7 })}</div>`,
      }),
    (ctx) => plan({
      ctx, code: 'V7', n: 2,
      visuel: html`<div class="pile-audio grand">${carteAudio(ctx, { libelle: LIBELLES.original[ctx.lang], drapeau: langue(ctx.lang).drapeau, duree: '0:12' })}<div class="pa-fleche">${icon('arrowRight', { size: 30, className: 'vers-bas' })}</div>${carteAudio(ctx, { libelle: LIBELLES.traduit[ctx.lang], drapeau: langue('ko').drapeau, duree: '0:12', active: true, graine: 7 })}</div>`,
      sous: sous('V7', 0, ctx),
    }),
    (ctx) => plan({ ctx, code: 'V7', n: 3, visuel: html`${telPlan(E.ecranConsentementVoix(sc(ctx, 'light')))}${loupe(E.ecranConsentementVoix(sc(ctx, 'light')), { cible: '.voix-lignes', x: 36, y: 420, largeur: 468, hauteur: 200, rotation: -2 })}`, sous: sous('V7', 1, ctx) }),
    (ctx) => carteFin({ ctx, code: 'V7', visuel: telFin(dm(ctx)) }),
  ],
  V8: [
    (ctx) =>
      scene({
        format: F, ctx, fond: 'vif', classe: 'couverture',
        contenu: html`${texte(HASHTAG[ctx.lang], ctx, { x: 34, y: 92, largeur: 440, hauteur: 64, taille: 44, classe: 'hashtag' })}
          ${titre(VIDEOS.V8.hook[ctx.lang], ctx, { x: 34, y: 170, largeur: 440, hauteur: 230, taille: 38 })}
          ${telCouv(ecran('global', sc(ctx, 'dark')), { y: 410 })}`,
      }),
    (ctx) => plan({ ctx, code: 'V8', n: 2, visuel: telPlan(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 0, saisie: true })), sous: sous('V8', 0, ctx) }),
    (ctx) => plan({ ctx, code: 'V8', n: 3, visuel: telPlan(E.ecranGlobalBonjour(sc(ctx, 'dark'), { reponses: 4 })), sous: sous('V8', 1, ctx) }),
    (ctx) => carteFin({
      ctx, code: 'V8',
      titreH: 100,
      extra: texte(HASHTAG[ctx.lang], ctx, { x: 34, y: 318, largeur: 444, hauteur: 64, taille: 40, classe: 'hashtag centre' }),
      visuel: telFin(ecran('succes', sc(ctx, 'dark'))),
    }),
  ],
}

