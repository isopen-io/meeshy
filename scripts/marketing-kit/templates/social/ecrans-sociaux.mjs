// Écrans reproduits propres au kit social — mêmes composants que le socle (screens/*.mjs),
// d'autres états de l'app : le bonjour du lecteur dans Global, sa story et son post « ma ville »,
// le consentement du profil vocal, la grille des badges, la révélation d'un succès, d'une série
// ou d'un niveau, la conversation vue depuis le téléphone de l'ami.
import { html, raw } from '../../lib/html.mjs'
import { icon, logo } from '../../lib/icons.mjs'
import { illustration } from '../../lib/illustrations.mjs'
import { avatar, homeIndicator, nomComplet, roundButton, statusBar, typo } from '../../lib/composants.mjs'
import { contexte, ecran } from '../../lib/gabarits.mjs'
import { formatNumber } from '../../lib/locales.mjs'
import { ACCENTS } from '../../screens/conversations.mjs'
import { dmHeader, globalHeader } from '../../screens/conversations.mjs'
import { bubble, conversationBackground, conversationHeader, daySeparator, systemNotice } from '../../screens/conversation.mjs'
import { meeshEntry } from '../../screens/progression.mjs'
import { postCard } from '../../screens/social.mjs'
import { DEMO, lecteurDe, profilDe } from '../../textes/demo.mjs'
import { COMMENTAIRES_VILLE, MA_VILLE, MON_BONJOUR, REPONSES_GLOBAL } from './textes/demo-social.mjs'

const ville = (profil, lang) => DEMO.villes[profil.ville][lang]

export const monBonjour = (ctx) => MON_BONJOUR[ctx.lang].replace('{0}', ville(lecteurDe(ctx.lang), ctx.lang))

// Réponses reçues : jamais écrites par le lecteur, jamais déjà dans sa langue (il n'y aurait
// rien à traduire à montrer).
export const reponsesPour = (ctx, n) => {
  const lecteur = lecteurDe(ctx.lang)
  return REPONSES_GLOBAL.filter((r) => r.lang !== ctx.lang && r.auteur !== lecteur.pseudo).slice(0, n)
}

const composerSaisi = (ctx, texteSaisi) =>
  html`<div class="composer">
    ${roundButton('plus', { iconSize: 20, tint: 'var(--kit-ink)' })}
    <div class="composer-field glass saisi"><span>${typo(texteSaisi, ctx.lang)}</span><i class="caret"></i></div>
    <div class="round-btn mic-btn envoyer">${icon('arrowRight', { size: 20, className: 'vers-haut' })}</div>
  </div>`

// Meeshy Global depuis le compte du lecteur : il arrive (« X a rejoint »), dit bonjour, le monde répond.
export const ecranGlobalBonjour = (ctx, { reponses = 3, saisie = false } = {}) => {
  const accent = ACCENTS.global
  const lecteur = lecteurDe(ctx.lang)
  const avant = DEMO.global.slice(0, 4)
  const heures = ['8:58', '9:00', '9:02', '9:03']
  const recues = reponsesPour(ctx, reponses)
  const corps = html`${daySeparator(ctx)}
    ${avant.map((ligne, i) =>
      ligne.type === 'arrivee'
        ? systemNotice(ctx.ui('bubble.joinNotice.joined', profilDe(ligne.auteur).prenom))
        : bubble({ ctx, contenu: ligne, auteur: ligne.auteur, accent, time: heures[i], identite: true }),
    )}
    ${systemNotice(ctx.ui('bubble.joinNotice.joined', lecteur.prenom))}
    ${saisie ? '' : bubble({ ctx, contenu: monBonjour(ctx), mine: true, accent, time: '9:15' })}
    ${recues.map((r, i) => bubble({ ctx, contenu: r, auteur: r.auteur, accent, time: `9:1${6 + i}`, identite: true }))}`
  return html`<div class="ecran iphone conversation ${ctx.theme} global" dir="${ctx.dir}" lang="${ctx.lang}">
    ${conversationBackground(accent, ctx.theme)}
    ${statusBar()}
    ${globalHeader(ctx)}
    <main class="messages">${corps}</main>
    ${saisie ? composerSaisi(ctx, monBonjour(ctx)) : html`<div class="composer">${roundButton('plus', { iconSize: 20, tint: 'var(--kit-ink)' })}<div class="composer-field glass"><span>${ctx.ui('composer.message')}</span></div><div class="round-btn mic-btn">${icon('mic', { size: 20 })}</div></div>`}
    ${homeIndicator()}
  </div>`
}

