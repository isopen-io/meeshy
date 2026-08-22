# Iteration 237 — `playbackStretch` acceptait un intervalle inversé ou nul, dont l'écoute était SILENCIEUSEMENT jetée par le persisteur (troisième site de la classe 234/236, aggravé par une divergence wire/persistance)

## Protocole (démarrage)
`main` @ `13bedd98` (dernier commit : `merge: #3240 feat(shared,gateway): CanvasV3
refuse un intervalle temporel qui finit avant de commencer`). Branche
`claude/brave-archimedes-1z7088` redémarrée sur `origin/main` (PR #3237 mergée, série 236
close) — 0 avance / 0 retard au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (idempotent, 1943
paquets déjà en place), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`. Suite baseline `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts`
verte au départ (71 tests).

**Audit anti-doublon** (6 PRs ouvertes au départ) : #3239 (Android composer),
#3164/#3147/#3140/#3139/#3138 (dependabot CI/deps). **Aucune PR ouverte ne touche
`services/gateway/src/validation/messages-schemas.ts` ni `services/gateway/src/utils/playback-trace.ts`** —
zéro chevauchement de fichier. Le lot précédent (236) a explicitement laissé ce
site en « améliorations futures » (cf. `2026-08-20-iteration-236-analyse.md:170-178` — le
troisième site listé pour l'extraction candidate d'un `timeRangeMsSchema`).

## Sélection : **Priorité 2 — refinement d'une feature déjà modernisée dont un jumeau de contrat porte encore le même défaut, aggravé cette fois par une divergence wire/persistance qui produit une perte de donnée SILENCIEUSE**

Le lot 234/236 a durci trois schémas Zod (`transcriptionSegmentSchema` shared,
`socketTranscriptionSegmentSchema` gateway, `TimingSchema` + `BackgroundSoundSchema.bounds`
canvas-v3) en ajoutant l'invariant temporel `endMs ≥ startMs`. Le troisième site
explicitement flaggé dans les améliorations futures 236 est `playbackStretch` dans
`services/gateway/src/validation/messages-schemas.ts:33-37`. Ce site a une CARACTÉRISTIQUE
QUI LE DISTINGUE DES TROIS PRÉCÉDENTS : la couche de PERSISTANCE en aval porte déjà
la contrainte, et la porte STRICTE (`endMs > startMs`), tandis que le wire accepte tout
`>= 0` sur les deux bornes séparément. La divergence produit une perte silencieuse de
la donnée d'écoute continue — le client reçoit un `200 OK` et croit sa trace persistée,
mais elle a été jetée entre le gate et la base.

## Current state (avant correctif)

### Le wire (`services/gateway/src/validation/messages-schemas.ts:33-37`)

```ts
const playbackStretch = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  endedBy: z.enum(['pause', 'seek', 'muted', 'completed', 'dismissed', 'superseded'])
});
```

Chaque borne est bornée `nonnegative()` INDIVIDUELLEMENT, mais rien ne LIE les deux.
`startMs=1500, endMs=500` (inversion) traverse. `startMs=500, endMs=500` (durée nulle)
traverse. Aucune trace n'existe côté serveur qu'une trace était en défaut.

### La persistance (`services/gateway/src/utils/playback-trace.ts:67-82`)

```ts
function isUsable(candidate: unknown): candidate is PlaybackStretch {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const { startMs, endMs, endedBy } = candidate as Record<string, unknown>;
  return (
    typeof startMs === 'number' &&
    typeof endMs === 'number' &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs >= 0 &&
    endMs > startMs &&                    // ← STRICTEMENT PLUS GRAND, pas ≥
    typeof endedBy === 'string' &&
    STRETCH_ENDS.has(endedBy)
  );
}
```

Le contrat effectif de la persistance est `endMs > startMs` (strict). Une écoute
inversée ou de durée nulle sortie du gate est SILENCIEUSEMENT jetée par
`parsePlaybackTrace` / `appendPlaybackStretches` (via ce filtre). Le
`.filter(isUsable)` sur `parsePlaybackTrace` (`playback-trace.ts:102`) et l'itération
sur `[...existing, ...incoming]` dans `appendPlaybackStretches` (`playback-trace.ts:147-153`)
sautent l'entrée sans loguer.

### La conséquence sur le pipeline

`AttachmentStatusBodySchema.stretches` (`messages-schemas.ts:214-217`) accepte l'array.
`routes/messages.ts` appelle `service.markAudioAsListened({ stretches })` (ou
`markVideoAsWatched`, `markImageAsViewed` selon action). `MessageReadStatusService.markAudioAsListened`
(`services/MessageReadStatusService.ts:2352-2354`) passe l'array à
`appendPlaybackStretches(parsePlaybackTrace(previous?.listenSegments), options?.stretches ?? [])`.
Toute écoute inversée/nulle est filtrée à ce point. Le service RETOURNE
`200 { success: true }` sans indice qu'une entrée a été jetée. Le client croit sa trace
persistée ; le serveur a persisté SANS elle.

## Problems identified

1. **Divergence wire/persistance sur le contrat effectif.** Le wire déclare `nonnegative()`
   x 2, la persistance impose `>` strict. Deux gardes disjointes qui devraient être
   miroir. Le gate wire est SEUL responsable de signaler à l'émetteur qu'un rapport
   est refusé — le sauter transforme un défaut en no-op muet, qui ni ne rejette, ni ne
   logue, ni ne persiste. Un émetteur ne peut pas apprendre qu'il envoie mal.

2. **Perte de donnée sans piste d'audit.** `isUsable` jette silencieusement l'entrée
   sans logging (`playback-trace.ts:67-82` n'appelle aucun logger — c'est un utilitaire
   pur). Aucun émetteur ne peut apprendre qu'un scrub/replay est effectivement compté.
   Sur un post-mortem « pourquoi cette écoute continue n'est-elle pas visible dans la
   trace ? », rien à corréler côté serveur.

3. **Blast radius produit précis.** Une entrée inversée/nulle FUIT le compteur
   `traceCoverage` et `MAX_TRACE_STRETCHES` : elle contribue à zéro sans consommer
   d'entrée, ce qui NE FAUSSE PAS les statistiques agrégées mais ANNIHILE la
   ligne-là de la trace. Un utilisateur qui a réellement écouté un passage dont le
   client a envoyé un tuple limite (drift d'horloge, race pause/end) verra sa
   couverture réelle sous-estimée — invisible côté UI.

4. **Troisième site de la classe 234/236, explicitement flaggé et resté non-corrigé.**
   `2026-08-20-iteration-236-analyse.md:170-178` liste ce fichier parmi les trois
   sites où la sémantique `(startMs, endMs)` doit porter une refine. Il est le dernier
   à ne pas la porter dans le codebase (grep exhaustif : les 3 autres sont désormais
   corrigés — 234 attachment, 236 canvas-v3 timing/bounds, 237-1 socket transcription).

## Root causes

- **Écriture SÉPARÉE de deux règles jumelles à deux moments différents.** Le wire
  `playbackStretch` a été écrit au moment où `AttachmentStatusBodySchema` a été posé ;
  le filtre `isUsable` a été écrit au moment de `playback-trace.ts` (utilitaire de
  persistance/normalisation). Personne n'a rapproché les deux : le premier accepte,
  le second jette, sans témoin qui prouve que les deux disent la même chose. Le codebase
  n'a pas encore extrait de brique `timeRangeMsSchema` partagée (candidat listé en
  amélioration future 234/236) — c'est le motif structurel de la divergence.

## Business impact

- **Faible en volume observé aujourd'hui, mais REL.** Les clients producteurs
  (`PlaybackStretchTracker` sur web `apps/web/utils/playback-stretch-tracker.ts` et
  iOS `packages/MeeshySDK/…/PlaybackStretchTracker.swift`) sont soigneusement construits
  pour émettre `endMs > startMs` (`this.startedAt < now` par construction). Le cas
  émerge sur les chemins limites : drift d'horloge (retour du background, `Date.now()`
  saut arrière/avant), race entre événements `pause` et `ended` sur `<audio>` DOM (le
  navigateur peut appeler `pause()` post-`ended` avec un `currentTime` retombé à 0), et
  reprises hors-ligne d'un ancien buffer partiellement corrompu.
- **Perte silencieuse >> panne bruyante.** Une trace tronquée sans témoin est pire
  qu'un `400 CANVAS_INVALID`-équivalent : le client garde le rapport en supposant qu'il
  a été accepté, la trace consolidée reste incohérente, aucune remontée. Rejeter au wire
  transforme un no-op muet en un signal loggable côté client (400) et gate serveur (`err`
  de validation Zod visible dans les métriques Fastify).

## Technical impact

- **Contrat de wire :** `endMs <= startMs` sur `AttachmentStatusBodySchema.stretches[]`
  devient un `400 Validation Error` (Fastify) au lieu d'un `200 OK` avec entrée jetée
  post-hoc. Comportement observable pour l'émetteur : le rapport est refusé
  visiblement — le client peut logger et retenter avec des bornes corrigées ou drop
  l'entrée avant l'envoi.
- **Aucun émetteur légitime ne produit de tuple limite** : les deux producteurs client
  garantissent `endMs > startMs` par construction (`PlaybackStretchTracker`), donc
  **zéro régression fonctionnelle attendue** sur les rapports réels. Le rejet transforme
  un chemin latent en chemin bloqué visible.
- **Coverage :** +2 tests dans `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts`
  (`rejette une écoute dont endMs est strictement inférieur à startMs`,
  `rejette une écoute de durée nulle (endMs === startMs)`). Le second témoin gèle
  l'alignement wire/persistance à `>` strict (différent des choix 234/236 qui admettaient
  `>=`, parce que la sémantique EST différente — voir « Décision produit » ci-dessous).
- **`tsc` :** 0 nouvelle erreur (le refine ne modifie pas le type inféré).
- **Persistance :** aucune modification. `isUsable` reste le SOURCE OF TRUTH côté
  persistance ; le refine wire cite explicitement cette référence dans son docstring.
# Iteration 237 — CanvasV3 : deux intervalles temporels sans invariant `end ≥ start` (schéma) et un convertisseur v1→v3 qui pouvait émettre `bounds: {start:N, end:0}`

> **Note de renumérotation (collision de numéro).** Ce travail a été mené et mergé (PR #3240) sous
> le numéro « itération 236 », en parallèle d'une autre session qui portait AUSSI le numéro 236
> (PR #3237, `socketTranscriptionSegmentSchema`). #3237 ayant mergé en premier, le merge add/add a
> concaténé les deux documents dans les mêmes fichiers `iteration-236-*.md` sur `main`. Cette passe
> (itération 237) répare la corruption : #3237 conserve le numéro 236, ce travail CanvasV3 est
> renuméroté 237. Contenu inchangé par ailleurs.

## Protocole (démarrage)
`main` @ `794dd88e` (dernier commit : `Merge remote-tracking branch 'origin/main'`).
Branche `claude/brave-archimedes-9e4nuc` alignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite vitest
partagée verte au départ (2320/2320 après merges), suite `canvasV3` gateway verte au départ.

**Audit anti-doublon** (9 PRs ouvertes au départ) : les PRs jcnm en vol portent les itérations
236→239 (composer attachment-ladder Android, message-summary-kind, un fix transcription live,
picker de transfert iOS) + 5 PRs Dependabot. **Aucune PR ouverte ne touche
`packages/shared/types/canvas-v3.ts` ni `services/gateway/src/services/posts/storyEffectsV3.ts`** —
zéro chevauchement de fichier. La cible n'apparaît pas non plus dans les « Améliorations futures »
des itérations 234/235.

## Sélection : **Priorité 1 — durcissement de contrat sur une feature récente (Canvas V3, feature-flag)**

Canvas V3 est la feature de story/reel la plus récente (`45ae1777 feat(shared): CanvasV3 dans types/`,
`0b8e588d feat(gateway): convertisseur v1 vers v3 a la lecture`, `9c31d1ca feat(gateway): ecriture
stricte storyEffects sous CANVAS_V3_WRITE_STRICT`, `2d27e5da feat(gateway): lecture v3 branchee`) —
un pipeline de conversion tolérant + un schéma Zod utilisé comme frontière de confiance à l'écriture
stricte (`400 CANVAS_INVALID`). C'est exactement la classe « feature récemment développée » que la
stratégie priorise.

L'itération 234 avait établi comme **norme du codebase** l'invariant temporel `end ≥ start` sur
les segments (`transcriptionSegmentSchema`, `packages/shared/utils/attachment-validators.ts`). Ce
correctif étend la même norme à **deux autres intervalles temporels dans un fichier différent** —
et referme au passage un bug latent du convertisseur v1→v3 qui pouvait produire des intervalles
corrompus.

## Current state (avant correctif)

### 1) `TimingSchema` (objets de canvas, `packages/shared/types/canvas-v3.ts:21-26`)

```ts
const TimingSchema = z.object({
  start: z.number().min(0).optional(),
  end:   z.number().min(0).optional(),
  rate:  z.number().min(0.25).max(4).optional(),
  keyframes: z.array(KeyframeSchema).max(60).optional(),
});
```

Les deux bornes sont contraintes `min(0)` **individuellement**, mais **aucune relation entre elles**
n'est vérifiée. Un objet `{ timing: { start: 4, end: 1 } }` — un intervalle qui se termine AVANT
de commencer — passait la validation.

### 2) `BackgroundSoundSchema.bounds` (fond sonore, `canvas-v3.ts:59`)

```ts
bounds: z.object({ start: z.number().min(0), end: z.number().min(0) }).optional(),
```

Mêmes bornes, mêmes garanties verticales, mais aucune contrainte relationnelle. Un trim
d'audio `{ bounds: { start: 17, end: 2 } }` passait sans broncher.

### 3) `convertV1ToV3` (`services/gateway/src/services/posts/storyEffectsV3.ts:195-197`)

```ts
...(typeof blob.backgroundAudioStart === 'number' || typeof blob.backgroundAudioEnd === 'number'
  ? { bounds: { start: num(blob.backgroundAudioStart, 0), end: num(blob.backgroundAudioEnd, 0) } }
  : {}),
