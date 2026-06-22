# Plan — Itération 60w (web only) : i18n du cluster admin/agent

## Base
- Repartir de `main` HEAD `9857819` (post-merge #799 iter-59w + #796 focus-trap +
  #779 inert ConversationDrawer).
- Branche de travail : `claude/practical-fermat-iuu5e3` (resynchronisée sur `main` HEAD).

## Contexte
- Routine déclenchée par fermeture (merge) de **PR #799** (iter-59w ImageLightbox).
- Revue analyses + plans : clusters feed/reels (53w), modales hand-rolled (58w/#796
  focus-trap), rouge erreur (56wb), ImageLightbox (59w) **tous soldés**. Pas de
  doublon web détecté.
- Audit surfaces live → cluster **admin / agent** non internationalisé (3 composants,
  22 chaînes FR figées, rupture Prisme rendue en TOUTES langues).

## Objectif
i18n des 3 composants `components/admin/agent/{AgentConversationsTab,
ConversationPicker,AgentRolesSection}.tsx` sous le namespace existant `admin`.

## Étapes
1. [x] Injecter **40 clés ×4 locales** sous `agent` dans `locales/{en,fr,es,pt}/admin.json` :
   - `conversationsTab.*` (8 + sous-groupe `columns.*` 8 clés)
   - `conversationPicker.*` (5 clés)
   - `rolesSection.*` (7 + sous-groupe `origin.*` 3 clés)
   - Diff strictement additif (round-trip JSON byte-identique ; parité 268 ×4).
2. [x] `AgentConversationsTab.tsx` : 15 swaps `t('agent.conversationsTab...')`
   (deleteConfirm, title, count interpolé, searchPlaceholder, configure, empty,
   viewMessages, triggerScheduler, 8 en-têtes colonnes).
3. [x] `ConversationPicker.tsx` : ajouter `t` au destructuring + 6 swaps
   (searchPlaceholder, searching, untitled ×2, noResults interpolé `{term}`, minChars).
4. [x] `AgentRolesSection.tsx` : 9 swaps (empty, origin ×3, locked, unlock, count
   interpolé `{count}`, confidence, assignArchetype).
5. [x] Vérif : grep FR résiduel = 0 ; JSON valide ×4 ; parité 40 clés ; aucun test
   impacté.
6. [x] Annoter analyse `2026-06-22-iteration-60w.md` + `branch-tracking.md`.
7. [ ] Commit + push ; PR vers `main` ; merge après CI vert ; supprimer la branche.

## Contraintes / décisions
- Fallbacks EN en 2e arg pour chaînes simples (anti-flash, leçon 50w) ; interpolation
  via params object (exclusif du fallback string par la signature `t()`).
- Namespace `admin` réutilisé (les 3 composants font déjà `useI18n('admin')`) — aucun
  nouveau namespace, aucun nouvel import de hook.
- `ConversationPicker` prop défaut EN `placeholder="Search a conversation..."` :
  surchargée par les appelants, laissée telle quelle (défaut de prop, non visible).
- Aucune autre frontend (iOS/Android hors périmètre).

## Suite (61w+)
- `Badge` v2 variants off-palette → arbitrage `theme.colors.*` vs `gp-*` AVANT migration.
- Épuration `_archived/` + composants morts (`font-selector`/`config-modal`/`metadata-test`)
  — lot dédié (touche barrels/tests).
- `console.error` FR (dev) ; `next-themes` orphelin (lockfile) ; `app/settings/loading.tsx`
  (i18n server-side).

## Merge
PR vers `main` ; après merge : mettre à jour `branch-tracking.md` (60w mergée, base
suivante = `main` HEAD) + supprimer la branche.
