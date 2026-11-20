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

### Et le correctif a failli être PIRE que la fuite

L'audit adversarial a rendu BLOQUANT, et le constat qui compte n'est pas une
imprécision : **la première rédaction rendait `GET /messages` et `GET /sync` en
500.**

Elle retirait la clé `transcription` de chaque piste traduite. Le contrat partagé
la déclare **REQUISE**, et `fast-json-stringify` LÈVE sur une requise absente :

```
STRIPPED THREW: Error | "transcription" is required!
```

Donc la **page entière**, pas la pièce. Et sur `/sync`, la pagination par curseur
ramenant la même ligne à chaque tentative, le rattrapage delta était bloqué
**définitivement** pour ce lecteur. Le déclenchement était nominal : la loi ferme
sur tout `expiresAt` POSÉ, qu'une conversation éphémère pose à la création.

> **Un correctif de confidentialité qui casse la lecture d'une page entière est
> pire que la fuite qu'il ferme.** La question à poser à tout retrait de champ
> n'est pas « qui le lit ? » mais **« qui le DÉCLARE requis ? »** — et elle se
> répond dans `packages/shared/types/api-schemas/`, pas chez les clients, qui
> tous trois le tolèrent nullable. C'est le sérialiseur SERVEUR qui ne tolère
> pas.

La suite complète était VERTE dessus (2 945 suites). Rien ne faisait traverser le
sérialiseur à une pièce **protégée** portant une piste traduite : les témoins de
protection n'exerçaient pas la sérialisation, et les témoins de sérialisation
n'exerçaient pas la protection. **Le défaut vivait dans l'intersection vide de
deux familles de témoins qui, chacune, couvraient bien sa moitié.**

### Le corollaire : « garder le médium » n'est tenable que si quelque chose sait l'ÉLIRE

La justification que j'avais écrite — « il retient le TEXTE, jamais le MÉDIUM :
`url` et `durationMs` restent, car l'adresse a sa propre loi plus forte » — est
défaite par une loi que le dépôt énonce et que je citais par ailleurs : *la piste
est élue par la langue du TEXTE SERVI* (cycle 128).

Vider les mots sans vider la carte rend donc les `url` qu'on croyait garder
**inatteignables** côté web (il retombe sur la piste originale, et la bulle
affiche le nom de fichier), pendant qu'iOS — qui élit sur les langues
disponibles — joue la piste traduite **sans aucun texte**. Deux clients
divergents sur la même charge.

> J'avais traité le texte et le médium comme deux familles indépendantes parce
> que leurs LOIS sont indépendantes. Leur **couplage n'est pas dans les lois,
> il est dans le mécanisme d'élection** — et un mécanisme ne se trouve pas en
> relisant des lois.

### Ce que le lot est devenu

Réduit à ce qui est provablement sûr : la transcription ORIGINALE. Le texte
traduit reste servi, écrit comme une **dette au site** avec ses deux mesures
(#20015), parce que le fermer exige de trancher le contrat partagé ET le
comportement produit du Prisme audio. Trois autres fuites de la même famille,
toutes antérieures, sont devenues #20016, #20017 et #20018 — dont une qui rend
ce lot-ci **inerte pour le web** tant qu'elle est ouverte.

