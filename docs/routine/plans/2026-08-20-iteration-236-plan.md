# Iteration 236 — Plan : refine `endMs >= startMs` sur `socketTranscriptionSegmentSchema`

## Objectif
Poser sur le gate Socket.IO `call:transcription-segment`
(`services/gateway/src/validation/call-schemas.ts`) l'invariant temporel
`endMs >= startMs`, jumeau strict de la refine posée à l'itération 234 sur
`transcriptionSegmentSchema` (`packages/shared/utils/attachment-validators.ts`).
Sans quoi un segment inversé traverse le gate, est PERSISTÉ (`Transcription`),
ENVOYÉ au traducteur (ZMQ), et DIFFUSÉ à toute la salle d'appel — sans indice
d'origine, sans piste d'audit.

## Modules affectés
- `services/gateway/src/validation/call-schemas.ts` — ajout d'une `.refine()`
  sur l'objet `segment` interne de `socketTranscriptionSegmentSchema`.
- `services/gateway/src/__tests__/call-schemas.test.ts` — deux tests jumeaux
  qui gèlent (a) le rejet des bornes inversées, (b) l'admission des bornes
  égales (segment ponctuel).

## Phases

### Phase 1 — RED
Écrire les deux tests **avant** toute production. Le premier tombe rouge sur
`main`, le second passe déjà (documente la décision « bornes égales admises »).

Preuve RED (avant fix) :
```
Expected: false
Received: true
    608 |         },
    609 |       });
  > 610 |       expect(result.success).toBe(false);
```

### Phase 2 — GREEN
Envelopper l'objet `segment` interne d'un `.refine()` :
```ts
segment: z.object({...}).refine((s) => s.endMs >= s.startMs, {
  message: 'endMs must be greater than or equal to startMs',
  path: ['endMs'],
})
```
Docstring in-line citant :
- la parité stricte avec `transcriptionSegmentSchema` (`packages/shared/utils/attachment-validators.ts`, itération 234) ;
- le blast radius (persistance `Transcription` + ZMQ + broadcast temps réel `ROOMS.call(...)`).

### Phase 3 — Validation
- `bun run jest --config=jest.config.json src/__tests__/call-schemas.test.ts` → 78/78.
- `bun run jest --config=jest.config.json src/socketio/__tests__/CallEventsHandler.test.ts` → 254/254.
- `bun run jest --config=jest.config.json --testPathPatterns='(call-schemas|CallEventsHandler|messages-schemas)'` → 742/742.
- `bun run tsc --noEmit` (gateway) → 0 erreur.
- Full gateway suite (background) — aligné sur baseline.

## Dépendances
Aucune. La refine n'ajoute pas de type inféré nouveau et n'implique aucun autre
module.

## Estimated risks
- **Faible.** Le schéma n'a qu'un seul call site (`CallEventsHandler.ts:4209`)
  qui gère déjà `!validation.success` par `return` silencieux (:4210). Aucun
  émetteur légitime connu ne produit d'inversion (Whisper client + Web Speech
  API garantissent `end >= start` par construction). Le rejet transforme un
  chemin latent en chemin bloqué.
- **Rollback :** retirer les 4 lignes de `.refine()` et les 2 tests jumeaux.

## Validation criteria
- [x] Baseline `call-schemas.test.ts` verte au départ (76/76).
- [x] RED prouvé sur le premier test (avant fix).
- [x] GREEN sur `call-schemas.test.ts` (78/78).
- [x] `CallEventsHandler.test.ts` inchangée (254/254).
- [x] Pattern `(call-schemas|CallEventsHandler|messages-schemas)` : 742/742 (37 suites).
- [x] `tsc --noEmit` (gateway) : 0 erreur.
- [ ] Full gateway suite (background) : aligné sur baseline.

## Completion status
- [x] RED écrit et prouvé.
- [x] GREEN posé.
- [x] Validations locales exécutées.
- [ ] Commit + push + PR + merge + delete de la branche.

## Progress tracking
- Baseline : 76/76 sur `call-schemas.test.ts`.
- Post-fix : 78/78 sur `call-schemas.test.ts` (+2 gardes).
- Adjacent suites (37) : 742/742.

## Future improvements
- **Parité Pydantic côté `services/translator`** (candidat 234 non retenu) :
  `TranscriptionSegment` (`services/translator/src/services/transcription_service.py`,
  `@dataclass`) ne porte AUCUN invariant `end_ms >= start_ms`. Environnement de
  cette itération sans `pydantic` ni la stack ML — à reprendre translator-ready.
- **Monotonie inter-segments** (`segments[i].startMs >= segments[i-1].startMs`) —
  arbitrage produit requis (diarisation entrelacée).
- **`timeRangeMsSchema` partagé** mutualisant `startMs + endMs + refine`. Trois
  sites concernés à ce jour : `transcriptionSegmentSchema` (shared),
  `socketTranscriptionSegmentSchema` (gateway), `stretches[]` de
  `messages-schemas.ts` (`startMs=0, endMs=500, endedBy: 'pause'`).
- **Candidats survey non retenus 233 → 234 → 235** (à reprendre) : markdown
  attachments routés vers le viewer texte (arbitrage produit) ; dépouillement des
  24 fabriques `jest.mock('@meeshy/shared', …)` mortes documentées dans
  `apps/web/CLAUDE.md`.
