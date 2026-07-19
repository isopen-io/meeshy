# Plan — Itération 165i : `MessageTranscriptionDetailView` (VoiceOver)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-smdrpy`
**Base** : `main` HEAD (`efedb69e4`) · **Gate** : CI `iOS Tests`

## Objectif

Rendre l'onglet « Transcription » du détail message lisible par VoiceOver, sans changement
visuel ni logique. Cible non traitée (`sys=1 rel=0 a11y=0`), nommée comme candidat a11y
MessageDetail en 160i/153i.

## Étapes (TDD light — a11y additive, 0 test neuf)

1. [x] Resync branche sur `main` HEAD (branche stale 10761 commits derrière → `checkout -B`).
2. [x] Repérer la cible : `MessageTranscriptionDetailView` (Dynamic Type déjà OK ; gaps VoiceOver réels).
3. [x] Bannière langue/confiance/durée → `.accessibilityElement(children: .ignore)` + label composé
       (`transcriptionBannerA11yLabel`) énonçant la confiance en contexte.
4. [x] Helper `durationA11yLabel(_:)` → durée contextualisée sur les rangées de traduction audio.
5. [x] Masquer 5 icônes de tête décoratives + le glyphe d'état vide 28pt (`.accessibilityHidden`).
6. [x] Grouper les rangées multi-parties (`.combine`) : locuteurs, carte attachment, en-tête
       traductions (+`.isHeader`), chaque rangée de traduction audio.
7. [x] 3 clés `.a11y` code-only (`defaultValue`, 0 édition xcstrings).
8. [x] Docs analyse + plan + branch-tracking.
9. [ ] Commit + push `claude/laughing-thompson-smdrpy`.

## Non-objectifs

- Pas de refonte visuelle, pas de logique, pas de nouveau test.
- Pas de traitement du seul `.font(.system(size:))` (glyphe décoratif figé — juste masqué).
- Sibling `MessageEditsDetailView` : hors périmètre (itération future).

## Vérification

- Revue manuelle de cohérence Swift (pas de toolchain macOS distante).
- Gate réel = CI `iOS Tests` sur la PR.
