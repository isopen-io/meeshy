## Leçon 212 — une règle portée sur un client n'est portée sur aucun autre, et le client indemne « par structure » ne l'est que sur le chemin qu'on a regardé (2026-08-16, routine temps réel, cycle 53)

### 1. Le fait

Le cycle 52 corrige, côté iOS, la ligne de liste qui décrivait un mélange de
deux messages. Il inspecte le web dans son §6 et conclut :

> **Web** : il est indemne pour une raison **structurelle**, et c'est la
> comparaison la plus instructive de ce cycle : sa ligne porte le dernier
> message comme un OBJET, pas comme douze champs frères. Le remplacer s'écrit
> `{ ...conv, lastMessage: replacement }` — il n'y a rien à oublier,
> l'atomicité vient du modèle.

Le raisonnement est juste. La conclusion est fausse — pas parce que l'analyse
s'est trompée, mais parce qu'elle a répondu à une autre question que celle
qu'elle croyait poser : elle a examiné le chemin de recalcul LOCAL
(`advanceConversationPreviewOnDelete`), qui écrit bien l'objet entier, et pas le
chemin du fan-out SERVEUR (`conversation:updated`), qui écrivait des champs
scalaires frères que la ligne ne lit pas.

Le web portait donc le MÊME défaut, sur le chemin d'à côté, et sous une forme
plus retorse : ses deux moitiés — l'objet `lastMessage` et la carte du Prisme,
scalaire — sont mises à jour par des chemins DIFFÉRENTS. L'atomicité venait bien
du modèle pour l'une, et pas du tout pour l'autre.

### 2. Pourquoi c'est invisible

Parce que « ce client range la donnée autrement » est une vraie explication, et
qu'une vraie explication clôt l'enquête. Elle donne le sentiment d'avoir compris
le mécanisme, ce qui est le meilleur moyen d'arrêter de chercher.

Et parce que le champ qui trahissait le mélange n'appartient pas à l'objet : la
carte du Prisme vit au niveau CONVERSATION, pas au niveau message — le gateway
l'y pose parce que sa forme compacte `{ langue: aperçu }` n'est pas celle de
`Message.translations`. Un audit qui vérifie « l'objet est-il écrit
atomiquement ? » ne peut pas voir un champ qui n'est pas dans l'objet.

### 3. La règle

**Quand un cycle déclare une surface indemne, la déclaration doit nommer le
CHEMIN, pas le client.** « Le web est indemne » n'est pas une conclusion
vérifiable ; « le recalcul local du web écrit l'objet entier » l'est — et laisse
visible ce qu'elle ne couvre pas.

La question de suivi tient en une ligne, et elle est mécanique : *quels sont
TOUS les écrivains de ce que la ligne AFFICHE ?* Pas les écrivains du champ, pas
les écrivains de l'objet : les écrivains de l'affichage. Ici la réponse était
trois — le recalcul local, le handler d'édition, et le fan-out serveur — et
seuls les deux premiers avaient été regardés.

### 4. Le corollaire — le mélange se cache à la jointure de deux modèles

Un défaut de cohérence ne vit pas dans un champ, il vit **entre** deux champs
qui doivent décrire le même objet. Il est donc structurellement invisible aux
audits qui parcourent les champs un par un, et il se loge de préférence là où
deux rangements se rencontrent : un objet d'un côté, des scalaires frères de
l'autre ; un cache mis à jour par un événement, un autre par un événement
différent.

La question qui le trouve n'est pas « ce champ est-il juste ? » mais **« ces
deux champs peuvent-ils décrire deux objets différents, et si oui, lequel gagne
à l'écran ? »**. Ici le perdant était l'objet et le gagnant le scalaire, parce
que le résolveur du Prisme PRÉFÈRE la traduction à l'aperçu brut — un témoin
posé sur la donnée serait passé au vert, seul un témoin posé sur le TEXTE
AFFICHÉ pouvait voir le défaut.

### 5. La contre-épreuve à écrire

Toute règle « remets à neutre ce dont l'événement ne parle pas » a besoin de son
témoin symétrique sur le chemin le PLUS FRÉQUENTÉ, pas seulement sur le chemin
défectueux. Ici : `message:new` pose l'objet complet, le `conversation:updated`
jumeau arrive juste derrière avec le même id — sans témoin, le correctif
effacerait la signature et la pastille de CHAQUE message reçu. Le témoin du
défaut prouve que le correctif agit ; celui-ci prouve qu'il s'abstient.
