## Leçon 106 — une room n'est pas une audience : chercher QUAND le client la rejoint (2026-08-11, routine messaging, cycle 77)

`message:attachment-updated` diffusait dans `ROOMS.conversation(...)` depuis toujours, et
ça se relit comme correct : l'événement concerne une pièce jointe D'UN message DE cette
conversation, donc la room de la conversation. C'est un raisonnement sur le SUJET de
l'événement, pas sur l'audience réelle de la room.

Ce qui décide, c'est **le moment où le client rejoint cette room**. iOS n'émet
`conversation:join` qu'à l'OUVERTURE du fil (`roomsToRejoinOnConnect` ne rejoue que les
rooms déjà tenues) : au lancement de l'app, un lecteur resté sur la liste n'est dans AUCUNE
room de conversation. Une diffusion « à la room » n'atteint donc pas « les participants »,
elle atteint « ceux qui ont ouvert ce fil depuis le lancement ».

Trois gestes, dans cet ordre :

1. **Vérifier ce que le client FAIT du delta, pas seulement s'il l'écoute.** Ici le SDK
   applique le patch sans regarder quel fil est ouvert (`ConversationSyncEngine`, cache
   par conversation, no-op si le message est absent) alors que le ViewModel, lui, filtre
   sur la conversation courante. Deux écouteurs, deux portées : élargir l'audience n'a de
   valeur que parce que le PREMIER existe. Sans lui, on aurait payé de la bande passante
   pour rien.
2. **Un événement asynchrone doit se demander ce que portait la copie MISE EN FILE.** Le
   `message:new` d'une note vocale part avant Whisper : il porte la pièce jointe sans
   transcription. Rejouer ce `message:new` seul à la reconnexion, c'est garantir la
   version non enrichie — l'enrichissement doit sa PROPRE entrée de file.
3. **Élargir une audience oblige à re-poser la question du filtrage par destinataire.**
   `message:new` trime ses traductions par langue du lecteur ; ce delta ne le peut pas,
   parce que les clients REMPLACENT la carte de traductions au lieu de la fusionner — un
   sous-ensemble effacerait les langues déjà en cache. La bonne réponse n'est pas toujours
   « fais comme le voisin » : c'est « regarde la sémantique d'application côté client ».

Corollaire pour le balayage : `grep "to(ROOMS.conversation("` ne rend pas une liste de
fautes, il rend une liste de **questions**. Chaque site se juge sur trois audiences — dans
le fil, sur la liste, hors ligne — et sur ce que le client fait de l'événement dans
chacune.
