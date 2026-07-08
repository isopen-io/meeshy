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
             ├─ « Activer »  → UserPreferencesManager.grantVoiceAutoTranslationConsent()
             │                 (espace de préférences — PATCH
             │                 /me/preferences/application + /audio via l'outbox)
             │                 → relance sendMessageWithAttachments()
             └─ « Plus tard » → relance l'envoi tel quel (audio non transcrit,
                                comportement actuel ; la note inline
                                AudioConsentNotice reste le rappel discret)
```

### Source de vérité : l'espace de préférences (même API en lecture et écriture)

- **Lecture** : `UserPreferencesManager.voiceConsentGranted`
  (`application.voiceProfileConsentAt != nil`) — repli legacy sur
  `VoiceProfileService.getConsentStatus()` uniquement quand les préférences
  sont muettes (consentement historique accordé via le wizard, champs User).
- **Écriture** : `UserPreferencesManager.grantVoiceAutoTranslationConsent()`
  pose de manière idempotente la chaîne de consentements dans
  `application` (`dataProcessingConsentAt` → `voiceDataConsentAt` →
  `voiceProfileConsentAt` → `voiceCloningConsentAt`/`voiceCloningEnabledAt`)
  ET les features `audio` (transcription, traduction audio, TTS, profil
  vocal) — local-first, synchronisé par l'outbox des préférences sur la
  MÊME API que toute autre préférence.
- Le gateway (`ConsentValidationService`) lit déjà ces champs avec priorité
  `UserPreferences.application` > `User` ; le `ApplicationPreferenceSchema`
  (shared) porte désormais ces cinq timestamps (Zod strippait silencieusement
  les clés inconnues), et `validateApplicationPreferences` reconnaît l'octroi
  same-request (le PATCH qui accorde `dataProcessingConsentAt` ne peut pas
  être rejeté pour `telemetryEnabled: true` présent dans le même corps).
- Décision pure testable : `ConversationView.shouldPromptVoiceConsent`
  (`VoiceConsentPromptGatingTests`) ; octroi testé dans
  `UserPreferencesManagerTests`.
- Jamais bloquant : l'écriture est locale immédiate, l'envoi repart dans
  tous les cas. Le wizard voix conserve son endpoint dédié
  `POST /voice-profile/consent` (réparé, voir ci-dessous).

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
