import { html } from '../lib/html.mjs'
import { icon, logo } from '../lib/icons.mjs'
import { illustration } from '../lib/illustrations.mjs'
import { avatar, flagChip, homeIndicator, nomComplet, roundButton, statusBar, typo } from '../lib/composants.mjs'
import { formatNumber } from '../lib/locales.mjs'
import { langue } from '../lib/langues.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, profilDe } from '../textes/demo.mjs'

const ville = (profil, lang) => DEMO.villes[profil.ville][lang]

const pastilleTraduction = (ctx, servi) =>
  servi.translated
    ? html`<div class="tr-row">${icon('translate', { size: 14 })}<span>${ctx.ui('call.control.captions.state.translated')}</span>${flagChip(servi.originalLang)}<span class="tr-arrow flip-rtl">${icon('forward', { size: 11 })}</span>${flagChip(ctx.lang, { active: true })}</div>`
    : ''

// FeedPostCard : en-tête auteur, texte servi par le Prisme + pastille de traduction, média,
// actions, aperçu de commentaires (eux aussi servis dans la langue du lecteur).
export const postCard = (ctx, post, { heures, ami = false }) => {
  const auteur = profilDe(post.auteur)
  const servi = serve(post, ctx.lang)
  return html`<article class="post-card">
    <header class="post-head">
      ${avatar(auteur, 42, { storyRing: true })}
      <div class="post-id">
        <div class="post-name">${auteur.prenom} ${auteur.drapeau}</div>
        <div class="post-meta">@${auteur.pseudo} · ${ctx.ui('kit.heures', heures)} · ${ville(auteur, ctx.lang)}</div>
      </div>
      ${ami ? html`<span class="add-btn">${icon('personPlus', { size: 14 })}${ctx.ui('kit.ajouter')}</span>` : html`<span class="post-more">${icon('ellipsis', { size: 18 })}</span>`}
    </header>
    <p class="post-text">${typo(servi.text, ctx.lang)}</p>
    ${pastilleTraduction(ctx, servi)}
    ${post.photo ? html`<div class="post-media">${illustration(post.photo, { className: `m-${post.id}` })}</div>` : ''}
    <footer class="post-actions">
      <span class="liked">${icon('heartFill', { size: 20 })}${formatNumber(ctx.lang, post.likes)}</span>
      <span>${icon('comment', { size: 20 })}${post.commentaires}</span>
      <span>${icon('repost', { size: 20 })}</span>
      <span>${icon('send', { size: 19 })}</span>
      <span class="end">${icon('bookmark', { size: 19 })}</span>
    </footer>
    ${(post.apercu ?? []).map((c) => {
      const p = profilDe(c.auteur)
      const s = serve(c, ctx.lang)
      return html`<div class="post-comment">${avatar(p, 24)}<p><b>${p.prenom}</b> ${s.text}</p>${s.translated ? flagChip(s.originalLang) : ''}</div>`
    })}
  </article>`
}

const storiesTray = (ctx) =>
  html`<div class="stories-tray">
    ${['lucas.olv', 'sofi.romero', 'minjun.p', 'amara.d', 'giulia.r', 'kwame.m']
      .filter((p) => p !== DEMO.lecteurs[ctx.lang])
      .slice(0, 5)
      .map((p) => html`<div class="story-bubble">${avatar(profilDe(p), 58, { storyRing: true })}<span>${profilDe(p).prenom}</span></div>`)}
  </div>`

export const filCorps = (ctx) =>
  html`${storiesTray(ctx)}${postCard(ctx, DEMO.posts[0], { heures: 2, ami: true })}${postCard(ctx, DEMO.posts[1], { heures: 5 })}`

export const ecranFil = (ctx) =>
  html`<div class="ecran iphone fil ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg plain"></div>
    ${statusBar()}
    <div class="fil-nav">
      <div class="fil-brand">${logo(34, { radius: 0.28 })}<span>${ctx.ui('conversation.list.feed')}</span></div>
      <div class="fil-actions">${roundButton('search', { iconSize: 17, tint: 'var(--kit-ink)' })}${roundButton('bell', { iconSize: 17, tint: 'var(--kit-ink)' })}</div>
    </div>
    <main class="fil-list">${filCorps(ctx)}</main>
    ${homeIndicator()}
  </div>`

