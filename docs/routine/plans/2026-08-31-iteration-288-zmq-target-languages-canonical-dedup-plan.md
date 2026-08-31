# Plan — Itération 288 — Canonicalisation des langues cibles au dispatch ZMQ

## Objectifs
Aligner le jeu de langues cibles ENVOYÉ au translator sur le jeu SUIVI
(`pendingLanguages`) et sur la forme de solde, tous canoniques, pour supprimer le
travail de traduction dupliqué et les cibles invalides produits par les variantes
région-taguées / casse mixte.

## Modules affectés
- `services/gateway/src/services/zmq-translation/ZmqRequestSender.ts` (production)
- `services/gateway/src/services/zmq-translation/__tests__/ZmqRequestSender.test.ts` (témoins)

## Phases
1. **RED** — Ajouter trois témoins de comportement dans `ZmqRequestSender.test.ts` :
   variante région-taguée dédupliquée en une cible, canonicalisation multi-langues,
   symétrie envoyé ↔ suivi. Prouver l'échec contre le code `.toLowerCase()`.
2. **GREEN** — Canonicaliser `request.targetLanguages` via `canonicalLanguage`
   avant le `new Set` ; dériver `pendingLanguages` du jeu déjà canonique.
3. **REFACTOR** — Corriger le doc-comment de `canonicalLanguage` (les cibles ne
   partent plus verbatim).
4. **Validation** — Suites ZMQ/translation + `tsc --noEmit` gateway.

## Dépendances
Aucune. `canonicalLanguage` / `normalizeLanguageCode` déjà présents et consommés.

## Risques estimés
Très faible. La canonicalisation ne fait que RESSERRER l'ensemble sortant ; les
codes déjà canoniques sont idempotents ; repli historique préservé pour tout code
rejeté par la SSOT. Format du fil ZMQ inchangé.

## Stratégie de rollback
Revert du commit : deux lignes de production + un bloc de témoins. Sans état
persisté, aucune migration.

## Critères de validation
- 3 témoins RED → GREEN, 69 pins existants inchangés.
- 116/116 sur les deux suites `ZmqRequestSender`.
- 400/400 sur `zmq-translation` + `ZmqTranslationClient` + `MessageTranslationService`.
- `tsc --noEmit` gateway : EXIT=0.

## Statut
**Livré.** Analyse : `docs/routine/analyses/2026-08-31-iteration-288-zmq-target-languages-canonical-dedup-analyse.md`.

## Améliorations futures (suivi)
- La racine reste que `systemLanguage`/préférences sont persistés verbatim
  (`z.string().optional()`, aucune normalisation à l'écriture). Chaque résolveur
  aval doit canonicaliser. Une issue de fond « normaliser les codes de langue à
  l'écriture » fermerait la classe entière — à ouvrir sur GitHub, pas ici.
- Balayer les autres émetteurs ZMQ (`sendStoryTextObjectRequest`,
  `sendAudioProcessRequest`) pour vérifier qu'aucun ne dispatche des cibles non
  canonicalisées.
