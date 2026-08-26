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
