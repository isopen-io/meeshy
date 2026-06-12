# Plan — UI/UX Iteration 42 (2026-06-12)

Base : main @ 1a238dd. Branche : `claude/blissful-ritchie-l66h8c`.
Continuité : solde les reports de l'itération 41 (cf. `branch-tracking.md` carry-over).

## Scope

### iOS (fait en direct)
- [x] SDK `MeeshyColors` : + `errorHex` ("F87171"), + `infoHex` ("60A5FA")
- [x] `SettingsView` : 36 littéraux hex → constantes MeeshyColors (mapping itération 41 étendu)
- [x] `NotificationSettingsView` : 38 littéraux → constantes
- [x] `DataExportView` : accent `3498DB`→`infoHex`, icône media `9B59B6`→`trackingAccent`
- [x] `ConversationView+Composer` : bandeau édition `F8B500`→`warning`/`warningHex`,
      panneau traduction `2ECC71`/`27AE60`→`success`, accents éphémère/blur/effets → hex constants
- [x] `ConversationView+MessageRow` : 4 couleurs de boutons d'action → constantes
- [x] `ConversationView+AttachmentHandlers` + fallback `secondaryColor` → constantes
- [x] `OnboardingView` : orbs → famille indigo (règle charte), gradients icône/bouton → tokens,
      logo light → `indigo950`, icône de page `accessibilityHidden(true)`
      (exception documentée : gradients d'ambiance par page conservés)
- [x] `ShareLinksView` + `TrackingLinksView` : textes → styles sémantiques Dynamic Type

### Web (agent)
- [x] `AudioEffectTile` : role=button + tabIndex + Enter/Espace + aria-label ; isolation clavier
      du Switch ; tests étendus
- [x] i18n namespace `audioEffects` (groupes timeline/transcription) sur en/fr/es/pt :
      `AudioEffectsPanel`, `AudioEffectsGraph`, `AudioControls`, `TranscriptionViewer`
- [x] SVG `<circle>` interactifs accessibles clavier (`AudioEffectsGraph`, `AudioEffectsOverview`)
- [x] Locale explicite : `AudioEffectsTimelineView`, `NotificationDropdown`
- [x] `create-link-button` : "Créer un lien" → t()

### Android (agent)
- [x] `values-es/` + `values-pt/` pour les 10 modules à ressources
- [x] `SettingsScreen` : retrait du clickable vide du header profil, Role.Button sur rows
      cliquables, spacing → échelle tokens si disponible
- [x] Vérifications : `MessageBubble` ReactionChip (conforme), `ChatScreen` SheetAction (conforme)

## Validation
- Web : tests jest ciblés (AudioEffectTile) + type-check
- Android : XML well-formed (pas de SDK Android dans l'env) ; compile Kotlin si gradle dispo
- iOS : substitutions conservatives (tokens 1:1) ; pas de build possible sur ce runner — CI

## Sortie
- Analyse : `docs/analyses/uiux/2026-06-12-iteration-42.md`
- PR vers main après CI verte, merge automatique, mise à jour `branch-tracking.md`
