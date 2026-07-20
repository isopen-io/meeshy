# Live Call Captions (transcription + traduction en appel) — Design

**Date**: 2026-07-10
**Statut**: Approuvé (brainstorming), en attente du plan d'implémentation

## Contexte

PR #1795 (`fix(ios/calls): remove dead live-call-transcription feature`) proposait de supprimer
`CallTranscriptionService.swift` (582 lignes) + son câblage `CallManager`/`CallView`/`WebRTCService`
en le qualifiant de code mort irrécupérable, sur la base d'un blocage réel mais mal cadré : le
build WebRTC public n'expose pas `factory.audioDeviceModule`, donc capturer l'**audio distant**
(décodé par WebRTC) n'est pas possible sans build custom.

Cette PR a été mise en **draft** et commentée (2026-07-10) plutôt que mergée, pour les raisons
suivantes :

1. Elle résolvait unilatéralement un point explicitement marqué **« décision produit requise »**
   dans `apps/ios/tasks/ios-simplification-passes-2026-06-24.md` (2026-06-24), sans validation humaine/produit.
2. Le blocage ADM ne concerne que l'**audio distant** — l'audio **local** (son propre micro) est
   capturable indépendamment de WebRTC via un tap `AVAudioEngine`, ce qui n'a jamais été évalué
   avant la décision de suppression.
3. Le gateway a **déjà** un pipeline complet, testé et durci pour exactement cet objectif
   (`CallEventsHandler.ts` : `call:transcription-segment` → traduction ZMQ par participant →
   `call:translated-segment`), durci pour la dernière fois le 2026-07-09 (`#1744`) — la veille de
   la PR de suppression — et **consommé par aucun client** (ni iOS ni web). L'architecture
   leader/follower + DataChannel P2P que le code supprimé essayait de construire résolvait un
   problème que le backend avait déjà résolu autrement.

## Objectif & scope

Sous-titres live traduits pendant un appel **1:1** (iOS ne supporte pas les appels de groupe
aujourd'hui — hors scope). Activation par **toggle manuel** dans l'UI d'appel (pas d'auto-activation).
Reconnaissance vocale **strictement on-device** — jamais de fallback vers les serveurs de
reconnaissance vocale d'Apple, y compris quand le modèle on-device ne supporte pas la langue du
locuteur (dans ce cas : transcription indisponible pour lui, pas de dégradation silencieuse vers
le cloud). Décisions produit validées avec l'utilisateur pendant le brainstorming — voir
« Décisions actées » ci-dessous.

## Architecture

