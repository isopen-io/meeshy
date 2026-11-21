## 2026-11-21 — Une portée corrigée s'arrête au cran où on l'a poussée (#20111, routine messagerie, cycle 204)

**Famille** : #20091 → #20100 → #20111. **Voisine** :
leçon 261 (une énumération porte DEUX affirmations).

### Le fait

#20091 a trouvé que le cliquet des audiences balayait `src/socketio/` en
affirmant quelque chose du dépôt. Il l'a corrigé, a écrit la leçon — « une
portée est une AFFIRMATION, et c'est celle que personne ne relit, parce qu'elle
ne ressemble pas à un inventaire : c'est un `path.resolve` » — et a poussé la
racine à `src/`.

**D'un RÉPERTOIRE. Pas d'un PAQUET.** `services/agent` lit `Participant`,
sélectionne les membres dormants d'une conversation pour parler à leur place, et
le faisait sur `isActive` NU : un membre actif-et-banni y était éligible.
L'agent publiait un message signé de quelqu'un d'exclu, dans le fil dont il est
exclu.

Le cliquet était vert. Trois défauts de la même famille (#20104, #20135,
#20136) avaient été livrés entre-temps.

### La règle

**Un correctif de portée se fait AU CRAN OÙ LE DÉFAUT A ÉTÉ TROUVÉ, et il n'y a
aucune raison que ce cran soit le dernier.** Devant une portée qu'on vient
d'élargir, poser la question une fois de plus :

> **De quel cran l'ai-je bougée, et y a-t-il un cran au-dessus ?**

Les crans sont nommables, et ils forment une échelle qu'on peut remonter
explicitement : un répertoire → son paquet → les paquets frères → le dépôt. Un
`path.resolve` ne dit jamais où il s'arrête, et c'est exactement ce qui le rend
illisible — la portée ne RESSEMBLE pas à une affirmation.

### Le remède de forme, et pourquoi il n'est pas cosmétique

Une portée cesse d'être un chemin et devient une **liste de racines qui NOMME
ce qu'elle laisse dehors, avec sa raison** (`AUDIENCE_ROOTS`, et la table du
§ audiences de `services/gateway/CLAUDE.md`). Trois propriétés à tenir :

1. **Ce qui est dehors l'est pour une raison ÉCRITE** — « aucune lecture à
   garder », vérifiable — jamais par un chemin qui s'arrête là.
2. **Une racine déclarée et absente du disque JETTE.** Un balayage qui saute en
   silence une racine qu'il annonce reproduit le défaut exact qu'il corrige.
3. **Un témoin prouve que la nouvelle racine REND des sites.** Un relevé vide y
   est indiscernable d'une racine jamais parcourue — « un inventaire vide et un
   balayage aveugle sont le même vert ».

### Corollaire : une loi qu'un paquet ne peut pas IMPORTER est une loi qu'il va ignorer

La cause réelle n'était pas le `path.resolve` : `PARTICIPATION_VIVANTE` vivait
dans la passerelle, et le service agent ne peut rien en importer. La portée du
cliquet et la portée de la LOI étaient le même défaut vu de deux côtés.

> Avant de poser un cliquet sur une loi, demander **qui peut l'importer**. Un
> paquet hors de portée de la définition est hors de portée de la règle, quelle
> que soit la qualité du cliquet qui la garde ailleurs.

Déménager la loi dans `@meeshy/shared` en laissant une **coquille de ré-export
sous le MÊME nom** coûte zéro import réécrit (55, ici) et garde le cliquet, qui
reconnaît la loi à son orthographe.

### Et un témoin de garde doit tomber quand la garde part PAR ACCIDENT

Mesuré dans ce lot : la passe de documentation a effacé un `...PARTICIPATION_VIVANTE`
en réécrivant le commentaire voisin. Le témoin l'a dit immédiatement — parce
qu'il assert sur les lignes RENDUES, pas sur la forme du `where`.

Le retrait volontaire est le cas qu'on imagine en écrivant un témoin ; la perte
accidentelle est celle qui arrive. Un témoin qui compare la clause reçue à celle
qu'il attend ne vérifie que sa propre copie — et sur `bannedAt`, dont la colonne
est ABSENTE du document de qui n'a jamais été banni, il passe aussi bien avec la
clause juste qu'avec celle qui éteint la feature pour tout le monde.

### Et un compte s'écrit en posant la QUESTION, pas en lançant le `grep` le plus proche

Troisième erreur mesurée du même lot, et la plus instructive, parce qu'elle a été
commise **dans le lot qui écrivait la règle contre elle**.

Le lot a publié **TROIS comptes faux, dans trois documents, en deux passes** —
et chaque fois pour la même raison : la commande lancée répondait à une question
voisine de celle qui était posée.

| annoncé | mesuré | ce que la commande comptait vraiment |
|---|---|---|
| « 98 importeurs » | **55** (53 de production, 2 de témoins) | les fichiers qui **mentionnent** `unsetOrNull`/`differsOrUnset` — commentaires, journaux et balayages de texte compris |
| « 99 clés d'inventaire » | **89** (15 `DELIBERATELY_WIDE` + 74 `MEASURED_NOT_INSTRUCTED`) | `grep -c "':"` sur le fichier d'inventaires, donc **plus les 10 noms de `MEASURED_FAMILIES`** — des familles, pas des clés de site |
| « 4 témoins tombent » | **5** sur 7 | une prévision, jamais rejouée après l'ajout du troisième site |

