# Iteration 242 — Plan : corriger la longueur base64 du champ `iv` de `SignalSchemas.encryptedMessage`

## Objectifs
Aligner la contrainte de longueur du champ `iv` de `SignalSchemas.encryptedMessage`
(`packages/shared/utils/validation.ts`) sur la réalité du wire : un IV AES-256-GCM de **12 octets**
base64-encodé fait **16 caractères**, pas 24. Le schéma exigeait `.length(24)` (la longueur d'un
authTag de 16 octets), ce qui aurait rejeté 100 % des IV réels si le schéma était branché. Corriger
aussi le commentaire in-line arithmétiquement faux.

## Modules affectés
- `packages/shared/utils/validation.ts` — `iv: .length(24)` → `.length(16)` + commentaires.
- `packages/shared/__tests__/validation.test.ts` — import `SignalSchemas` + bloc de 4 tests
  d'invariants de longueur base64.

Aucun consommateur : `SignalSchemas` n'a pas de call site vivant (grep exhaustif). Aucun schéma DB,
aucun contrat de wire branché, aucun miroir iOS/Android impacté.

## Phases d'implémentation
1. **RED** — importer `SignalSchemas`, ajouter 4 tests : IV 12 octets base64 (16 car.) accepté ;
   authTag 16 octets base64 (24 car.) accepté ; IV de 16 octets (24 car.) rejeté ; authTag de
   12 octets (16 car.) rejeté. 3 tombent rouges sur `main`. ✅
2. **GREEN** — `iv: z.string().length(16, 'IV must be 12 bytes base64')` + commentaires corrigés. ✅
3. **Validation** — suite ciblée, suite shared complète, `tsc`, `build` dist. ✅

## Dépendances
Aucune. Changement local à une constante Zod. Pas de cycle d'import (test ajoute `SignalSchemas` à
l'import existant depuis `../utils/validation.js`).

## Estimated risks
Très faible. La constante n'accepte plus qu'une longueur que seule la donnée légitime porte (16 car.).
Aucun émetteur ne produit d'IV de 24 caractères base64 (= 18 octets, hors spec AES-GCM). Aucun
consommateur en production.

## Rollback strategy
`git revert` du commit unique. Aucune migration de données, aucun changement de schéma Prisma, aucun
contrat de wire branché, aucun état persisté touché.

## Validation criteria
- [x] RED : 3 tests rouges sur `main`.
- [x] GREEN : `validation.test.ts` 58/58.
- [x] Suite shared vitest : 2352/2352 (96 fichiers).
- [x] `tsc --noEmit` (shared) : 0 erreur.
- [x] `bun run build` (shared) : OK, `dist` porte `.length(16`.
- [ ] CI verte sur la branche.

## Completion status
- [x] Tests RED ajoutés et prouvés rouges
- [x] Longueur corrigée (16) + commentaires véridiques
- [x] Analyse + plan écrits
- [x] Validation locale verte
- [ ] Commit + push branche
- [ ] Revue Codex

## Progress tracking
Itération autonome 242. Commit de départ `65015b6e`. Une seule unité de changement, cohérente,
testée. Constat issu d'un audit sous-agent des schémas Zod / utilitaires purs `packages/shared`,
hors des 13 domaines de PR en vol.

## Future improvements
Voir la section « Améliorations futures » de l'analyse : brancher `SignalSchemas.encryptedMessage`
au chemin de validation wire ; audit de parité base64 des autres champs `SignalSchemas` ; brique
partagée `base64Length(bytes)` pour dériver la longueur attendue et rendre le drift structurellement
impossible.