// Le DM au moment où le lecteur ENREGISTRE son vocal (V1, plan 1) : les messages d'avant,
// et le composeur en enregistrement — point rouge, durée, onde qui avance.
export const ecranEnregistrement = (ctx) => {
  const accent = ACCENTS.dm
  const onde = Array.from({ length: 34 }, (_, i) => 4 + 16 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37)))
  return html`<div class="ecran iphone conversation ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    ${conversationBackground(accent, ctx.theme)}
    ${statusBar()}
    ${dmHeader(ctx)}
    <main class="messages">
      ${daySeparator(ctx)}
      ${bubble({ ctx, contenu: DEMO.dm[0], accent, time: '9:18' })}
      ${bubble({ ctx, contenu: DEMO.miens.dmCri[ctx.lang], mine: true, accent, time: '9:19' })}
      ${bubble({ ctx, contenu: DEMO.dm[1], accent, time: '9:24' })}
      ${bubble({ ctx, contenu: DEMO.miens.dmBillets[ctx.lang], mine: true, accent, time: '9:25' })}
      ${bubble({ ctx, contenu: DEMO.dm[2], accent, time: '9:26' })}
    </main>
    <div class="composer enregistre">
      <div class="composer-field glass rec"><i class="rec-point"></i><b>0:05</b><span class="rec-onde">${onde.map((h) => html`<i style="height:${h.toFixed(1)}px"></i>`)}</span></div>
      <div class="round-btn mic-btn actif">${icon('mic', { size: 22 })}</div>
    </div>
    ${homeIndicator()}
  </div>`
}

// Le message du lecteur, vu depuis le téléphone d'un ami qui lit dans `langAmi` (C1, slide 2).
export const ecranChezLAmi = (lang, langLecteur, theme = 'light') => {
  const ctx = contexte({ lang, theme })
  const auteur = lecteurDe(langLecteur)
  const accent = ACCENTS.dm
  const cri = { id: 'dm.cri', lang: langLecteur, text: DEMO.miens.dmCri[langLecteur], translations: DEMO.miens.dmCri }
  const billets = { id: 'dm.billets', lang: langLecteur, text: DEMO.miens.dmBillets[langLecteur], translations: DEMO.miens.dmBillets }
  return html`<div class="ecran iphone conversation ${theme}" dir="${ctx.dir}" lang="${lang}">
    ${conversationBackground(accent, theme)}
    ${statusBar()}
    ${conversationHeader({ ctx, visuel: avatar(auteur, 38), titre: nomComplet(auteur), sousTitre: `${auteur.drapeau} ${ville(auteur, lang)}` })}
    <main class="messages">
      ${daySeparator(ctx)}
      ${bubble({ ctx, contenu: DEMO.miens.dmBillets[lang], mine: true, accent, time: '9:17' })}
      ${bubble({ ctx, contenu: cri, accent, time: '9:19' })}
      ${bubble({ ctx, contenu: billets, accent, time: '9:25', reactions: '🙌' })}
    </main>
    <div class="composer">${roundButton('plus', { iconSize: 20, tint: 'var(--kit-ink)' })}<div class="composer-field glass"><span>${ctx.ui('composer.message')}</span></div><div class="round-btn mic-btn">${icon('mic', { size: 20 })}</div></div>
    ${homeIndicator()}
  </div>`
}

