# Plan — Itération 65w (web)

## Objectif
Corriger le **bug i18n live** de la page de détails d'un lien de tracking
`app/links/tracked/[token]/page.tsx` : 7 clés d'erreur absentes des locales font afficher la
**clé brute** (toasts + écran d'erreur plein cadre) à TOUS les utilisateurs. Solder en même
temps l'anti-pattern `t()||fallback` résiduel du fichier + 3 chaînes FR figées.

## Surface (orthogonale aux PR en vol #858/#859/#860/#861/#862/#863)
- 1 composant : `app/links/tracked/[token]/page.tsx`
- 4 locales : `locales/{en,fr,es,pt}/links.json`

## Étapes
1. [x] Confirmer la cause racine : `useI18n('links')` déballe la clé racine ; `tracking.errors.*`
   absentes → `t()` renvoie la clé brute, `||` court-circuite.
2. [x] Convertir les 15 `t(k) || 'FR'` → `t(k, 'EN')` (signature de secours native, anti-flash).
3. [x] `Une erreur inattendue s'est produite` → `t('tracking.details.unexpectedError', '…')`.
4. [x] `{n} clics` / `{n} uniques` → `t('tracking.details.clicksCount'|'uniqueCount', { count })`.
5. [x] Ajouter 8 clés ×4 locales (7 `errors.*` + 1 `details.unexpectedError`) via `jq` (append-only).
6. [x] Valider JSON (`jq empty`) + parité 14 clés `errors` ×4.
7. [x] `grep` anti-pattern + FR user-facing = 0.
8. [x] Tests jest verts (30 passed / 8 skipped, inchangés).
9. [ ] Commit, push, PR, CI verte, merge `main`, supprimer la branche, MAJ `branch-tracking.md`.

## Risques / non-régression
- Mock de test `t` ignore le 2ᵉ arg (clé renvoyée) → assertions par clé inchangées. ✅
- `t('…', { count })` : `count` numérique → `params[k].toString()` OK. ✅
- Append-only locales : aucune clé existante touchée. ✅

## Numérotation
**65w** : 64w (#858/#860) et 64wb (#861/#863) déjà occupés par d'autres agents web.
