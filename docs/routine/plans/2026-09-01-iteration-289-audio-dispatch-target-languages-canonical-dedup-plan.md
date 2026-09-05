# Plan — Itération 289 — Canonicalisation + dédup des langues cibles au dispatch AUDIO

## Objectifs
Aligner la branche EXPLICITE de résolution des langues cibles du chemin audio
(`MessageTranslationService.processAudioAttachment`) sur la forme canonique + dédupliquée
que le chemin texte et la branche dérivée emploient déjà, pour supprimer le travail
de traduction ML + TTS dupliqué et les cibles invalides produits par les variantes
région-taguées / casse mixte fournies par un appelant.

## Modules affectés
- `services/gateway/src/services/message-translation/MessageTranslationService.ts` (production)
- `services/gateway/src/__tests__/unit/services/MessageTranslationService.audio.test.ts` (témoins)

## Phases
1. **RED** — Ajouter deux témoins de comportement dans le describe `translateAttachment()` :
   variante région-taguée + casse-mixte dédupliquée en une cible, canonicalisation
   underscore/région multi-langues. Prouver l'échec contre le passage verbatim.
2. **GREEN** — Ajouter le helper pur privé `_canonicalizeExplicitAudioTargets`
   (canonicalise via SSOT `normalizeLanguageCode` + dédup ordre-préservant), et
   l'appliquer à la branche explicite de `processAudioAttachment`.
3. **Validation** — Suites `MessageTranslationService*` + `tsc --noEmit` gateway.

## Dépendances
Aucune. `normalizeLanguageCode` déjà importé et consommé dans le fichier.

## Risques estimés
Très faible. La canonicalisation ne fait que RESSERRER l'ensemble sortant ; les
codes déjà canoniques sont idempotents ; repli historique préservé pour tout code
rejeté par la SSOT. Format du fil ZMQ inchangé. Branche dérivée et fallback dur
inchangés. Fichier distinct de #4590 → pas de conflit.

## Stratégie de rollback
Revert du commit : un helper pur + une ligne de branche + un bloc de témoins.
Sans état persisté, aucune migration.

## Critères de validation
- 2 témoins RED → GREEN (mesuré par restauration du verbatim).
- 127/127 sur `MessageTranslationService.audio`.
- 269/269 sur les 5 suites `MessageTranslationService`.
- `tsc --noEmit` gateway : EXIT=0.

## Statut
**Livré.** Analyse : `docs/routine/analyses/2026-09-01-iteration-289-audio-dispatch-target-languages-canonical-dedup-analyse.md`.

## Améliorations futures (suivi)
- Issue de fond « normaliser les codes de langue à l'écriture » (ferme la classe
  entière des résolveurs aval) — à ouvrir sur GitHub.
- Retrait de la langue source sur le chemin audio (source détectée par Whisper,
  inconnue au dispatch) — à trancher si le translator expose la source en amont.
- `sendStoryTextObjectRequest` : vérifié conforme (cibles via
  `PostService.audienceLanguages`, canonicalisé au cycle 287).
