# Plan — Iteration 53w (2026-06-22)

## Contexte
Mon itération initiale (52w sur `claude/practical-fermat-i7juiv`, ciblant `getTypeLabel` ranking)
est devenue **redondante** : un agent parallèle a soldé le même différé (PR #765, mergée dans
`main` `50350e3`, via `ranking.conversationType.*`). Convergence vers `main` (reset) puis repivot
sur un finding distinct → **53w**.

## Objectif
i18n de la page de **deep-link reel** `/reel/[postId]` — 10 chaînes FR dures user-facing
(toasts, loading sr-only, titres/corps d'états d'erreur, bouton) affichées en toutes langues.

## Périmètre (web uniquement)
- `apps/web/app/reel/[postId]/page.tsx`
- `apps/web/locales/{en,fr,es,pt}/reel.json` (nouveau namespace)

## Étapes
1. **Locales** — créer `reel.json` ×4 (10 clés à parité : `linkCopied`, `linkCopyError`,
   `loading`, `unavailableTitle`, `notAReelTitle`, `goneTitle`, `unavailableBody`, `notAReelBody`,
   `goneBody`, `backToFeed`). ✅
2. **page.tsx** — `import { useI18n }` + `const { t } = useI18n('reel')` ; remplacer les 10
   littéraux par `t('key', '<fallback EN>')` (2e arg = fallback anti-flash, leçon 50w) ; ajouter
   `t` aux deps du `useCallback` `onShare`. ✅

## Décisions
- **Namespace dédié `reel`** (pas d'entassement dans `common`) : aligne sur la convention
  namespace-par-feature ; la surface feed/reel n'avait aucun namespace.
- **Fallbacks anglais en 2e argument** : `t()` renvoie la clé brute pendant le chargement async
  du namespace (leçon iter-50w) → fallback évite le flash sur une surface d'entrée publique.
- **`index.ts` non touché** : barrel `locales/*/index.ts` non importé (runtime = import
  dynamique), déjà incomplet → ne pas l'étendre pour un namespace dynamique.

## Validation
- 4 `reel.json` valides + parité 10 clés.
- 0 chaîne FR résiduelle dans `page.tsx`.

## Risques
- Très faible. 1 page `'use client'` isolée + 4 fichiers de locale neufs. Aucun chemin critique
  modifié. Job web CI `continue-on-error` (erreurs `@meeshy/shared` prisma réseau-sandbox
  préexistantes).

## Statut : ✅ implémenté — voir analyse 2026-06-22-iteration-53w
