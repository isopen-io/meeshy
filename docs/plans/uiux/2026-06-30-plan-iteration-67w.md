# Plan de correction — Itération 67w (web)

**Date** : 2026-06-30
**Branche** : `claude/practical-fermat-vfe7ah` (depuis `main` HEAD post-#872)
**Cible** : `app/auth/verify-phone/page.tsx` + `locales/en/auth.json`

## Problème
- `auth.verifyPhone` (25 clés) présent en `fr/es/pt` mais **absent de `en/auth.json`** (locale
  fallback) → utilisateurs interface EN voient **toutes les clés i18n brutes** sur la page de
  vérification téléphone (deep-link onboarding). Rupture Prisme.
- 27 occurrences de l'anti-pattern `t('verifyPhone.X') || 'FR'` (dead-code + flash-of-raw-keys,
  secours FR figé).

## Étapes
1. [x] Vérifier l'absence de PR web en vol (`list_pull_requests`) → surface orthogonale.
2. [x] Confirmer la parité : `en` manque tout le namespace `verifyPhone` (fr/es/pt = 25 clés).
3. [x] Ajouter `auth.verifyPhone.*` (25 clés) à `en/auth.json` — insertion comme dernier sibling
   sous `auth`, indentation 2-espaces préservée, JSON valide.
4. [x] Convertir les 27 `t('verifyPhone.X') || 'FR'` → `t('verifyPhone.X', 'EN')` (secours natif
   anti-flash, valeur EN exacte). Préfixes `data.error || …` préservés.
5. [x] Vérifs : parité `en`==`fr`==`es`==`pt` (diff=0), JSON valides, grep anti-pattern=0,
   parenthèses/accolades équilibrées.
6. [ ] Commit + push `claude/practical-fermat-vfe7ah`.
7. [ ] PR → CI vert (gate : `Test web` + `Quality (bun)`) → merge dans `main`.
8. [ ] Post-merge : mettre à jour `branch-tracking.md` (base 68w = `main` HEAD), supprimer la
   branche.

## Risques / Mitigations
- **Régression de test** : aucun test ne référence `verify-phone` → risque nul ; les mocks `t`
  renvoient la clé, le 2ᵉ arg string est inerte.
- **Build** : `node_modules` absent localement → typecheck/build délégués au CI.
- **Collision** : aucune PR web ouverte au moment du démarrage → orthogonal.
