# Iteration 238 — L'invariant temporel `endMs ≥ startMs` était recopié verbatim sur deux sites et ABSENT d'un troisième : une brique partagée le déclare une seule fois

## Protocole (démarrage)
`main` @ `13bedd98` (dernier commit : `merge: #3240 feat(shared,gateway): CanvasV3 refuse un
intervalle temporel qui finit avant de commencer`). Branche `claude/brave-archimedes-9e4nuc`
resynchronisée sur `origin/main` après le merge de la PR #3240 (itération 237, CanvasV3).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, `npx prisma generate
--generator client` + `bun run build` dans `packages/shared`. Suites de départ vertes (shared
vitest 2332, gateway `messages-schemas|call-schemas|CallEventsHandler` 744).

**Audit anti-doublon** : PRs jcnm en vol (composer Android, message-summary, picker iOS) + Dependabot.
**Aucune PR ouverte ne touche `packages/shared/utils/attachment-validators.ts`,
`services/gateway/src/validation/{call-schemas,messages-schemas}.ts`** — zéro chevauchement.

## Deux motifs découverts au resync

### A) Collision de numéro d'itération sur `main` (hygiène docs)

Le resync a révélé que **deux sessions parallèles ont mergé sous le numéro « itération 236 »** :
- PR #3237 (`socketTranscriptionSegmentSchema`, mergée en premier `053f15a8`) a écrit
  `docs/routine/{analyses,plans}/2026-08-20-iteration-236-*.md`.
- PR #3240 (CanvasV3, ce fil, mergée ensuite `83add3d1`) a écrit les MÊMES chemins.

Le merge add/add de git a **concaténé les deux documents dans un seul fichier** (analyse : 380
lignes = transcription 1-178 + CanvasV3 179-380 ; plan : 178 lignes = transcription 1-99 + CanvasV3
100-178). Corruption documentaire réelle sur `main`. **Réparation** : #3237 garde le numéro 236
(mergé en premier) ; le travail CanvasV3 est renuméroté **237**, extrait dans ses propres fichiers.

### B) L'invariant `endMs ≥ startMs` — trois copies, une divergence, un trou (dette de fond)

En instrumentant la collision, un motif de fond apparaît : l'invariant temporel `endMs ≥ startMs`
a été **re-posé verbatim, site par site**, à mesure que le défaut était découvert :

| site | fichier | invariant avant 238 |
|------|---------|---------------------|
| `transcriptionSegmentSchema` | `packages/shared/utils/attachment-validators.ts` | ✅ (itération 234) |
| `socketTranscriptionSegmentSchema` | `services/gateway/src/validation/call-schemas.ts` | ✅ (itération 236, PR #3237) |
| `playbackStretch` | `services/gateway/src/validation/messages-schemas.ts` | ❌ **ABSENT** |

Trois schémas portent la MÊME paire `startMs/endMs` avec la MÊME sémantique (« un intervalle en
millisecondes ne peut finir avant de commencer »). Deux le vérifient — **par deux copies distinctes
du même bloc `.refine`, même message, même `path`**. Le troisième (`playbackStretch`, une entrée de
la trace d'écoute audio) ne le vérifie PAS : `{ startMs: 500, endMs: 100, endedBy: 'pause' }`
traversait le gate.

## Sélection : **Priorité 1/2 — réduction de duplication + fermeture d'un trou de contrat, sur des features récentes**

Les analyses jumelles d'itération 236 (les deux versions concaténées !) nomment TOUTES DEUX le même
candidat propre :

> **`timeRangeMsSchema` partagé** mutualisant `startMs + endMs + refine`. Trois sites concernés :
> `transcriptionSegmentSchema` (shared), `socketTranscriptionSegmentSchema` (gateway), `stretches[]`
> de `messages-schemas.ts`.

C'est exactement la classe « single source of truth / réduction de duplication / dette technique »
que la stratégie priorise, appliquée à des schémas de validation récents (frontières de confiance).

## Current state (avant correctif)

- **Duplication.** Le bloc suivant existait à l'identique dans `attachment-validators.ts` et
  `call-schemas.ts` :
  ```ts
  .refine((segment) => segment.endMs >= segment.startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs'],
  })
  ```
  Deux copies verbatim = deux points de dérive possibles (un futur correctif de message ou de
  `path` sur l'un oublie l'autre).

- **Trou.** `playbackStretch` (`messages-schemas.ts:33`) :
  ```ts
  const playbackStretch = z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    endedBy: z.enum([...])
  });
  ```
  Aucune contrainte relationnelle. Une « écoute » de 500ms à 100ms passait la validation, était
  persistée dans la trace d'écoute (`AttachmentStatusBodySchema` → `MessageReadStatusService`), et
  faussait les métriques de lecture.

## Problems identified

1. **Contrat identique déclaré N fois.** Un invariant sémantique du COUPLE `(startMs, endMs)` était
   dispersé en copies au lieu d'une brique. La cohérence reposait sur la vigilance de chaque auteur.
2. **Un site oublié.** La conséquence directe de la dispersion : un troisième porteur du même couple
   n'a jamais reçu l'invariant. La duplication ne « manque » pas seulement de DRY — elle laisse
   activement des trous.
3. **Corruption documentaire sur `main`** (collision de numéro, motif A).

## Root causes
- L'invariant a été ajouté RÉACTIVEMENT (itération 234 sur un site, 236 sur un autre) sans extraire
  la règle partagée au premier doublon. Chaque schéma ayant un champ-set différent (`text`,
  `speakerId`… vs `endedBy`…), la tentation était de recopier la seule clause commune plutôt que
  d'extraire une brique — mais la clause commune EST la sémantique partagée, précisément ce qui
  mérite une source unique.
- La collision documentaire vient de deux sessions parallèles ayant tiré le même numéro d'itération
  sans coordination — l'add/add merge ne signale pas le conflit, il concatène.

## Business impact
- **Trou `playbackStretch` : faible mais réel.** Une trace d'écoute inversée fausse les métriques de
  consommation (durée écoutée, complétion) sans erreur visible. Fermé défensivement.
- **Duplication : dette de maintenabilité.** Un futur changement du message/`path` d'erreur devait
  toucher deux (bientôt trois) sites en cohérence. Désormais un seul.

## Technical impact
- **Nouvelle brique partagée** `packages/shared/utils/time-range.ts` : `isMsRangeOrdered` (prédicat
  pur) + `MS_RANGE_REFINEMENT` (message + `path` partagés). Exportée via `@meeshy/shared/utils/time-range`
  et le baril `utils/index.ts`.
- **Trois sites** consomment désormais la brique — deux refactors comportement-identiques
  (`transcriptionSegmentSchema`, `socketTranscriptionSegmentSchema`), un durcissement
  (`playbackStretch` GAGNE l'invariant).
- **`z.infer` inchangé** partout — `.refine` préserve le type inféré.
- **CanvasV3 hors périmètre** : `TimingSchema`/`bounds` (itération 237) expriment le même invariant
  sous d'autres noms (`start`/`end`, secondes) — brique `*Ms` non applicable telle quelle ; noté en
  futures.

## Risk assessment
- **Négligeable.**
  - Les deux refactors sont prouvés comportement-identiques par les suites existantes
    (`attachment-validators` 39/39, `call-schemas`/`CallEventsHandler` inchangées).
  - Le durcissement `playbackStretch` : aucun fixture/test existant ne posait `endMs < startMs`
    (tous les `stretches` de test sont ordonnés — `{0,500}`, `{0,400}`, `{500,900}`…). Zéro
    régression.
  - `MS_RANGE_REFINEMENT` partagé entre plusieurs `.refine` : Zod copie `path` dans l'issue, ne mute
    jamais l'objet — partage sûr.
- **Guard ESM** : l'import relatif `./time-range` a d'abord violé le garde `esm-relative-imports`
  (extension `.js` obligatoire pour la sûreté runtime dist) — corrigé en `./time-range.js`, garde
  reverte au vert. Le témoin a fait son travail.

## Proposed improvements (implémenté)
1. Brique `time-range.ts` (prédicat + params de refine partagés).
2. Application aux trois sites `startMs/endMs`.
3. Réparation de la collision documentaire (236 = transcription, 237 = CanvasV3, extraits).

## Expected benefits
- L'invariant temporel `endMs ≥ startMs` a une source unique — plus jamais de copie divergente ni de
  site oublié pour ce couple.
- Un trou de contrat réel (`playbackStretch`) fermé.
- Documentation d'itération sur `main` réparée et cohérente.

## Implementation complexity
- **Faible-moyenne.** 1 nouveau fichier shared + 1 test shared, 3 sites modifiés (−2 blocs
  dupliqués, +1 invariant), 2 tests gateway, réparation docs (4 fichiers).

## Validation criteria
- [x] RED : `playbackStretch` acceptait `endMs < startMs` (prouvé via `AttachmentStatusBodySchema`).
- [x] GREEN : les 3 sites refusent l'inversion, acceptent la durée nulle.
- [x] Brique testée : `time-range.test.ts` 4/4 (ordonné, ponctuel, inversé, params).
- [x] Refactors comportement-identiques : `attachment-validators` 39/39.
- [x] Suite gateway `messages-schemas|call-schemas|CallEventsHandler` : 744/744.
- [x] Consommateur `MessageReadStatusService` (fixtures stretches) : 259/259.
- [x] Suite shared vitest complète : 2332/2332.
- [x] `tsc --noEmit` propre sur `packages/shared` et `services/gateway`.
- [x] Garde `esm-relative-imports` verte (import `.js` explicite).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)
- **CanvasV3 `TimingSchema`/`bounds`** (itération 237) : même invariant, noms `start`/`end` en
  secondes. Une brique jumelle `isSecRangeOrdered` (ou générique paramétrée par les noms de champ)
  pourrait les mutualiser aussi — à peser (les bornes CanvasV3 sont optionnelles, la brique devrait
  gérer le cas partiel).
- **Parité Pydantic translator** (candidat 234 non retenu) : `TranscriptionSegment`
  (`services/translator`, `@dataclass`) n'a aucun invariant `end_ms >= start_ms`. À reprendre
  translator-ready (pas de stack ML dans cet environnement).
- **Monotonie inter-segments/inter-stretches** : `segments[i].startMs >= segments[i-1].startMs` —
  arbitrage produit requis (diarisation entrelacée). Contrainte de collection, à peser séparément.
