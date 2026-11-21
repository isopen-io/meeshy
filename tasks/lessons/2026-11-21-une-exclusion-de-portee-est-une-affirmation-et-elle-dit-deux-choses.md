## Une exclusion de portée est une AFFIRMATION, et elle dit DEUX choses (cycle 206, #20155)

Le balayage des portes à clé d'appelant ne relève que les lectures singulières
de `Participant`. Sa justification, écrite dans le code et recopiée au journal :

> « `count`, `aggregate` et `groupBy` sont des MESURES … et `findMany` rend un
> ENSEMBLE, donc une audience, **qui a déjà son cliquet**. »

La première moitié est une DÉCISION, et elle est défendable : le dépôt a tranché
le régime des mesures. La seconde est une CLAIM, et elle est fausse.

Le cliquet des audiences écarte délibérément toute clause qui NOMME une personne
(`namesAParticularMember`, #20100) — parce qu'une audience est un ensemble. Donc
**une lecture plurielle ou une mesure dont le `where` nomme l'appelant n'est vue
par AUCUN des deux balayages** : c'est la lacune exacte que le nouveau cliquet
existe pour fermer, rouverte pour quatre méthodes Prisma. Mesuré par l'audit
adversarial : **44 sites, dont 41 nus** (#20260).

Et « ce sont des mesures » est faux d'au moins un site. `call-preview-events.ts`
fait d'un `count(…) > 0` le SEUL contrôle d'appartenance de `calleeRefusal`, qui
gouverne les deux verbes de l'aperçu avant décroché — le relais WebRTC de la
caméra et du micro de l'appelant. Là, le nombre **EST** l'autorisation, et la
troncature n'y est pas « un nombre faux » : c'est un laissez-passer (#20261).

> La question à poser à une mesure n'est donc pas « est-ce un nombre ? » mais
> **« ce nombre est-il lu par un humain ou par un `if` ? »**.

### Pourquoi la forme de la phrase importe

Les deux moitiés tiennent en une ligne et ont des durées de vie opposées. « Hors
de ma portée » reste vrai tant que le discriminant ne change pas. « Couvert
ailleurs » dépend d'un AUTRE outil, que son propre auteur fera évoluer sans
jamais lire cette ligne-ci. Collées, elles se lisent comme une seule décision
instruite — et c'est la seconde qui emporte la conclusion, parce que c'est elle
qui dispense d'agir.

**Une exclusion qui annonce une couverture endort précisément la question
qu'elle devait poser.** Un cliquet est le dernier endroit où écrire cela : il est
lu par quelqu'un qui cherche à savoir si un site est gardé, et il répond oui.

Le remède n'est pas de retirer l'exclusion — elle est juste — mais de dire sa
DETTE à sa taille, avec son issue, et de PUBLIER ce qu'on n'a pas relevé, comme
le balayage publie déjà ce qu'il ne sait pas juger (#20091 : « un inventaire vide
et un balayage aveugle sont le même vert »). Même famille que le compte, le tri,
le consommateur nommé, la contrainte de schéma et la dispense : le dépôt tient
déjà cinq variantes de « ceci est une affirmation, pas une donnée ». L'exclusion
de portée est la sixième, et la plus discrète, parce qu'elle ne parle pas du code
mais de l'outil qui le regarde.
