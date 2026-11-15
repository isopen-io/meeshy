## Leçon 50 — le MÊME event socket peut être émis en deux id-spaces selon le transport ; vérifier que tous les writers d'un champ comparé côté client résolvent pareil (routine messaging, iter 157, 2026-07-09)

`message:new.senderId` était résolu vers le `User.id` par le writer REST/ZMQ
(`MeeshySocketIOManager.broadcastMessage`, avec un commentaire explicite « les clients comparent
senderId avec leur userId ») mais émis en `Participant.id` **brut** par le writer du chemin WS
`message:send` (`MessageHandler._buildMessagePayload`). `Message.senderId` est un `Participant.id`
(relation Prisma `MessageSender` → `Participant`), donc les deux writers d'un même wire event
mettaient des id-spaces différents. Côté client web, `use-socket-cache-sync.ts` compare
`message.senderId === currentUser.id` (un `User.id`) pour détecter ses propres messages et promouvoir
l'optimistic bubble multi-device — sur le chemin WS le test échouait toujours (Participant.id ≠
User.id), donc l'auteur voyait son propre message en double / rendu comme entrant. Le bug était
**invisible sur le chemin REST** (qui résolvait correctement) : seul le transport WS était atteint.

**Signature du bug** : un champ de payload socket comparé côté client à un id utilisateur, construit
par ≥2 writers (un par transport : WS vs REST vs ZMQ), dont un seul applique la résolution
`participant.userId ?? participant.user?.id ?? message.senderId`. Le writer « correct » porte souvent
un commentaire justifiant la résolution — mais ce commentaire ne protège PAS les writers siblings qui
n'ont jamais reçu le même traitement.

**Règle réutilisable** : quand un writer d'un event socket résout un id (Participant→User) avec une
justification « les clients comparent à leur userId », grep IMMÉDIATEMENT le nom de l'event
(`MESSAGE_NEW`/`message:new`) ET le champ (`senderId: message.senderId`) sur TOUT le service pour
trouver les autres writers du même event qui n'ont pas la résolution — un par transport. Ne jamais
supposer qu'un seul chemin construit un event : le send a au moins WS + REST, souvent + un
re-broadcast ZMQ (traduction). Le champ `sender.id` (Participant.id) reste disponible séparément pour
les rares consommateurs qui en ont besoin ; ne PAS toucher les events où les deux writers sont
cohérents entre eux (`CONVERSATION_UPDATED` garde le Participant.id brut des deux côtés — consommateur
distinct, pas de divergence).

---
