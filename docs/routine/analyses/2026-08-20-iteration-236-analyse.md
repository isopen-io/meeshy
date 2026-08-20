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
