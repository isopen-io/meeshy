## Une loi qui NOMME trois choses dans son en-tête peut n'en garder qu'une — celle pour laquelle on l'a écrite (#19978)

*2026-11-20, #19978.*

### Le motif

`mediaSideContent.ts` ouvre ainsi :

> « Ce qui voyage À CÔTÉ d'un média — **sa transcription en sous-titres**, sa
> description textuelle et ses traductions — et la loi UNIQUE qui décide s'il en
> a le droit. »

Trois choses nommées, « loi UNIQUE » revendiquée. Mesuré : la loi gardait la
**description**. La transcription ne passait par elle **à aucun endroit** du
sérialiseur socket ni de la liste REST, et le dépouilleur de traductions ne
retirait que la clé disque, jamais les mots.

Le biais est mécanique, et c'est le même qu'au cycle 128 sur un contrat
d'événement : **on garde ce qu'on vient d'ajouter.** La loi est née d'un lot sur
`alt` (#12333) ; son en-tête a été écrit en décrivant la CLASSE, son code en
traitant le CAS. Rien ne les confronte, et l'en-tête se relit ensuite comme un
inventaire.

### La règle

> **Un en-tête qui énumère est une AFFIRMATION, exactement comme un tri, un
> compte ou une contrainte de schéma.** Et il est plus crédible que les autres,
> parce qu'il est écrit à l'endroit le plus autorisé — sur la loi elle-même. La
> question à poser n'est pas « cette loi est-elle juste ? » mais **« chacune des
> choses qu'elle NOMME passe-t-elle par elle ? »**, et elle se répond en
> cherchant les appelants de chaque champ, pas en relisant la loi.

Le remède de structure : une loi qui nomme N choses expose **une** fonction qui
les sert toutes les N. Tant qu'elle expose un helper par champ, chaque site
d'appel choisit son sous-ensemble — et le sous-ensemble qu'il choisit est celui
que son auteur avait en tête ce jour-là.

### Le corollaire, trouvé en instruisant le champ voisin

`thumbHash` voyage aussi sans condition. La tentation est d'étendre la même loi.
C'est faux dans les deux sens, et la mesure le dit :

- la loi ferme sur le **FLOU**, où l'image elle-même voyage — y retirer
  `thumbHash` ne protège rien et coûte le placeholder ;
- elle ne dit rien de ce qui compte vraiment pour ce champ.

Ce qui compte, c'est **qui le re-juge au moment où il sert** :

| champ | nature | re-jugé par |
|---|---|---|
| `fileUrl`, `translations[].url` | une **CAPACITÉ** | la route : loi de sortie, scellement, signature par lecteur |
| `transcription`, `alt` | du **TEXTE** | personne — d'où la loi du contenu latéral |
| `thumbHash` | du **CONTENU** (~20 octets qui décodent en image) | **personne**, et il n'a pas de loi |

> **Une protection adossée au refus d'une route ne couvre que ce qui PASSE par
> la route.** La leçon 275 apprend à regarder tout ce que la charge transporte ;
> celle-ci ajoute un cran : de chaque chose transportée, demander *qui la
> re-juge au moment où elle sert* — et traiter différemment une adresse (qu'on
> peut refuser plus tard) et un contenu (qu'on ne peut plus reprendre).

Conséquence de lot : la part mécanique se corrige, la part qui demande de
décider ce que l'utilisateur voit à la place devient une issue (#20006). Les
mélanger aurait livré un changement d'affichage sous un titre de sécurité.
