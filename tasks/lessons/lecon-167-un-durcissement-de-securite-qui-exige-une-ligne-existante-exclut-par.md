## Leçon 167 — Un durcissement de sécurité qui exige « une ligne existante » exclut par construction l'appelant légitime qui n'en a pas encore une (2026-08-14, routine appels audio/vidéo)

Audit du calling stack (`services/gateway/src/socketio/CallEventsHandler.ts`) : le bouton
« Refuser » d'un appel entrant était cassé depuis le durcissement de sécurité du 2026-07-10b.
`call:end` exigeait `resolveActiveCallParticipantId` — une ligne `CallParticipant` ACTIVE pour CE
call précis, pour fermer une faille réelle (un appelant resté dans la room après avoir quitté ce
call pouvait le raccrocher pour l'autre). Mais `call:join` est le SEUL chemin qui crée cette ligne
pour un callee — `call:initiate` n'en crée une que pour l'initiateur. Un callee qui tape « Refuser »
avant d'avoir jamais rejoint n'a donc JAMAIS eu de ligne à trouver : le check légitime le rejetait
au même titre qu'un imposteur. Résultat silencieux : `ack` jamais vérifié côté client (aucun
callback enregistré), l'appelant continuait de sonner jusqu'au timeout 60s au lieu de voir le refus.

**Le signal de reconnaissance** : une autorisation qui teste « CE user a-t-il déjà une ligne dans
CETTE table » exclut structurellement deux populations différentes qu'on confond trop vite en une
seule catégorie « non autorisé » — celui qui n'a JAMAIS eu de ligne (légitime mais pas encore
inscrit) et celui qui EN A EU une et l'a quittée (exactement la fraude que le check visait). Le
correctif du 2026-07-10b avait raison de fermer la seconde ; il a fermé la première par le même
geste parce que le test ne distingue pas « absent » de « parti ».

**La règle** : avant de resserrer une autorisation sur « a une ligne active », énumérer TOUS les
chemins qui peuvent légitimement atteindre ce contrôle sans qu'une ligne existe encore — pas
seulement ceux qui en ont une et l'ont perdue. Ici il suffisait de relire quel événement crée la
ligne (`call:join`) contre quel événement porte le contrôle (`call:end`) pour voir l'écart : le
premier ne couvre pas tous les appelants qui peuvent légitimement déclencher le second.

**Le correctif reste étroit à dessein** : la voie de secours (`resolvePreJoinDeclineParticipantId`)
ne s'active que si (a) `resolveActiveCallParticipantId` a échoué, (b) `reason === 'rejected'`
explicitement — jamais pour un `call:end` générique —, (c) l'appel n'a jamais été décroché
(`!answeredAt`), (d) l'appelant n'a AUCUNE ligne pour ce call, même quittée (sinon il retombe sur le
chemin strict), et (e) il est un membre de la conversation. Élargir la portée « pour être sûr » (par
exemple accepter n'importe quel `reason`, ou sauter la vérification de membership) aurait rouvert
exactement la faille du 2026-07-10 — un inconnu qui devine un `callId` pourrait y mettre fin.

**Corollaire côté web, même cycle** : `call-store.ts`'s `beforeunload` émettait `CALL_END`
inconditionnellement — correct tant que 1:1 était le seul mode (raccrocher termine forcément
l'appel pour les deux), devenu faux le jour où les appels de groupe ont supprimé le plafond à deux
participants (`b06d54681`, la veille). Fermer un onglet dans un appel à 5 terminait l'appel pour les
4 autres. Le correctif n'a touché AUCUNE logique serveur : `CallService.leaveCall()` distinguait déjà
1:1 (`isDirectCall` → toute sortie termine l'appel) de groupe (seule la sortie du DERNIER participant
le termine) — le bug entier tenait dans le nom d'un seul événement émis côté client
(`CALL_END` → `CALL_LEAVE`). **Un event socket au nom générique (« end ») porté par un flux qui
n'a plus le contexte qui le rendait sûr (1:1 devenu N:N) doit être ré-audité au moment où ce contexte
change — pas seulement au moment où on l'écrit.**
