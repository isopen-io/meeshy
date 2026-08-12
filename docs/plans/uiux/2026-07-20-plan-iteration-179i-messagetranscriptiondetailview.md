# Plan — Iteration-179i — MessageTranscriptionDetailView (a11y VoiceOver)

**Base**: `main` HEAD `70dd5695` (169i mergé)
**Branche**: `claude/laughing-thompson-yfiky7`
**Analyse**: `docs/analyses/uiux/2026-07-20-iteration-179i-messagetranscriptiondetailview.md`

## Tâches (TDD non applicable — a11y modifiers pures, gate = CI iOS Tests)

1. [x] Bandeau langue/confiance/durée → 1 élément VoiceOver labellisé (`transcriptionBannerA11yLabel`), icône masquée.
2. [x] Segments mot-à-mot `FlowLayout` → `.accessibilityHidden(true)` (redondant avec texte plein).
3. [x] Compteur locuteurs → `.combine` + icône masquée.
4. [x] Cartes pièce jointe (état vide) → `.combine` + icône masquée.
5. [x] État vide hero + bouton Transcrire → icône masquée, label explicite + `.accessibilityValue` d'état de chargement.
6. [x] En-tête « Traductions audio » → icône masquée + `.isHeader`.
7. [x] Lignes traduction audio → 1 élément labellisé (`audioTranslationA11yLabel`).
8. [x] Helper `spokenDuration` natif (`DateComponentsFormatter`, locale-aware) pour remplacer « 0:12 ».
9. [x] 4 clés i18n neuves (fr/en/de/es/pt-BR), insérées sans reformater le xcstrings (0 suppression).

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift` (+57)
- `apps/ios/Meeshy/Localizable.xcstrings` (+140, 4 clés × 5 locales)

## Non-régression
- 0 changement de logique métier / comportement visuel. Aucune police ni couleur modifiée.
- Icônes SF Symbols figées inchangées (seulement `.accessibilityHidden`).
- Diff xcstrings = insertion pure (aucune entrée existante reformatée).

## Vérification
- Relecture du diff : cohérence des champs modèles (`MessageTranscription`,
  `MessageTranslatedAudio`) — tous déjà utilisés dans le fichier d'origine.
- Gate CI : « iOS Tests » (compile Xcode 26.1.1 / run simu 18.2).
