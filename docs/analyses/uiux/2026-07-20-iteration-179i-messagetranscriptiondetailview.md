# Iteration-179i — MessageTranscriptionDetailView (a11y VoiceOver)

**Date**: 2026-07-20
**Scope**: iOS-only
**Target**: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift`
**Type**: Accessibility (VoiceOver) + native locale-aware duration formatting

## Contexte

`MessageTranscriptionDetailView` est l'onglet « Transcription » d'un message
(transcription Whisper + traductions audio TTS). C'est un contenu central du
Prisme Linguistique (transcription + retraduction audio). Le fichier (354 lignes)
ne contient **aucun** modificateur d'accessibilité — VoiceOver lit chaque fragment
visuel de façon décousue et redondante.

## Diagnostic VoiceOver (avant)

| # | Zone | Problème |
|---|------|----------|
| 1 | Bandeau langue + confiance + durée (l.94-128) | 4 fragments lus séparément (icône, nom langue, « 95% », « 0:12 »). L'icône `waveform.and.mic` décorative est vocalisée. « 0:12 » lu « zéro douze » sans contexte. |
| 2 | Segments mot-à-mot `FlowLayout` (l.143-157) | Redondant avec le texte plein (l.131) — VoiceOver relit tout le texte une 2e fois, mot par mot. La coloration locuteur est purement visuelle. |
| 3 | Compteur locuteurs (l.164-174) | Icône `person.2.fill` décorative vocalisée ; texte non groupé. |
| 4 | Cartes pièce jointe (vide) (l.182-209) | Icône décorative vocalisée ; nom + durée non groupés. |
| 5 | État vide + bouton Transcrire (l.212-244) | Icône hero décorative vocalisée ; bouton sans état de chargement annoncé (le `ProgressView` remplace l'icône sans feedback VoiceOver). |
| 6 | En-tête « Traductions audio » (l.257-264) | Icône `translate` décorative vocalisée. |
| 7 | Lignes traduction audio (l.271-306) | Drapeau emoji + nom + badge « Clone » + durée + transcription lus en fragments ; « Clone » cryptique ; « 0:12 » mal lu. |

## Décisions

- **Bandeau** : `.accessibilityElement(children: .ignore)` + label composé
  « Transcription en {langue}, confiance {N} %, {durée parlée} ».
- **Durée parlée** : `DateComponentsFormatter` (`.full`, `[.minute,.second]`) —
  natif, locale-aware, **zéro chaîne à traduire** (« 12 secondes » / « 12 seconds »
  / « 12 Sekunden » automatiquement). Remplace le rendu ambigu « 0:12 » côté a11y.
- **Segments mot-à-mot** : `.accessibilityHidden(true)` — redondant avec le texte
  plein déjà lu ; la coloration locuteur n'apporte rien en audio.
- **Compteur locuteurs / cartes attachement / en-tête audio** :
  `.accessibilityElement(children: .combine)` + icônes `.accessibilityHidden(true)`.
- **Bouton Transcrire** : label explicite + `.accessibilityValue` d'état de
  chargement quand `isRequestingTranscription`.
- **Lignes traduction audio** : `.accessibilityElement(children: .ignore)` + label
  composé « {langue}, voix clonée, {durée parlée}, {transcription} ».

## Nouvelles clés de localisation (5 locales : fr/en/de/es/pt-BR)

- `a11y.transcription.in-language` = « Transcription en %@ »
- `a11y.transcription.confidence` = « confiance %d %% »
- `a11y.transcription.in-progress` = « Transcription en cours »
- `a11y.audio.cloned-voice` = « voix clonée »

## Périmètre

- 1 fichier Swift, 4 clés i18n neuves, 0 changement de logique métier /
  comportement visuel. Icônes figées inchangées (juste masquées à VoiceOver).
- Gate : CI « iOS Tests ».

## Statut : ✅ implémenté (voir plan associé)
