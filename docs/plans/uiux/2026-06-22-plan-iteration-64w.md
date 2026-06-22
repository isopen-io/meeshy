# Plan — Itération 64w (web)

## Objectif
Solder un cluster **orthogonal** de l'anti-pattern `t()||fallback` (différé 60w) sur des
bannières/labels où les clés étaient **absentes des locales** (vrai bug i18n, pas que dead-code).

## Périmètre (bounded)
1. `failed-message-banner.tsx` → `bubbleStream.*` (15 clés)
2. `SystemStatusBanner.tsx` → `offlineMessage`/`updateAvailable`/`updateNow`/`wait`
3. `language-selector.tsx` → `languageSelector.{selectLanguage,searchLanguage,noLanguageFound}`
4. `emoji-picker.tsx` → `picker.{clearSearch,categories.label}`

## Étapes
- [x] Convertir `t('k') || 'fr'` → `t('k', 'fr')` sur les 4 composants
- [x] Regrouper les 5 clés génériques du banner sous `bubbleStream`
- [x] Ajouter 24 clés ×4 locales (fr/en/es/pt) — append-only, JSON valide
- [x] Vérifier 0 anti-pattern restant + JSON valide
- [ ] `bun install` + `jest` sur les 3 tests des composants touchés
- [ ] Commit + push branche `claude/practical-fermat-gq4cjc`
- [ ] PR → CI vert → merge dans `main`
- [ ] MAJ `branch-tracking.md` (History + Next iteration 65w)

## Différé restant (pour 65w+) — classe `t()||fallback`
Surfaces orthogonales encore ouvertes (ne pas dupliquer #843/#849/#844) :
`app/(connected)/{contacts,me}/page.tsx`, `app/forgot-password/*`, `app/reset-password/page.tsx`,
`app/settings/page.tsx`, `components/common/SystemStatusBanner` ✅, `LastMessagePreview.tsx`,
`hooks/use-recovery-*.ts`, `hooks/use-conversation-details.ts`, `CommunityCarousel.tsx`,
`ConversationLayout.tsx`, `ConversationSettingsModal.tsx`, `conversation-participants-drawer.tsx`,
`steps/ConversationDetailsStep.tsx`, `video-calls/audio-effects/hooks/useAudioEffects.ts`,
`PhoneResetFlow.tsx` (post-#800). Procéder par lots **bornés et orthogonaux**.

## Continuité
- Base de départ : `main` (4172b8f). Branche de travail : `claude/practical-fermat-gq4cjc`.
- Après merge : supprimer la branche, repartir de `main` HEAD pour 65w.
