# Iteration 236 — `socketTranscriptionSegmentSchema` acceptait `endMs < startMs` (jumeau live du gate corrigé itération 234)

## Protocole (démarrage)
`main` @ `65af14d5` (dernier commit : `fix(ios): les suites ForwardPickerSpokenName et
SystemNoticeEngravedTime entrent au bundle de tests`). Branche
`claude/brave-archimedes-1z7088` alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`.
Suite `services/gateway/src/__tests__/call-schemas.test.ts` verte au départ (76 tests).

**Audit anti-doublon** (6 PRs ouvertes au départ) : #3236 (iOS picker), #3164/#3147/#3140/#3139/#3138
(dependabot). **Aucune PR ouverte ne touche `services/gateway/src/validation/call-schemas.ts` ni
le handler `call:transcription-segment` de `CallEventsHandler.ts`** — zéro chevauchement de fichier.
La refine sœur (`transcriptionSegmentSchema` du package partagé) a été posée à l'itération 234
(PR #3234 mergée sur `main`) ; cette itération étend l'invariant au jumeau LIVE explicitement
laissé en « améliorations futures » (candidat non retenu 233).

## Sélection : **Priorité 2 — feature récemment modernisée dont un jumeau de contrat porte encore le même défaut**

Le plan d'iteration 234 (`docs/routine/plans/2026-08-20-iteration-234-plan.md`, section
« Améliorations futures ») note deux extensions candidates :

> - Parité Pydantic `end_ms >= start_ms` côté `services/translator` (émetteur des segments).
> - Contrainte de monotonie inter-segments (`segments[i].startMs >= segments[i-1].startMs`) — à peser
>   séparément (diarisation entrelacée possible).

La première parité (Pydantic translator) est bloquée localement : `services/translator` est
en `@dataclass`, pas Pydantic, et l'environnement de cette itération n'a pas `numpy`/`torch`
pour importer la stack (`import: 'No module named pydantic'`). Ré-audit : le gate CORRESPONDANT
côté gateway existe pour un ENTRÉE UTILISATEUR différente et le porte la même faille de
naissance — Zod sur `socketTranscriptionSegmentSchema` (`call-schemas.ts:308`), l'invariant temporel
manque exactement au même endroit du contrat que sur `transcriptionSegmentSchema` avant
itération 234. Même classe de défaut, même correction (`.refine`), périmètre plus étroit et
blast radius PLUS grand (voir « Business impact » ci-dessous).

## Current state (avant correctif)

`socketTranscriptionSegmentSchema` est le gate d'entrée du handler Socket.IO
`call:transcription-segment` — chemin LIVE de la transcription d'appel. Sa forme :

```ts
export const socketTranscriptionSegmentSchema = z.object({
  callId: objectIdSchema,
  segment: z.object({
    id: z.string().min(1).max(64).optional(),
    text: z.string().min(1).max(5000),
    speakerId: z.string().min(1),
    startMs: z.number().min(0),
    endMs: z.number().min(0),
    isFinal: z.boolean(),
    confidence: z.number().min(0).max(1),
    language: z.string().min(2).max(10),
    capturedAtMs: z.number().int().min(0).optional()
  })
});
```

Chacune des bornes temporelles est bornée à `min(0)` (comme le jumeau attachment
avant itération 234), mais rien ne LIE les deux — `startMs=1500, endMs=500` traverse le gate
verbatim et se propage.

Le handler (`CallEventsHandler.ts:4194-4286`) ne re-valide pas l'invariant en aval : après
`if (!validation.success) return;` (:4210), il PERSISTE le segment final en base
(`persistTranscriptionSegment`, :4258), l'envoie au traducteur ZMQ
(`translateAndEmitSegment`, :4266) et le DIFFUSE aux autres participants de la room
(`socket.to(ROOMS.call(...)).emit(...)`, :4272-4275). Le segment vit ensuite dans
`Transcription` (modèle persistant), dans les journaux de ZMQ (`TranslationCall` accrochés),
dans l'overlay de sous-titres de tous les clients CONNECTÉS à l'appel, et dans le replay
`GET /calls/:callId/transcript` — sans indice d'origine ni piste d'audit.

## Problems identified

1. **Invariant temporel manquant sur le gate LIVE.** Le jumeau attachment (`transcriptionSegmentSchema`)
   l'a acquis à l'itération 234 ; ici l'entrée est un événement Socket.IO fire-and-forget dont le
   gate est SEUL responsable. Un client (ou un bug d'horloge sur l'émetteur — mobile, retour du
   background, drift Whisper streaming) peut poster un segment inversé.
2. **Blast radius supérieur au cas attachment.** Là où un attachment est une pièce jointe unique
   liée à un message et rendue à la demande, le segment live est PERSISTÉ en base ET diffusé
   à toute la salle d'appel EN TEMPS RÉEL — un segment inversé se voit tout de suite dans
   l'overlay de sous-titres des N participants, et survit ensuite dans le replay post-appel,
   sans piste d'audit possible (pas de champ « rejeté par validation temporelle »).
3. **Divergence de contrat entre deux schémas jumeaux.** Le lecteur qui consulte
   `attachment-validators.ts` voit un invariant explicite et documenté ; le lecteur qui consulte
   `call-schemas.ts` voit son absence — le contrat vécu par les deux chemins est différent alors
   que la sémantique du champ (`endMs ≥ startMs`) est identique.

## Root causes
- Les deux schémas ont été écrits SÉPARÉMENT (nomenclature `startMs/endMs` alignée, mais pas
  d'héritage de Zod) parce que leurs formes de payload divergent (`speakerId`, `isFinal`,
  `capturedAtMs` d'un côté ; `translatedText`, `translatedLanguage` de l'autre) et qu'aucun
  n'utilise l'autre comme brique. L'invariant temporel est un aspect DE LA SÉMANTIQUE DU
  COUPLE (`startMs`, `endMs`), pas du reste de la forme — il aurait mérité une brique partagée
  dès l'origine. L'itération 234 a réparé le premier ; le second est resté.

## Business impact
- **Nul en runtime PROUVÉ à ce jour** — aucun rapport d'utilisateur ni ligne de log l'attestant.
  Mais un segment inversé n'aurait aucune trace : le renversement ne casse rien immédiatement,
  il rend juste le replay incohérent (l'ordre du journal se calcule par `capturedAtMs`, mais les
  bornes internes du segment sont affichées telles quelles dans l'overlay et exportées telles
  quelles par la route de replay). C'est un **hardening préventif** parallèle à celui de 234,
  motivé par la préexistence prouvée du même défaut sur le jumeau et par la stratégie de
  cohérence : deux gates jumeaux doivent porter les mêmes invariants ou explicitement documenter
  leur divergence — jamais tomber dans le silence.

## Technical impact
- **Contrat de wire :** un `endMs < startMs` sur le socket `call:transcription-segment` devient
  un `validation.success === false`, ce qui déclenche le `return` silencieux existant du handler
  (:4210). Comportement observable pour l'émetteur : le segment n'est ni broadcasté ni persisté
  ni traduit (aucun `ack` sur ce socket — c'est un fire-and-forget). Aucun émetteur légitime
  connu ne produit d'inversion (les émetteurs sont Whisper streaming côté client + backend Web
  Speech API, tous deux garantissent `end ≥ start` par construction) : donc **zéro régression
  fonctionnelle attendue**. Le rejet transforme un chemin latent en chemin bloqué.
- **Coverage :** +2 tests dans `services/gateway/src/__tests__/call-schemas.test.ts`
  (`rejects a segment whose endMs is strictly less than startMs`,
  `accepts a zero-duration segment where endMs equals startMs`). Le second témoin gèle la
  décision produit d'itération 234 (bornes égales = segment ponctuel admis) et empêche une
  refine trop stricte qui utiliserait `>` au lieu de `>=`.
- **`tsc` :** 0 nouvelle erreur (contrat inchangé côté TS, la refine ne modifie pas le type
  inféré).

## Risk assessment
- **Faible.** La refine est colocalisée dans un schéma qui n'a qu'UN seul point d'appel
  (`CallEventsHandler.ts:4209`, via `validateSocketEvent(socketTranscriptionSegmentSchema, ...)`)
  qui gère déjà `!success` par un `return` silencieux (:4210). Aucun code de production ne
  construit un segment inversé (audit : les émetteurs sont Whisper client + Web Speech). Le
  test `strips a client-supplied speakerDisplayName` prouve que le schéma est déjà en mode
  `.strip()` par défaut ; ajouter une refine ne change pas ce mode.
- **Rollback :** retirer les 4 lignes de `.refine()` et les 2 tests jumeaux.

## Proposed improvements
1. **RED** : ajouter deux tests dans `services/gateway/src/__tests__/call-schemas.test.ts` :
   - `rejects a segment whose endMs is strictly less than startMs` (attendu `success=false`).
   - `accepts a zero-duration segment where endMs equals startMs` (attendu `success=true`).
   Le premier tombe rouge sur `main` ; le second passe déjà (documente la décision).
2. **GREEN** : envelopper l'objet `segment` interne d'un `.refine((s) => s.endMs >= s.startMs, ...)`
   avec `path: ['endMs']` (Zod pointe la borne fautive dans le message). Docstring in-line
   citant le jumeau attachment et la décision « bornes égales admises » d'itération 234.

## Expected benefits
- **Cohérence de contrat.** Deux schémas jumeaux sur `startMs/endMs` portent désormais la même
  refine, gelée par test.
- **Blocage préventif du plus large blast radius de la classe.** Le chemin live (persistance +
  ZMQ + broadcast temps réel) est celui qui, en cas d'inversion, produirait la corruption la
  plus visible ET la plus difficile à corréler post-hoc.
- **Facilitation du lot Pydantic.** Une fois cette parité posée côté gate serveur, le lot
  Pydantic translator (candidat 234) trouve un miroir de plus à respecter — la doc du gate
  gateway cite l'itération 234 et vice-versa, ce qui donne au reviewer un point d'ancrage
  clair.

## Implementation complexity
- **Trivial.** 1 fichier de production modifié (1 `refine` + docstring), 1 fichier de test
  modifié (+2 tests, +34 lignes avec comments). Aucun changement de type inféré, aucun
  changement de comportement pour les émetteurs légitimes.

## Validation criteria
- [x] `bun run jest --config=jest.config.json src/__tests__/call-schemas.test.ts` → 78/78.
- [x] `bun run jest --config=jest.config.json src/socketio/__tests__/CallEventsHandler.test.ts` → 254/254.
- [x] `bun run jest --config=jest.config.json --testPathPatterns='(call-schemas|CallEventsHandler|messages-schemas)'` → 742/742 (37 suites).
- [x] `bun run tsc --noEmit` (gateway) → 0 erreur.
- [ ] Full gateway suite (background) — vert attendu, aligné sur baseline.

## Améliorations futures (hors périmètre de cette itération)
- **Parité Pydantic côté `services/translator`** (candidat 234 non retenu) : l'émetteur des
  segments audio (`TranscriptionSegment` dans `services/translator/src/services/transcription_service.py`,
  `@dataclass`) ne porte AUCUN invariant `end_ms >= start_ms`. L'environnement de cette
  itération n'a ni `pydantic` ni la stack ML pour tester : à reprendre dans un contexte
  translator-ready.
- **Contrainte de monotonie inter-segments** (candidat 234 non retenu) : `segments[i].startMs
  >= segments[i-1].startMs` — nécessite arbitrage produit (diarisation entrelacée possible ;
  la garantie stricte peut casser des cas légitimes).
- **Extraction d'une brique Zod partagée** pour la sémantique `(startMs, endMs)` : le couple
  apparaît dans au moins trois schémas (`transcriptionSegmentSchema` shared, `socketTranscriptionSegmentSchema`
  gateway, `stretches[]` de `messages-schemas.ts` — `startMs=0, endMs=500, endedBy: 'pause'`).
  Chaque site porte sa propre paire `min(0)` sans invariant temporel jusqu'ici ; un
  `timeRangeMsSchema` mutualisant `startMs + endMs + refine(end >= start)` supprimerait la
  possibilité même de ce genre de dérive. Candidat propre pour une itération dédiée.
# Iteration 236 — CanvasV3 : deux intervalles temporels sans invariant `end ≥ start` (schéma) et un convertisseur v1→v3 qui pouvait émettre `bounds: {start:N, end:0}`

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
