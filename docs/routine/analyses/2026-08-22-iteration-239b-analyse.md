# Itération 239b — `callSessionMinimalSchema.mode` déclarait le type d'appel là où le producteur porte l'architecture WebRTC

> Numérotation : `239` est déjà pris par une AUTRE lignée (`claude/brave-archimedes-e3a8fd`,
> bornes `limit` des query-schemas admin). Ce lot prend le suffixe `239b`
> (convention `237b`/`237c`) pour éviter la collision de journal — cf. Leçon 243
> et `docs(routine): un journal d'itération par PR`.
> Branche : `claude/brave-archimedes-1z7088`. `main` @ `2bfaebf5`.

## Current state
`packages/shared/types/api-schemas.ts` porte DEUX schémas OpenAPI pour la même
entité `CallSession` :

- **Détail** `callSessionSchema.mode` (:2393) — `enum: ['p2p', 'sfu']`, avec le
  commentaire explicite « WebRTC architecture (p2p or sfu) — NOT the call type;
  see metadata.type ». Correct, maintenu.
- **Minimal** `callSessionMinimalSchema.mode` (:2470) — `enum: ['voice', 'video']`,
  description « Call mode ». Le MÊME champ Prisma, décrit avec l'enum du TYPE
  d'appel.

Source de vérité du producteur : `packages/shared/prisma/schema.prisma:1905-1906`
+ `enum CallMode { p2p, sfu }` (:2075) — `CallSession.mode` vaut TOUJOURS `p2p`
(2 participants) ou `sfu` (3+), `@default(p2p)`. Le type audio/video vit
séparément dans `metadata.type` (`enum: ['audio','video']`).

L'enum `['voice','video']` est un copié-collé de `startCallRequestSchema.mode`
(:2492) — où `mode` désigne LÉGITIMEMENT le type demandé par l'appelant (voix ou
vidéo). Le champ porte le même nom, deux sémantiques opposées : requête = type,
session persistée = architecture.

## Problems identified
Une DÉCLARATION de schéma de réponse qui contredit son PRODUCTEUR : le schéma
minimal annonce `mode ∈ {voice, video}` quand le champ sérialisé porte
`{p2p, sfu}`.

## Root causes
`callSessionMinimalSchema` a été écrit en dérivant l'enum `mode` de la forme
REQUÊTE (`startCallRequestSchema`) au lieu de la forme PRODUCTEUR
(`callSessionSchema` / `CallSession.mode`). L'homonymie `mode` (type ↔
architecture) a rendu les deux enums également crédibles au moment de l'écriture
— exactement le piège que le CLAUDE.md gateway décrit sous « Avant de déclarer un
champ, remonter jusqu'à l'ÉMETTEUR » et « Une déclaration n'est juste que contre
son PRODUCTEUR ».

## Business impact
Aujourd'hui : NUL en données. `callSessionMinimalSchema` n'est référencé par
AUCUN `response:` (importé mais inutilisé dans `routes/calls.ts:33` ; aucune
autre référence dans le dépôt). Rien ne fuit, rien ne casse — le schéma est du
contrat mort.

Demain : **piège armé.** Le schéma est EXPORTÉ (surface OpenAPI / génération
client). fast-json-stringify n'impose pas un `enum` de chaîne EN SORTIE — le fil
porterait `p2p`/`sfu` correctement — mais un client typé généré depuis l'OpenAPI
typerait `mode: 'voice' | 'video'` et échouerait au décodage de `'p2p'`. Le
premier `response:` qui adopte la forme minimale (une route de LISTE d'appels,
son usage désigné) publie le faux contrat le jour même, sans qu'aucun témoin ne
tombe. C'est le patron « une non-fuite accidentelle se garde par un témoin »
(cycle 84) appliqué à un contrat.

## Technical impact
Incohérence jumelle : deux schémas décrivant `CallSession.mode` divergent sur son
domaine de valeurs. Le détail dit vrai, le minimal dit faux.

## Risk assessment
**Très faible.** Modification d'un unique littéral `enum` (+ alignement de la
`description` sur le jumeau). Aucune logique, aucun type inféré (les schémas
OpenAPI sont des littéraux `as const` consommés par fast-json-stringify, pas des
types TS). Le schéma étant inutilisé, aucun `response:` n'en dépend. Rollback =
restaurer les deux lignes.

## Proposed improvements
1. **RED** — `packages/shared/__tests__/api-schemas-call-mode.test.ts`, calqué
   sur le précédent `api-schemas-member-count.test.ts` (invariant jumeau
   minimal↔détail) : (a) `callSessionSchema.mode.enum === ['p2p','sfu']`
   (documente la vérité, passe déjà) ; (b) `callSessionMinimalSchema.mode.enum`
   ÉGALE celui du détail (tombe ROUGE sur `main`).
2. **GREEN** — `callSessionMinimalSchema.mode` : enum `['p2p','sfu']`, description
   copiée mot pour mot du jumeau `callSessionSchema.mode`.

## Expected benefits
- **Cohérence de contrat.** Les deux schémas d'une même entité s'accordent sur le
  domaine de `mode`, gelé par test jumeau (peut tomber dans les DEUX sens).
- **Désamorçage préventif.** La route de liste qui adoptera la forme minimale
  hérite d'un contrat juste, pas d'un faux.

## Implementation complexity
**Triviale.** 1 littéral de production (enum + description), 1 fichier de test
(+2 assertions). Aucun changement de comportement runtime.

## Validation criteria
- [x] `npx vitest run __tests__/api-schemas-call-mode.test.ts` → ROUGE avant
      (1/2), VERT après (2/2).
- [x] `npx tsc --noEmit` (shared) → 0 erreur.
- [x] `npx vitest run` (shared complet) → 2407/2407 (100 fichiers).
- [x] `bun run tsc --noEmit` (gateway) → 0 erreur.
- [x] `--testPathPatterns='(calls|CallService|CallEventsHandler)'` → 1014/1014
      (48 suites).
- [ ] Full gateway suite (background) — vert attendu, aligné sur baseline.

## Améliorations futures (hors périmètre)
- **Imports morts dans `routes/calls.ts:33-34`** : `callSessionMinimalSchema` ET
  `startCallRequestSchema` sont importés mais jamais référencés. Hygiène pure,
  sans effet fonctionnel (lint CI vert avec eux) ; délibérément NON touché ici
  pour garder le lot centré sur le défaut de contrat.
- **Câbler `callSessionMinimalSchema` sur une route de liste d'appels** si le
  besoin produit existe (payload allégé pour la pagination d'historique) : c'est
  son usage désigné, aujourd'hui absent. Décision produit, pas initiative.
- **Garde de surface « tout schéma OpenAPI exporté est référencé »** : le balayage
  `response-schema-sweep` ne voit pas les schémas de `packages/shared` (cf.
  CLAUDE.md gateway) ni les schémas EXPORTÉS-mais-morts. Un contrat mort n'est pas
  maintenu et se propage (cycle 88, « Une forme écrite dans du CODE MORT »).
  Candidat pour une itération outillage dédiée.
