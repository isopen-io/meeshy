# iOS — Popup de consentement vocal à l'envoi d'un audio

Date : 2026-07-08
Complète : `2026-06-22-ios-voice-consent-notice-design.md` (note inline sur les bulles).

## Objectif

Quand l'utilisateur ENVOIE un message vocal sans avoir validé le consentement
vocal, proposer via un popup l'activation de la traduction automatique. La
validation accorde en un geste :
1. le consentement de **définition du profil vocal** (`voiceRecordingConsent`
   → `voiceProfileConsentAt` + dépendances `voiceDataConsentAt`,
   `dataProcessingConsentAt`) ;
2. la **traduction utilisant ce profil** (`voiceCloningConsent` →
   `voiceCloningEnabledAt`) ;
3. les features audio correspondantes côté préférences
   (`transcriptionEnabled`, `audioTranslationEnabled`, `ttsEnabled`,
   `voiceProfileEnabled` — PATCH `/me/preferences/audio` via l'outbox).

## Flow

```
Tap envoyer (composer contient de l'audio)
  → shouldPromptVoiceConsent(hasAudio, consentMissing, alreadyPrompted) ?
      non → envoi normal
      oui → popup (UNE fois par session de conversation), composer INTACT
             ├─ « Activer »  → grantVoiceAutoTranslationConsent()
             │                 (POST /voice-profile/consent + prefs audio)
             │                 → relance sendMessageWithAttachments()
             └─ « Plus tard » → relance l'envoi tel quel (audio non transcrit,
                                comportement actuel ; la note inline
                                AudioConsentNotice reste le rappel discret)
```

- Décision pure testable : `ConversationView.shouldPromptVoiceConsent`
  (`VoiceConsentPromptGatingTests`).
- Octroi : `ConversationViewModel.grantVoiceAutoTranslationConsent()` —
  bascule aussi `voiceConsentMissing = false` (éteint les nudges inline).
- Échec d'octroi : toast d'erreur, l'envoi part quand même (jamais bloquant).

## Réparations de contrat associées (préexistantes, root cause)

1. **SDK ↔ gateway `/voice-profile/consent`** : les modèles Swift envoyaient
   `{consentGiven, ageVerification}` alors que le gateway exige
   `{voiceRecordingConsent, voiceCloningConsent?, birthDate?}`, et décodaient
   des booléens que le schema de réponse Fastify ne sérialise pas (seuls les
   trois timestamps passent). `VoiceConsentRequest`/`VoiceConsentStatus`/
   `VoiceConsentResponse` collent désormais au wire format ; les booléens
   (`hasConsent`, `voiceCloningEnabled`…) sont des propriétés dérivées.
2. **Gateway `ConsentValidationService`** : les gates lisaient des timestamps
   `audioPrefs.…EnabledAt` que rien n'écrit ; ils dérivent maintenant des
   booléens du `AudioPreferenceSchema` réellement stockés (défauts du schema
   respectés : transcription ON, traduction texte ON — Prisme —, traduction
   audio/TTS OFF), timestamps legacy prioritaires, et
   `User.voiceCloningEnabledAt` vaut consentement clonage. Tests :
   `src/__tests__/ConsentValidationService.test.ts` +
   `src/__tests__/unit/services/ConsentValidationService.test.ts`.
