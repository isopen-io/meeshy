import { html } from '../lib/html.mjs'
import { icon, logo } from '../lib/icons.mjs'
import { illustration } from '../lib/illustrations.mjs'
import { avatar, homeIndicator, nomComplet, roundButton, statusBar } from '../lib/composants.mjs'
import { formatDate, formatNumber } from '../lib/locales.mjs'
import { langue } from '../lib/langues.mjs'
import { serve } from '../lib/prism.mjs'
import { DEMO, lecteurDe, profilDe } from '../textes/demo.mjs'

// CallView : vidéo du correspondant plein écran, vignette du lecteur, sous-titres de
// CallTranscriptionService TRADUITS dans la langue du lecteur (l'original en rappel discret).
export const appelSousTitres = (ctx) => {
  const servi = serve(DEMO.appel, ctx.lang)
  return html`<div class="call-captions">
    <div class="cc-head">${icon('captions', { size: 15 })}<span>${ctx.ui('call.control.captions.state.translated')}</span><span class="cc-flags">${langue('ko').drapeau} → ${langue(ctx.lang).drapeau}</span></div>
    <p class="cc-text">${servi.text}</p>
    <p class="cc-orig" lang="ko">${DEMO.appel.text}</p>
  </div>`
}

const controle = (nom, legende, { actif = false, rouge = false } = {}) =>
  html`<div class="call-ctl${actif ? ' on' : ''}${rouge ? ' red' : ''}"><span>${icon(nom, { size: 24 })}</span><em>${legende}</em></div>`

export const appelControles = (ctx) =>
  html`<div class="call-controls glass">
    ${controle('mic', ctx.ui('call.control.mute.caption'))}
    ${controle('video', ctx.ui('call.control.video.caption'))}
    ${controle('captions', ctx.ui('call.control.transcript.caption'), { actif: true })}
    ${controle('speaker', ctx.ui('call.control.speaker.caption'))}
    ${controle('hangup', '', { rouge: true })}
  </div>`

export const ecranAppel = (ctx) => {
  const minjun = profilDe('minjun.p')
  return html`<div class="ecran iphone appel dark" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="call-video">${illustration('appel-seoul', { className: 'call-illu' })}</div>
    <div class="call-shade"></div>
    ${statusBar({ onMedia: true })}
    <div class="call-top">
      <span class="call-pill glass">${icon('back', { size: 15 })}</span>
      <div class="call-who"><b>${nomComplet(minjun)}</b><span><i class="rec"></i>04:12 · 🇰🇷 ${DEMO.villes['Séoul'][ctx.lang]}</span></div>
    </div>
    <div class="call-self">${avatar(lecteurDe(ctx.lang), 64)}</div>
    ${appelSousTitres(ctx)}
    ${appelControles(ctx)}
    ${homeIndicator({ onMedia: true })}
  </div>`
}

// Lien d'invitation (CommunityLinkDetailView) : on entre SANS compte par /l/<lien>.
export const invitationCorps = (ctx) => {
  const L = DEMO.lienInvitation
  const total = L.langues.reduce((n, [, v]) => n + v, 0)
  const recents = ['priya.n', 'kwame.m', 'amara.d']
  return html`
    <section class="inv-card">
      <div class="inv-head">
        <div class="inv-logo">${logo(52, { radius: 0.3 })}</div>
        <div><b>${L.groupe}</b><span>${ctx.ui('communityLink.createdAt')} ${formatDate(ctx.lang, L.cree, { day: 'numeric', month: 'short' })}</span></div>
      </div>
      <div class="inv-url">${icon('link', { size: 17 })}<span dir="ltr">${L.url}</span></div>
      <p class="inv-promise">${ctx.ui('kit.invit.promesse')}</p>
      <div class="inv-buttons"><span class="primary">${icon('send', { size: 16 })}${ctx.ui('kit.invit.partager')}</span><span>${icon('link', { size: 16 })}${ctx.ui('kit.invit.copier')}</span></div>
    </section>
    <section class="inv-stats">
      <div><b>${formatNumber(ctx.lang, L.clics)}</b><span>${ctx.ui('kit.invit.visites')}</span></div>
      <div><b>${formatNumber(ctx.lang, L.arrivees)}</b><span>${ctx.ui('kit.invit.arrivees')}</span></div>
      <div class="accent"><b>${formatNumber(ctx.lang, L.sansCompte)}</b><span>${ctx.ui('kit.invit.sans.compte')}</span></div>
    </section>
    <section class="inv-langs">
      <div class="inv-h">${ctx.ui('kit.invit.langues')}</div>
      <div class="inv-bar">${L.langues.map(([code, v]) => html`<i style="flex:${v};background:${langue(code).couleur}"></i>`)}</div>
      <div class="inv-legend">${L.langues.map(([code, v]) => html`<span><i style="background:${langue(code).couleur}"></i>${langue(code).drapeau} ${Math.round((v * 100) / total)}%</span>`)}</div>
    </section>
    <section class="inv-recent">
      <div class="inv-h">${ctx.ui('kit.recents')}</div>
      ${recents.map(
        (pseudo, i) => html`<div class="inv-row">${avatar(profilDe(pseudo), 36)}<b>${profilDe(pseudo).prenom}</b>${i === 1 ? '' : html`<span class="no-acc">${ctx.ui('bubble.joinNotice.noAccount')}</span>`}<span class="flag">${profilDe(pseudo).drapeau}</span></div>`,
      )}
    </section>`
}

export const ecranInvitation = (ctx) =>
  html`<div class="ecran iphone invitation ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="p-nav">${roundButton('back', { iconSize: 19, tint: 'var(--ios-indigo-500)', className: 'flip-rtl' })}${roundButton('ellipsis', { iconSize: 18, tint: 'var(--kit-ink)' })}</div>
    <h1 class="p-title">${ctx.ui('kit.invit.titre')}</h1>
    <main class="inv-list">${invitationCorps(ctx)}</main>
    ${homeIndicator()}
  </div>`