// PeopleDiscoveryView (onglet Découvrir de ContactsHubView) + la demande acceptée.
// Aucune pastille de présence : elle n'est servie qu'entre amis acceptés (presence-visibility).
export const ecranDecouverte = (ctx) => {
  const lecteur = DEMO.lecteurs[ctx.lang]
  const pool = ['kwame.m', 'giulia.r', 'lucas.olv', 'priya.n', 'jonas.wb', 'maya.chen', 'amara.d']
  const profils = pool.filter((p) => p !== lecteur).slice(0, 5)
  return html`<div class="ecran iphone decouverte ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="p-nav">${roundButton('back', { iconSize: 19, tint: 'var(--ios-indigo-400)', className: 'flip-rtl' })}${roundButton('search', { iconSize: 17, tint: 'var(--kit-ink)' })}</div>
    <h1 class="p-title">${ctx.ui('discovery.title')}</h1>
    <div class="seg glass">
      <span class="on">${icon('globe', { size: 15 })}${ctx.ui('discovery.tab.discover')}</span>
      <span>${icon('personPlus', { size: 15 })}${ctx.ui('discovery.tab.requests')}</span>
    </div>
    <div class="accept-banner">
      ${avatar(profilDe('minjun.p'), 40)}
      <div><b>${ctx.ui('kit.ami.accepte', 'Min-jun')}</b><span>${ctx.ui('profile.stats.friends')} · 🇰🇷 ${DEMO.villes['Séoul'][ctx.lang]}</span></div>
      <span class="ok">${icon('personCheck', { size: 18 })}</span>
    </div>
    <div class="d-section">${ctx.ui('kit.suggestions')}</div>
    <div class="d-list">
      ${profils.map((pseudo, i) => {
        const p = profilDe(pseudo)
        const bio = serve(DEMO.bios[pseudo], ctx.lang)
        const l = langue(p.lang)
        return html`<div class="d-row">
          ${avatar(p, 54)}
          <div class="d-id">
            <div class="d-name">${nomComplet(p)}</div>
            <div class="d-meta">${p.drapeau} ${ville(p, ctx.lang)} · ${ctx.ui('kit.parle')} ${l.drapeau} ${l.nom}</div>
            <div class="d-bio">${bio.text}</div>
          </div>
          ${i === 1
            ? html`<span class="add-btn sent">${ctx.ui('kit.demande.envoyee')}</span>`
            : html`<span class="add-btn">${icon('personPlus', { size: 14 })}${ctx.ui('kit.ajouter')}</span>`}
        </div>`
      })}
    </div>
    ${homeIndicator()}
  </div>`
}

// StoryViewerView : plein écran, barres de progression, auteur, texte servi, réponse.
export const ecranStory = (ctx) => {
  const story = DEMO.story.find((s) => s.auteur !== DEMO.lecteurs[ctx.lang])
  const auteur = profilDe(story.auteur)
  const servi = serve(story, ctx.lang)
  return html`<div class="ecran iphone story dark" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="story-media">${illustration(story.fond, { className: 'story-illu' })}</div>
    <div class="story-shade"></div>
    ${statusBar({ onMedia: true })}
    <div class="story-bars"><i class="done"></i><i class="live"><b></b></i><i></i></div>
    <div class="story-head">
      ${avatar(auteur, 38)}
      <div><b>${auteur.prenom}</b><span>${ville(auteur, ctx.lang)} · ${ctx.ui('kit.heures', 1)}</span></div>
      <span class="story-x">${icon('close', { size: 22 })}</span>
    </div>
    <div class="story-text"><span>${typo(servi.text, ctx.lang)}</span></div>
    <div class="story-translated">${pastilleTraduction(ctx, servi)}</div>
    <div class="story-reactions"><span>🧡</span><span>🔥</span><span>😍</span><span>👏</span></div>
    <div class="story-reply">
      <div class="story-field">${ctx.ui('story.viewer.reply')}</div>
      <span>${icon('heart', { size: 26 })}</span><span>${icon('send', { size: 24 })}</span>
    </div>
    ${homeIndicator({ onMedia: true })}
  </div>`
}
