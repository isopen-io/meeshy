# Iteration 237 — Plan d'implémentation

## Objectif
Poser sur `playbackStretch` (`services/gateway/src/validation/messages-schemas.ts:33-37`)
la refine `endMs > startMs` (STRICT), miroir explicite du filtre `isUsable` de
`services/gateway/src/utils/playback-trace.ts:67-82`. Transforme une perte silencieuse
de donnée (wire accepte, persistance jette) en un `400 Validation Error` observable
côté client.

## Modules affectés

1. **`services/gateway/src/validation/messages-schemas.ts`** — ajouter `.refine()` sur
   `playbackStretch` + docstring citant `isUsable`. ~8 lignes.

2. **`services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts`** —
   ajouter 2 tests dans le bloc `AttachmentStatusBodySchema` / section `stretches`.
   ~24 lignes avec commentaires.

## Phases d'implémentation

### Phase RED — Prouver le témoin (avant tout changement de production)

1. Ajouter les 2 tests à la suite existante (après `plafonne le nombre d'écoutes rapportées d'un coup`, `messages-schemas.test.ts:295`) :
   - `rejette une écoute dont endMs est strictement inférieur à startMs`
     ```ts
     expect(
       AttachmentStatusBodySchema.safeParse({
         action: 'listened',
         stretches: [{ startMs: 500, endMs: 200, endedBy: 'pause' }],
       }).success
     ).toBe(false);
     ```
   - `rejette une écoute de durée nulle (endMs === startMs)`
     ```ts
     // La persistance (isUsable dans playback-trace.ts) requiert endMs > startMs
     // STRICTEMENT — une "écoute continue" de durée zéro n'est pas une écoute.
     // Le wire miroite ce contrat pour ne pas laisser passer ce que la persistance
     // jetterait ensuite en silence.
     expect(
       AttachmentStatusBodySchema.safeParse({
         action: 'listened',
         stretches: [{ startMs: 500, endMs: 500, endedBy: 'pause' }],
       }).success
     ).toBe(false);
     ```
2. Lancer : `bun run jest --config=jest.config.json src/__tests__/unit/validation/messages-schemas.test.ts` → **attendu 2 ROUGES sur 73**.

### Phase GREEN — Poser la refine

3. Modifier `playbackStretch` dans `messages-schemas.ts:33-37` :
   ```ts
   const playbackStretch = z.object({
     startMs: z.number().int().nonnegative(),
     endMs: z.number().int().nonnegative(),
     endedBy: z.enum(['pause', 'seek', 'muted', 'completed', 'dismissed', 'superseded'])
   }).refine((s) => s.endMs > s.startMs, {
     path: ['endMs'],
     message: 'STRETCH_END_MUST_EXCEED_START',
   });
   ```
   Le refine est STRICT (`>` pas `>=`) : il miroite `isUsable` (playback-trace.ts:78,
   `endMs > startMs`). Différent des refines 234/236 (`>=`) parce que la sémantique
   « écoute réellement continue » exclut une durée nulle.

4. Ajouter un docstring in-line au-dessus de la refine :
   ```ts
   /**
    * `endMs > startMs` STRICT (pas `>=`) : miroir explicite du filtre `isUsable`
    * dans `services/gateway/src/utils/playback-trace.ts:78`, qui jette silencieusement
    * une entrée de durée nulle ou inversée à la persistance. Rejeter au wire
    * transforme une perte silencieuse en `400 Validation Error` — le client peut
    * loguer et retenter au lieu de croire son rapport persisté.
    *
    * Décision produit distincte des refines 234/236 (`>=`, segment ponctuel admis) :
    * ici la sémantique documentée est « une écoute réellement CONTINUE »
    * (`playback-trace.ts:7`) — une durée nulle n'est pas une écoute.
    */
   ```
5. Lancer : `bun run jest --config=jest.config.json src/__tests__/unit/validation/messages-schemas.test.ts` → **attendu 73/73 VERTS**.

### Phase VALIDATION — Non-régression

6. Suite étendue :
   ```bash
   bun run jest --config=jest.config.json --testPathPatterns='(messages-schemas|playback-trace|MessageReadStatusService|routes/messages|message-detail|message-edit|read-status-legacy)'
   ```
   Attendu : verts, aucune régression. Aucun test existant ne pose de tuple limite
   (audit préalable confirmé).

7. `bun run tsc --noEmit` (gateway) → 0 erreur.

