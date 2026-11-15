import { html } from '../lib/html.mjs'
import { avatar } from '../lib/composants.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, profilDe } from '../textes/demo.mjs'
import { audioBubble } from './audio.mjs'
import { pistesAutour } from './amour.mjs'
import { bubble, conversationHeader, conversationScreen, daySeparator, heure } from './conversation.mjs'
import { messagePhotos } from './medias.mjs'

// Les deux groupes de la vitrine (#8825) : « Lisboa ✈️ » rit d'une photo, « Pizza Night 🍕 »
// s'enflamme. Un message du lecteur lui-même se range de son côté, dans sa langue.
export const ACCENT_DROLE = '#F59E0B'
export const ACCENT_DEBAT = '#EF4444'

const D = DEMO.drole
const B = DEMO.debat

const lecteurDe = (ctx) => DEMO.lecteurs[ctx.lang]

// `photosLong` : une photo que seul l'iPad a la hauteur de montrer.
const ligne = (ctx, m, { accent, time, long = false }) => {
  const mine = m.auteur === lecteurDe(ctx)
  const contenu = mine ? m.text : m
  const photos = m.photos ?? (long ? m.photosLong : undefined)
  const commun = { ctx, contenu, mine, accent, time, auteur: m.auteur, identite: !mine, reactions: m.reactions }
  return photos ? messagePhotos({ ...commun, photos }) : bubble(commun)
}

// Les membres vus par le lecteur : lui compris, une seule fois, et leurs drapeaux.
export const membresDe = (ctx, membres) => [...new Set([...membres, lecteurDe(ctx)])]

const entete = (ctx, { titre, membres }) => {
  const tous = membresDe(ctx, membres)
  return conversationHeader({
    ctx,
    visuel: html`<div class="stack-avatars">${membres.filter((p) => p !== lecteurDe(ctx)).slice(0, 3).map((p) => avatar(profilDe(p), 26))}</div>`,
    titre,
    sousTitre: `${ctx.ui('conversation.members-count', tous.length)} · ${tous.map((p) => profilDe(p).drapeau).join(' ')}`,
    actions: ['video'],
  })
}

export const droleHeader = (ctx) => entete(ctx, D)

// `long` : l'iPad a la hauteur du chien de Lucas et du hublot de Sofía. Aucun séparateur de
// jour : la conversation est déjà défilée, la photo du chat reste entière sous l'en-tête.
export const droleCorps = (ctx, { long = false } = {}) => {
  const accent = ACCENT_DROLE
  return html`
    ${ligne(ctx, D.valise, { accent, time: '19:02' })}
    ${ligne(ctx, D.bagage, { accent, time: '19:03' })}
    ${long ? ligne(ctx, D.chien, { accent, time: '19:03' }) : ''}
    ${long ? ligne(ctx, D.hublot, { accent, time: '19:04' }) : ''}
    ${audioBubble({
      ctx,
      mine: false,
      accent,
      expediteur: profilDe(D.vocal.auteur),
      duree: D.vocal.duree,
      ecoule: D.vocal.ecoule,
      progression: D.vocal.progression,
      pistes: pistesAutour(ctx.lang, ctx),
      active: ctx.lang,
      transcription: serve(D.vocal, ctx.lang).text,
      time: '19:04',
      heure,
    })}
    ${bubble({ ctx, contenu: D.mien[ctx.lang], mine: true, accent, time: '19:05' })}
  `
}

export const debatHeader = (ctx) => entete(ctx, B)

// `long` : sur l'iPad, la pizza brésilienne se montre, la Corée entre dans le débat, et Jonas
// sort le pop-corn.
export const debatCorps = (ctx, { long = false } = {}) => {
  const accent = ACCENT_DEBAT
  const [diner, crime, chocolat, quitte, popcorn] = B.messages
  const messages = long ? [diner, crime, chocolat, B.patateDouce, quitte, popcorn] : [diner, crime, chocolat, quitte]
  const heures = ['20:31', '20:31', '20:33', '20:33', '20:34', '20:34']
  return html`
    ${long ? daySeparator(ctx) : ''}
    ${messages.map((m, i) => ligne(ctx, m, { accent, time: heures[i], long }))}
    ${B.membres.includes(lecteurDe(ctx)) ? '' : bubble({ ctx, contenu: B.mien[ctx.lang], mine: true, accent, time: '20:36' })}
  `
}

export const ecranDrole = (ctx) =>
  conversationScreen({ ctx, accent: ACCENT_DROLE, header: droleHeader(ctx), corps: droleCorps(ctx), className: 'groupe-drole' })

export const ecranDebat = (ctx) =>
  conversationScreen({ ctx, accent: ACCENT_DEBAT, header: debatHeader(ctx), corps: debatCorps(ctx), className: 'groupe-debat' })
