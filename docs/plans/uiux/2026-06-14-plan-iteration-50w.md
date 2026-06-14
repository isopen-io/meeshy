# Plan — Iteration 50w (2026-06-14)

## Scope
**Web exclusivement** (suffixe `w`). Base : `main` HEAD `97a1870c` (post-merge iter-49i #630 +
iter-49wb #633). Itération dédiée au lot différé **micro-chaînes i18n + a11y audio/media/v2**
tracé dans `branch-tracking.md` (« NOUVEAU repéré 49w »).

## Findings traités (tous différés 49w → soldés ici)

### 1. Fallbacks `t('x') || 'English'` — pattern buggé (carousel/panel appel vidéo)
`t()` (`hooks/use-i18n.ts:140`) retourne **la clé elle-même** quand la traduction est absente
ou pendant le chargement initial (`translations === {}`). Donc `t('title') || 'Audio Effects'`
n'affiche **jamais** le fallback anglais : il affiche la clé brute `"title"` pendant le load.
La signature correcte est `t(key, fallback)` (2e argument). Les clés existent déjà dans les 4
locales `audioEffects.json` — le fallback ne sert que de garde au chargement.
- `video-calls/AudioEffectsCarousel.tsx` : `title`, `subtitle`, `selectEffectPrompt`.
- `video-calls/AudioEffectsPanel.tsx` : `backSound.loopMode.tooltip`.
→ Conversion `t('x') || 'En'` → `t('x', 'En')`.

### 2. `AudioEffectsTimeline.tsx` — FR dur sans i18n (pas de hook)
Ligne 61 : `title={...- Cliquez pour aller à ce moment}` codé en dur ; le composant n'a aucun
`useI18n`. La clé **existe déjà** : `audioEffects.timeline.clickToSeek` (4 locales). De plus le
compteur `({n} segment{s})` est une pseudo-pluralisation FR/EN dure adjacente.
→ Ajout `useI18n('audioEffects')` ; `t('timeline.clickToSeek')` ; nouvelles clés
`timeline.segment` / `timeline.segments` (×4 locales) pour le compteur.

### 3. `AudioControls.tsx:238` — `title="Voix clonée"` FR dur
Le composant a déjà `useI18n('audioEffects')`. → nouvelle clé `clonedVoice` (×4 locales),
`t('clonedVoice', 'Voix clonée')`.

### 4. `v2/GhostBadge.tsx:29` — `title="Utilisateur anonyme"` FR dur
Atome présentationnel `/v2` sans hook. → `useI18n('common')` + nouvelle clé `anonymousUser`
(×4 locales ; distincte du `common.anonymous` = « Anonyme » existant, ici « Utilisateur anonyme »).

### 5. `common/PrintButton.tsx` — défaut `label = 'Imprimer'` FR dur
Les **2 seuls** appelants (`app/terms/page.tsx`, `app/privacy/page.tsx`) passent déjà
`label={t('print')}`. Le défaut est mort. → `label` rendu **requis** (suppression du défaut FR,
type-safe, zéro chaîne en dur).

### 6. `v2/PostCard.tsx:255` — a11y : `alt={m.alt ?? ''}` (image de contenu sans alt)
`alt=""` indique une image **décorative** aux lecteurs d'écran → image de contenu masquée.
→ fallback localisé indexé `t('post.imageAlt', { index })` (convention `MediaImageCard`),
map avec index. Nouvelle clé `components.post.imageAlt` (×4 locales).

## Clés locales ajoutées (×4 : fr/en/es/pt)
- `audioEffects.json` → `clonedVoice`, `timeline.segment`, `timeline.segments`
- `common.json` → (sous `common`) `anonymousUser`
- `components.json` → `post.imageAlt`

## Hors périmètre (différés maintenus)
- `getTypeLabel`/`getMessageTypeIcon` (ranking) ; retrait `next-themes` ; consolidation
  notifications/preferences ; réactions par pièce jointe ; deep links `/v2/chats?id=` ;
  swipe-back ; audit dark admin (reste) ; audit qualité es/pt ; console.error FR.
- `MediaImageCard` fallbacks `'Image'`/`Image ${n}` : soldé 46w, ne pas retoucher.

## Validation
- `pnpm --filter @meeshy/web typecheck` + lint sur les fichiers touchés.
- Vérif node : les 6 nouvelles clés résolvent dans les 4 locales.
- Parité plateformes : libellés d'UI (pas du contenu Prisme) → pas de propagation iOS/Android.
