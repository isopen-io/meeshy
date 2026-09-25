## 2026-07-04 : Calling architecture — decisions.md pointe vers les specs superpowers (pas de duplication)

**Statut**: Accepte

**Contexte**: Un audit du sous-systeme d'appel (WebRTC/CallKit/PushKit, `CallManager.swift`, `P2PWebRTCClient.swift`, `WebRTCService.swift`, `WebRTCTypes.swift`) a note que ce fichier ne contenait aucune entree dediee a l'architecture d'appel, alors que le sujet a deja fait l'objet de plusieurs rondes de conception formelles ailleurs dans le repo.

**Decision**: Les ADR canoniques pour le systeme d'appel vivent dans `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` (section 10 — 7 ADRs : moteur media libwebrtc, facade `@MainActor CallManager` + `actor CallEventQueue` pour serialiser les entrees concurrentes socket/CallKit/WebRTC/reseau, verrouillage optimiste Prisma `version` sur `CallSession`, `setCodecPreferences` plutot que SDP munging sauf pour `transport-cc`, session audio `.voiceChat` pour la Voice Isolation OS, appels anonymes limites au socket actif sans PushKit, bus `MediaPipelineHook` pour extensibilite future). Ce fichier ne duplique pas ces decisions — il pointe vers la source, conformement a l'esprit "decisions.md par package" mais sans re-ecrire un contenu deja arbitre ailleurs. Voir aussi `docs/superpowers/specs/2026-03-29-webrtc-p2p-calling-design.md` (spec Phase 1) et `docs/superpowers/specs/2026-06-20-ios-call-pip-and-hardening-design.md` (PiP + hardening).

**Verification faite lors de l'audit** (aucun changement de code requis) :
- `P2PWebRTCClient.swift` contient deux declarations de `final class P2PWebRTCClient` (ligne ~37 et ~1602) correctement isolees par `#if canImport(WebRTC) / #else / #endif` — pas un doublon accidentel.
- `WebRTCService.swift` (@MainActor, 613 lignes) n'est pas un legacy dupliquant `P2PWebRTCClient.swift` (1650 lignes) : c'est la couche de politique/isolation d'acteur (ADR-2 ci-dessus) qui delegue au `client: any WebRTCClientProviding`. Les deux fichiers ont des responsabilites distinctes et doivent coexister.

**Alternatives rejetees**: dupliquer le contenu des specs superpowers dans ce fichier — rejete, cree un risque de divergence entre deux sources de verite pour la meme decision.
