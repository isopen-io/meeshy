## Leçon 307 — une règle ÉCRITE, EXPLIQUÉE et COMMENTÉE n'est pas une règle appliquée : elle n'est appliquée que là où quelqu'un l'a citée (2026-08-28, cycle 130 bis)

`services/gateway/CLAUDE.md` § *Critical Gotchas* porte, depuis la leçon 230, la
règle la plus explicite du dépôt :

> **`void p` exige TOUJOURS `p.catch(...)`.** Un `void` DÉTACHE la promesse : le
> `try/catch` qui l'entoure n'attrape qu'un `throw` SYNCHRONE, jamais le rejet de
> la promesse rendue. Un rejet sans écouteur termine le PROCESS sous le
> `--unhandled-rejections=throw` par défaut de Node 22 — toute la gateway tombée
> pour un canal best-effort.

Elle est écrite, motivée, et **commentée sur place** partout où elle est
appliquée : `broadcastLinkMessage` la redit trois fois, `broadcastMessageMutation`
deux, `broadcastReadStatus` une. Un balayage du dépôt a rendu **quatorze**
contre-exemples en production, dont **deux à cinquante lignes** d'un de ces
commentaires.

> **Une règle ne se propage pas depuis son énoncé, elle se propage depuis les
> sites qui la CITENT.** Chacun des cinq commentaires ci-dessus a été écrit par
> le lot qui corrigeait CE site-là ; aucun n'a jamais fait le tour de la famille.
> Le résultat n'est pas « la règle est mal connue » — elle l'est parfaitement,
> c'est même la plus longuement expliquée du service — mais « la règle vaut là où
> on l'a récitée ».

**Ce que l'inventaire dit, et qui est le vrai enseignement.** Aucun des quatorze
n'était une panne LE JOUR de la mesure : tous les callees avalaient leurs
erreurs. C'est donc un piège armé (règle du cycle 84), et deux propriétés
mesurées en font le prix :

- **La garantie appartient au SITE, jamais au collaborateur.** « Le callee avale
  ses erreurs » décrit l'autre bout, qui peut changer sans que le site rougisse —
  et c'est **déjà faux** dès que le callee porte une instruction avant son
  propre `try`. `CallEventsHandler.onDisconnectGraceExpired` en portait **trois**,
  dont un accès de propriété sur un paramètre. Un des quatorze commentaires
  l'écrivait même à l'envers : *« `_createReactionNotification` handles errors
  internally; void to be explicit »* — une propriété du callee présentée comme
  la justification de ne pas garder le site.
- **Cinq des quatorze vivaient dans un `setTimeout`.** Il n'y a alors AUCUN
  `try/catch` englobant à invoquer, et le rappel se déclenche longtemps après la
  requête qui l'a armé : le rejet n'a nulle part où être vu, et son seul effet
  observable est l'arrêt du process. Une fenêtre de grâce de reconnexion d'appel
  et l'écriture débouncée d'un heartbeat étaient dans ce cas.

### Le corollaire de forme : « c'était le dernier » est une AFFIRMATION

Le doc-comment de `broadcastMessageMutation` concluait, sur la garde qu'il venait
de poser : **« c'était ici la dernière exception de la famille »**. Il en restait
quatorze, dont deux dans le fichier de l'épingle.

C'est la règle du cycle 93 (« un compte est une affirmation : il se compte, il ne
s'hérite pas ») appliquée à un inventaire de SITES plutôt qu'à un nombre. Devant
toute phrase de la forme « c'était le dernier », « il n'en reste plus », « la
famille est fermée » : **la famille se compte, et elle se compte par un
balayage** — jamais depuis le site qu'on vient de corriger, qui est par
construction le seul qu'on ait ouvert.

`src/__tests__/detached-promise-catch-sweep.ts` est ce balayage, en cliquet à
inventaire VIDE. Deux choix de rédaction méritent d'être repris :

- **le discriminant est la POSITION, pas le mot-clé.** La première rédaction
  cherchait `void` précédé de « n'importe quoi qui ne soit pas un mot » et rendait
  plus de cent faux positifs, tous des annotations de retour (`(): void {`,
  `Promise<void>`). Un balayage qui cherche un IDIOME mesure sa popularité, pas
  une propriété (cycle 107) ; ici la propriété est « `void` en position
  d'instruction », donc précédé de `;`, `{`, `}` ou du début du fichier ;
- **il détecte sur une source dépouillée et RAPPORTE depuis la source brute.**
  Les commentaires citent la forme fautive pour l'expliquer — c'est leur rôle, et
  ce fichier-ci en est la preuve — donc la détection doit les neutraliser ; mais
  la clé d'inventaire doit garder ses littéraux, sans quoi les deux
  `_enqueueOfflineReactionEvent` voisins de `ReactionHandler` (`'reaction-added'`
  contre `'reaction-removed'`) seraient indiscernables. Le dépouillement remplace
  donc chaque caractère par une espace de MÊME longueur, ce qui laisse les
  offsets alignés entre les deux versions.

### Et l'épingle, sixième transport, a re-codé ce qu'un helper tenait déjà

Deux des quatorze étaient les entrées `PUT`/`DELETE …/pin`. Elles ne manquaient
pas seulement le `.catch` : elles avaient re-codé à la main deux des trois
audiences de `broadcastMessageMutation`, dont le doc-comment prédisait —
littéralement — que « collapsing them here means a **sixth transport** cannot
silently reopen it ». Le sixième transport est arrivé et n'a pas appelé.

Ce que la copie manuscrite perdait, en plus du `.catch` : **l'émission de room
n'était pas gardée**. `io.to(room).emit(...)` LÈVE quand l'adaptateur ou
l'encodeur est en défaut ; l'épingle étant DÉJÀ commise en base, la levée
remontait au `catch` de la route, qui rendait **500 pour une écriture réussie** —
et, la levée ayant sauté la suite, **la mise en file hors ligne n'avait jamais
lieu**. Un incident COSMÉTIQUE emportait la seule garantie DURABLE du chemin :
c'est exactement l'inversion que le cycle 116 avait corrigée sur les deux
producteurs de `message:new`, rejouée sur un chemin que ce lot-là ne couvrait pas.

> **Un helper à peu d'appelants ne garde pas une règle : il documente que
> quelques sites l'appliquent** (cycle 123 bis, formulé sur `protectedPreview`).
> La suite, mesurée ici : **la phrase d'un doc-comment qui PRÉDIT qu'aucun
> nouveau site ne rouvrira la brèche ne garde rien du tout.** Rien n'oblige un
> écrivain à passer par le helper — et l'épingle, elle, avait été écrite en
> connaissance de cause, avec un commentaire qui revendiquait la « parité avec
> la remise hors ligne des éditions/suppressions/réactions ». Elle CITAIT la
> famille sans l'appeler.
