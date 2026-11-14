## Une garde énumère une CARTE, pas un FIL — et c'est le registre que le CODE importe qui gagne ; et devant une famille de gardes, compter les DIRECTIONS avant de chercher un défaut dans l'une d'elles (2026-11-14, #18499)

*Cycle 162 de la routine d'amélioration continue du temps réel.*

### Le fait

Cinq cliquets gardaient le contrat Socket.IO de ce dépôt, et tous les cinq
énuméraient `SERVER_EVENTS` / `CLIENT_EVENTS`. La passerelle, elle, importe
`CALL_EVENTS` (`packages/shared/types/video-call.ts`) — une **seconde carte des
mêmes noms de fil**. Mesuré : trois noms ne vivaient que là, donc hors de portée
de toutes les gardes, dont deux cités nulle part et sans même un doc-comment
pour le dire.

### La règle

> **Une garde qui énumère une carte garde cette carte, pas le fil.** Dès qu'un
> second registre déclare les mêmes noms, un nom ajouté à l'un et pas à l'autre
> échappe à tout — et c'est le registre que le CODE importe qui gagne, pas celui
> que la garde lit.

Avant de se fier à un cliquet d'inventaire, poser : **sur quoi énumère-t-il, et
est-ce bien ce que le code consomme ?** La réponse ne se lit pas dans le cliquet
— elle se lit dans les `import` du service gardé.

Le correctif n'est pas de fusionner les cartes (elles ont des usages distincts)
mais de rendre la seconde VISIBLE de la garde : « tout nom de `CALL_EVENTS` est
aussi déclaré au contrat socketio, ou nommé à l'inventaire avec sa raison ».

### La forme sœur, trouvée dans le même cycle

Les cinq cliquets regardaient aussi tous la **même direction** (serveur→client).
Un nom de `CLIENT_EVENTS` sans `socket.on` est un canal que le contrat AFFIRME,
qu'un client implémente, et que **Socket.IO laisse tomber sans lever la moindre
erreur** : un bouton inerte, sans ACK, sans journal, sans rejet.

> **Devant une famille de gardes, compter les DIRECTIONS avant de chercher un
> défaut dans l'une d'elles.** Une liste de cliquets qui pointent tous du même
> côté dit où le dépôt n'a jamais regardé.

Et l'obstacle qui avait empêché d'écrire cette garde — `user:status` déclaré des
deux côtés alors que c'est un événement serveur pur — avait été **retiré au
cycle 60**. Le `CLAUDE.md` de `shared` nommait la garde manquante depuis ; elle
était écrivable depuis soixante-deux cycles. **Une limite écrite dans un
commentaire ne se périme pas toute seule : relire ce qui la causait avant de la
croire encore vraie.**

### Le piège d'instrument, rejoué

Premier balayage : 21 noms sans écouteur, dont 20 en `call:*`. Vingt sur
vingt-un dans la même famille n'est pas un verdict, c'est la signature d'un
idiome non reconnu (cycle 107 : *un balayage qui cherche UN idiome mesure sa
popularité*). La passerelle épelle `CALL_EVENTS.INITIATE`, jamais
`CLIENT_EVENTS.CALL_INITIATE`. L'instrument a été refait sur la résolution de
jeton que `socket-event-emitter-gate` avait déjà écrite pour cette exacte
raison — et la mesure est tombée à 5.

> **Un motif frappant est d'abord une accusation contre l'instrument.** Le
> deuxième balayage n'a pas été lancé parce que le premier était implausible,
> mais parce que sa CONCENTRATION dans une seule famille s'expliquait mieux par
> un idiome que par vingt lacunes.

### Deux résultats négatifs valent d'être écrits

Mesurés dans le même cycle, et rien trouvé : les 88 `socket.on` de la passerelle
sont tous couverts par une limitation de débit sauf les `disconnect` (non
déclenchables en rafale), et les 62 noms résolus en `socket.on` sont **tous**
déclarés dans `ClientToServerEvents`. Une dimension mesurée mûre se CONSIGNE :
sans cela, le cycle suivant la remesure.

### Et le format de ce fichier a lui-même rougi

Écrit d'abord avec un titre `# ` et six sections `## `, il a fait tomber
`journal-one-file-per-entry-guard` — qui exige qu'un fichier de `tasks/lessons/`
commence par `## ` et ne porte qu'UN titre de ce niveau. Le cliquet a nommé le
fichier et la ligne. **Un journal est gardé comme du code dans ce dépôt ; écrire
une leçon sans lire la garde qui la reçoit est la même faute que livrer un
correctif sans lancer son gate.**