```

`num(..., 0)` remplit toute borne manquante par `0`. Conséquence : un blob v1 qui porte
`backgroundAudioStart: 5` mais AUCUN `backgroundAudioEnd` produisait `bounds: { start: 5, end: 0 }`.
`end` avant `start`. Un intervalle corrompu, servi à des clients v3 sur le chemin de lecture
(`convertStoryEffectsForWire` → `negotiateWireStoryEffects`).

## Problems identified

1. **Invariant temporel absent — schéma.** `end ≥ start` est une propriété DÉFINITIONNELLE d'un
   intervalle de temps ; sa violation décrit une donnée corrompue. La sanité numérique était
   affirmée verticalement (chaque borne `min(0)`) mais pas relationnellement — même diagnostic
   que l'itération 234, appliqué à deux intervalles différents dans un fichier différent.

2. **Convertisseur v1→v3 pouvait fabriquer un intervalle corrompu.** Le pattern
   `num(x, 0)` masquait « borne absente » derrière « borne = 0 », un choix DESTRUCTEUR pour un
   intervalle : `start: 5, end: 0` n'a aucun sens temporel. Ce chemin était NON couvert par les
   tests existants (le seul fixture v1→v3 golden porte les deux bornes présentes et ordonnées).

3. **Interaction schéma×convertisseur.** Poser l'invariant `end ≥ start` au schéma SANS corriger
   le convertisseur ferait immédiatement échouer la validation d'un blob v1 légitime servi via
   `negotiateWireStoryEffects` sous `CANVAS_V3_WRITE_STRICT`. Les deux se corrigent nécessairement
   ensemble — d'où un correctif unique qui referme les deux gaps en un mouvement.

## Root causes

- **Schéma.** Écrit champ-par-champ, sans clause `.refine` cross-field — même schéma d'omission
  qu'itération 234, dans un fichier plus récent (Canvas V3 date du lot A).
- **Convertisseur.** Le helper `num(v, d)` est TROP tolérant sur un contexte où la « donnée
  manquante » ne peut PAS se replier sur `0` sans corrompre le sens du champ. Les deux bornes
  d'un intervalle sont couplées : l'omission de l'une doit propager à l'omission de l'objet
  entier, pas à un défaut arbitraire.

## Business impact

- **Faible mais réel.** `bounds` corrompu = un client v3 tenterait de jouer un audio « de 5s à 0s »,
  soit ignoré (comportement client dépendant), soit joué en entier (défaut), soit affiché comme
  erreur silencieuse. Sur `timing.end < start` d'un objet texte : l'objet ne s'affiche jamais (sa
  fenêtre est vide/négative). Le gain est **défensif** : fermer la porte avant qu'un backend
  futur / un éditeur mal codé / un blob v1 partiel ne fasse passer une donnée corrompue jusqu'aux
  clients.

## Technical impact

- **Aucun comportement observable ne change pour les données valides existantes.** Le fixture
  golden (`v1-legacy-full.json`) porte les deux bornes ordonnées (2, 17) — l'or reste vert.
  `end === start` (durée nulle) reste accepté partout — la borne est `≥`, pas `>`.
- **Blast radius identique en nature** à la contrainte `min(0)` préexistante : le schéma est
  utilisé via `safeParse` dans le rejet `CANVAS_INVALID`, il ne throw jamais.
- **Convertisseur tolérant.** Une borne manquante ou inversée dégrade en « pas de trim » (le clip
  audio entier joue), jamais en donnée corrompue. Ce comportement est ALIGNÉ sur le style annoncé
  par le convertisseur (« tolérant, golden gelé », `0b8e588d`).
- **Types inchangés.** `z.infer<typeof CanvasV3Schema>` inchangé — `.refine` préserve le type
  inféré, et le `.optional()` reste après le refine pour `bounds`.

## Risk assessment

- **Négligeable.** Recherche exhaustive :
  - **Producteurs client.** `apps/web/utils/playback-stretch-tracker.ts` et
    `packages/MeeshySDK/…/PlaybackStretchTracker.swift` construisent `startedAt` puis
    `endMs = now` — par construction `endMs > startedAt` (le temps a coulé). Aucun
    tuple limite ne peut naître sauf drift d'horloge.
  - **Tests existants.** Les 71 tests de `messages-schemas.test.ts` n'exercent aucun
    tuple limite (`{startMs: 0, endMs: 500}` typique). Aucune fixture ni test iOS/web
    ne pose `endMs <= startMs` (grep exhaustif sur `stretches:` et sur `PlaybackStretch`).
  - **Producteurs serveur.** Aucun. `appendPlaybackStretches` est une pure consommation
    de `options.stretches` ; il n'existe pas de code serveur qui FABRIQUE des stretches
    ex nihilo à envoyer sur le wire.
  - **Extend/pick.** `playbackStretch` n'est utilisé que par `AttachmentStatusBodySchema.stretches`
    (grep exhaustif). Aucun `.extend()`, `.merge()`, `.pick()`.
- **Rollback :** retirer les 4 lignes de `.refine()` et les 2 tests jumeaux.

## Décision produit : `endMs > startMs` (STRICT), différent des choix 234/236 (`>=`)

Les trois refines précédentes ont admis `endMs === startMs` (segment ponctuel, durée
nulle) parce que la sémantique du champ était compatible :
- 234 (`transcriptionSegmentSchema`) : un point de transcription à un instant peut
  légitimement porter une borne unique (marqueur, annotation ponctuelle).
- 236 partie 1 (`socketTranscriptionSegmentSchema`) : idem, jumeau live.
- 236 partie 2 (`TimingSchema` / `BackgroundSoundSchema.bounds`) : un timing d'objet
  affiché « à un instant précis » ou un bounds audio à l'instant t sont possibles.

Ici la sémantique EST différente. `playbackStretch` documente
(`playback-trace.ts:7`) : « **une suite d'écoutes réellement CONTINUES** ». Une écoute
« de durée zéro » n'est pas une écoute — c'est un no-op. La persistance a codé cette
sémantique produit dans `isUsable` avec `endMs > startMs` strict. Le wire refine doit
la miroiter EXACTEMENT pour ne pas laisser passer ce que la persistance jette.

## Proposed improvements

1. **RED** : ajouter deux tests dans `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts` :
   - `rejette une écoute dont endMs est strictement inférieur à startMs` (attendu `success=false`).
   - `rejette une écoute de durée nulle (endMs === startMs)` (attendu `success=false`).
   Les deux tombent rouges sur `main` (le premier immédiatement, le second aussi — le
   wire courant admet `>= 0` sans lien).
2. **GREEN** : ajouter `.refine((s) => s.endMs > s.startMs, { path: ['endMs'], message: 'STRETCH_END_MUST_EXCEED_START' })`
   sur `playbackStretch`. Docstring in-line citant `isUsable` dans `playback-trace.ts` et
   la décision `>` strict alignée sur la sémantique « écoute réellement continue ».

## Expected benefits

- **Cohérence wire/persistance.** Deux gardes qui portaient déjà la même intention
  la déclarent explicitement au même endroit — le wire signale ce que la persistance
  jetterait sinon en silence.
- **Signal loud > silent drop.** Un client mal configuré (drift, race, retry de vieux
  buffer) reçoit un `400` explicite au lieu d'un `200` mensonger. Le débogage devient
  possible.
- **Fin de la classe 234/236.** Les quatre sites explicitement listés portent enfin
  tous l'invariant `endMs (>=|>) startMs` selon leur sémantique. La stratégie de
  « cohérence : deux gates jumeaux doivent porter les mêmes invariants ou explicitement
  documenter leur divergence » (analyse 236) est effectivement close.

## Implementation complexity

- **Trivial.** 1 fichier de production modifié (1 `.refine` + docstring, ~8 lignes),
  1 fichier de test modifié (+2 tests, ~24 lignes avec comments). Aucun changement de
  type inféré, aucun changement de comportement pour les émetteurs légitimes.

## Validation criteria

- [ ] RED : les 2 tests tombent ROUGES sur `main` (prouver le témoin avant fix).
- [ ] GREEN : `services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts` → 73/73.
- [ ] Aucune régression sur suites connexes : `playback-trace.test.ts` (60+ tests
      internes), `MessageReadStatusService.test.ts`, `read-status-legacy-message-route.test.ts`,
      `messages.test.ts`, `messages-extended.test.ts`, `message-detail-read-receipts.test.ts`,
      `message-edit-stale-translation.test.ts`, `message-edit-mention-parity.test.ts`.
- [ ] Suite étendue `messages-schemas|playback-trace|MessageReadStatusService|messages\.test|messages-extended|message-detail|message-edit` : verte.
- [ ] `bun run tsc --noEmit` (gateway) → 0 erreur.
- [ ] Full gateway suite (background) — vert attendu, aligné sur baseline (18706/18706 → 18708/18708).
- [ ] CI verte sur la PR.

## Améliorations futures (hors périmètre)

- **Extraction d'une brique `timeRangeMsSchema` partagée** (candidat 234/236, reste
  pertinent). Maintenant que les quatre sites portent la refine, le motif est mûr
  pour être extrait en un helper Zod dans `packages/shared/utils/`. Chaque site
  garderait le CHOIX `>=` vs `>` (sémantique différente), mais la structure
  `{ startMs, endMs }` + comparaison serait mutualisée. Itération dédiée.
- **Logging du drop dans `isUsable`.** Actuellement l'utilitaire est pur (aucun
  logger). Après le fix wire, les DROPS deviennent extrêmement rares (bug interne
  seulement). Ajouter un `console.warn`/logger structuré aiderait à détecter les
  régressions futures — mais nécessite arbitrage sur les dépendances de
  `playback-trace.ts` (utilitaire pur aujourd'hui). Candidat séparé.
- **Parité Pydantic côté `services/translator`** (candidat 234/236, non résolu). L'env
  actuel n'a toujours pas la stack ML. Reprendre dans un contexte translator-ready.
- **Contrainte de monotonie inter-stretches.** `appendPlaybackStretches` ne vérifie
  pas que `stretches[i].startMs >= stretches[i-1].endMs`. Un rapport avec
  chevauchements passe. Semantiquement acceptable (le client peut envoyer les tuples
  dans un ordre non chronologique — `traceCoverage` fusionne), mais un audit pourrait
  peser un ordre canonique. Différent de la monotonie inter-segments 234 (diarisation
  possible) parce que ici il n'y a QU'UN participant : plus tranchable.
  - **Fixtures.** Aucun fixture v3 ne pose `end < start` (grep exhaustif sur `bounds`/`timing`).
    Le fixture v1 golden porte les deux bornes ordonnées.
  - **Tests.** Aucun test ne pose `end < start`. Les tests d'écriture stricte (`storyEffectsUpgradeGate`,
    `storyEffectsMediaClaim`, `storyEffectsWire`) et de traduction texte (`storyTextObjectTranslationV3`)
    restent verts — 130/130 sur le pattern `storyEffects|storyTextObject|canvasV3`.
  - **Extend/pick.** Aucun consommateur n'appelle `.extend()`/`.shape`/`.merge()`/`.pick()` sur
    `TimingSchema` ou `BackgroundSoundSchema`.
- **Le refine préserve la structure `z.optional()`** pour `bounds` (le `.refine` s'applique à
  l'objet interne AVANT le `.optional()` extérieur) — un `sound` sans `bounds` reste valide.

## Proposed improvements

### Schéma (`packages/shared/types/canvas-v3.ts`)

```ts
const TimingSchema = z.object({ start, end, rate, keyframes })
  .refine((t) => t.start === undefined || t.end === undefined || t.end >= t.start, {
    path: ['end'],
    message: 'TIMING_END_BEFORE_START',
  });

