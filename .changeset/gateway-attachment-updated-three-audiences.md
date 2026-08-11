---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

L'enrichissement d'une pièce jointe (transcription, audio traduit) atteint enfin les lecteurs qui ne sont pas dans le fil

`message:attachment-updated` — le delta émis quand Whisper finit de transcrire une note
vocale, puis quand NLLB+Chatterbox rendent chaque langue d'audio traduit — n'était diffusé
que dans la room `conversation:<id>`. Deux audiences le perdaient :

- **Le lecteur resté sur la liste de conversations.** iOS ne rejoint une room de
  conversation qu'à l'OUVERTURE du fil : au lancement de l'app, un lecteur sur la liste
  n'est dans aucune room de conversation. Son SDK applique pourtant ce delta sans regarder
  quel fil est ouvert (`ConversationSyncEngine.handleAttachmentUpdated` patche le message
  en cache de n'importe quelle conversation) — la room personnelle n'est donc pas une
  audience plus large pour le principe, c'est l'endroit où l'écriture atterrit vraiment.
- **Le lecteur hors ligne.** Le `message:new` mis en file à l'ENVOI porte la pièce jointe
  telle qu'elle était alors : sans transcription, sans audio traduit, les deux arrivant une
  à deux secondes plus tard. Sans rejeu de l'enrichissement, la copie rejouée à la
  reconnexion reste définitivement celle-là.

Même classe de défaut que l'aperçu de liste qui ne se retraduisait jamais : le Prisme
(« il s'applique à TOUT le contenu, transcriptions audio comprises ») dépendait de la
ROUTE du lecteur — avoir le fil ouvert au moment où Whisper a fini — et non de ses
préférences de langue.

L'émission chaîne désormais la room de conversation et les rooms personnelles de tous les
participants (une seule copie par socket, `emitToConversationParticipants`), et met
l'enrichissement en file pour les participants hors ligne sous le nouveau
`eventType: 'attachment-updated'`, rejoué en `message:attachment-updated` à la
reconnexion. La clé de dédup est l'id de la PIÈCE JOINTE : l'identité par défaut
`(messageId, eventType)` ferait superséder l'enrichissement de la première pièce jointe
par celui de la seconde sur un message à deux audios. Le payload n'est pas filtré par
langue du destinataire — les clients REMPLACENT la carte de traductions de la pièce
jointe, donc un sous-ensemble par lecteur effacerait les langues déjà en cache.

Une panne de la requête participants dégrade vers la room de conversation seule (l'audience
d'avant), jamais vers le silence.
