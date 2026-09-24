import { html } from '../lib/html.mjs'
import { icon, logo } from '../lib/icons.mjs'
import { illustration } from '../lib/illustrations.mjs'
import { avatar, homeIndicator, roundButton, statusBar } from '../lib/composants.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, lecteurDe, profilDe } from '../textes/demo.mjs'
import {
  ACCENTS,
  dmCorps,
  dmHeader,
  globalCorps,
  globalHeader,
  groupeCorps,
  groupeHeader,
  groupeVisuel,
} from './conversations.mjs'
import { composer, conversationBackground, heure } from './conversation.mjs'
import { filCorps } from './social.mjs'
import { grilleBadges, meeshEntry, progressionCartes } from './progression.mjs'
import { appelControles, appelSousTitres } from './appel.mjs'

const P = DEMO.progression

const compact = (lang, n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { notation: 'compact' }).format(n)

const apercu = (ctx, contenu, auteur) => {
  const s = serve(contenu, ctx.lang)
  return auteur ? `${profilDe(auteur).prenom}${ctx.lang === 'fr' ? ' : ' : ': '}${s.text}` : s.text
}

// iPadRootView : colonne gauche ConversationListView (ThemedConversationRow), panneau droit.
const rangees = (ctx) => {
  const lecteur = DEMO.lecteurs[ctx.lang]
  const toutes = [
    { id: 'nova', titre: DEMO.lienInvitation.groupe, visuel: groupeVisuel(), texte: apercu(ctx, DEMO.groupe.find((m) => m.id === 'nova.decalage'), 'aiko.t'), h: '18:05', nonLus: 3 },
    { id: 'dm', titre: 'Min-jun Park', visuel: avatar(profilDe('minjun.p'), 52, { presence: true }), texte: apercu(ctx, DEMO.dm[3]), h: '9:33', nonLus: 1 },
    { id: 'global', titre: 'Meeshy Global', visuel: html`<div class="global-avatar big">${logo(52, { radius: 0.5 })}</div>`, texte: apercu(ctx, DEMO.global.at(-1), 'minjun.p'), h: '9:14', nonLus: 24 },
    { id: 'aiko.t', titre: 'Aiko Tanaka', visuel: avatar(profilDe('aiko.t'), 52), texte: apercu(ctx, DEMO.global[4]), h: '8:40' },
    { id: 'lucas.olv', titre: 'Lucas Oliveira', visuel: avatar(profilDe('lucas.olv'), 52, { presence: true }), texte: apercu(ctx, DEMO.story[0]), h: '8:12' },
    { id: 'giulia.r', titre: 'Giulia Rossi', visuel: avatar(profilDe('giulia.r'), 52), texte: apercu(ctx, DEMO.posts[0].apercu[1]), h: '7:55' },
    { id: 'kwame.m', titre: 'Kwame Mensah', visuel: avatar(profilDe('kwame.m'), 52), texte: apercu(ctx, DEMO.global[3]), h: '7:31' },
  ]
  return toutes.filter((r) => r.id !== lecteur)
}

const colonneGauche = (ctx, selection) =>
  html`<aside class="ipad-list">
    <div class="ipad-list-head">
      <h2>${ctx.ui('tab.conversations')}</h2>
      <div class="ipad-list-actions">${roundButton('plus', { size: 38, iconSize: 17, tint: 'var(--kit-ink)' })}</div>
    </div>
    <div class="ipad-search glass">${icon('search', { size: 15 })}<span>${ctx.ui('conversation.list.search_conversations')}</span></div>
    <div class="ipad-rows">
      ${rangees(ctx).map(
        (r) => html`<div class="ipad-row${r.id === selection ? ' on' : ''}">
          ${r.visuel}
          <div class="ipad-row-text"><div class="t"><b>${r.titre}</b><span>${heure(ctx.lang, r.h)}</span></div><div class="p">${r.texte}</div></div>
          ${r.nonLus ? html`<span class="badge">${r.nonLus}</span>` : ''}
        </div>`,
      )}
    </div>
  </aside>`

const panneauConversation = (ctx, { accent, header, corps }) =>
  html`<section class="ipad-panel conversation">${conversationBackground(accent, ctx.theme)}${header}<main class="messages">${corps}</main>${composer(ctx)}</section>`

