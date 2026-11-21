## Une course a DEUX côtés, et on ne ferme que celui qu'on regarde

*2026-11-18, cycle 179 (#19688). Relevé par l'`auditeur-adversarial` sur un lot
qui venait précisément d'énoncer la règle qui l'attrapait.*

Le lot fermait une course : trois portes de rentrée d'une conversation posaient
`isActive: true` sur une ligne que le bannissement venait de marquer, parce que
la garde vivait en AMONT de l'écriture (dans la lecture) et pas dans sa clause.
Le correctif est juste, les témoins tombent, la leçon était écrite :

> « L'état que l'écriture POSE est-il encore légitime au moment où elle commet ?
> — et seule la clause de l'écriture peut y répondre. »

**Elle n'avait été appliquée qu'à une des deux écritures de la course.** Dans
l'ordre inverse — le bannissement LIT une ligne inactive, décide d'écrire
`{ bannedAt }` seul (« un membre déjà parti n'a plus d'appartenance à retirer »),
une rentrée commet, puis le bannissement commet sur un `where: { id }` sans garde
d'état — la ligne finissait dans **exactement le même état interdit**. Et en
prime COLLANT : rebannir est refusé en `400 « déjà banni »`.

> **Devant une course entre A et B, fermer A ne ferme pas la course.** La
> question se pose une fois par ÉCRITURE, pas une fois par course — et celle
> qu'on examine est, par construction, celle qu'on tenait pour la coupable. Le
> réflexe à prendre : *qui d'autre écrit l'un des champs de cet état, et sur
> quelle lecture décide-t-il ?*

### Le correctif n'était pas une garde de plus

Symétriser la garde (`where: { id, isActive: false }` + relecture) aurait
fonctionné, et c'est la mauvaise réponse : coûteuse, et elle refuse là où il n'y
a rien à refuser. La bonne est dans la **donnée** — reposer `isActive: false`
dans la branche « déjà dehors » :

- c'est un **no-op** sur une ligne réellement inactive, donc gratuit dans le cas
  nominal (99,99 % des appels) ;
- il **ÉCRASE** la rentrée qui aurait gagné la course, ce qui est le bon verdict :
  un banni est dehors ;
- `leftAt` n'est pas réécrit, ce qui était la raison d'être de cette branche.

> Quand deux écritures se disputent un état, la seconde n'a pas toujours besoin
> de REFUSER : il lui suffit parfois de **réaffirmer** ce qu'elle veut. Une garde
> arbitre, une réaffirmation gagne — et une réaffirmation idempotente ne coûte
> rien à ceux qui ne sont pas dans la course.

### Et un lot qui corrige N scanners doit compter ceux qu'il TOUCHE

Le même audit a trouvé ce que j'avais manqué : le lot avait enseigné la nouvelle
graphie d'écriture à **trois** balayages et pas au **quatrième**, dont il
modifiait pourtant l'inventaire dans le même commit. Le quatrième posait une
AUTRE question (quelle loi d'entrée juge cette porte ?), et c'est ce qui l'a
rendu invisible : je cherchais « qui compte les écritures de rentrée ? », pas
« qui compte les écritures, tout court ? ».

> **La liste des cliquets à instruire ne se dresse pas en cherchant ceux qui
> posent MA question.** Elle se dresse en cherchant ceux qui lisent le SITE que
> je déplace — quelle que soit la question qu'ils lui posent. Un cliquet dont
> j'édite l'inventaire dans le même commit et dont je n'ai pas relu le scanner
> est un angle mort signé.
