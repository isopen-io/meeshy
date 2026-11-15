## Un témoin vert peut sortir VINGT LIGNES avant la garde qu'il prétend mesurer — et la garde peut être inatteignable

**Le témoin.** « N'enfile RIEN quand la lecture du plan tombe. » Vert. Son double
faisait lever `participant.findMany` dès que le `select` demandait `shareLinkId`
— la projection que le plan demande. La mutation a dit le reste : **retirer la
garde laissait 66 témoins au vert.**

**Pourquoi.** La loi d'AUDIENCE, posée vingt lignes plus haut dans la même
fonction, interroge la base avec EXACTEMENT la même projection. Elle tombait
donc aussi, rendait `'unknown'`, et la fonction sortait avant d'atteindre la
garde. Le témoin mesurait une sortie anticipée en croyant mesurer un refus.

> **Faire échouer une lecture ne cible pas une garde : cela cible toutes celles
> qui partagent cette lecture.** Un double qui discrimine par le `select` ne
> discrimine qu'entre des projections DIFFÉRENTES — et deux gardes voisines ont
> souvent la même, précisément parce qu'elles posent des questions voisines.

**Ce que la recherche d'un meilleur discriminant a révélé.** Le verdict que la
garde attend est **inatteignable sur ce site** : l'autre lecture du plan est
récupérée fail-closed à l'intérieur, et la seule qui pourrait le produire est
celle que l'audience interroge déjà. La garde n'était pas mal testée : elle
était morte.

**Les trois réponses possibles, et pourquoi la troisième.** Supprimer la garde
rouvrirait le chemin en silence si l'audience changeait de forme. La prétendre
prouvée serait un mensonge que la prochaine lecture croira. **La garde reste,
son inatteignabilité est ÉCRITE à côté d'elle, et le témoin dit ce qui est vrai**
— ici : que la loi d'audience ferme les deux canaux ensemble.

**La question à poser à tout témoin de garde fail-closed.** *Entre le début de
la fonction et la garde que je mesure, combien de sorties mon double
déclenche-t-il ?* Si la réponse n'est pas « zéro », le témoin atteste une autre
garde que la sienne. La mutation est la seule façon de le savoir — relire ne
suffit pas, parce que la sortie anticipée est, par construction, le comportement
JUSTE d'une autre garde.
