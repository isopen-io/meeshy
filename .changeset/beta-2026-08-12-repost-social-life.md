---
"@meeshy/gateway": patch
"@meeshy/web": patch
"@meeshy/shared": patch
---

Beta 2026-08-12 — vie sociale des reposts, effectifs de conversation, messages éphémères

**Gateway (backend).**

- Un repost de STORY/STATUS garde désormais **sa propre** vie sociale. La redirection des interactions vers la racine — la règle des reposts simples — est levée quand cette racine est éphémère, parce que le repost porte son propre instantané (média/audio/`storyEffects` dupliqués à la création). Deux défauts disparaissent : les like/commentaires ne partent plus vers la racine en `story:reacted` pour une action posée sur une carte de feed, et le repost ne devient plus définitivement 404 dès qu'`ExpiredStoriesCleanupService` soft-supprime la racine (~7 j après expiry) alors que la carte reste affichée. Lecture (`PostService.getPostById`, `PostFeedService.resolveUserReactionsMap`) et écriture (`resolveRedirectTarget`) partagent le même prédicat `isEphemeralPostType`, pour qu'elles ne puissent pas diverger.
- `post:join` / `post:leave` suivent enfin la même redirection que la lecture du fil : un viewer ouvrant le fil d'un repost simple rejoignait la room du repost quand tous les broadcasts partent vers celle de la racine — il ne recevait plus aucun événement. `leave` est redevenu symétrique, sans quoi la vraie room ne se libérait jamais.
- `conversation:participant-joined` : nouvel événement, symétrique de `participant-left`, émis vers les rooms personnelles des membres. `conversation:joined` ne pouvait pas porter ce fait — le gateway l'émet aussi comme ack self-only à chaque ouverture de fil.
- Départ, retrait et ajout de participant atteignent tous les membres et non plus la seule room du fil ouvert.
- `GET /me/preferences/encryption` rapporte préférence de chiffrement et état des clés Signal, en lisant l'existence réelle d'un `SignalPreKeyBundle` actif plutôt que les colonnes miroir jamais renseignées.
- Un message rappelé par son auteur ne reste plus lisible en clair dans l'inbox de mentions ; ses liens courts sont désactivés et ses notifications retirées.

**Web (frontend).**

- L'effectif d'un groupe ne dérive plus : il grossissait d'une unité à chaque ouverture du fil et en perdait une à chaque fermeture, les deux erreurs se compensant sans jamais s'annuler. L'incrémentation passe sur `conversation:participant-joined` ; `conversation:joined` ne fait plus qu'invalider la liste des participants.

**Shared.**

- Types et payloads de `conversation:participant-joined`, alignés sur le socle d'événements existant.

**iOS.** Chrome global unifié — bannière d'appel en `safeAreaInset` pleine largeur et point de montage unique du SyncPill ; tray de stories qui ne se coupe plus silencieusement à 50 ; effectif de conversation qui ne peut plus que décroître.