// La story « ma ville » du lecteur, vue par lui-même : barres, auteur, texte, nombre de vues.
export const ecranMaStory = (ctx) => {
  const moi = lecteurDe(ctx.lang)
  return html`<div class="ecran iphone story dark" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="story-media">${illustration('madrid', { className: 'story-illu ma-ville' })}</div>
    <div class="story-shade"></div>
    ${statusBar({ onMedia: true })}
    <div class="story-bars"><i class="live"><b></b></i></div>
    <div class="story-head">
      ${avatar(moi, 38)}
      <div><b>${moi.prenom}</b><span>${ville(moi, ctx.lang)} · ${ctx.ui('kit.heures', 1)}</span></div>
      <span class="story-x">${icon('close', { size: 22 })}</span>
    </div>
    <div class="story-text"><span>${typo(MA_VILLE[ctx.lang], ctx.lang)}</span></div>
    <div class="story-vues">
      <div class="vues-avatars">${COMMENTAIRES_VILLE.slice(0, 4).map((c) => avatar(profilDe(c.auteur), 28))}</div>
      <span>${icon('eye', { size: 18 })}${formatNumber(ctx.lang, 248)}</span>
    </div>
    ${homeIndicator({ onMedia: true })}
  </div>`
}

export const commentairesPour = (ctx, n) => {
  const lecteur = lecteurDe(ctx.lang)
  return COMMENTAIRES_VILLE.filter((c) => c.lang !== ctx.lang && c.auteur !== lecteur.pseudo).slice(0, n)
}

// Le fil, avec le post « ma ville » du lecteur et les commentaires servis dans sa langue.
export const ecranFilMaVille = (ctx) => {
  const moi = lecteurDe(ctx.lang)
  const post = {
    id: 'ma-ville', auteur: moi.pseudo, photo: 'madrid', likes: 214, commentaires: 12,
    lang: ctx.lang, text: MA_VILLE[ctx.lang], translations: {}, apercu: commentairesPour(ctx, 4),
  }
  return html`<div class="ecran iphone fil ma-ville ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg plain"></div>
    ${statusBar()}
    <div class="fil-nav">
      <div class="fil-brand">${logo(34, { radius: 0.28 })}<span>${ctx.ui('conversation.list.feed')}</span></div>
      <div class="fil-actions">${roundButton('search', { iconSize: 17, tint: 'var(--kit-ink)' })}${roundButton('bell', { iconSize: 17, tint: 'var(--kit-ink)' })}</div>
    </div>
    <main class="fil-list">${postCard(ctx, post, { heures: 1 })}</main>
    ${homeIndicator()}
  </div>`
}

// Glyphes SF absents du socle : trash.fill et waveform.circle.fill.
const corbeille = raw('<svg class="ico" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l.8 1.8H20v2H4v-2h4.2z M5.5 8.5h13l-1 11.2a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z" fill="currentColor"/></svg>')
const ondeCercle = raw('<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><defs><linearGradient id="onde-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--ios-indigo-500)"/><stop offset="1" style="stop-color:var(--ios-indigo-400)"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="url(#onde-g)"/><g stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M17 28v8M23.5 22v20M30 17v30M36.5 24v16M43 20v24M49.5 28v8"/></g></svg>')

// VoiceProfileWizardView — étape de consentement. Les lignes « intro » et « use » du catalogue
// promettent « votre voix naturelle » / « avec votre voix », contraires au § 2 de la campagne :
// elles ne sont PAS montrées (défaut de copie consigné dans une issue), le reste est fidèle.
export const ecranConsentementVoix = (ctx) =>
  html`<div class="ecran iphone voix ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="voix-nav"><span class="voix-fermer">${icon('close', { size: 16 })}</span><b>${ctx.ui('voice.profile.wizard.title')}</b><span></span></div>
    <div class="voix-corps">
      <div class="voix-icone">${ondeCercle}</div>
      <h2>${ctx.ui('voice.profile.wizard.title')}</h2>
      <div class="voix-lignes">
        <div>${icon('mic', { size: 16 })}<span>${ctx.ui('voice.profile.wizard.consent.samples')}</span></div>
        <div>${corbeille}<span>${ctx.ui('voice.profile.wizard.consent.rgpd')}</span></div>
      </div>
      <div class="voix-bouton">${ctx.ui('voice.profile.wizard.acceptContinue')}</div>
    </div>
    ${homeIndicator()}
  </div>`

// La grille des badges (AchievementBadgeView ×3 colonnes) : anneau de progression, nom, compte.
const BADGES = [
  ['content.audio_message', 'mic', 12, 10, '#6366F1'],
  ['content.story', 'camera', 7, 10, '#EC4899'],
  ['social.friendship', 'personCheck', 10, 10, '#10B981'],
  ['conversation.public', 'globe', 23, 25, '#0EA5E9'],
  ['comment.audio', 'comment', 4, 10, '#F59E0B'],
  ['content.post', 'heart', 3, 10, '#8B5CF6'],
  ['social.invite_joined', 'personPlus', 2, 5, '#14B8A6'],
  ['tool.sticker', 'sparkles', 1, 10, '#F43F5E'],
  ['content.reel', 'video', 0, 5, '#808080'],
]

