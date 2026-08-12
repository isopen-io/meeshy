# Plan — Itération 55w (web)

## Contexte
Base : `main` HEAD post-merge iter-54w (#767, story deep-link). Toutes les
analyses/plans web antérieurs sont soldés et annotés dans `branch-tracking.md`.
Cette itération solde le **cluster i18n « micro-surfaces FR restantes »**
repéré en 53w (deferred carry-over), borné aux surfaces d'entrée/leaf encore
non internationalisées.

## Périmètre (web only)
i18n des dernières chaînes **FR dures** affichées en TOUTES langues — rupture
Prisme UI sur des surfaces de chargement/aperçu :

1. **Fallbacks Suspense de chargement** (FR durs rendus quel que soit le locale)
   - `app/groups/page.tsx` → `Chargement des groupes...`
   - `app/groups/[identifier]/page.tsx` → `Chargement du groupe...`
   - `app/auth/verify-phone/page.tsx` `LoadingFallback` → `Chargement...`
   - `app/auth/verify-email/page.tsx` `LoadingFallback` → `Chargement...`
2. **Labels media de réponse** — `components/v2/ReplyPreview.tsx`
   `CONTENT_TYPE_LABELS` (`📷 Photo` / `🎤 Audio` / `🎬 Vidéo`) figés FR.

## Approche
- Pages `'use client'` → `useI18n` utilisable directement dans les composants
  fallback (pas de server component dans le lot, cf. exclusion documentée
  `app/settings/loading.tsx` 54w).
- Fallbacks EN passés en **2e argument** de `t()` (signature native
  `t(key, fallback)`, anti-flash — leçon 50w).
- ReplyPreview : emoji conservé dans le code (neutre), seul le mot est traduit.
  Réutilise `conversations.v2chat.photo` (existant 53w) ; ajoute
  `v2chat.audio` / `v2chat.video`. Pattern identique à `ConversationItem` (53w).

## Clés ajoutées (×4 locales en/es/fr/pt)
- `groups.list.loadingGroups`
- `groups.details.loadingGroup`
- `conversations.v2chat.audio`
- `conversations.v2chat.video`
- (`common.loading` réutilisé tel quel pour les pages verify — aucune clé neuve)

## Validation
- node_modules absent dans le container routine → typecheck/build délégués au CI.
- Diffs locale strictement additifs (round-trip JSON byte-identique vérifié).
- Pattern aligné sur `ConversationItem` (53w, mergé #766).

## Hors périmètre (reste du cluster 53w → 56w+)
- `AttachmentDeleteDialog.tsx` (~5 chaînes dialogue confirm FR)
- `PhoneExistsModal.tsx` (~8 chaînes FR + flow SMS)
- `PostComposer.tsx` & `AudioPlayer.tsx` (`aria-label` statiques EN non i18n)
- `ReelPlayer.tsx` + surface feed globale (large, passe dédiée)
