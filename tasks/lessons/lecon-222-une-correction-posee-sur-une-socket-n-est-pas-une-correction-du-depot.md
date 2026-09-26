## Leçon 222 — une correction posée sur UNE socket n'est pas une correction du dépôt ; et un double de socket qui ne change pas d'identité fait passer les témoins de reconnexion à VIDE (2026-08-17, routine messagerie, cycle 58)

**Le fait.** Le web a deux sockets Socket.IO. Les deux durcissements du couloir
des messages — jeton du handshake résolu à chaque tentative, `reconnect_failed`
rendu à une boucle manuelle — n'avaient jamais traversé vers la socket des
notifications. Chacun y était pourtant documenté par un commentaire qui DÉCRIT
la panne qu'il supprime. Troisième occurrence de cette forme dans le dépôt.

**Trois règles.**

1. **Quand on corrige un transport, compter combien le dépôt en a.** La question
   n'est pas « ai-je corrigé le bug ? » mais « combien de sites portent la même
   construction ? ». Un `grep` sur l'option fautive (`auth: {`,
   `reconnectionAttempts`) l'aurait rendu en une commande, à n'importe lequel
   des trois cycles concernés. Le commentaire qui explique la correction est le
   meilleur point de départ : il nomme la panne, donc il nomme quoi chercher
   ailleurs.

2. **Un compteur ÉCRIT et jamais LU ne protège rien — il empêche de voir qu'il
   ne protège rien.** `reconnectAttempts++` donnait au fichier l'apparence
   d'une gestion de tentatives qui n'existait pas ; c'est probablement ce qui a
   fait passer les relectures précédentes. Un champ dont aucune lecture n'existe
   se retire, il ne se garde pas « au cas où ».

3. **Rendre le transport ne suffit pas : il faut rendre ce que la coupure a
   coûté.** Une reprise « évidente » aurait reconstruit la socket via
   `disconnect()` et aurait été VERTE sur « la socket revient » tout en
   détruisant le rattrapage — `hasConnectedBefore` remis à false (donc plus de
   `desync('reconnect')`) et curseur `_seq` effacé. D'où la séparation du
   démontage TECHNIQUE et du reset SÉMANTIQUE : toute fonction de reconnexion
   doit dire explicitement ce qu'elle préserve, pas seulement ce qu'elle jette.

**Corollaire de méthode, sur les témoins.** Deux témoins de ce cycle étaient
VERTS avant le correctif : ils émettaient sur `currentSocketMock`, c'est-à-dire
sur la socket d'ORIGINE, puisque aucune neuve n'était construite. Ils
mesuraient une socket vivante, ce qui n'a jamais été en doute. **Tout témoin de
reconnexion doit d'abord prouver l'IDENTITÉ du double** (`expect(socket).not
.toBe(dead)`) avant d'observer quoi que ce soit dessus ; sans cette assertion,
un double qui ne se renouvelle pas rend le témoin tautologique. C'est la
deuxième fois en trois cycles — la règle est désormais écrite.

**Corollaire sur les gardes.** Une garde qu'aucune mutation ne fait rougir est
soit inatteignable, soit non spécifiée. Ce cycle a vérifié laquelle (elle était
inatteignable, la vraie protection vivant ailleurs et sa mutation étant rouge)
et l'a RETIRÉE, plutôt que de lui écrire un témoin qui n'aurait mesuré que le
double.
