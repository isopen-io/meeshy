## Leçon 178 — Une garde d'ordonnancement écrite sur le chemin d'ENTRÉE doit être posée en question au chemin de SORTIE (2026-08-15, routine temps réel, cycle 29)

`_authenticateJWTUser` joint les rooms AVANT d'inscrire le socket dans
`connectedUsers`, et le dit : la livraison étant gatée sur
`connectedUsers.has(clé)`, un destinataire qui « paraît en ligne » sans être dans
la room perd l'événement des deux côtés — écarté de la file hors ligne parce
qu'il a l'air joignable, absent de la diffusion parce qu'il ne l'est pas.

`handleDisconnection` devait faire l'inverse — désinscrire d'abord — et ne le
faisait pas. Il tourne sur `disconnect`, que Socket.IO émet APRÈS avoir vidé les
rooms : chaque `await` avant le `delete` était une fenêtre de perte sèche.

**La règle.** Une garde d'ORDRE entre deux registres (ici : appartenance aux
rooms et registre de présence) n'est jamais une propriété d'un seul chemin. Elle
énonce un invariant — « ces deux états ne divergent jamais dans le sens qui fait
perdre » — et un invariant se vérifie à CHAQUE transition, entrée comme sortie,
avec l'ordre inversé de part et d'autre. Trouver la garde à l'entrée ne dit rien
de la sortie ; ce sont deux sites, pas deux lectures du même site.

**Pourquoi c'est resté invisible — la garde jumelle a servi d'alibi.** Le défaut
n'a pas survécu à un oubli discret mais à son contraire : la garde EXISTE, elle
est documentée, longuement, et elle porte sur le chemin qu'on relit
naturellement. Une lecture qui cherche « cette protection est-elle en place ? »
la trouve et s'arrête satisfaite. **Une garde présente sur le chemin voisin est
le plus efficace des camouflages** — c'est la même forme que la Leçon 176 (quatre
routes qui font toutes visiblement le bon geste sur le canal vivant, aucune sur
le différé). Le prédicat utile n'est pas « la garde existe-t-elle ? » mais
« combien de chemins traversent cet invariant, et je les ai tous ouverts ? ».

**Corollaire — « sûr par accident » n'est pas sûr.** Le chemin inscrit
respectait l'ordre sans le vouloir : il ne traverse simplement aucun `await`
avant la désinscription. Rien ne l'y oblige, aucun test ne le fige, et le
premier `await` ajouté demain (un cache, une métrique, un appel réseau) rouvre
la fenêtre en silence. Un invariant tenu par l'absence fortuite d'une
instruction est une dette qui ne s'annonce pas.

**Corollaire de test — une fenêtre ne s'observe que de l'intérieur.** L'état
FINAL était correct des deux côtés du correctif : observer `connectedUsers`
après le `await` ne montre rien. Le seul témoin discriminant lit le registre
DEPUIS l'intérieur du travail awaité (ici, en instrumentant le mock Prisma que
le nettoyage attend). Quand le défaut est un ORDRE et non un résultat, le point
d'observation doit être placé dans l'intervalle, pas à ses bornes.

**Corollaire de charge.** La fenêtre dure un aller-retour de base : elle croît
donc avec la profondeur de file de cette base, c'est-à-dire pendant les rafales
de déconnexion (redémarrage, coupure réseau) — quand la perte est à la fois la
plus probable et la plus massive. Troisième récidive de la famille des cycles 24
et 25 : **un coût dimensionné par l'état accumulé se paie toujours au pire
moment**, et c'est ce qui le rend introuvable en test nominal.