> **Deux `grep` qui se ressemblent répondent à deux questions, et une seule est
> la vôtre.** Avant d'écrire un compte, écrire la QUESTION dont il est la
> réponse, puis vérifier que la commande la pose — un compte est une AFFIRMATION
> (cycle 93), et « j'ai une commande qui rend un nombre » n'est pas une mesure.
> Un compte d'inventaire se lit en **exécutant** l'inventaire
> (`Object.keys(...).length`), jamais en comptant des lignes de sa source : la
> source porte d'autres tables.

C'est le constat textuel du cycle 202 rejoué sur des comptes au lieu d'une
porte : **écrire une règle ne l'applique pas au lot qui l'écrit.** Le premier
faux a été corrigé par un commit qui, lui-même, laissait le chiffre résiduel
vingt lignes plus haut dans CE fichier, et n'avait pas regardé son voisin de
paragraphe. La relire contre son propre diff est une étape, pas une évidence —
et **la passe de correction a besoin de la même relecture que la passe
d'origine.**

### Et un témoin qui dépend de l'ORDRE de sa fixture teste l'ordre, pas la propriété

Quatrième erreur du lot, trouvée en prouvant le rouge des témoins ajoutés pour
réparer les constats de l'audit — c'est-à-dire **dans la passe qui réparait les
faiblesses de témoin**.

Le témoin de `groupByIn` qui garde « une clé ABSENTE et une clé `null` vont dans
le MÊME seau » avait sa fixture écrite `[{ userId: null }, { }]`. Il ne pouvait
pas tomber : un seau garde la valeur de la **première** ligne qui le crée, donc
la ligne `null` arrivant d'abord, la normalisation `?? null` n'était jamais
sollicitée. La mutation qui la retire laissait le témoin **vert**.

> Quand la propriété gardée est une **normalisation** — deux entrées qui doivent
> rendre la même sortie — la fixture doit la solliciter **depuis chaque côté**.
> Un seul ordre ne teste que le côté par lequel la valeur attendue arrive déjà
> normalisée. `it.each` sur les deux ordres coûte une ligne.

Le remède général : **prouver le rouge de chaque témoin séparément**, par la
mutation qu'il NOMME. C'est la seule étape qui distingue un témoin d'une
décoration, et elle a attrapé ici ce que la relecture n'avait pas vu — dans un
lot dont trois témoins sur quatre tombaient parfaitement.

### Déplacer une constante hors d'un paquet la retire des instruments de ce paquet

Le gain et la perte arrivent dans le même commit, et **seul le gain est
visible.**

Mesuré : `soft-state-equality-filter-guard.test.ts` (passerelle) RÉSOLVAIT
`PARTICIPATION_VIVANTE` tant qu'elle était un `const` local — il lisait son
littéral et vérifiait qu'elle ne cachait pas un `bannedAt: null` nu, l'écriture
qui ferme une conversation à toute la population jamais bannie. Déplacée dans
`@meeshy/shared` pour qu'un second paquet puisse l'importer, elle lui est
devenue OPAQUE.

Ce qui a sauvé la mesure n'est pas la relecture : c'est que **ce cliquet-là
publie sa propre liste d'angles morts** et rougit quand elle grandit. Un cliquet
qui se serait contenté de sauter ce qu'il ne résout pas serait resté vert, et la
couverture serait partie sans trace.

> La question à poser à tout déménagement de constante, de fonction ou de
> fichier : **qu'est-ce qui, à l'ancienne adresse, savait lire ce que je
> déplace ?** Les instruments d'un paquet — cliquets, balayages, résolveurs de
> littéraux — sont bornés à ce paquet, et ils ne se plaignent pas de ce qui
> sort de leur portée. C'est la leçon de la portée (ci-dessus) vue depuis
> l'objet déplacé au lieu de l'instrument.

Et le remède n'est jamais la seule ligne d'inventaire : **la couverture se REND
chez le paquet qui reçoit**, sinon l'exemption est une absolution.

### Post-scriptum : « cycle 203 » a été pris deux fois le même jour

Ce lot s'est d'abord numéroté 203. Une autre session a publié son propre
« cycle 203 » et l'a fusionnée dans `dev` pendant que celui-ci était en audit.

Les deux fichiers ne collisionnent pas — le numéro d'issue les sépare — mais le
NUMÉRO, lui, ne désigne plus rien. C'est #5102 appliqué au compteur de cette
routine : **un identifiant qui ne s'alloue pas collisionne**, et « cycle N » n'a
aucun allocateur.

Ce lot a cédé (renuméroté 204), par la règle d'asymétrie du dépôt : l'autre
était déjà sur `dev`, celui-ci ne l'était pas, et rien ne référençait son
chemin. **Celui qui n'a rien écrit cède** — ici « écrit » veut dire « fusionné ».
