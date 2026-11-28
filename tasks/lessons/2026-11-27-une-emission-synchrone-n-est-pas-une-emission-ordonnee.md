## Une émission SYNCHRONE n'est pas une émission ORDONNÉE (cycle 227, #20414)

Quatre passages de la passerelle justifiaient de lire la séparation AVANT la
mutation par cette phrase, ou l'une de ses variantes :

> « Ce n'est pas une commodité : […] résolue avant l'écriture, l'émission
> redevient synchrone juste après elle. »

Elle décrit la **POSITION de l'appel dans une fonction** — aucun `await` entre la
mutation et l'`emit` — et elle se relit comme une **propriété du FIL** : les
diffusions partiraient dans l'ordre des écritures. Entre les deux il y a deux
requêtes CONCURRENTES et un pool de connexions, que la phrase ne nomme pas. Deux
gestes sur le même commentaire sont deux gestionnaires indépendants ; leurs
accusés Mongo reviennent sur des connexions distinctes et peuvent s'inverser par
rapport à l'ordre de commit.

**Le dépôt le disait déjà, dans le même répertoire.** Le doc-comment
d'`emitWithSeq` décrit exactement ce mécanisme pour l'allocation de `_seq`
(« deux appels concurrents […] dont les réponses peuvent revenir DANS LE
DÉSORDRE ») et va jusqu'à SÉRIALISER par utilisateur pour s'en protéger. Quatre
fichiers voisins promettaient l'inverse sans le savoir.

> **Devant une justification d'ordonnancement, demander : à quelle échelle ?**
> « Synchrone » est une propriété d'une fonction, « ordonné » une propriété de
> deux requêtes. Résoudre une lecture avant la mutation RESSERRE la fenêtre de
> réordonnancement d'un `await` ; elle ne se ferme pas, et le resserrement n'est
> pas une garantie — c'est une réduction de probabilité, qui s'écrit comme telle.

Corollaire de forme, payé en écrivant le cliquet du lot : **une garde de texte
ne peut pas CITER ce qu'elle refuse.** Son doc-comment reproduisait les deux
énoncés d'origine pour raconter l'histoire, et le seul rouge restant après
l'alignement des douze passages était le sien. L'histoire va dans la décision,
où aucun cliquet ne la cherche — un cliquet de texte est le seul outil dont la
documentation vit dans son propre périmètre.