const coque = (ctx, gauche, droite, { plein = false } = {}) =>
  html`<div class="ecran ipad ${ctx.theme}${plein ? ' plein' : ''}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar({ onMedia: plein })}
    <div class="ipad-split">${gauche}${droite}</div>
    ${homeIndicator({ onMedia: plein })}
  </div>`

export const ipadDm = (ctx) =>
  coque(ctx, colonneGauche(ctx, 'dm'), panneauConversation(ctx, { accent: ACCENTS.dm, header: dmHeader(ctx), corps: dmCorps(ctx) }))

export const ipadGlobal = (ctx) =>
  coque(ctx, colonneGauche(ctx, 'global'), panneauConversation(ctx, { accent: ACCENTS.global, header: globalHeader(ctx), corps: globalCorps(ctx) }))

export const ipadGroupe = (ctx) =>
  coque(ctx, colonneGauche(ctx, 'nova'), panneauConversation(ctx, { accent: ACCENTS.nova, header: groupeHeader(ctx), corps: groupeCorps(ctx) }))

export const ipadFil = (ctx) =>
  coque(
    ctx,
    colonneGauche(ctx, null),
    html`<section class="ipad-panel fil">
      <div class="ipad-panel-head"><h2>${ctx.ui('conversation.list.feed')}</h2>${roundButton('bell', { size: 38, iconSize: 16, tint: 'var(--kit-ink)' })}</div>
      <div class="ipad-fil">${filCorps(ctx)}</div>
    </section>`,
  )

export const ipadProgression = (ctx) =>
  coque(
    ctx,
    colonneGauche(ctx, null),
    html`<section class="ipad-panel progression-panel">
      <div class="ipad-panel-head"><h2>${ctx.ui('progression.title')}</h2>${meeshEntry(P.meesh)}</div>
      <div class="ipad-progression-corps">
        <div class="ipad-progression">${progressionCartes(ctx)}</div>
        <div class="ipad-badges"><h3>${ctx.ui('progression.section.badges')}</h3>${grilleBadges(ctx, { limite: 8 })}</div>
      </div>
    </section>`,
  )

// CallView à trois : deux correspondants en tuiles, le lecteur en vignette, sous-titres traduits.
export const ipadAppel = (ctx) =>
  html`<div class="ecran ipad appel dark plein" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="ipad-call-grid">
      <div class="tile">${illustration('appel-seoul', { className: 'call-illu' })}<div class="call-avatar">${avatar(profilDe('minjun.p'), 150)}</div><span class="tag">Min-jun 🇰🇷</span></div>
      <div class="tile alt">${avatar(profilDe('sofi.romero'), 180)}<span class="tag">Sofía 🇪🇸</span></div>
    </div>
    ${statusBar({ onMedia: true })}
    <div class="call-self">${avatar(lecteurDe(ctx.lang), 64)}</div>
    ${appelSousTitres(ctx)}
    ${appelControles(ctx)}
    ${homeIndicator({ onMedia: true })}
  </div>`

// ReelsPlayerView en largeur régulière : le média au centre, l'auteur et la légende à côté.
export const ipadStory = (ctx) => {
  const story = DEMO.story.find((s) => s.auteur !== DEMO.lecteurs[ctx.lang])
  const auteur = profilDe(story.auteur)
  const servi = serve(story, ctx.lang)
  return html`<div class="ecran ipad story-ipad dark plein" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="reel-blur">${illustration(story.fond, { className: 'reel-bg' })}</div>
    ${statusBar({ onMedia: true })}
    <div class="reel-stage">${illustration(story.fond, { className: 'reel-media' })}<div class="reel-caption"><span>${servi.text}</span></div></div>
    <div class="reel-side">
      <div class="reel-author">${avatar(auteur, 52, { storyRing: true })}<div><b>${auteur.prenom} ${auteur.drapeau}</b><span>@${auteur.pseudo}</span></div></div>
      <div class="tr-row">${icon('translate', { size: 14 })}<span>${ctx.ui('call.control.captions.state.translated')}</span></div>
      <div class="reel-actions"><span>${icon('heartFill', { size: 26 })}${compact(ctx.lang, 2400)}</span><span>${icon('comment', { size: 26 })}186</span><span>${icon('send', { size: 24 })}</span></div>
    </div>
    ${homeIndicator({ onMedia: true })}
  </div>`
}
