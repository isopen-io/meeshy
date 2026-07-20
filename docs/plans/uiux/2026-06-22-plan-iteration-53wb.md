# Plan — Iteration 53wb (2026-06-22)

## Contexte (double collision parallèle)
- 52w (`practical-fermat-whger0`, #765) : `getTypeLabel` ranking — ma 52w initiale (même périmètre)
  redondante → convergée/abandonnée.
- 53w (`practical-fermat-isk47b`, #766) : i18n+a11y liste de conversations v2.
Mon travail (page reel) est de **périmètre disjoint** des deux → renumérotée **53wb** (précédent
`49wb`). Docs `53w` (v2 conv list) conservées ; celle-ci additive.

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
- **Namespace dédié `reel`** : la surface feed/reel n'avait aucun namespace ; convention
  namespace-par-feature.
- **Fallbacks anglais en 2e argument** : `t()` renvoie la clé brute pendant le load (leçon 50w).
- **`index.ts` non touché** : barrel non importé (runtime = import dynamique), déjà incomplet.

## Validation
- 4 `reel.json` valides + parité 10 clés ; 0 chaîne FR résiduelle dans `page.tsx` ; aucun test
  n'importe la page reel.

## Risques
- Très faible. 1 page `'use client'` isolée + 4 fichiers de locale neufs.
- **Note CI** : `Test web` rouge sur `main` (préexistant, `42a6b60`) — 2 suites sur deps non
  déclarées (`@radix-ui/react-visually-hidden`, `@signalapp/libsignal-client`), indépendantes de ce
  diff. Job non bloquant (cf. #765/#766). À corriger isolément.

## Statut : ✅ implémenté — voir analyse 2026-06-22-iteration-53wb
