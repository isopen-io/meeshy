import { html, raw } from '../lib/html.mjs'
import { icon, logo } from '../lib/icons.mjs'
import { avatar, flagChip, homeIndicator, roundButton, statusBar } from '../lib/composants.mjs'
import { serve } from '../lib/prism.mjs'
import { profilDe } from '../textes/demo.mjs'

// ConversationAnimatedBackground.baseGradient : 0F0C29 → teinté 12 % → 24243E (sombre),
// blanc teinté 8 % → blanc → 5 % (clair) ; les halos d'accent y sont posés à 12 %.
export const conversationBackground = (accent, theme) => {
  const base =
    theme === 'dark'
      ? `linear-gradient(135deg, #0f0c29 0%, color-mix(in srgb, ${accent} 12%, #0f0c29) 50%, #24243e 100%)`
      : `linear-gradient(135deg, color-mix(in srgb, ${accent} 8%, #fff) 0%, #fff 50%, color-mix(in srgb, ${accent} 5%, #fff) 100%)`
  return html`<div class="conv-bg" style="background:${base};--accent:${accent}">
    <span class="halo h1"></span><span class="halo h2"></span><span class="halo h3"></span>
  </div>`
}

export const heure = (lang, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  const date = new Date(Date.UTC(2026, 8, 24, h, m))
  const locale = { ar: 'ar-SA-u-nu-latn', en: 'en-US', pt: 'pt-BR' }[lang] ?? lang
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(date)
}

export const conversationHeader = ({ ctx, visuel, titre, sousTitre, sousTitreEnLigne = false, actions = ['video', 'phone'] }) =>
  html`<header class="conv-header">
    ${roundButton('back', { iconSize: 19, tint: 'var(--ios-indigo-400)', className: 'flip-rtl' })}
    <div class="conv-id glass">
      ${visuel}
      <div class="conv-id-text">
        <div class="conv-title">${titre}</div>
        <div class="conv-sub${sousTitreEnLigne ? ' online' : ''}">${sousTitreEnLigne ? raw('<i class="dot"></i>') : ''}${sousTitre}</div>
      </div>
    </div>
    <div class="conv-actions">${actions.map((a) => roundButton(a, { iconSize: 18, tint: 'var(--kit-ink)' }))}</div>
  </header>`

export const globalVisuel = () => html`<div class="global-avatar">${logo(40, { radius: 0.5 })}</div>`

export const daySeparator = (ctx) => html`<div class="day-sep"><span>${ctx.ui('date.today')}</span></div>`

export const systemNotice = (texte, { icone = 'personPlus' } = {}) =>
  html`<div class="sys-notice"><span class="pill">${icon(icone, { size: 13 })}${texte}</span></div>`

const footerFlags = (servi, ctx) =>
  servi.translated
    ? html`<span class="translate-glyph">${icon('translate', { size: 13 })}</span>${flagChip(servi.originalLang)}${flagChip(ctx.lang, { active: true })}`
    : ''

// Une bulle texte (BubbleStandardLayout.textBubbleContent) : le corps, puis le pied DANS la bulle
// (BubbleFooter .row) — en groupe, l'identité de l'expéditeur vit dans ce pied.
export const bubble = ({ ctx, contenu, auteur, mine = false, accent, time, identite = false, reactions }) => {
  const servi = mine ? { text: contenu, translated: false } : serve(contenu, ctx.lang)
  const profil = auteur ? profilDe(auteur) : null
  return html`<div class="msg-row ${mine ? 'mine' : 'theirs'}">
    <div class="bubble ${mine ? 'mine' : 'theirs'}" style="--accent:${accent}">
      <div class="bubble-body">${servi.text}</div>
      <div class="bubble-footer${identite && profil ? ' with-id' : ''}">
        ${identite && profil ? html`${avatar(profil, 24)}<span class="sender">${profil.prenom}</span>` : ''}
        ${footerFlags(servi, ctx)}
        <span class="spacer"></span>
        <span class="time">${heure(ctx.lang, time)}</span>
        ${mine ? html`<span class="check">${icon('checks', { size: 15 })}</span>` : ''}
      </div>
    </div>
    ${reactions ? html`<div class="reactions glass">${reactions}</div>` : ''}
  </div>`
}

export const composer = (ctx) =>
  html`<div class="composer">
    ${roundButton('plus', { iconSize: 20, tint: 'var(--kit-ink)' })}
    <div class="composer-field glass"><span>${ctx.ui('composer.message')}</span></div>
    <div class="round-btn mic-btn">${icon('mic', { size: 20 })}</div>
  </div>`

export const conversationScreen = ({ ctx, accent, header, corps, className = '' }) =>
  html`<div class="ecran iphone conversation ${ctx.theme} ${className}" dir="${ctx.dir}" lang="${ctx.lang}">
    ${conversationBackground(accent, ctx.theme)}
    ${statusBar()}
    ${header}
    <main class="messages">${corps}</main>
    ${composer(ctx)}
    ${homeIndicator()}
  </div>`

export const avatarDe = (pseudo, size, options) => avatar(profilDe(pseudo), size, options)
