## Leçon 202 — un commentaire qui affirme « le seul » n'a pas vérifié les frères jumeaux du site qu'il corrige (2026-08-16, routine appels, Vague 133)

**Le fait.** La Vague 132 a corrigé `broadcastParticipantLeftResult` pour inclure `userId` dans son
émission `PARTICIPANT_LEFT`, avec un commentaire affirmant que c'était « le seul site d'émission
PARTICIPANT_LEFT à omettre `userId` ». Son propre frère jumeau — `forceCleanupParticipationAfterLeaveFailure`,
le repli d'erreur de la MÊME méthode appelante (`leaveParticipationAndBroadcast`), à quarante lignes
de distance dans le même fichier — émettait toujours l'ancienne forme. L'affirmation était fausse dès
l'écriture, pas devenue fausse depuis.

**Pourquoi ça échappe à la revue.** Les deux méthodes sont nommées différemment, ont des signatures
différentes, et un seul chemin (le nominal) est exercé par la quasi-totalité des scénarios de test
manuels ou même automatisés d'un correctif ciblé — l'autre n'est atteint QUE quand `leaveCall` throw,
une condition d'erreur rarement provoquée en dehors d'un test dédié à cette branche précise. Deux
émetteurs qui produisent le MÊME événement socket (`CALL_EVENTS.PARTICIPANT_LEFT`) vers le MÊME
event-type partagé, l'un juste après l'autre dans le fichier, ne se lisent pas comme des « frères » à
l'oeil : rien dans leur nom ne le signale, et il faut remonter à leur appelant commun
(`leaveParticipationAndBroadcast`'s try/catch) pour voir qu'ils sont les deux issues d'un seul embranchement.

**Règle pour la suite.** Avant d'écrire « le seul site qui fait X » dans un commentaire de correctif :
chercher TOUS les émetteurs du même événement/type partagé (`grep` sur le nom de l'event, pas sur le
nom de la fonction qu'on corrige), puis vérifier explicitement chacun — pas seulement ceux qu'un test
existant couvre déjà. Et à l'inverse, quand on *lit* un tel commentaire dans du code existant en
cherchant un nouveau bug : le traiter comme une hypothèse à vérifier, pas comme un fait établi — c'est
exactement ce doute qui a mené au correctif de cette vague. Un test qui verrouille durablement cette
classe de bug devrait cibler l'INVARIANT (« tout émetteur de PARTICIPANT_LEFT inclut `userId` »),
pas un site nommé un par un — un futur troisième émetteur ajouté au fichier n'aurait sinon aucune
raison de le respecter.
