# Cycle 78 — Le quatrième bord du contrat, et un battement qui ne servait personne

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-t92wij`
**Périmètre** :
- web (`hooks/use-user-status-realtime.ts`, sa suite de tests)
- gateway (`socketio/handlers/AuthHandler.ts` — commentaire porteur, aucune ligne exécutable)

**Clients touchés** : web seul. Aucun nom d'événement retiré du contrat, aucune
charge utile modifiée. Un `setInterval` disparaît, et le commentaire serveur qui
énumérait ses émetteurs redevient vrai.

---

## 1. D'où vient ce cycle

Le cycle 77-bis s'est terminé sur une question posée en toutes lettres, et
explicitement laissée à la main :

> **Retirer un canal mort demande de regarder ce que son récepteur ALIMENTAIT.**
> […] Aucune garde ne remplace la question, qui se pose à la main, une fois :
> après ce retrait, qui écrit encore dans ce que le code retiré écrivait ?

Elle a été posée pour les CINQ canaux retirés au cycle 77, sur les TROIS clients.
Réponse : **rien d'autre à corriger.** Le détail, parce qu'un « rien trouvé »
sans pièces ne vaut pas mieux qu'une absence de vérification :

| retrait | ce qu'il alimentait | qui l'alimente aujourd'hui |
|---|---|---|
| `conversation:online-stats` (web) | la liste des présents | corrigé au 77-bis (`user:status`) |
| `message:translated` (android) | `translationCompleted` | **fusionné** dans `translationReceived` sur `message:translation` — le canal vivant |
| `message:translated` (web, iOS) | le même merge que `message:translation` | doublon exact, sans état propre |
| `system:message` (web) | `messageListeners` | `message:new` — un message système EST un message ; une garde de passerelle interdit le repli global |
| `conversation:online-stats`, `system:message` (iOS) | **aucun consommateur** | les deux `PassthroughSubject` n'étaient lus nulle part |

Le défaut du 77-bis était donc bien **web et web seul**. Le fil est clos.

## 2. Ce que la question devient quand on la généralise

Un canal serveur→client tient par quatre bords, et le dépôt en garde trois :

| bord | question | état |
|---|---|---|
| client → contrat | un nom épelé par un client existe-t-il au contrat ? | garde, cycle 76 |
| contrat → passerelle | un nom déclaré a-t-il un émetteur ? | garde, cycle 77 |
| passerelle → contrat | la passerelle émet-elle un nom NON déclaré ? | **vérifié ici, vert par construction** |
| contrat → client | un nom émis est-il ÉCOUTÉ quelque part ? | **inventorié ici** |

**Le troisième bord ne demande pas de garde.** Les 277 sites d'émission de la
passerelle passent TOUS par une constante du contrat ; il n'existe pas un seul
littéral de la forme `emit('x:y')` dans son code non-test. Les deux émissions
indirectes — `EVENT_NAME[eventType]` (`broadcastReactionMutation`) et
`emission.event` (`broadcastLinkMessage`) — se résolvent l'une et l'autre dans
des tables adossées à `SERVER_EVENTS`. Écrire une garde ici reviendrait à
protéger une porte que le mur ne laisse pas atteindre.

**Le quatrième, lui, n'est pas gardable — mais il est inventoriable.** « Aucun
client n'écoute » n'est pas un défaut en soi : trois canaux sont RÉSERVÉS
(déclarés avant leur émetteur), et une écoute sur un seul client est souvent la
bonne réponse (`agent:admin-event` est un canal d'administration web). La sortie
utile est donc une matrice à relire, pas une assertion à rendre verte.

## 3. La matrice

119 noms de `SERVER_EVENTS`, croisés avec le code non-test des trois clients
(web 1225 fichiers, iOS 1177, Android 738), commentaires dépouillés.

**Écoutés par aucun client : exactement 3** — `call:translation-requested`,
`call:translation-enabled`, `call:transcription-result`. Ce sont *exactement*
les trois entrées de `RESERVED_SERVER_EVENTS`. La coïncidence est le résultat le
plus rassurant de la passe : les deux listes, construites par des chemins
indépendants, coïncident au nom près.

**Écoutés par un seul client : 14.** Trois classes, et une seule demandait un
correctif :

- **Légitimes** — `agent:admin-event` (administration web), `link:message:new`
  (invité de lien, web), `authenticated` / `auth:session-revoked`.
- **Écarts de parité fonctionnelle, hors périmètre d'un cycle de synchronisation** —
  `attachment:reaction-*` (iOS seul : le web n'a pas la fonctionnalité, ni
  l'émission ni la réception — c'est un manque produit, pas un défaut de
  synchronisation) ; `friend-request:*` (web seul) ; `notification:*-bulk`
  (web seul — voir §6, la pastille mobile est couverte, la LISTE ne l'est pas).
- **Le cas de ce cycle** — `heartbeat:ack`, écouté par iOS seul.

## 4. Le battement qui ne servait personne

Le web émettait `heartbeat` toutes les 90 s (`use-user-status-realtime`), sur
une justification écrite dans son propre en-tête :

> « Heartbeat periodique (90s) pour maintenir la presence dans Redis (TTL 120s) »

Cette charge **avait changé de main sans que la phrase le suive**. La passerelle
rafraîchit désormais la présence sur le pong ENGINE (`handleEnginePong`,
branché sur `socket.conn.on('packet')`), que Socket.IO échange toutes les 25 s
(`pingInterval: 25000`) avec chaque client, sans qu'aucun code applicatif ait à
le demander. Ce chemin a été ajouté pour **Android**, qui n'a jamais eu de
battement applicatif — et il couvre du même geste les deux autres.

Les deux chemins appellent la MÊME méthode, `StatusService.noteHeartbeat`,
étranglée à 60 s. D'où :

- un battement à 90 s ne pouvait **rien** produire que le pong n'ait déjà
  produit 3,6× plus souvent ;
- la clé Redis restait rafraîchie toutes les 60 s, **moitié** de son TTL de 120 s.

Et le battement web était de surcroît **muet**. Le canal applicatif n'offre
qu'une chose de plus que le pong : un `heartbeat:ack` porteur du RTT, que le
serveur ne calcule que si le client envoie `clientTime`. iOS l'envoie ; le web
partait NU. Donc `latencyHintMs` restait `undefined`, et l'ack repartait vers un
client **sans écouteur**. Une trame toutes les 90 s par onglet, plus une trame de
retour, pour un effet déjà acquis et une mesure jamais lue.

C'est la question du 77-bis prise par l'autre bout. Là-bas : un lecteur sans
écrivain. Ici : **un écrivain sans lecteur.**

## 5. Preuves

| gate | résultat |
|---|---|
| nouveau test de non-émission, contre le hook de `main` | **ROUGE — 3 battements sur 300 s** |
| son témoin (le tick local sur la même fenêtre) | vert des deux côtés |
| `use-user-status-realtime` après correctif | 15/15 verts |
| web — `__tests__/hooks` + `__tests__/services` | **168 suites, 4131 tests verts** |
| gateway — suites `AuthHandler` | 87 tests verts |
| `tsc` web sur les fichiers touchés | aucune erreur (base du dépôt : 1340, inchangée) |

Le témoin rouge est la preuve qui compte : le test est écrit contre `main` et y
compte trois battements. Il est posé sur une fenêtre **large** — 5 minutes, plus
de trois fois l'ancienne période — parce que vérifier « pas de battement à 90 s »
à la seconde près laisserait passer un battement réintroduit à une autre
période, qui est précisément la forme sous laquelle la régression reviendrait.

Le commentaire de `handleEnginePong` énumérait ses émetteurs applicatifs
(« web (90s) and iOS (30s) ») : il est corrigé dans le même commit. Un
commentaire qui nomme des faits devient faux en silence quand les faits bougent
— c'est exactement ce qui avait rendu l'en-tête du hook web trompeur.

## 6. Pistes laissées ouvertes

**`connectionRTT` est un `PassthroughSubject` sans abonné (iOS).** Le RTT que le
`heartbeat:ack` rapporte est décodé (`MessageSocketManager:3215`), converti, et
publié (`:3231`) — vers personne. Déclaré au protocole, doublé dans deux mocks,
lu nulle part. C'est la MÊME forme que le défaut de ce cycle, un cran plus
haut : le battement iOS, lui, est correct (il envoie `clientTime`) ; c'est sa
sortie qui n'a pas de destinataire. Deux issues cohérentes — brancher un
indicateur de qualité de connexion, ou retirer la chaîne — et le choix est
produit, donc il demande son propre cycle.

**Non traité ici faute de pouvoir le VÉRIFIER** : ce conteneur est sous Linux,
sans Xcode. Une modification iOS n'y serait ni compilée ni testée, et la règle de
cette routine est de ne fusionner que ce qui est prouvé. Le constat est donc
consigné, pas corrigé.

**Les listes de notifications mobiles rancissent sur un marquage en masse.**
`notification:read-bulk` / `notification:deleted-bulk` ne sont écoutés que par le
web. La PASTILLE mobile est correcte — `emitCountsUpdate` suit chaque appel et
iOS écoute `notification:counts` — mais les LIGNES gardent leur pastille de
non-lu jusqu'au prochain refetch. Le prédicat à rejouer existe déjà en partagé
(`notificationMatchesReadBulkScope`), ce qui rend le correctif petit : il est
iOS/Android, donc invérifiable ici, même raison que ci-dessus.

**Une leçon de forme, pour la matrice.** Elle ne peut pas devenir une assertion :
ses trois classes de sortie (légitime / écart produit / défaut) ne se
distinguent que par un jugement. Rendue verte à la hâte, elle deviendrait une
table d'exemptions — précisément ce que la garde du cycle 77 a refusé de faire
en sortant `RESERVED_SERVER_EVENTS` vers le contrat. Elle vaut comme **passe
d'inventaire**, à refaire, pas comme gate.
