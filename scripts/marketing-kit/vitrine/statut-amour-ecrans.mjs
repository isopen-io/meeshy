// Les deux écrans du KIT que la vidéo de statut (#9988) montre en direct, faute de prise filmée : la conversation
// d'AMITIÉ (le DM du concert, écrit par le partenaire de la vitrine — Min-jun en coréen ou Aiko en japonais) et le
// GRAND JOUR de la conversation amoureuse (#8825). Chacun est un document autonome, chargé dans un cadre de la page ;
// la page révèle ses bulles une à une (`.msg-row`, dans l'ordre du fil).
import { html, toString } from '../lib/html.mjs'
import { contexte } from '../lib/gabarits.mjs'
import { kitCss } from '../lib/styles.mjs'
import { directionOf } from '../lib/locales.mjs'
import { DEMO, partenaireDe } from '../textes/demo.mjs'
import { AMITIE_JAPONAIS } from '../textes/statut-amour.mjs'
import { amourHeader, ecranAmourPhotos } from '../screens/amour.mjs'
import { bubble, conversationScreen, daySeparator } from '../screens/conversation.mjs'

export const ACCENT_AMITIE = '#00B4D8'
export const ECRAN_KIT = { largeur: 440, hauteur: 956, facteur: 3 }

// Une réplique du DM, dans la langue de celui qui l'écrit : le coréen du kit, ou son original japonais.
export const repliqueDAmitie = (id, voix) => {
  const kit = DEMO.dm.find((c) => c.id === id)
  if (!kit) throw new Error(`réplique inconnue : ${id}`)
  if (voix === kit.lang) return kit
  if (voix !== 'ja' || !AMITIE_JAPONAIS[id]) throw new Error(`${id} n'a pas d'original en ${voix}`)
  return { ...kit, id: `${id}.ja`, lang: 'ja', text: AMITIE_JAPONAIS[id] }
}

// Le DM d'amitié : le partenaire annonce le concert, le lecteur crie, les billets, puis « on est dans la même section ? ».
export const amitieCorps = (ctx) => {
  const voix = partenaireDe(ctx.lang).lang
  const accent = ACCENT_AMITIE
  return html`
    ${daySeparator(ctx)}
    ${bubble({ ctx, contenu: repliqueDAmitie('dm.annonce', voix), accent, time: '9:18' })}
    ${bubble({ ctx, contenu: DEMO.miens.dmCri[ctx.lang], mine: true, accent, time: '9:19' })}
    ${bubble({ ctx, contenu: repliqueDAmitie('dm.billets', voix), accent, time: '9:24' })}
    ${bubble({ ctx, contenu: DEMO.miens.dmBillets[ctx.lang], mine: true, accent, time: '9:25' })}
    ${bubble({ ctx, contenu: repliqueDAmitie('dm.section', voix), accent, time: '9:26', reactions: '😂' })}
  `
}

export const ecranAmitie = (ctx) => conversationScreen({ ctx, accent: ACCENT_AMITIE, header: amourHeader(ctx), corps: amitieCorps(ctx) })

export const ECRANS_DU_STATUT = { amitie: ecranAmitie, 'amour-photos': ecranAmourPhotos }

// Le document d'un écran du kit, à sa taille CSS native (440×956, l'iPhone au facteur 3).
export const documentDeLEcran = ({ ecran, lang }) => {
  const rendu = ECRANS_DU_STATUT[ecran]
  if (!rendu) throw new Error(`écran du statut inconnu : ${ecran}`)
  const ctx = contexte({ lang, theme: 'light' })
  return `<!doctype html><html lang="${lang}" dir="${directionOf(lang)}"><head><meta charset="utf-8"><style>${kitCss()}
html, body { margin: 0; width: ${ECRAN_KIT.largeur}px; height: ${ECRAN_KIT.hauteur}px; overflow: hidden; background: #fff; }</style></head><body>${toString(rendu(ctx))}</body></html>`
}
