import { html } from '../lib/html.mjs'
import { icon, logo } from '../lib/icons.mjs'
import { photo } from '../lib/photos.mjs'
import { avatar, homeIndicator, nomComplet, roundButton, statusBar } from '../lib/composants.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, partenaireDe, profilDe } from '../textes/demo.mjs'
import { globalCorps, globalHeader, groupeVisuel, ACCENTS } from './conversations.mjs'
import { composer, conversationBackground, heure } from './conversation.mjs'
import { ACCENT_AMOUR, amourCorps, amourHeader, amourPhotosCorps, appelAmour } from './amour.mjs'
import { ACCENT_DEBAT, ACCENT_DROLE, debatCorps, debatHeader, droleCorps, droleHeader } from './groupes.mjs'
import { filCorps } from './social.mjs'
import { grilleBadges, meeshEntry, progressionCartes } from './progression.mjs'

// iPadRootView en PORTRAIT (#8825 — le format par défaut d'App Store Connect, 2064 × 2752) :
// la colonne des conversations prend 38 % de la largeur (`leftColumnRatio`), le panneau droit le
// reste. L'appel et la story passent en plein écran, comme dans l'app.
const P = DEMO.progression

const compact = (lang, n) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { notation: 'compact' }).format(n)

const apercu = (ctx, contenu, auteur) => {
  const s = serve(contenu, ctx.lang)
  return auteur ? `${profilDe(auteur).prenom}${ctx.lang === 'fr' ? ' : ' : ': '}${s.text}` : s.text
}

const empile = (pseudos) => html`<div class="stack-avatars">${pseudos.map((p) => avatar(profilDe(p), 26))}</div>`

