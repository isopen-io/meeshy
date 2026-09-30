import { html } from '../lib/html.mjs'
import { icon } from '../lib/icons.mjs'
import { photo } from '../lib/photos.mjs'
import { avatar, homeIndicator, nomComplet, statusBar } from '../lib/composants.mjs'
import { langue } from '../lib/langues.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, lecteurDe, partenaireDe } from '../textes/demo.mjs'
import { audioBubble } from './audio.mjs'
import { appelControles } from './appel.mjs'
import { bubble, conversationHeader, conversationScreen, daySeparator, heure } from './conversation.mjs'
import { messagePhotos } from './medias.mjs'

// La conversation amoureuse à distance (#8825) : le lecteur de la vitrine et son partenaire
// (Min-jun à Séoul, ou Aiko à Osaka — `partenaireDe`). Tout ce que le partenaire écrit est servi
// par le Prisme dans la langue du lecteur ; le vocal du lecteur se joue dans celle du partenaire.
export const ACCENT_AMOUR = '#EC4899'

const A = DEMO.amour

const voix = (ctx) => partenaireDe(ctx.lang).lang

const dit = (replique, ctx) => replique[voix(ctx)]

// Les pistes de la bande : la langue écoutée, puis l'anglais (l'espagnol pour un anglophone).
export const pistesAutour = (active, ctx) => [active, ctx.lang === 'en' || active === 'en' ? 'es' : 'en']

export const amourHeader = (ctx) => {
  const partenaire = partenaireDe(ctx.lang)
  return conversationHeader({
    ctx,
    visuel: avatar(partenaire, 38, { presence: true }),
    titre: nomComplet(partenaire),
    sousTitre: ctx.ui('presence.online'),
    sousTitreEnLigne: true,
  })
}

// Capture 1 — le soir : la vue envoyée, le manque, et le vocal du lecteur écouté dans la langue de
// l'autre. `long` (l'iPad, qui a la hauteur) ouvre sur le déjeuner du partenaire et compte les jours.
export const amourCorps = (ctx, { long = false } = {}) => {
  const accent = ACCENT_AMOUR
  const v = voix(ctx)
  return html`
    ${long ? daySeparator(ctx) : ''}
    ${long ? messagePhotos({ ctx, photos: [A.photos.dejeuner], contenu: dit(A.pense, ctx), accent, time: '12:40' }) : ''}
    ${long ? bubble({ ctx, contenu: A.miens.vueDemandee[ctx.lang], mine: true, accent, time: '12:41' }) : ''}
    ${messagePhotos({ ctx, photos: [A.photos.vue[v]], contenu: dit(A.vue, ctx), accent, time: '21:02' })}
    ${bubble({ ctx, contenu: A.miens.manque[ctx.lang], mine: true, accent, time: '21:04' })}
    ${long ? bubble({ ctx, contenu: dit(A.jours, ctx), accent, time: '21:05' }) : ''}
    ${audioBubble({
      ctx,
      duree: A.vocal.duree,
      ecoule: A.vocal.ecoule,
      progression: A.vocal.progression,
      pistes: pistesAutour(v, ctx),
      active: v,
      transcription: A.vocal.transcription[v],
      time: '21:06',
      heure,
    })}
    ${bubble({ ctx, contenu: dit(A.vocalReaction, ctx), accent, time: '21:07', reactions: '❤️' })}
  `
}

// Capture 2 — le jour du départ : le hublot, puis la table réservée et le bouquet qui attendent.
// `long` y ajoute le réveil, le café du matin et l'impatience.
export const amourPhotosCorps = (ctx, { long = false } = {}) => {
  const accent = ACCENT_AMOUR
  return html`
    ${long ? daySeparator(ctx) : ''}
    ${long ? bubble({ ctx, contenu: dit(A.grandJour, ctx), accent, time: '7:30' }) : ''}
    ${long ? messagePhotos({ ctx, photos: [A.photos.cafe], contenu: A.miens.dormi[ctx.lang], mine: true, accent, time: '7:34' }) : ''}
    ${messagePhotos({ ctx, photos: [A.photos.hublot], contenu: A.miens.decolle[ctx.lang], mine: true, accent, time: '14:12' })}
    ${long ? bubble({ ctx, contenu: dit(A.minutes, ctx), accent, time: '14:13' }) : ''}
    ${messagePhotos({ ctx, photos: A.photos.table, contenu: dit(A.table, ctx), accent, time: '14:15' })}
    ${bubble({ ctx, contenu: A.miens.parfait[ctx.lang], mine: true, accent, time: '14:16', reactions: '❤️' })}
  `
}

export const ecranAmour = (ctx) =>
  conversationScreen({ ctx, accent: ACCENT_AMOUR, header: amourHeader(ctx), corps: amourCorps(ctx), className: 'amour' })

export const ecranAmourPhotos = (ctx) =>
  conversationScreen({ ctx, accent: ACCENT_AMOUR, header: amourHeader(ctx), corps: amourPhotosCorps(ctx), className: 'amour' })

// L'appel du soir : la caméra arrière du partenaire filme la pluie sur sa vitre ; ce qu'il dit
// arrive sous-titré DANS la langue du lecteur, l'original en rappel discret.
export const sousTitresAmour = (ctx) => {
  const dite = dit(A.appel, ctx)
  const servi = serve(dite, ctx.lang)
  return html`<div class="call-captions">
    <div class="cc-head">${icon('captions', { size: 15 })}<span>${ctx.ui('call.control.captions.state.translated')}</span><span class="cc-flags">${langue(dite.lang).drapeau} → ${langue(ctx.lang).drapeau}</span></div>
    <p class="cc-text">${servi.text}</p>
    <p class="cc-orig" lang="${dite.lang}">${dite.text}</p>
  </div>`
}

export const appelAmour = (ctx, appareil) => {
  const partenaire = partenaireDe(ctx.lang)
  return html`<div class="ecran ${appareil} appel amour dark${appareil === 'ipad' ? ' plein' : ''}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="call-video">${photo(A.photos.appel, { className: 'call-photo' })}</div>
    <div class="call-shade"></div>
    ${statusBar({ onMedia: true })}
    <div class="call-top">
      <span class="call-pill glass">${icon('back', { size: 15 })}</span>
      <div class="call-who"><b>${nomComplet(partenaire)}</b><span><i class="rec"></i>12:47 · ${partenaire.drapeau} ${DEMO.villes[partenaire.ville][ctx.lang]}</span></div>
    </div>
    <div class="call-self">${avatar(lecteurDe(ctx.lang), appareil === 'ipad' ? 84 : 64)}</div>
    ${sousTitresAmour(ctx)}
    ${appelControles(ctx)}
    ${homeIndicator({ onMedia: true })}
  </div>`
}

export const ecranAppelAmour = (ctx) => appelAmour(ctx, 'iphone')
