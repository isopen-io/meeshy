# Itération 219 — Analyse : canonicalisation du format DND `HH:MM` (write-boundary + défense pure)

**Date** : 2026-07-27
**Surface** : `packages/shared` (TypeScript, pure, testable vitest)
**Priorité** : P1 (fonction développée récemment — GW7 Do-Not-Disturb timezone-aware)

## Current state
La fenêtre Do-Not-Disturb (GW7) est évaluée par une **fonction pure unique**,
`isWithinDnd()` dans `packages/shared/utils/notification-dnd.ts`. Elle compare l'heure locale
courante (`"HH:MM"` zero-paddée) aux bornes `dndStartTime`/`dndEndTime` par **comparaison
lexicographique de chaînes** pour (a) détecter une fenêtre à cheval sur minuit (`start > end`)
et (b) tester l'appartenance (`currentTime >= start`, `currentTime < end`).

Cette logique n'est correcte **que si** les bornes sont elles aussi au format zero-paddé
`"HH:MM"` (heure sur 2 chiffres). La fonction ne le garantit pas : elle **assume** le format
sans le normaliser.

Or le format des bornes est validé par **quatre** schémas dont **un diverge** :

| Site | Regex | Accepte `"9:00"` ? |
|------|-------|--------------------|
| `types/preferences/notification.ts:44-45` (schéma défaut) | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| `services/gateway/.../notification-schemas.ts:192,196` | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| `services/gateway/config/user-preferences-defaults.ts:169` (`isValidDndTime`) | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| **`utils/validation.ts:1515-1516`** (`NotificationPreferenceSchemas.update`) | `/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/` | ✅ **oui** (laxiste) |

Le `[01]?` rend le chiffre de tête optionnel : `"9:00"` passe le schéma laxiste et peut donc
atteindre la persistance sans normalisation.

## Problems identified
1. **Divergence de schéma** : un seul des quatre validateurs admet l'heure sur 1 chiffre.
   Drift silencieux contre le principe SSOT du CLAUDE.md.
2. **Fragilité de la fonction pure** : `isWithinDnd` dépend implicitement du format d'entrée
   du caller au lieu de le rendre robuste.

## Root causes
- La comparaison lexicographique exige un padding strict, mais le padding n'est appliqué qu'à
  `currentTime` (calculé), jamais aux bornes (fournies par le caller / la base).
- Le schéma d'update `validation.ts` a été écrit avec une regex laxiste divergente des trois
  autres sites, laissant une porte d'entrée pour une valeur non canonique.

## Business impact
Un document persistant avec `"9:00"` (via le schéma laxiste, ou hérité) casse **totalement**
la fenêtre DND : `('9:00' > '17:00')` vaut `true` (char `'9'`=0x39 > `'1'`=0x31), donc une
fenêtre diurne 09:00–17:00 est mal détectée comme **overnight** et devient un blocage
minuit → 17:00. L'utilisateur voit ses notifications supprimées toute la matinée, ou au
contraire reçoit des notifications en pleine fenêtre voulue. Impact direct sur la confiance
produit (les notifications sont un contrat).

## Technical impact
- `isWithinDnd` devient robuste par construction (padding local, pur, idempotent).
- Les quatre write-boundaries convergent sur la **seule** regex canonique → SSOT restauré.
- Les documents hérités `"9:00"` déjà en base sont désormais évalués correctement (le padding
  au read couvre le stock existant que la seule regserrée ne réparerait pas).

## Risk assessment
**Très faible.**
- `padWallClock` est **idempotent** sur les valeurs déjà canoniques (`"22:00"` → `"22:00"`)
  → tous les tests et documents existants inchangés.
- Une entrée qu'il ne sait pas parser (pas de `:`) est renvoyée **verbatim** → comportement
  identique à l'actuel pour le vraiment-malformé, aucune perte.
- Le resserrage de `validation.ts` ne fait que **rejeter** une forme non canonique qu'aucun
  test/consommateur n'exigeait (grep : seuls mes nouveaux tests utilisent `"9:00"`), et les
  trois autres sites la rejetaient déjà.

## Proposed improvements
1. `notification-dnd.ts` : helper pur `padWallClock(value)` (pad heure+minute), appliqué aux
   deux bornes en tête de `isWithinDnd`.
2. `validation.ts:1515-1516` : regex laxiste → canonique `/^([01]\d|2[0-3]):([0-5]\d)$/`.

## Expected benefits
- Fenêtre DND correcte pour toute valeur légale ou héritée.
- SSOT du format `HH:MM` sur les quatre sites.
- Zéro nouvelle dépendance, zéro I/O, fonction pure toujours testable isolément.

## Implementation complexity
Très faible : +1 helper pur (~6 lignes), 2 lignes modifiées dans `isWithinDnd`, 2 lignes de
regex resserrées, +7 tests (3 DND non-paddé, 4 schéma update).

## Validation criteria
- RED prouvé (branche non patchée) : `"9:00"` accepté par `update` (échoue en attendant rejet) ;
  `isWithinDnd({start:'9:00', end:'17:00'})` à 03:00 → `true` (échoue en attendant `false`).
- GREEN : `update` rejette `"9:00"`/`"8:30"`, accepte `"09:00"`/`"23:59"` ; `isWithinDnd`
  traite `"9:00"`→`"09:00"` correctement (diurne, overnight, avec offset).
- Non-régression : suite complète `packages/shared` verte (1427 tests), `tsc --noEmit` 0 erreur.

## Future considerations
- Migration idempotente optionnelle des documents `dndStartTime`/`dndEndTime` historiques
  région-taggés `"H:MM"` → `"HH:MM"` pour retirer à terme la défense au read.
- `SecuritySanitizer.truncate` (`services/gateway/utils/sanitize.ts:219`) coupe par unités
  UTF-16 et peut scinder une paire de substitution / séquence ZWJ emoji dans un aperçu de
  notification → lone surrogate `�`. Candidat P3 séparé (grapheme-safe truncation).
