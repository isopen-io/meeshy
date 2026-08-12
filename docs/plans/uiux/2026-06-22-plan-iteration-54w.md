# Plan — Iteration 54w (2026-06-22)

## Contexte
Continuité directe de 53wb (#764, page reel `/reel/[postId]`). La page de deep-link **story**
`/story/[postId]` est sa jumelle plein écran et restait 100 % FR dure. Base : `main` HEAD
`34585d5` (post-merge 53wb). Itération **web exclusivement**.

## Objectif
i18n de la page de **deep-link story** `/story/[postId]` — 11 chaînes FR dures user-facing
(toasts delete/reply, loading sr-only, titres/corps d'états, bouton) affichées en toutes langues.

## Périmètre (web uniquement)
- `apps/web/app/story/[postId]/page.tsx`
- `apps/web/locales/{en,fr,es,pt}/story.json` (nouveau namespace)

## Étapes
1. **Locales** — créer `story.json` ×4 (11 clés à parité : `deleted`, `deleteError`, `replySent`,
   `loading`, `unavailableTitle`, `notAStoryTitle`, `goneTitle`, `unavailableBody`, `notAStoryBody`,
   `goneBody`, `backToFeed`). ✅
2. **page.tsx** — `import { useI18n }` + `const { t } = useI18n('story')` ; remplacer les 11
   littéraux par `t('key', '<fallback EN>')` (2e arg = fallback anti-flash, leçon 50w) ; ajouter
   `t` aux deps des `useCallback` `handleDelete` / `handleReply`. ✅

## Décisions
- **Namespace dédié `story`** : aucune surface story-page n'avait de namespace ; convention
  namespace-par-feature (cohérent avec `reel` en 53wb).
- **Fallbacks anglais en 2e argument** : `t()` renvoie la clé brute pendant le load (leçon 50w).
- **`index.ts` non touché** : barrel non importé (runtime = import dynamique).
- **`settings/loading.tsx` EXCLU** : server component → hook client inutilisable sans casser le
  streaming skeleton. Documenté comme exclusion, à arbitrer séparément.

## Validation
- 4 `story.json` valides + parité 11 clés ; 0 chaîne FR résiduelle dans `page.tsx`.
- Diff = miroir fidèle de la page reel (53wb) qui compile en CI.

## Risques
- Très faible. 1 page `'use client'` isolée + 4 fichiers de locale neufs.
- **Note CI** : `Test web` rouge sur `main` (préexistant, `42a6b60`) — 2 suites sur deps non
  déclarées, indépendantes de ce diff. Job non bloquant (cf. #764/#765/#766). À corriger isolément.

## Statut : ✅ implémenté — voir analyse 2026-06-22-iteration-54w
