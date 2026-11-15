# Plan itération 288 — Canonicalisation de la langue source des sous-titres d'appel

## Objectifs

Aligner `CallEventsHandler.translateAndEmitSegment` sur sa jumelle chat
(`MessageTranslationService._normalizeSourceLanguage`) : canonicaliser la langue
source déclarée par le client (`data.segment.language`) via la SSOT
`normalizeLanguageForDedup` avant le regroupement par langue et le dispatch ZMQ.

## Modules affectés

- `services/gateway/src/socketio/CallEventsHandler.ts` (production)
- `services/gateway/src/__tests__/unit/socketio/CallEventsHandler-transcription-translation.test.ts` (témoins)

## Phases

1. **RED** — deux témoins :
   - segment `'fr-FR'` ⇒ source ZMQ attendue `'fr'`.
   - segment `'en-US'` + auditeur `'en'` ⇒ aucune requête de traduction, original
     servi avec `sourceLanguage: 'en'`.
2. **GREEN** — import `normalizeLanguageForDedup` ; `segmentLanguage` calculé une
   fois ; comparaison même-langue et source ZMQ sur `segmentLanguage` ;
   `buildTranslatedSegment` estampille des labels canoniques (source + cible).
3. **REFACTOR / validation** — suites d'appel complètes (658), `tsc --noEmit`.

## Dépendances

Aucune — `normalizeLanguageForDedup` existe déjà dans `@meeshy/shared`.

## Risques estimés

Faible. Idempotent pour les codes canoniques. La persistance du journal reste
brute (parité chat), donc le replay n'est pas modifié.

## Stratégie de rollback

Revert du commit unique ; aucune migration, aucun changement de schéma ou de
contrat de fil (seul un label de langue passe de brut à canonique).

## Critères de validation

Voir l'analyse : deux témoins RED→GREEN, `tsc` EXIT=0, 658/658 suites d'appel.

## Statut de complétion

- [x] RED
- [x] GREEN
- [x] Suites d'appel vertes (658/658)
- [x] tsc gateway EXIT=0
- [x] Suite socketio complète — 121 suites / 2404 tests verts (surface touchée : `socketio/` + SSOT `normalizeLanguageForDedup`)

## Améliorations futures

- Étudier si `persistTranscriptionSegment` doit persister un code canonique (le
  replay normaliserait alors à la lecture, comme le chat) — issue distincte si
  une divergence de replay est mesurée.
- Balayer les autres consommateurs de `data.segment.language` / codes de langue
  socket bruts pour d'éventuelles jumelles restantes.