8. Full gateway suite (background, ~9 min) : `bun run jest --config=jest.config.json`
   → attendu 18708/18708 (baseline 18706 + 2 nouveaux tests).

## Dépendances

- Aucune dépendance externe. Le refine est local au fichier, importe déjà `z`.
- Zod déjà à `4.x` dans le workspace — `.refine()` API stable, `path` + `message` supportés depuis Zod 3.

## Risques estimés

- **Régression fonctionnelle** : ~0. Les 2 producteurs client (`PlaybackStretchTracker`
  web et iOS) garantissent `endMs > startMs` par construction (`now - startedAt > 0`
  puisque le temps a coulé). Aucune fixture ni test ne pose de tuple limite. Le seul
  chemin qui pourrait provoquer un `400` est un client mal codé / bug de drift —
  précisément ce que le fix veut détecter.

- **Divergence de choix produit avec 234/236** : documentée in-line et dans l'analyse.
  Le choix `>` strict ici est SEMANTIQUEMENT motivé (« écoute continue » ≠ « segment
  ponctuel ») et miroite la persistance. Pas un accident, pas une divergence à réduire.

- **Impact CI/télémétrie** : nul immédiat. Si un client émet en pratique des tuples
  limites (qu'on n'a pas détectés faute de logging côté persistance), la métrique
  Fastify des `400` sur `/attachments/:id/status` remontera — c'est le signal attendu.

## Stratégie de rollback

Retirer :
1. Le `.refine()` de `playbackStretch` (retour à `.object({...})` nu).
2. Le docstring in-line associé.
3. Les 2 tests jumeaux dans `messages-schemas.test.ts`.

3 hunks localisés, 2 fichiers, ~35 lignes. Retour à l'état pré-fix en une commande.

## Critères de validation (à cocher pendant l'exécution)

- [x] Setup : `bun install --ignore-scripts`, `prisma generate`, `shared build`.
- [x] Baseline : 71/71 sur `messages-schemas.test.ts`.
- [ ] RED : 2 tests tombent rouges sur `main` sans le fix.
- [ ] GREEN : 73/73 sur `messages-schemas.test.ts`.
- [ ] Non-régression : suite étendue (`messages-schemas|playback-trace|MessageReadStatusService|routes/messages|message-detail|message-edit|read-status-legacy`) verte.
- [ ] `tsc --noEmit` propre.
- [ ] Full gateway suite verte (18708/18708 attendu).
- [ ] Commit + push + PR ouverte.
- [ ] CI verte.
- [ ] Merge et delete branch.

## Statut d'avancement

- [x] Analyse écrite : `docs/routine/analyses/2026-08-20-iteration-237-analyse.md`.
- [x] Plan écrit : ce document.
- [ ] RED prouvé.
- [ ] GREEN posé.
- [ ] Validation étendue.
- [ ] PR mergée.

## Améliorations futures (à faire ré-émerger APRÈS ce lot)

- **Extraction d'une brique `timeRangeMsSchema` partagée** (candidat 234/236).
  Maintenant que les 4 sites (`transcriptionSegmentSchema`, `socketTranscriptionSegmentSchema`,
  `TimingSchema`, `BackgroundSoundSchema.bounds`, `playbackStretch`) portent tous
  l'invariant, le motif est mûr pour être factorisé. Chaque site garde son CHOIX
  `>=` vs `>` (arbitrage sémantique différent), mais le squelette + refine est
  mutualisable.
- **Logging du drop dans `isUsable`.** Après le fix wire, les drops deviennent
  extrêmement rares. Un `logger.warn` sur drop aiderait à détecter les régressions
  futures (bug interne ou client rétrograde qui émettrait un vieux buffer). À peser
  contre la contrainte « utilitaire pur » actuelle.
- **Parité Pydantic côté `services/translator`** (candidat 234/236). Env actuel sans
  la stack ML — reste bloqué. À reprendre dans un contexte translator-ready.
# Iteration 237 — Plan : invariant `end ≥ start` sur CanvasV3 (schéma + convertisseur)

> **Note de renumérotation (collision de numéro).** Mergé sous PR #3240 en parallèle de PR #3237
> qui portait aussi le numéro 236 ; #3237 ayant mergé en premier garde 236, ce plan CanvasV3 est
> renuméroté 237. Voir l'analyse jumelle pour le détail.

