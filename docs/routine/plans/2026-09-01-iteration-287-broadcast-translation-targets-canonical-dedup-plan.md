# Plan — Itération 287 : `BroadcastTranslationService` canonicalise ses langues cibles (SSOT `normalizeLanguageForDedup`)

## Objectifs

Retirer le second agrégat de cibles de traduction du gateway resté sur des codes
`systemLanguage` verbatim (suivi de l'itération 286). Faire descendre la
canonicalisation-avec-dedup au frontière de service `translateContent`, de sorte
que le translator ne reçoive que des codes NLLB canoniques, dédupliqués par
langue réelle, et que la langue source soit exclue quelle que soit sa forme.

## Modules affectés

- `services/gateway/src/services/admin/broadcast-translation.service.ts`
  (production — import + filtre/dedup)
- `services/gateway/src/__tests__/unit/services/admin/broadcast-translation.service.test.ts`
  (4 nouveaux pins)
- `docs/routine/analyses/…-iteration-287-…md`, `docs/routine/plans/…-iteration-287-…md`

## Phases

1. **RED** — 4 témoins dans le fichier de tests : (a) cible `'pt-BR'`
   canonicalisée en `'pt'` avant l'appel axios, (b) `['fr','fr-FR','FR','fr_FR']`
   ⇒ un seul appel batch, 2 requêtes, toutes `target_language:'fr'`, (c) source
   `'en'` + cibles `['en-US','EN']` ⇒ aucun appel axios, (d) source `'pt-BR'` +
   cible `['pt']` ⇒ aucun appel axios. ✅ tombent sur le code courant (4 échecs).
2. **GREEN** — importer `normalizeLanguageForDedup`, canonicaliser la source, et
   `[...new Set(targets.map(normalizeLanguageForDedup).filter(l => l !== '' && l
   !== canonicalSource))]`. ✅ 16/16.
3. **Non-régression** — 7 suites broadcast + i18n de cadrage (188 tests),
   `tsc --noEmit` gateway. ✅
4. **Docs + commit + push.**

## Dépendances

Aucune. Isolé au service et à son fichier de tests. Seul appelant de
`translateContent` = `routes/admin/broadcasts.ts` (vérifié).

## Risques estimés

Faibles. La canonicalisation ne fait que RESSERRER l'ensemble sortant (moins de
travaux, jamais plus) et préserve l'ordre. Codes canoniques idempotents (12 pins
existants inchangés). Le côté lecture canonicalisait déjà ses clés — l'écriture
s'y aligne.

## Stratégie de rollback

Revert du commit (un import + un bloc de filtre/dedup + un bloc de tests). Aucune
migration, aucun changement de contrat, aucun état persistant modifié.

## Critères de validation

- RED prouvé au runtime (4 échecs sur le code courant).
- GREEN : `broadcast-translation.service.test.ts` 16/16.
- 7 suites broadcast + i18n de cadrage vertes (188 tests).
- `tsc --noEmit -p services/gateway/tsconfig.json` EXIT=0.

## Statut d'achèvement

**Terminé.** Toutes les phases livrées et validées (RED→GREEN prouvé,
188 tests verts, typecheck vert, docs écrites).

## Suivi / améliorations futures

- `ZmqRequestSender.ts:85` (`.toLowerCase()` dedup des cibles du pipeline de
  MESSAGES) — troisième agrégat, surface ZMQ plus large, itération dédiée.
- `broadcast.targetLanguages` persisté verbatim (métadonnée non consommée) —
  cohérence optionnelle, non planifié.
