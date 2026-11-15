## Leçon 176 — Une autorisation se lit contre l'autorité à la LIVRAISON, jamais contre une copie prise à l'enfilement (2026-08-15, routine temps réel, cycle 27)

`enqueueForOfflineParticipants` décide l'audience de la file de rejeu au moment
où il enfile, sur l'appartenance de cet instant-là. `_drainPendingMessages`
livrait, jusqu'à 48 h plus tard, sans rien revérifier. Or **entre l'enfilement
et la livraison il y a exactement l'absence** — c'est-à-dire la fenêtre pendant
laquelle on quitte un groupe, s'en fait retirer, s'y fait bannir. Résultat : le
contenu d'une conversation livré après la fin de l'autorisation qui le
justifiait, et cette conversation ressuscitée dans une liste dont on venait de
la retirer.

**La règle.** Tout canal DIFFÉRÉ (file, rejeu, notification programmée, digest,
webhook retenté) sépare la décision d'audience de l'acte de livraison. Le droit
d'un destinataire à ce qu'il reçoit doit être évalué à l'instant le plus TARDIF
possible — la livraison — parce que c'est le seul instant où la réponse est
encore vraie. Une audience calculée en amont est une donnée périmée qui a l'air
d'une décision.

**Corollaire — une garde à la sortie vaut mieux que N purges à l'entrée.** La
réaction naturelle était de purger la file depuis chacune des quatre routes qui
mettent fin à une appartenance. C'est une cinquième copie d'une obligation qui
en comptait déjà quatre (la dérive exacte que `enqueueForOfflineParticipants`
documente après cinq réimplémentations), ça oublie la transition suivante par
construction, et ça garde une course résiduelle (un enfilement en vol juste
après la purge). Un point de sortie unique couvre les quatre routes ET celles
qui n'existent pas encore, sans qu'aucune ait à s'en souvenir. **Quand N
écrivains doivent honorer une garantie, l'implémenter chez le LECTEUR unique.**

**Corollaire de détection — le silence d'une capacité absente.** Ce qui a rendu
le défaut invisible n'est pas un oubli discret mais son contraire : les quatre
routes font toutes, visiblement et avec commentaire, le geste d'éviction de la
room. Une lecture qui les compare voit quatre fermetures cohérentes du canal
VIVANT et repart rassurée. Rien ne nommait le canal DIFFÉRÉ — pas même une
méthode de purge sur `RedisDeliveryQueue` qu'on aurait pu constater jamais
appelée. **Une capacité manquante ne laisse aucune trace à trouver ; on ne la
trouve qu'en énumérant les canaux depuis la GARANTIE, pas depuis le code.** Le
prédicat d'audit utile : « pour chaque transition d'autorisation, quels canaux
peuvent encore porter du contenu d'avant ? » — et la réponse doit inclure ceux
qui ne se déclenchent que plus tard.

**Corollaire d'asymétrie — ouvert sur la PANNE, fermé sur la RÉPONSE.** Une
garde d'autorisation posée devant une opération DESTRUCTIVE (ici le drain a déjà
vidé la file quand la garde s'exécute) ne peut pas être fermée sur l'erreur : ce
serait détruire l'arriéré de tout le monde à chaque hoquet de base — et une
tempête de reconnexions est précisément le moment où la base est sous pression.
Une RÉPONSE « non membre » fait autorité et doit être honorée ; une ABSENCE de
réponse n'autorise rien à conclure. Distinguer les deux n'est pas une faiblesse
de la garde : c'est ce qui l'empêche d'introduire un mode de perte de données
que l'état d'avant — ouvert à 100 % — n'avait pas.

**Corollaire de test (suite de la Leçon 172).** Deux témoins voisins prouvaient
« rien ne s'est passé » par l'ABSENCE d'appel à `prisma.participant.findMany`.
Ce prédicat cesse de prouver quoi que ce soit dès qu'un second appelant partage
ce mock. Un témoin qui asserte sur un mock PARTAGÉ doit nommer l'appel qu'il
vise (ici : la seule des deux lectures qui demande `select.bannedAt`), sinon il
se transforme en faux rouge — ou, plus tard et bien pire, en faux vert.