## Objectifs
1. Étendre l'invariant temporel `end ≥ start` (norme du codebase, itération 234) aux deux
   intervalles temporels de `CanvasV3Schema` : `TimingSchema` (objets) et `BackgroundSoundSchema.bounds`
   (fond sonore).
2. Corriger le convertisseur `convertV1ToV3` qui pouvait émettre `bounds: { start: N, end: 0 }`
   quand un blob v1 ne portait qu'une seule borne — un intervalle qui finit avant de commencer.

## Modules affectés
- `packages/shared/types/canvas-v3.ts` — schéma Zod (+ 2 refines).
- `services/gateway/src/services/posts/storyEffectsV3.ts` — convertisseur v1→v3 (`convertV1ToV3`,
  bloc bounds).
- `services/gateway/src/__tests__/unit/services/posts/canvasV3.schema.test.ts` — 8 tests
  additionnels (5 timing + 3 bounds).
- `services/gateway/src/__tests__/unit/services/posts/canvasV3.fixtures.test.ts` — 3 tests
  `convertV1ToV3` (round-trip vers le schéma).

## Phases d'implémentation
1. **RED** — Écrire les 5 tests schéma (`end < start` refusé, `end === start` accepté, timing
   partielle acceptée, bounds inversé refusé, bounds durée nulle accepté). Confirmer le rouge sur
   les deux cas `end < start` (les autres passent déjà, ce sont les gardes de non-régression).
2. **GREEN schéma** — Ajouter les deux `.refine` sur `TimingSchema` (conditionnel, deux bornes
   optionnelles) et `BackgroundSoundSchema.bounds` (inconditionnel, deux bornes requises). Rebuild
   `packages/shared`.
3. **RED convertisseur** — Écrire les 3 tests `convertV1ToV3`. Le cas « une seule borne » et « borne
   inversée » échoueraient contre la garde ajoutée en phase 2 si le convertisseur n'est pas corrigé.
4. **GREEN convertisseur** — Remplacer le pattern `num(x, 0)` par une garde qui n'émet `bounds`
   QUE si les deux bornes sont des `number` finis et forment un intervalle valide (`end >= start`).
5. **Validation** — Suite `canvasV3` (18/18), suite étendue `storyEffects|storyTextObject|canvasV3`
   (130/130), suite shared vitest (2328/2328). `tsc --noEmit` propre sur shared + gateway.

## Dépendances
- Aucun changement de types externes (`z.infer` inchangé).
- Aucun changement de comportement runtime pour les données valides existantes.
- Aucune migration DB (schéma Zod uniquement).

## Risques estimés
- **Négligeable.** Aucun fixture ni test existant ne pose `end < start`. Le golden `v1-legacy-full.v3.json`
  porte des bornes ordonnées (2, 17), inchangé. Le refine préserve le type Zod inféré.
- **Interaction schéma × convertisseur.** Le refine schéma sans correctif convertisseur ferait
  échouer la validation d'un blob v1 partiel : les deux se corrigent nécessairement ensemble
  (phase 2 + phase 4 dans le même commit).

## Stratégie de rollback
- Un `git revert` du commit unique suffit. Aucun changement d'API, aucun changement de wire format.
- Le fixture golden reste inchangé : aucun risque de désynchronisation cross-lot.

## Critères de validation
- [x] Tests RED prouvés (2 cas `end < start` refusés seulement après refine).
- [x] Tests GREEN schéma : 13/13 canvasV3.schema (5 nouveaux ordre-temporel + 8 existants).
- [x] Tests GREEN convertisseur : 3 nouveaux `convertV1ToV3` (bornes ordonnées / borne unique
      droppée / borne inversée droppée).
- [x] Suite étendue `storyEffects|storyTextObject|canvasV3` : 130/130 verts (11 suites).
- [x] Suite shared vitest : 2328/2328 verts (aucune régression au niveau exports canvas-v3).
- [x] `tsc --noEmit` propre sur `packages/shared` et `services/gateway`.
- [x] Fixture golden `v1-legacy-full.v3.json` inchangé.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Statut d'achèvement
**Complet.** 4 fichiers modifiés, 85 lignes ajoutées, 3 lignes supprimées. Aucune régression
détectée localement.

