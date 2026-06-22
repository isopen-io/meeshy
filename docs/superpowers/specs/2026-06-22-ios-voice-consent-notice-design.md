# iOS — Note de consentement vocal sur les bulles audio

Date : 2026-06-22
Statut : Design validé, prêt pour plan d'implémentation.

## Problème

Quand un utilisateur envoie un message vocal mais n'a pas accordé le consentement
données vocales, le gateway **n'effectue ni transcription ni traduction** (log :
`User … lacks voice data consent for audio transcription`, requiert
`dataProcessingConsentAt + voiceDataConsentAt + audioTranscriptionEnabledAt`).
Côté destinataire, le vocal arrive sans transcription ni traduction — silencieusement.
L'expéditeur n'a aucun retour lui indiquant qu'il doit activer le consentement.

## Objectif

Afficher une **note inline discrète** sur les **propres** bulles vocales de
l'utilisateur (expéditeur) quand son consentement données vocales est OFF, l'invitant
à l'activer pour que ses audios soient **transcrits ET traduits** dans plusieurs
langues. Tap → écran Réglages (section transcription/voix). Conforme au Prisme
(indicateur subtil, pas de bannière intrusive).

## Détection (signal client)

- Le gateway bloque sur le **consentement données vocales**. Le client le lit via
  `VoiceProfileService.getConsentStatus() -> VoiceConsentStatus` (REST
  `GET /voice-profile/consent`) ; champ `hasConsent: Bool`.
- `voiceConsentMissing := !hasConsent`.
- Récupéré **une seule fois** (pas par bulle) et mis en cache côté app ; exposé comme
  primitif `Bool` aux vues.

## Architecture (SDK Purity)

- **SDK (atome pur)** — `MeeshyUI` : `AudioConsentNotice` (vue SwiftUI sans état,
  paramètres opaques, aucun singleton, aucune décision produit) :
  ```swift
  public struct AudioConsentNotice: View {
      public init(message: String, actionTitle: String, accentHex: String, onTap: @escaping () -> Void)
  }
  ```
  Style discret : icône (waveform/lock) + texte + chevron, fond `.ultraThinMaterial`
  teinté accent. C'est un building block agnostique.
- **App (orchestration)** :
  - Récupère le consentement (une fois) → `voiceConsentMissing: Bool` exposé par
    `ConversationViewModel` (ou un petit manager partagé), `@Published`, hors cellule.
  - Décision pure et testable :
    `shouldShowConsentNotice(isMe: Bool, voiceConsentMissing: Bool, isAudio: Bool) -> Bool`
    = `isMe && voiceConsentMissing && isAudio`.
  - Le `Bool` `voiceConsentMissing` est passé en **primitif** dans la construction de la
    bulle (`ThemedMessageBubble` → `BubbleContentBuilder` → champ optionnel sur le
    sous-modèle audio de `BubbleContent`), puis `AudioMediaView`
    (`apps/ios/.../Views/ConversationMediaViews.swift`) rend `AudioConsentNotice`
    sous le lecteur quand la décision est vraie.
  - Tap → navigation vers l'écran **Réglages** (section transcription/voix —
    `SettingsView` `transcriptionSection`/`voiceProfileSection`), où l'utilisateur
    active le consentement. (Choix produit : on ouvre les Réglages, pas le wizard
    directement.)

## Flux de données

```
App launch / ouverture conversation
  → VoiceProfileService.getConsentStatus() (1×, caché)
  → voiceConsentMissing: Bool (@Published, hors cellule)
  → passé en `let Bool` à la bulle (zéro @ObservedObject singleton dans la cellule)
  → BubbleContentBuilder calcule showConsentNotice (audio + isMe + voiceConsentMissing)
  → AudioMediaView rend AudioConsentNotice si vrai ; tap → Réglages
```

## Cas limites / erreurs

- Échec ou indisponibilité du statut consentement → `voiceConsentMissing = false`
  (fail-safe : **ne pas** afficher de faux nudge).
- Note jamais affichée sur les messages **reçus** (gate `isMe`).
- Affichée que sur les bulles **audio** (gate `isAudio`).
- Indépendante de l'état de transcription du message courant (si pas de consentement,
  il n'y aura jamais de transcription).
- Re-render : `voiceConsentMissing` passé en primitif `let` ; `AudioConsentNotice`
  Equatable ; pas d'observation de singleton dans la cellule (règle « Zero
  Unnecessary Re-render »).

## Hors périmètre

- Modifier le gateway / le modèle de consentement (on lit l'endpoint existant).
- La logique d'activation elle-même (le wizard/Settings existe déjà).
- Une bannière one-time/dismissible (rejeté : on a choisi la note inline).

## Tests (TDD)

- **SDK** : test de rendu de `AudioConsentNotice` (atome pur, params opaques) ; tap
  invoque `onTap`. Scheme `MeeshySDK-Package`.
- **App** : helper pur `shouldShowConsentNotice(isMe:voiceConsentMissing:isAudio:)` —
  table de vérité (seul `true/true/true` → true). XCTest, simu iOS 18.2.
- **App** : `voiceConsentMissing` reste `false` si `getConsentStatus()` échoue
  (fail-safe).

## Gate qualité

- `./apps/ios/meeshy.sh build` OK + tests ciblés sur simu 18.2.
- Nouveaux fichiers .swift → entrées pbxproj manuelles (xcodeproj classique).
- Localisation 5 langues du texte de la note (xcstrings).