// ConversationListView (ThemedConversationRow) : les conversations de la vitrine d'abord, puis
// assez de monde pour remplir la hauteur du portrait.
const rangees = (ctx) => {
  const lecteur = DEMO.lecteurs[ctx.lang]
  const partenaire = partenaireDe(ctx.lang)
  const autre = partenaire.pseudo === 'minjun.p' ? profilDe('aiko.t') : profilDe('minjun.p')
  const bonjourDe = (pseudo) => DEMO.global.find((l) => l.auteur === pseudo && l.id)
  const dm = (profil, h, { presence = false } = {}) => ({ id: profil.pseudo, titre: nomComplet(profil), visuel: avatar(profil, 52, { presence }), texte: apercu(ctx, bonjourDe(profil.pseudo) ?? DEMO.bios[profil.pseudo]), h })
  const toutes = [
    { id: 'amour', titre: nomComplet(partenaire), visuel: avatar(partenaire, 52, { presence: true }), texte: apercu(ctx, DEMO.amour.vocalReaction[partenaire.lang]), h: '21:07', nonLus: 1 },
    { id: 'debat', titre: DEMO.debat.titre, visuel: empile(['kwame.m', 'giulia.r', 'jonas.wb']), texte: apercu(ctx, DEMO.debat.messages[0], 'kwame.m'), h: '20:34', nonLus: 9 },
    { id: 'drole', titre: DEMO.drole.titre, visuel: empile(['aiko.t', 'lucas.olv', 'minjun.p']), texte: apercu(ctx, DEMO.drole.valise, 'aiko.t'), h: '19:05', nonLus: 4 },
    { id: 'nova', titre: DEMO.lienInvitation.groupe, visuel: groupeVisuel(), texte: apercu(ctx, DEMO.groupe.find((m) => m.id === 'nova.decalage'), 'aiko.t'), h: '18:05', nonLus: 3 },
    { id: 'global', titre: 'Meeshy Global', visuel: html`<div class="global-avatar big">${logo(52, { radius: 0.5 })}</div>`, texte: apercu(ctx, DEMO.global.at(-1), 'minjun.p'), h: '9:14', nonLus: 24 },
    dm(autre, '9:05'),
    { id: 'lucas.olv', titre: 'Lucas Oliveira', visuel: avatar(profilDe('lucas.olv'), 52, { presence: true }), texte: apercu(ctx, DEMO.story[0]), h: '8:12' },
    { id: 'sofi.romero', titre: 'Sofía Romero', visuel: avatar(profilDe('sofi.romero'), 52), texte: apercu(ctx, DEMO.story[1]), h: '8:03' },
    { id: 'giulia.r', titre: 'Giulia Rossi', visuel: avatar(profilDe('giulia.r'), 52), texte: apercu(ctx, DEMO.posts[0].apercu[1]), h: '7:55' },
    dm(profilDe('kwame.m'), '7:31'),
    dm(profilDe('yusuf.h'), '7:02'),
    dm(profilDe('priya.n'), 'Hier', { presence: true }),
    dm(profilDe('amara.d'), 'Hier'),
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
          <div class="ipad-row-text"><div class="t"><b>${r.titre}</b><span>${r.h === 'Hier' ? ctx.ui('date.yesterday') : heure(ctx.lang, r.h)}</span></div><div class="p">${r.texte}</div></div>
          ${r.nonLus ? html`<span class="badge">${r.nonLus}</span>` : ''}
        </div>`,
      )}
    </div>
  </aside>`

const panneauConversation = (ctx, { accent, header, corps }) =>
  html`<section class="ipad-panel conversation">${conversationBackground(accent, ctx.theme)}${header}<main class="messages">${corps}</main>${composer(ctx)}</section>`

const coque = (ctx, gauche, droite) =>
  html`<div class="ecran ipad ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="ipad-split">${gauche}${droite}</div>
    ${homeIndicator()}
  </div>`

const conversation = (ctx, selection, panneau) => coque(ctx, colonneGauche(ctx, selection), panneauConversation(ctx, panneau))

export const ipadAmour = (ctx) =>
  conversation(ctx, 'amour', { accent: ACCENT_AMOUR, header: amourHeader(ctx), corps: amourCorps(ctx, { long: true }) })

export const ipadAmourPhotos = (ctx) =>
  conversation(ctx, 'amour', { accent: ACCENT_AMOUR, header: amourHeader(ctx), corps: amourPhotosCorps(ctx, { long: true }) })

export const ipadDrole = (ctx) => conversation(ctx, 'drole', { accent: ACCENT_DROLE, header: droleHeader(ctx), corps: droleCorps(ctx, { long: true }) })

export const ipadDebat = (ctx) => conversation(ctx, 'debat', { accent: ACCENT_DEBAT, header: debatHeader(ctx), corps: debatCorps(ctx, { long: true }) })

export const ipadGlobal = (ctx) => conversation(ctx, 'global', { accent: ACCENTS.global, header: globalHeader(ctx), corps: globalCorps(ctx) })

export const ipadAppelAmour = (ctx) => appelAmour(ctx, 'ipad')

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

// ReelsPlayerView en largeur régulière : le média au centre sur son propre flou, l'auteur, la
// pastille de traduction et les actions sous la scène.
export const ipadStory = (ctx) => {
  const story = DEMO.story.find((s) => s.auteur !== DEMO.lecteurs[ctx.lang])
  const auteur = profilDe(story.auteur)
  const servi = serve(story, ctx.lang)
  return html`<div class="ecran ipad story-ipad dark plein" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="reel-blur">${photo(story.photo, { className: 'reel-bg' })}</div>
    ${statusBar({ onMedia: true })}
    <div class="reel-stage">${photo(story.photo, { className: 'reel-media' })}<div class="reel-caption"><span>${servi.text}</span></div></div>
    <div class="reel-side">
      <div class="reel-author">${avatar(auteur, 52, { storyRing: true })}<div><b>${auteur.prenom} ${auteur.drapeau}</b><span>@${auteur.pseudo}</span></div></div>
      <div class="tr-row">${icon('translate', { size: 14 })}<span>${ctx.ui('call.control.captions.state.translated')}</span></div>
      <div class="reel-actions"><span>${icon('heartFill', { size: 26 })}${compact(ctx.lang, 2400)}</span><span>${icon('comment', { size: 26 })}186</span><span>${icon('send', { size: 24 })}</span></div>
    </div>
    ${homeIndicator({ onMedia: true })}
  </div>`
}
