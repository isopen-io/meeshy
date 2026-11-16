## Un chemin bavard peut se taire exactement là où il DÉTRUIT

*2026-11-16, #18733 (cycle 172). `RedisDeliveryQueue`, chemin d'enfilage de la
file de remise hors ligne.*

## Le fait

Le chemin d'enfilage de la file hors ligne journalise **tout** : dédoublonnage,
supplantation d'un événement mutable, repli mémoire sur panne Redis, map mémoire
pleine, entrée informe. Cinq traces, trois niveaux, chacune posée par le lot qui
a introduit son cas.

Le seul événement qui **détruit du rejeu** — l'éviction au plafond de 500 par
destinataire — n'avait aucune trace. Trois issues (#18614, #18701, #18707) le
nomment comme la cause d'un défaut visible par l'utilisateur, en insistant
chacune sur le fait qu'il n'exige aucune panne ; aucune n'a pu dire à quelle
fréquence il se produit, parce que rien ne le disait. Et la valeur était **déjà
sous la main** : `RPUSH` rend la longueur de la liste, le script la jetait ;
côté mémoire, `evictCount` était calculé, servait à trancher, et était jeté.

## Pourquoi un chemin instrumenté partout peut l'être partout sauf là

Une trace se pose avec le CAS qu'elle décrit — « j'ai dédoublonné », « je suis
tombé sur Redis », « cette entrée est informe ». Chacun de ces cas est une
BRANCHE : quelqu'un l'a écrite, et en l'écrivant s'est demandé ce qu'elle devait
dire.

L'éviction n'est pas une branche. C'est un **effet de bord d'une commande du
chemin nominal** — `LTRIM` après `RPUSH`, `slice(-N)` après un `concat`. Il n'y a
pas de `if` où poser la phrase, pas de moment où l'auteur se demande « et là, je
journalise quoi ? ». Le silence n'est donc pas un oubli de discipline : il est la
conséquence de l'endroit où vit la destruction.

> **La question à poser à un chemin dont on vérifie l'instrumentation n'est pas
> « ses cas sont-ils journalisés ? » mais « qu'est-ce qu'il DÉTRUIT, et où ? ».**
> La première se répond en lisant les branches, et elle rend « oui » sur un
> chemin qui perd des données en silence. La seconde se répond en lisant les
> COMMANDES — un `LTRIM`, un `slice`, un `splice`, un `delete`, un `DEL` — dont
> aucune n'a de branche à elle.

Corollaire d'asymétrie, et c'est lui qui aurait dû alerter : **la map mémoire
pleine avertissait**. Une éviction qui n'affecte que le REPLI avait sa phrase ;
celle du chemin de PRODUCTION n'en avait pas. Quand deux évictions voisines ne
sont pas instrumentées pareil, c'est en général la plus coûteuse qui se tait —
parce qu'elle est la plus ordinaire, donc la moins écrite.

## Et la jumelle n'était pas où l'issue regardait

L'issue scopait « les DEUX chemins, Redis et mémoire » — les deux moitiés de
l'enfilage. Posée au moment du correctif, la question « ce `LTRIM` est-il le seul
du fichier ? » en a rendu deux de plus : la REMISE (#12822, M3) borne de la même
façon les entrées scellées qu'un drain n'a pas pu rouvrir. Même destruction, même
silence, et son `LPUSH` rend déjà la longueur.

Le pire des quatre n'était nommé nulle part : **Redis DRAINE puis sa remise
ÉCHOUE**, et le repli mémoire reçoit jusqu'à 500 entrées dans une tranche qui en
garde 50 — jusqu'à 450 détruites, à l'instant précis où le drain venait de les
retirer de Redis. Il ne s'atteint par aucune lecture de l'enfilage : il naît de
la RENCONTRE de deux bornes différentes sur le chemin de panne de la première.

## La règle de forme qui en est sortie

Quand on fait voyager une mesure depuis un script Lua (ou tout exécuteur distant
sans double) :

1. **le script TRANSPORTE, il ne DÉCIDE pas.** L'arithmétique (« cette longueur
   dépasse-t-elle le plafond, de combien ? ») vit en TypeScript, où un témoin
   l'exerce vraiment — le dépôt n'a aucun double capable d'exécuter du Lua, donc
   tout calcul qu'on y laisse est non testé par construction ;
2. **la mesure est un élément de retour EN PLUS, jamais une valeur de code en
   plus** — `1` doit continuer de vouloir dire « poussée », sans quoi chaque
   lecteur apprend deux façons de dire la même chose ;
3. **l'absence de mesure se dit `0` et ne doit JAMAIS pouvoir se lire comme une
   mesure.** Tous les doubles du dépôt rendent l'entier nu d'avant le lot ; un
   lecteur qui en déduirait une longueur publierait une perte imaginaire — et
   c'est ce chiffre qui servira un jour à instruire la valeur du plafond. Le
   témoin qui garde ce point doit utiliser un entier nu **au-dessus du plafond**,
   sinon il ne peut pas tomber.
