import { html } from '../lib/html.mjs'
import { icon, meeshCoin } from '../lib/icons.mjs'
import { homeIndicator, revealRays, roundButton, statusBar } from '../lib/composants.mjs'
import { formatDate } from '../lib/locales.mjs'
import { DEMO } from '../textes/demo.mjs'

const P = DEMO.progression

// ProgressionElansHero écrit « Élan ×\(f) » EN DUR (non localisé) : une capture anglaise
// montrerait un mot français. Le kit prend le début localisé de « progression.elan.base »
// (« Momentum ×3 », « Racha ×3 »…) — défaut iOS consigné dans #7757.
const titreElan = (ui) => ui('progression.elan.base', P.elan, '', P.elanFenetre).split(' — ')[0].trim()

const bar = (fraction, teinte) =>
  html`<div class="p-bar"><i style="width:${Math.round(fraction * 100)}%;background:${teinte}"></i></div>`

const tuile = (nom, teinte) =>
  html`<div class="p-tile" style="--t:${teinte}">${icon(nom, { size: 26 })}</div>`

// ProgressionMeeshEntry — le solde dans l'en-tête, pièce d'argent (meeshSilver) sur verre ambré.
export const meeshEntry = (solde) =>
  html`<div class="meesh-entry glass"><span>${solde}</span>${meeshCoin(20)}</div>`

// ProgressionMeeshCard — le solde, ce qui a été frappé depuis toujours, la prochaine frappe.
export const carteMeesh = ({ ui }) => {
  const warning = 'var(--ios-warning)'
  return html`<section class="p-card meesh" style="--t:${warning}">
        <div class="p-eyebrow meesh-eyebrow">${meeshCoin(16)}${ui('progression.meesh.title')}</div>
        <div class="p-meesh-balance">${ui('progression.meesh.many', P.meesh)}</div>
        <div class="p-muted small">${ui('progression.meesh.minted.many', P.meeshFrappees)}</div>
        ${bar(P.meeshProgression, warning)}
        <div class="p-muted small">${ui('progression.meesh.missing', P.meeshManquants)}</div>
      </section>`
}

// ProgressionLayout.blocks : dernier succès → niveau → Meesh → élans → série → sections.
// La section « Défis » n'est pas montrée : la campagne n'emploie pas ce mot sur un écran iOS (§ 2).
export const progressionCartes = (ctx) => {
  const { ui, lang } = ctx
  const warning = 'var(--ios-warning)'
  const brand = 'var(--ios-indigo-500)'
  const success = 'var(--ios-success)'
  const familles = P.elanFamilles.map((f) => ui(`progression.family.${f}`))
  const elan = `${ui('progression.elan.base', P.elan, ui('progression.elan.family.many', P.elanFamilles.length), P.elanFenetre)}. ${ui('progression.elan.effect', P.elan)}`
  return html`      <section class="p-card hero" style="--t:${success}">
        ${tuile('trophy', success)}
        <div>
          <div class="p-eyebrow">${ui('progression.hero.last')}</div>
          <div class="p-strong">${ui(`progression.achievement.${P.dernierSucces.cle}.title`)}</div>
          <div class="p-muted">${ui('progression.obtained', formatDate(lang, P.dernierSucces.date))}</div>
        </div>
      </section>

      <section class="p-card level">
        <div class="p-level-row">
          <span class="p-level">${ui('progression.level', P.niveau)}</span>
          <span class="p-score">${ui('progression.points', P.points)}</span>
        </div>
        ${bar(0.74, brand)}
        <div class="p-muted">${ui('progression.next.level', P.pointsAvantNiveau, P.niveau + 1)}</div>
      </section>

      ${carteMeesh(ctx)}

      <section class="p-card elans" style="--t:${brand}">
        <div class="p-elan-title">${icon('sparkles', { size: 18 })}<span>${titreElan(ui)}</span></div>
        <div class="p-wrap">${familles.map((f) => html`<span>${f}</span>`)}</div>
        <div class="p-muted">${elan}</div>
      </section>

      <section class="p-card hero flamme" style="--t:${warning}">
        ${tuile('flame', warning)}
        <div>
          <div class="p-eyebrow">${ui('progression.hero.streak')}</div>
          <div class="p-strong">${ui('progression.streak.days', P.serie)}</div>
          <div class="p-muted">${ui('progression.streak.record', P.record)}</div>
          <div class="p-muted">${ui('progression.next.streak', P.serieJalon - P.serie, P.serieJalon)}</div>
        </div>
      </section>

      ${[
        ['rosette', brand, ui('progression.section.badges'), P.badges],
        ['trophy', success, ui('progression.section.achievements'), P.succes],
      ].map(
        ([nom, teinte, titre, [fait, total]]) => html`<section class="p-link" style="--t:${teinte}">
          <div class="p-link-tile">${icon(nom, { size: 17 })}</div>
          <span class="p-link-title">${titre}</span>
          <span class="p-link-count">${fait} / ${total}</span>
          <span class="flip-rtl p-chev">${icon('forward', { size: 14 })}</span>
        </section>`,
      )}
`
}

export const ecranProgression = (ctx) =>
  html`<div class="ecran iphone progression ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="p-nav">
      ${roundButton('back', { iconSize: 19, tint: 'var(--ios-indigo-500)', className: 'flip-rtl' })}
      ${meeshEntry(P.meesh)}
    </div>
    <h1 class="p-title">${ctx.ui('progression.title')}</h1>
    <div class="p-list">${progressionCartes(ctx)}</div>
    ${homeIndicator()}
  </div>`

// AchievementRevealView — médaille, bandeau, titre, explication, sorties ; le solde Meesh en
// surimpression dans le coin (captures-app-store.md § 2, capture 8).
export const ecranSucces = (ctx) => {
  const { ui, lang } = ctx
  const axe = ui(`progression.axis.${P.revelation.axe}`)
  const titre = `${P.revelation.seuil} ${lang === 'de' ? axe : axe.toLocaleLowerCase(lang)}`
  return html`<div class="ecran iphone reveal ${ctx.theme}" dir="${ctx.dir}" lang="${lang}">
    <div class="reveal-glow"></div>
    ${revealRays()}
    ${statusBar()}
    <div class="reveal-top">${meeshEntry(P.meesh)}</div>
    <div class="reveal-center">
      <div class="reveal-medal">${icon('rosette', { size: 60 })}</div>
      <div class="reveal-eyebrow">${ui('reveal.badge.badge')}</div>
      <div class="reveal-title">${titre}</div>
      <div class="reveal-sub">${ui('reveal.badgeAxis.subtitle')}</div>
    </div>
    <div class="reveal-actions">
      <div class="reveal-primary">${ui('reveal.continue')}</div>
      <div class="reveal-secondary">${ui('reveal.ok')}</div>
    </div>
    ${homeIndicator()}
  </div>`
}
