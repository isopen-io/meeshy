# Plan — Itération 59w (web)

**Base** : `main` HEAD post-merge iter-58wb (#787) → `5148505`
**Branche de travail** : `claude/practical-fermat-06dry3`
**Périmètre** : i18n des aria-labels d'accessibilité du flux OTP

> **Pivot après collision** : le candidat initial 58w (`PostsFeedScreen` i18n) a été livré
> en parallèle par #787 (iter-58wb). PR doublon #795 **fermée sans merge**. Ce run repivote
> sur le différé borné « aria-labels FR isolés » (volet OTP, non revendiqué).

## Objectif
Internationaliser les aria-labels OTP figés en français (rupture Prisme + a11y) sur le
flux de réinitialisation par téléphone / récupération de compte.

## Étapes
1. [x] Fermer la PR doublon #795 (renvoi #787) ; resync branche sur `main` (`5148505`).
2. [x] `auth.json` ×4 : bloc générique `otp` (`groupLabel`, `digitLabel`).
3. [x] `OTPInput.tsx` : `useI18n('auth')` + 2 aria-labels → `t('otp.*')`.
4. [x] `PhoneResetFlow.tsx` : `useI18n('auth')` dans le sous-composant OTP inline +
       2 aria-labels → `t('otp.*')`.
5. [x] Validation : `tsc` (0 nouvelle erreur ; 3 erreurs store préexistent sur `main`) ;
       JSON valide ×4 ; parité 2 clés ; grep FR résiduel = 0.
6. [ ] Commit + push sur `claude/practical-fermat-06dry3`.
7. [ ] PR → `main` ; CI ; merge ; supprimer la branche feature.
8. [ ] Mettre à jour `branch-tracking.md` (Next → 60 ; history 59w ✅).

## Clés ajoutées (`auth.json` → bloc `otp`, ×4 locales)
- `otp.groupLabel` (fallback EN 2e arg) ; `otp.digitLabel` (`{index}`/`{total}`)

## Risques / notes
- `branch-tracking.md` édité en parallèle par d'autres agents → conflit probable au merge ;
  résolution additive (garder toutes les lignes des deux côtés).
- 56× `t() || fallback` dans `PhoneResetFlow` = hygiène large **hors périmètre** (60w+).
- Placeholder `6 12 34 56 78` = format téléphone neutre, NE PAS i18n.
- Sandbox `node_modules` partiel → `tsc` ciblé suffit ; CI confirme le build complet.