## Progression
1. ✅ RED schéma (2 tests `end < start` refusés — rouge confirmé)
2. ✅ GREEN schéma (`.refine` sur `TimingSchema` et `BackgroundSoundSchema.bounds`)
3. ✅ RED/GREEN convertisseur (garde de validité + 3 tests round-trip)
4. ✅ Validation étendue (130/130 gateway sur `storyEffects*`, 2328/2328 shared)
5. ✅ `tsc --noEmit` propre sur les deux packages

## Améliorations futures
1. **Parité clients (web + iOS).** Les renderers CanvasV3 côté client doivent tolérer un intervalle
   corrompu à l'affichage (silencieusement) — audit à faire dès que les targets accessibles.
2. **Monotonie inter-keyframes.** `KeyframeSchema.time` dans un tableau `keyframes` n'est pas
   contraint d'être monotone. Idem pour `transcriptionSegmentSchema[]` (itération 234, futures).
   Contrainte de collection, à peser séparément.
3. **Audit du pattern `num(v, 0)`.** D'autres champs du convertisseur (volume, position, échelle)
   utilisent le même défaut arbitraire. Identifier lesquels tolèrent `0` comme défaut sémantique
   valide et lesquels devraient dégrader en « champ absent ».
# Plan d'itération 237 — Propager « un message système forme son propre groupe » au mode Focal

## Objectifs
Éliminer le jumeau non corrigé du défaut de regroupement 2026-08-20 : `isFirstInFocalGroup`
(`apps/web/components/conversations/focal/focal-row-utils.ts`) doit refuser de regrouper une bulle
derrière un message SYSTÈME, en déléguant au résolveur canonique
`apps/web/utils/message-grouping.ts` (Single Source of Truth).

## Modules affectés
- `apps/web/components/conversations/focal/focal-row-utils.ts` — délégation + import.
- `apps/web/components/conversations/focal/__tests__/focal-row-utils.test.ts` — 2 cas système
  ajoutés ; 3 cas existants complétés du champ `messageSource` (désormais requis par la signature
  `Pick<Message, 'senderId' | 'messageSource'>`).

## Phases d'implémentation
1. **RED** — ajouter au test les deux cas système (bulle après avis système même auteur ⇒ ouvre ;
   avis système lui-même ⇒ ouvre). Échoue contre l'ancien corps.
2. **GREEN** — réécrire `isFirstInFocalGroup` pour déléguer à `computeIsFirstInGroup`, en adaptant
   la forme plate `senderId` → `{ sender: { id }, messageSource }`. Élargir la signature à
   `Pick<Message, 'senderId' | 'messageSource'>`.
3. **Ajustement de type** — `messageSource` étant REQUIS sur `Message` (`conversation.ts:120`),
   compléter les cas de test existants.
4. **REFACTOR** — la règle vit désormais en un seul endroit ; le prédicat Focal n'est qu'un
   adaptateur documenté.

## Dépendances
Aucune nouvelle dépendance. Réutilise `@/utils/message-grouping` (fichier web pur, sans import
partagé), créé par le commit `368b936f`.

## Risques estimés
Très faible — fonction pure, changement additif (n'ouvre que des groupes), court-circuit `script`
et branche « même auteur » préservés. Pas de contrat réseau, pas de schéma, pas de miroir
iOS/Android pour cet util Focal web.

## Stratégie de rollback
Revert du commit unique — deux fichiers, sans migration ni changement de contrat.

## Critères de validation
- [x] RED prouvé avant correctif (ancien corps ⇒ `false` sur le cas système).
- [x] `focal-row-utils.test.ts` : 24/24.
- [x] Suites Focal complètes : 14 suites / 145 tests verts.
- [x] `tsc` : 0 erreur introduite dans les fichiers touchés.

## Statut de complétion
**Complet.** Correctif + tests posés, suites vertes.

## Suivi de progression
- Itération 234 : `transcriptionSegmentSchema` `endMs >= startMs` (gate partagé).
- Itération 235 : type de page cache infini débarrassé de l'enveloppe delta morte.
- Itération 236 : `socketTranscriptionSegmentSchema` `endMs >= startMs` (jumeau live).
- **Itération 237 : mode Focal converge sur la loi de regroupement corrigée (message système =
  groupe propre).**

## Améliorations futures
1. Loi partagée `river-lanes.ts` `isGroupHead` — extension cross-plateforme (type d'entrée +
   miroir iOS), à traiter avec toolchain iOS.
2. Monotonie de collection : `transcriptionSegmentSchema[]`, `KeyframeSchema.time[]`.