export const ecranBadges = (ctx) =>
  html`<div class="ecran iphone badges ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}">
    <div class="p-bg"></div>
    ${statusBar()}
    <div class="p-nav">${roundButton('back', { iconSize: 19, tint: 'var(--ios-indigo-500)', className: 'flip-rtl' })}${meeshEntry(DEMO.progression.meesh)}</div>
    <h1 class="p-title">${ctx.ui('progression.section.badges')}</h1>
    <div class="badge-grille">
      ${BADGES.map(([axe, glyphe, courant, seuil, couleur]) => {
        const obtenu = courant >= seuil
        const teinte = obtenu ? couleur : '#808080'
        const angle = Math.min(1, courant / seuil) * 360
        return html`<div class="badge-carte${obtenu ? ' obtenu' : ''}" style="--b:${teinte};--arc:${angle}deg">
          <div class="badge-anneau"><span>${icon(glyphe, { size: 22 })}</span></div>
          <div class="badge-nom">${ctx.ui(`progression.axis.${axe}`)}</div>
          <div class="badge-compte">${courant}/${seuil}</div>
        </div>`
      })}
    </div>
    ${homeIndicator()}
  </div>`

// AchievementRevealView pour un succès, une série ou un niveau (le socle montre le badge).
const REVELATIONS = {
  succes: (ui, v) => ({ teinte: 'var(--ios-purple-500)', glyphe: 'trophy', surtitre: ui('reveal.badge.achievement'), titre: ui(`progression.achievement.${v}.title`), sous: ui(`progression.achievement.${v}.condition`) }),
  serie: (ui, v) => ({ teinte: 'var(--ios-warning)', glyphe: 'flame', surtitre: ui('reveal.badge.streak'), titre: ui('progression.streak.days', v), sous: ui('reveal.streak.subtitle', v) }),
  niveau: (ui, v) => ({ teinte: 'var(--ios-indigo-500)', glyphe: 'sparkles', surtitre: ui('reveal.badge.level'), titre: ui('progression.level', v), sous: ui('reveal.level.subtitle') }),
}

export const ecranRevelation = (ctx, { type, valeur }) => {
  const r = REVELATIONS[type](ctx.ui, valeur)
  return html`<div class="ecran iphone reveal ${ctx.theme}" dir="${ctx.dir}" lang="${ctx.lang}" style="--t:${r.teinte}">
    <div class="reveal-glow"></div>
    <div class="reveal-rays">${Array.from({ length: 12 }, (_, i) => html`<i style="transform:rotate(${i * 30}deg) translateY(-118px)"></i>`)}</div>
    ${statusBar()}
    <div class="reveal-top">${meeshEntry(DEMO.progression.meesh)}</div>
    <div class="reveal-center">
      <div class="reveal-medal">${icon(r.glyphe, { size: 60 })}</div>
      <div class="reveal-eyebrow">${r.surtitre}</div>
      <div class="reveal-title">${r.titre}</div>
      <div class="reveal-sub">${r.sous}</div>
    </div>
    <div class="reveal-actions">
      <div class="reveal-primary">${ctx.ui('reveal.continue')}</div>
      <div class="reveal-secondary">${ctx.ui('reveal.ok')}</div>
    </div>
    ${homeIndicator()}
  </div>`
}

// L'écran Progression du socle, avec une autre série (V3 « jour 30 », C2 « jour 1 »). Le rendu
// est synchrone : la valeur de démo est rétablie avant que quiconque d'autre ne la lise.
export const ecranProgressionAvec = (ctx, valeurs) => {
  const avant = { ...DEMO.progression }
  Object.assign(DEMO.progression, valeurs)
  try {
    return ecran('progression', ctx)
  } finally {
    Object.keys(valeurs).forEach((k) => delete DEMO.progression[k])
    Object.assign(DEMO.progression, avant)
  }
}
