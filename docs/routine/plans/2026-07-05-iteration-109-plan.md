# Iteration 109 — Plan d'implémentation (2026-07-05) — F80

## Objectives
Corriger `validatePhoneNumber` (`apps/web/utils/phone-validator.ts`) pour borner le **nombre de
chiffres** (8-15, conforme E.164) au lieu de la longueur brute de la chaîne — qui impute à tort le
préfixe international `+`/`00` au budget — et signaler les formats invalides comme tels.

## Affected modules
- `apps/web/utils/phone-validator.ts` (production, pur).
- `apps/web/__tests__/utils/phone-validator.test.ts` (tests — mise à jour des cas encodant le bug +
  nouveaux cas d'équivalence de préfixe).

## Implementation phases
1. **RED/adapter** : mettre à jour les tests pour la sémantique juste (15 chiffres valides, 16 →
   `phoneTooLong`, espaces/tirets → `phoneInvalidFormat`, équivalence de préfixe).
2. **GREEN** : réordonner (format d'abord), borner sur `digits.length` après retrait du préfixe.
3. **REFACTOR/docs** : JSDoc + exemples parlant de chiffres.

## Dependencies
Aucune. Fichier pur, aucun changement de signature, aucun appelant à modifier.

## Estimated risks
FAIBLE. Élargit la borne haute (aucun rejet nouveau sur la borne haute), resserre marginalement la
borne basse (cas `+`/`00` + < 8 chiffres, sans appelant/test dépendant), reclasse espaces/tirets en
format (libellé plus exact). Voir Risk assessment de l'analyse.

## Rollback strategy
Révert du commit unique ; fichier isolé sans dépendance transverse.

## Validation criteria
- `npx jest __tests__/utils/phone-validator.test.ts` vert.
- `tsc --noEmit` sans nouvelle erreur sur le fichier.

## Completion status
- [x] Analyse rédigée
- [x] Plan rédigé
- [x] Tests mis à jour + étendus
- [x] Implémentation
- [x] Validation (jest 44/44 vert, tsc sans erreur sur le fichier)
- [x] Commit + push + PR

## Progress tracking
Démarré à `main` @ `968aaa0`. `npx jest __tests__/utils/phone-validator.test.ts` → 44/44 passés.
`tsc --noEmit` sans nouvelle erreur sur `phone-validator.ts`.

## Future improvements
- F25b : fusionner les deux validateurs téléphone vers `libphonenumber-js` (country-aware) comme SSOT,
  supprimer le validateur simple. Refactor MOYEN à planifier hors cycle bugfix.