Principe directeur : **chaque device ne transcrit jamais que sa propre voix**, jamais l'audio
distant. Ça élimine complètement le blocage ADM (qui ne concerne que l'audio distant) et supprime
le besoin de toute négociation de rôle leader/follower — chaque device est symétriquement
responsable de son propre flux sortant.

```
Locuteur (device A)                          Gateway                    Auditeur (device B)
─────────────────────                        ────────                   ─────────────────────
AVAudioEngine tap (mic local, post-CallKit didActivate)
  → SFSpeechRecognizer (on-device only, requiresOnDeviceRecognition=true)
  → segment final (isFinal=true)
  → socket emit "call:transcription-segment" → traduction ZMQ (pipeline existant, inchangé) → socket "call:translated-segment"
                                                                                                 → affichage sous-titre attribué au locuteur
```

Aucune capture, ni tentative de capture, de l'audio distant à aucune étape. Le DataChannel WebRTC
`"transcription"` (label générique, partagé avec `bye`/keep-alive) **n'est pas réutilisé** pour ce
flux — le transport est le socket d'appel déjà connecté (`MessageSocketManager`), pas WebRTC.

### Phase 0 — Spike de validation technique (bloquant, device réel)

Avant tout investissement dans le reste du build : un prototype jetable qui installe un tap
`AVAudioEngine` sur `inputNode` pendant un appel CallKit actif (démarré après
`provider:didActivate:`, jamais avant — même contrainte que WebRTC lui-même documente dans
`P2PWebRTCClient.swift`), et vérifie sur device réel (pas simulateur — la session audio
CallKit/WebRTC n'a pas de parité fiable en simulateur) :

- L'audio de l'appel (les deux sens, WebRTC) reste inchangé pendant que le tap est actif.
- Les buffers PCM du tap sont exploitables (pas de silence, pas de corruption).
- `AVAudioEngine.start()` ne perturbe pas `RTCAudioSession.useManualAudio = true` ni les
  transitions `didActivate`/`didDeactivate` déjà fragiles (cf. les nombreux commentaires
  `[AUDIO_FALLBACK]`/`AUDIO_FALLBACK` dans `CallManager.swift`).
- Comportement à l'interruption audio (autre appel, Siri, etc.) et à la bascule speaker/écouteur.

**Critère d'arrêt** : si le tap dégrade l'audio d'appel de façon non résolvable, le projet
s'arrête ici — coût contenu, décision documentée dans le plan d'implémentation.

### Phase 1 — Build (si le spike passe)

Composants détaillés dans la section suivante.

## Composants

| Composant | Emplacement | Rôle |
|---|---|---|
| `CallTranscriptionService` (réintroduit, restructuré — retire tout le modèle leader/follower/rôle/DataChannel de l'ancienne version) | `apps/ios/Meeshy/Features/Main/Services/` — **app**, pas SDK (orchestration cascade AVAudioEngine + Speech + socket liée aux décisions du cycle de vie d'un appel — test du grain SDK Purity de `apps/ios/CLAUDE.md`) | Possède le tap `AVAudioEngine` (démarré après CallKit `didActivate`, arrêté avant `didDeactivate`/à la fin d'appel), pilote `SFSpeechRecognizer` (on-device only), appelle le SDK pour émettre les segments finaux et s'abonne aux segments traduits reçus |
| `emitCallTranscriptionSegment(callId:segment:)` + publisher `callTranslatedSegmentReceived` | `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` — **SDK** (atome socket typé, même pattern que `emitCallQualityReport`/`callOfferReceived` déjà en place) | Émission/réception typée du wire contract `CallTranscriptionSegmentEvent`/`call:translated-segment` (miroir des types `packages/shared/types/video-call.ts`), zéro logique de décision |
| `CallView.showTranscript` + `transcriptOverlay` (réintroduits, câblés cette fois) | `CallView.swift` | Bouton toggle manuel (le point d'entrée UI qui manquait dans le code supprimé — `showTranscript` n'était jamais mis à `true`) ; affichage des sous-titres par locuteur, dans la langue déjà traduite côté serveur |
| Simplification du gate `translationEnabled` mort | `services/gateway/src/socketio/CallEventsHandler.ts` | Aujourd'hui `metadata.translationEnabled` n'est jamais mis à `true` en dehors des tests. **Décision** : retirer ce gate plutôt que construire un moyen de l'activer — le vrai contrôle produit est déjà « le locuteur a activé son toggle côté client » (aucun segment n'est émis sinon). Le handler tente la traduction pour tout segment `isFinal` reçu dès qu'il existe au moins une langue cible différente parmi les participants actifs, sans dépendre de `callSession.metadata`. |

### Hors scope de ce build (dette signalée, pas traitée ici)
- `CallTranscriptionRoleEvent`/`CALL_EVENTS.TRANSCRIPTION_ROLE` (`packages/shared/types/video-call.ts`) : type déclaré dans le wire contract, aucun handler gateway. Mort, à supprimer en follow-up.
- Résolution de langue du destinataire côté gateway (`translateAndEmitSegment`) n'utilise que `systemLanguage`, pas la chaîne complète `resolveUserLanguage()` (regionalLanguage/customDestination/deviceLocale). Amélioration future, pas bloquant pour ce build.

## Décisions actées (brainstorming 2026-07-10)
1. **Objectif** : sous-titres traduits (Prisme Linguistique), pas juste un transcript brut mono-langue.
2. **Confidentialité STT** : strictement on-device, jamais de fallback serveur Apple.
3. **Activation** : toggle manuel dans l'appel, jamais automatique.
4. **Approche technique** : capture locale uniquement + pipeline gateway existant (Approche A), avec spike de validation technique en préalable au reste du build.

## Flux de données détaillé
1. Utilisateur active le toggle dans `CallView` → `CallManager.toggleTranscription()` → `CallTranscriptionService.requestPermission()` (si pas déjà `.authorized`) → si accordé, démarre le tap `AVAudioEngine` + `SFSpeechRecognizer` local uniquement.
2. Chaque résultat `isFinal=true` du recognizer → `MessageSocketManager.emitCallTranscriptionSegment(callId:, segment:)`.
3. Gateway (`CallEventsHandler.handleTranscriptionSegment`, inchangé) valide, autorise, traduit vers chaque participant actif, émet `call:translated-segment` à la salle.
4. Chaque device (y compris le locuteur, qui reçoit son propre segment en retour avec `sourceLanguage == targetLanguage`) reçoit via `callTranslatedSegmentReceived` → `CallTranscriptionService` ajoute le segment à son buffer d'affichage, attribué à `speakerId`.
5. Fin d'appel ou toggle désactivé → arrêt du tap, `stopTranscribing()`/`resetForCallEnd()` (logique de purge inconditionnelle conservée du code supprimé — un follower recevait sinon les segments de l'appel précédent).

## Gestion d'erreurs
- Permission refusée → toggle reste désactivé, message discret non bloquant pour l'appel.
- Langue du locuteur non supportée on-device → toggle grisé pour ce device avec message explicite ; jamais de fallback cloud.
- Timeout/échec traduction côté gateway → déjà géré serveur (fallback texte original, `sourceLanguage == targetLanguage`) ; le client affiche tel quel sans traitement d'erreur supplémentaire.
- Perte réseau du socket d'appel → segments non émis sont simplement perdus (pas de file d'attente/retry — un sous-titre manqué n'est pas critique, contrairement à un message).
- Fin d'appel → purge inconditionnelle (cf. flux ci-dessus).
- Conflit tap `AVAudioEngine` / session CallKit détecté en Phase 0 → voir critère d'arrêt du spike.

## Tests
- `CallTranscriptionServiceTests` (XCTest, protocole `CallTranscriptionServiceProviding`, mock du socket manager) : start/stop/permission/réception de segments — même structure que les tests supprimés par #1795, adaptée au nouveau contrat (plus de rôle/leader/follower).
- Tests gateway existants (`CallEventsHandler-transcription-translation.test.ts`, etc.) restent verts sans modification, sauf si le gate `translationEnabled` est simplifié (auquel cas mise à jour ciblée).
- Validation device réelle obligatoire (spike Phase 0, puis QA finale audio d'appel + sous-titres simultanés) — non fiable en simulateur.

## Risques
| Risque | Sévérité | Mitigation |
|---|---|---|
| Tap `AVAudioEngine` dégrade l'audio d'appel (zone historiquement fragile) | Élevée | Spike Phase 0 avant tout le reste |
| Latence perçue traduction (aller-retour ZMQ par segment) | Moyenne | Déjà bornée à 10s côté gateway avec fallback ; à mesurer en pratique pendant le build |
| Consommation batterie/CPU (STT on-device + appel déjà coûteux en CPU) | Moyenne | Mesurer en Phase 1, limiter aux segments `isFinal` uniquement (pas de partiels envoyés) |
