import { html } from '../lib/html.mjs'
import { DEMO, lecteurDe, profilDe } from '../textes/demo.mjs'
import { avatar, nomComplet } from '../lib/composants.mjs'
import { audioBubble } from './audio.mjs'
import {
  bubble,
  conversationHeader,
  conversationScreen,
  daySeparator,
  globalVisuel,
  heure,
  systemNotice,
} from './conversation.mjs'

export const ACCENTS = {
  dm: '#00B4D8',
  nova: '#8B5CF6',
  global: '#6366F1',
}

const autresPistes = (ctx) => ['ko', ctx.lang === 'en' ? 'es' : 'en']

// Capture 1 — le vocal du lecteur, écouté en coréen : « Ta voix. Leur langue. »
export const dmCorps = (ctx) => {
  const accent = ACCENTS.dm
  const lecteur = lecteurDe(ctx.lang)
  return html`
    ${daySeparator(ctx)}
    ${bubble({ ctx, contenu: DEMO.dm[0], accent, time: '9:18' })}
    ${bubble({ ctx, contenu: DEMO.miens.dmCri[ctx.lang], mine: true, accent, time: '9:19' })}
    ${bubble({ ctx, contenu: DEMO.dm[1], accent, time: '9:24' })}
    ${bubble({ ctx, contenu: DEMO.miens.dmBillets[ctx.lang], mine: true, accent, time: '9:25' })}
    ${bubble({ ctx, contenu: DEMO.dm[2], accent, time: '9:26' })}
    ${audioBubble({
      ctx,
      duree: '0:12',
      ecoule: '0:05',
      progression: 0.42,
      pistes: autresPistes(ctx),
      active: 'ko',
      transcription: DEMO.vocalCoreen,
      time: '9:31',
      heure,
      auteur: lecteur,
    })}
    ${bubble({ ctx, contenu: DEMO.dm[3], accent, time: '9:33', reactions: '❤️' })}
  `
}

export const dmHeader = (ctx) => {
  const minjun = profilDe('minjun.p')
  return conversationHeader({
    ctx,
    visuel: avatar(minjun, 38, { presence: true }),
    titre: nomComplet(minjun),
    sousTitre: ctx.ui('presence.online'),
    sousTitreEnLigne: true,
  })
}

export const ecranDm = (ctx) =>
  conversationScreen({ ctx, accent: ACCENTS.dm, header: dmHeader(ctx), corps: dmCorps(ctx) })

// Capture 2 — Nova Club, quatre langues, tout se lit dans celle du lecteur.
export const groupeCorps = (ctx) => {
  const accent = ACCENTS.nova
  const lecteur = DEMO.lecteurs[ctx.lang]
  const heures = ['18:02', '18:03', '18:05', '18:06']
  const lignes = DEMO.groupe.map((m, i) =>
    m.auteur === lecteur
      ? bubble({ ctx, contenu: m.lang === ctx.lang ? m.text : m.translations[ctx.lang], mine: true, accent, time: heures[i] })
      : bubble({ ctx, contenu: m, auteur: m.auteur, accent, time: heures[i], identite: true, reactions: m.reactions }),
  )
  const membre = DEMO.groupe.some((m) => m.auteur === lecteur)
  return html`
    ${daySeparator(ctx)}
    ${lignes}
    ${membre ? '' : bubble({ ctx, contenu: DEMO.miens.groupe[ctx.lang], mine: true, accent, time: '18:08' })}
  `
}

export const groupeVisuel = () =>
  html`<div class="stack-avatars">${['minjun.p', 'sofi.romero', 'aiko.t'].map((p) => avatar(profilDe(p), 26))}</div>`

export const groupeHeader = (ctx) =>
  conversationHeader({
    ctx,
    visuel: groupeVisuel(),
    titre: DEMO.lienInvitation.groupe,
    sousTitre: `${ctx.ui('conversation.members-count', 12)} · 🇰🇷 🇪🇸 🇯🇵 🇫🇷`,
    actions: ['video'],
  })

export const ecranGroupe = (ctx) =>
  conversationScreen({ ctx, accent: ACCENTS.nova, header: groupeHeader(ctx), corps: groupeCorps(ctx) })

// Capture 3 — Meeshy Global : « X a rejoint », puis les bonjours, lus dans la langue du lecteur.
export const globalCorps = (ctx) => {
  const accent = ACCENTS.global
  const lecteur = DEMO.lecteurs[ctx.lang]
  const heures = ['8:58', '9:00', '9:02', '9:03', '9:05', '9:06', '9:08', '9:10', '9:11', '9:12', '9:14']
  const lignes = DEMO.global.map((ligne, i) => {
    if (ligne.type === 'arrivee') return systemNotice(ctx.ui('bubble.joinNotice.joined', profilDe(ligne.auteur).prenom))
    if (ligne.auteur === lecteur) return bubble({ ctx, contenu: ligne.text, mine: true, accent, time: heures[i] })
    return bubble({ ctx, contenu: ligne, auteur: ligne.auteur, accent, time: heures[i], identite: true })
  })
  return html`${daySeparator(ctx)}${lignes}`
}

export const globalHeader = (ctx) =>
  conversationHeader({
    ctx,
    visuel: globalVisuel(),
    titre: 'Meeshy Global',
    sousTitre: ctx.ui('conversation.members-count', 2481),
    actions: [],
  })

export const ecranGlobal = (ctx) =>
  conversationScreen({ ctx, accent: ACCENTS.global, header: globalHeader(ctx), corps: globalCorps(ctx), className: 'global' })