BackgroundSoundSchema.bounds:
  z.object({ start: min(0), end: min(0) })
    .refine((b) => b.end >= b.start, { path: ['end'], message: 'BOUNDS_END_BEFORE_START' })
    .optional();
```

Le refine sur `TimingSchema` est **conditionnel** (les deux bornes sont optionnelles individuellement ;
une timing partielle `{ start }` seule ou `{ keyframes }` seule reste valide). Le refine sur `bounds`
est **inconditionnel** (les deux bornes sont requises). Durée nulle acceptée dans les deux cas.

### Convertisseur (`services/gateway/src/services/posts/storyEffectsV3.ts`)

`bounds` ne s'émet QUE comme un intervalle complet et valide :
- les deux bornes doivent être des `number` finis
- `end >= start`

Sinon → pas de `bounds` (dégradation en « pas de trim », le clip entier joue).

## Expected benefits

- Contrat CanvasV3 complet et interne-cohérent sur les intervalles temporels (schéma × convertisseur).
- Rejet défensif des données corrompues au JSON boundary, gracieusement (safeParse).
- Convertisseur v1→v3 qui n'émet plus jamais de donnée corrompue, même sur blob v1 partiel.
- Norme du codebase (`end ≥ start`, itération 234) étendue au fichier le plus récent du lot A.

## Implementation complexity

- **Faible.** 1 fichier schéma (+2 clauses `.refine`), 1 fichier convertisseur (+garde de validité),
  8 nouveaux tests (5 schéma + 3 convertisseur).

## Validation criteria

- [x] RED : 2 tests schéma prouvent l'acceptation actuelle de `end < start` (timing objet + bounds
      audio) AVANT correctif.
- [x] GREEN schéma : 13/13 tests `canvasV3.schema` verts (5 existants + 5 timing + 3 bounds).
- [x] GREEN convertisseur : 3 nouveaux tests `convertV1ToV3 — bounds audio ne sortent jamais un
      intervalle corrompu` verts (ordre préservé, borne unique droppée, borne inversée droppée).
- [x] Suite étendue `storyEffects|storyTextObject|canvasV3` : **130/130 verts** (11 suites, aucune
      régression sur wire negotiation / strict-write / media claim / text-object translation).
- [x] Suite shared vitest complète : **2328/2328 verts** (aucune régression au niveau des
      exports canvas-v3 côté shared).
- [x] `tsc --noEmit` propre sur `packages/shared` et `services/gateway` — types inchangés.
- [x] Fixture golden `v1-legacy-full.v3.json` inchangé (bornes ordonnées → validation inchangée).
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **Parité web/iOS.** Les clients web (`apps/web`) et iOS (`packages/MeeshySDK` renderer canvas)
  qui consommeront `CanvasV3` doivent également refuser un intervalle corrompu à l'affichage —
  au moins par tolérance silencieuse (borne inversée → pas de trim, pas de crash). Le schéma Zod
  côté serveur est le premier rempart ; le rendu côté client reste à auditer une fois les targets
  Swift/TS accessibles.
- **Monotonie inter-keyframes.** `KeyframeSchema.time` n'est pas contraint d'être monotone dans un
  tableau. Idem `transcriptionSegmentSchema[]` (itération 234, améliorations futures). Contrainte
  de collection, plus lourde, à peser séparément.
- **Défauts arbitraires dans le convertisseur.** Le pattern `num(v, 0)` reste utilisé pour d'autres
  champs (volume, position, échelle). Un audit dédié pourrait identifier lesquels tolèrent `0` comme
  défaut sémantique valide et lesquels devraient dégrader en « champ absent » comme `bounds` ici.
