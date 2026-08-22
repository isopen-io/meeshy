# Plan — Itération 239b : aligner `callSessionMinimalSchema.mode` sur son producteur

> `239` pris par une autre lignée (bornes `limit` admin) ; ce lot = `239b`.
> Branche `claude/brave-archimedes-1z7088`, `main` @ `2bfaebf5`.

## Objectives
Corriger l'enum `mode` du schéma OpenAPI minimal de session d'appel
(`['voice','video']` → `['p2p','sfu']`) pour qu'il décrive la vraie valeur de
`CallSession.mode` (architecture WebRTC), et geler l'invariant jumeau
minimal↔détail par test.

## Affected modules
- `packages/shared/types/api-schemas.ts` — `callSessionMinimalSchema.mode`
  (production).
- `packages/shared/__tests__/api-schemas-call-mode.test.ts` — nouveau témoin.

## Implementation phases
1. **RED** — écrire le témoin jumeau (détail = vérité, minimal doit l'égaler) et
   prouver le rouge. ✅
2. **GREEN** — corriger enum + description du schéma minimal ; rebuild
   `packages/shared` (dist). ✅
3. **Validation** — tsc shared/gateway, suite shared complète, suites d'appel
   gateway, full gateway en arrière-plan. ✅ (full en cours)

## Dependencies
Aucune. Changement isolé à un littéral de schéma consommé par fast-json-stringify.

## Estimated risks
Très faibles. Schéma inutilisé par tout `response:` ; aucune logique modifiée ;
aucun type TS inféré affecté.

## Rollback strategy
Restaurer les deux lignes (`enum`/`description`) du schéma minimal et supprimer le
fichier de test.

## Validation criteria
Voir l'analyse (`2026-08-22-iteration-239b-analyse.md` § Validation criteria).
Toutes vertes hors full gateway (en cours, vert attendu).

## Completion status
- [x] Analyse rédigée
- [x] RED prouvé (1/2)
- [x] GREEN (2/2)
- [x] tsc shared + gateway (0/0)
- [x] Suite shared complète (2407/2407)
- [x] Suites d'appel gateway (1014/1014)
- [ ] Full gateway (background)
- [ ] Commit + push + PR + merge + restart branche

## Progress tracking
Itération 239b = premier lot du filon « schéma déclare faux contre son
producteur » côté `packages/shared` (que le balayage gateway ne couvre pas).
Précédents proches : cycles 84/89/91/92 (formes de sérialisation gateway),
itération 238 (brique `time-range`).

## Future improvements
- Imports morts `routes/calls.ts:33-34` (hygiène).
- Câbler le schéma minimal sur une route de liste (produit).
- Outillage « schéma exporté ⇒ référencé » pour `packages/shared`.
