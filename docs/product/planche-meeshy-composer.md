# MeeshyComposer — la planche, version allégée

> **Source de vérité = ce dépôt.** Ce fichier `.md` et son jumeau `planche-meeshy-composer.html`
> (rendu de design complet, 100+ révisions) sont la vision maintenue du composer unifié. Un artifact
> publié peut disparaître ; ces fichiers, non. L'**état** de chaque tâche vit dans son **issue GitHub**
> (projet « Meeshy — pilotage » #1) ; en cas d'écart, l'issue a raison.
>
> Cette version allégée sert de référence rapide (sans le CSS/JS ni les maquettes du `.html`). Les
> **captures des vues cibles** vivent dans `docs/product/planche-meeshy-composer/` et sont produites
> par l'issue **#3989** ; ce document les référence au fur et à mesure.

## Ce qu'est le composer
Un seul composer produit quatre formats — **Story**, **Post**, **Réel**, **Mood** — et trois viewers
(Story · Post · Réel) partagent un seul noyau de lecture (`MeeshyScenePlayer`). Le contenu est un
**document** d'objets (`text` · `media` · `audio` · `drawing` · `sticker` · `mention` · `location`)
posés sur une **scène 9:16** à trois plans (`.background` · `.content` · `.foreground`), lus par une
**timeline « un plan »**. Changer de format ne jette jamais le contenu (loi 9, livrée 2026-08-27).

## Le modèle — slides, scènes, objets (normalisé 2026-08-27)

> **Sémantique complète : [`meeshy-composer-modele.md`](meeshy-composer-modele.md).**
> La planche porte la VISION, ce fichier-là porte la SÉMANTIQUE ; en cas d'écart sur un
> **nom** ou une **règle**, le modèle a raison.

```
MeeshyPublication  (profil S | R | P | M)
└── slides: [MeeshySlide]                     1..10
     └── MeeshySlide = MeeshyScene + description
          └── MeeshyScene (ratio)
               └── objects: [MeeshySceneObject]    plans: background · content · foreground
```

Quatre noms, et rien d'autre : **`MeeshySceneObject`** (l'unité posée) · **`MeeshyScene`** (la surface
qui les restitue) · **`MeeshySlide`** (une scène + sa description) · **`MeeshyPublication`**
(un profil + ses slides). Tout code neuf et toute issue parlent ce vocabulaire (#4048).

### Ce que les quatre noms NE couvrent pas — le chrome

Les quatre noms décrivent le **contenu**. La moitié des règles de cette planche parlent de ce qui
l'**entoure** : une barre, un rail, un socle, un inspecteur. Sans nom, ces pièces se décrivaient par
périphrase (« la zone en bas », « la rangée »), et deux règles voisines pouvaient désigner la même
chose autrement. L'inventaire ci-dessous est donc la **seconde moitié** du vocabulaire — il ne crée
aucun type, il NOMME ce qui existe déjà dans le code.

| Nom | Ce que c'est | Sur quel niveau du modèle il agit | Dans le code |
|---|---|---|---|
| **la surface** | l'écran monté : `document` · `scène` · `mood` | rend une `MeeshyPublication` | `ComposerSurfaceKind` |
| **le plateau** | le fond teinté qui porte tout, trois teintes, toujours sombre | aucun — c'est le support | `PlateauTint` |
| **la barre haute** | `✕ · [type ▾] · rail · ⋯` | la `MeeshyPublication` (son profil, ses slides) | `exitAffordance` |
| **l'éventail** | le menu vertical de verre qui choisit le profil | le **profil** de la `MeeshyPublication` | `ComposerFormatFan` |
| **le rail** | la bande des slides du document | les `MeeshySlide` de la publication | `slideRail` |
| **le `⋯`** | ce que le document sait faire et que rien d'autre ne fait | la `MeeshyPublication` entière | `overflowMenu` |
| **la scène incrustée** | la `MeeshyScene` de la slide courante, rendue dans l'écran document | une `MeeshyScene` | `EmbeddedSceneCanvas` |
| **l'inspecteur** | les contrôles de l'objet sélectionné, au-dessus des outils | UN `MeeshySceneObject` | `EmbeddedSceneInspector` |
| **la rangée d'outils** | les portes qui font ENTRER de la matière + la langue déclarée | crée des `MeeshySceneObject` | `toolRow` |
| **les amorces** | sur une scène vide : caméra · dernière capture · « touchez pour écrire » | crée le PREMIER `MeeshySceneObject` | `blankCanvasStarter*` |
| **le socle** | Audience · Aperçu · Publier — il ne bouge jamais (loi 5) | la `MeeshyPublication` (ce qui part) | `socle` |

**Règle de lecture de cette planche** : chaque règle nomme le niveau sur lequel elle agit — un
`MeeshySceneObject`, une `MeeshyScene`, une `MeeshySlide`, la `MeeshyPublication`, ou une pièce de chrome
de la table ci-dessus. Une règle qui n'en nomme aucun décrit un comportement dont on ne sait pas ce
qu'il touche : c'est la forme sous laquelle deux lots finissent par se contredire.

**Une `MeeshySlide` est TOUJOURS une `MeeshyScene`.** Une slide qui ne porte qu'un média est une
scène dont le seul `MeeshySceneObject` occupe le plan `background` — il n'existe pas deux formes de slide.
C'est ce que la planche disait déjà (« chaque slide est une Scene du document », P8), et c'est ce qui
rend vraie sans cas particulier la demande de départ : une `MeeshyScene` doit pouvoir être **un seul
média présentable** dans un réel ou un post.

**Ce qu'une `MeeshySlide` SIGNIFIE dépend du profil de sa `MeeshyPublication`** — le point le plus
facile à rater. Le même objet ne dit pas la même chose selon S · R · P · M :

| | Story (S) | Réel (R) | Post (P) | Mood (M) |
|---|---|---|---|---|
| Une `MeeshySlide` EST | une story entière | le réel entier (le réel EST la `MeeshyScene`) | **UN média du post** | — |
| Nombre de `MeeshySlide` | plusieurs | 1 | plusieurs | 0 |
| La **description** de la slide est | **le contenu** | **le contenu** | **la légende de ce média** | — |
| `content` de la `MeeshyPublication` | = la description de sa slide | = la description de sa slide | **propre au post** | le contenu, seul |
| Sortir un `MeeshySceneObject` de la scène | interdit | autorisé | autorisé | — |

**Poser un média sur une `MeeshyScene`, une seule règle — elle choisit un PLAN, jamais une file.**
Pas de fond visuel ⇒ le `MeeshySceneObject` naît au plan `background` ; un fond déjà là ⇒ il naît au plan
`foreground`. Un `MeeshySceneObject` de kind `audio` prend le **son de fond** — la seconde place du plan
`background` — s'il est libre. Aucune question n'est posée à l'utilisateur (#4038).

**Taper la scène incrustée sélectionne un `MeeshySceneObject`, et l'inspecteur paraît juste au-dessus de
la rangée d'outils (#4035).** Aucun objet sélectionné ⇒ **inspecteur absent**, jamais un panneau
vide. Et le geste est un **va-et-vient** : le même tap referme, sinon une sélection posée sur le
plan `background` n'aurait aucune sortie.

**Une chaîne dont chaque maillon est juste peut ne transporter personne.** L'inspecteur était câblé
de bout en bout — la scène incrustée transmet la sélection, le meuble la retient, la surface le monte
— et pourtant inatteignable : en Post une `MeeshySlide` ne porte qu'UN `MeeshySceneObject`, la règle de
placement le met au plan `background`, et le hit-test du canvas n'itère que les plans `content` et
`foreground`. Le tap retombait sur « fond touché », qui EFFAÇAIT la sélection. La question à poser à
un câblage n'est donc pas « le rappel est-il branché ? » mais **« le geste réel de l'utilisateur
atteint-il ce rappel ? »**.

La correction vit côté APP, jamais dans le geste du SDK : rendre le plan `background` hit-testable
côté canvas changerait la manipulation de la surface `scène`, que ce lot doit laisser intacte.
**Le SDK dit quel `MeeshySceneObject` a été touché ; l'app décide ce que cela sélectionne.**

**L'amorce « dernière capture » paraît enfin (#4036).** Les amorces sont les portes qui créent le
PREMIER `MeeshySceneObject` d'une `MeeshyScene` vide ; celle-ci est construite, câblée et documentée
depuis S5 — l'ancre A4 promet « la dernière photo accessible en 1 geste » — et ne s'était **jamais
affichée**, même autorisation complète accordée : l'auteur voyait la capsule « Galerie » à sa place.

La cause était un mode de livraison PhotoKit. `.fastFormat` ne rend que ce qui est **déjà local** et
ne télécharge jamais — `isNetworkAccessAllowed` ne le gouverne pas. Un asset iCloud dont la vignette
locale a été purgée (le cas nominal sous « optimiser le stockage », réglage par **défaut**) rendait
donc `nil`, et l'amorce disparaissait sans un mot. Le code AUTORISAIT pourtant le rapatriement
réseau, deux lignes plus bas : une intention posée qu'aucun réglage n'honorait.

> **Un repli qui rend `nil` en silence ne se voit pas dans les tests : il se voit à l'écran, sous la
> forme d'une affordance qui n'arrive jamais.** Il ne s'attrape donc ni en lisant le code — qui a
> l'air complet — ni en comptant les tests, mais en OUVRANT l'écran et en cherchant ce que la spec y
> promet.

**Le socle RÉTRÉCIT aux grandes tailles de texte, il ne se casse pas (#4057).** Le socle porte ce qui
décide de la `MeeshyPublication` entière — son audience, son aperçu, son départ — et ses deux zones
nommées portent un pictogramme et un mot ; aux paliers d'accessibilité, le mot ne tient plus. Mesuré
en allemand à `accessibility-XXXL` : « Veröffentlichen » se cassait en syllabes **empilées** —
« Ver- / öf- / fent- / li- » — et « Öffentlich » se tronquait en « Öffe… ». Les deux zones se
retrouvaient à **104 pt d'écart vertical** : l'action terminale du composer était devenue une colonne
de fragments. Au-delà du seuil, les libellés cèdent la place à leur icône, **au même endroit** — la
loi 5 est préservée parce que les zones ne se déplacent pas, elles rétrécissent.

**La loi 5 dit « le socle ne bouge jamais ». Elle ne dit rien de ce qui arrive quand il ne TIENT
plus** — c'est une loi de position, pas de dimension. Deux choses ne rétrécissent jamais avec le mot :
le **nom accessible** (un contrôle qui perd son nom en devenant compact est inatteignable à Voice
Control) et la **cible de 44 pt**, qui est un plancher et non une conséquence du contenu.

**La rangée d'outils DÉFILE, et le drapeau de langue reste fixe (#4032).** Elle porte les portes qui
font ENTRER de la matière — chacune crée un `MeeshySceneObject` — plus la langue déclarée, qui devient la
`locale` de tout objet posé. Statique, elle sortait de l'écran dès les grandes tailles de texte :
mesurée à `accessibility-XXXL`, elle occupait **630 pt sur un
écran de 402, calée à x = −114** — coupée des DEUX côtés, avec des outils qu'aucun geste
n'atteignait. Après : x = 16, largeur 370.

**Un retour porteur qui annule un lot ne condamne pas toujours l'idée.** Celui du 2026-08-27
condamnait le fond NOIR sous le drapeau, sur un plateau navy — pas le défilement —, et il posait sa
condition de retour en toutes lettres : « un fond d'occultation ALIGNÉ sur la teinte du plateau ». Le
dégradé va donc de la teinte transparente à la teinte pleine du **plateau**, celle que le meuble peint
déjà sur tout l'écran : invisible tant que rien ne passe dessous, il se fond dès qu'un outil y
glisse. La condition est tenue par une garde, pas par une promesse.

**L'appui long sur un `MeeshySceneObject` ouvre SES actions, et elles seules (#4046).** Le menu servait
ses cinq entrées à tout objet non verrouillé, et deux n'avaient alors aucun effet : « Mettre au
premier plan » un objet **seul de son plan** ne déplace rien — le menu proposait un geste dont le
résultat est l'écran d'avant —, et « Modifier » délègue à un rappel que l'**hôte** fournit, que la
scène incrustée ne transmet pas : l'entrée s'y peignait au-dessus d'un `nil`. Un objet du plan
`background` n'empile pas non plus : l'empilement ordonne le plan `foreground`, où il ne vit pas.

**Le frère de plan se compte sur les sept kinds, pas sur les médias.** L'empilement ordonne le `z` de
TOUS les `MeeshySceneObject` du plan `foreground` — c'est ce que le rendu trie. Ne compter que les objets
de kind `media` dirait « seul » d'un objet posé sous un `text`, et retirerait une action qui a bel et
bien un effet.

**VoiceOver lit la MÊME règle, sur le même `MeeshySceneObject`.** Annoncer à l'oreille une action que le
menu visuel ne sert pas rouvrirait le cul-de-sac par l'autre porte, et en pire : rien ne le dirait.

**Un `MeeshySceneObject` de kind `audio` posé sur une `MeeshyScene` en devient la BANDE-SON (#4052).** Le
plan `background` porte DEUX places, pas une : un visuel **et** un son. Avec le plan `foreground`,
cela fait trois emplacements, pas une file unique. Le refus du SDK — « un son n'a pas de place de
fond sur un canvas » — était juste du visuel, et faux du son. Un second objet `audio` ne remplace pas
le premier en silence : il naît au plan `foreground`, où il reste audible, plutôt que de faire
disparaître la bande-son que l'auteur venait de choisir.

**Un objet `audio` n'ouvre PAS de `MeeshySlide`.** En Post chaque `MeeshySceneObject` de kind `media`
ouvre sa slide ; un `audio`, non — il appartient à la `MeeshyScene` qu'on regarde. Deux conséquences
se paient sur le **rail**, et les deux étaient des régressions muettes : la vignette du vocal
affichait une icône de DOCUMENT (or un son du plan `background` ne peint aucune pastille sur le
canvas — ce chip est le seul témoin à l'écran qu'une publication a une bande-son), et son ✕ ne
s'affichait **plus jamais**, la croix étant réservée au chip sélectionné et un `audio` n'ayant aucune
`MeeshySlide` à sélectionner : **le vocal devenait irretirable**. Un chip du rail qui ne mène à
aucune slide porte donc toujours sa croix — c'est sa seule action.

**Le mime DÉCLARÉ voyage avec le `MeeshySceneObject` posé (#4038).** Poser un média sur une `MeeshyScene`
COPIE son fichier sous `{objectId}.{ext}` — l'`id` de l'objet EST le nom du fichier —, et c'est ce
NOM que tout l'aval relit pour étiqueter le téléversement. Le choix
de l'extension EST donc le transport du mime — et il était guessé : une URL source sans extension
faisait baptiser « jpg » un PNG, « mov » un MP4. Rien ne rougissait : le fichier existe, l'objet se
pose, le canvas l'affiche ; seul le serveur reçoit un type faux. L'ordre est désormais
**extension de la source → mime déclaré → repli**, et le repli n'a pas disparu : il a cessé d'être
le premier choix.

**La barre haute porte tout ce qui décrit la `MeeshyPublication`** — `✕ · [Post ▾] · ▭ ▭ · ⋯` :
fermer, le **profil** (l'éventail), le **rail** de ses `MeeshySlide`, le `⋯`. Le rail y remplace le
bandeau de vignettes d'un seul tenant : les slides sont la STRUCTURE de la publication, elles se
lisent donc là où se lit son profil, pas au milieu des outils, qui créent des `MeeshySceneObject`
(#4047).

**Le profil de la `MeeshyPublication` se choisit dans un MENU VERTICAL en verre — l'éventail —, pas
dans une rangée de chips.** Une rangée
grandit avec le nombre de formats et repousse les slides hors de l'écran ; surtout, elle ne DIT pas
l'état courant, elle le teinte. Un menu le nomme sur son libellé — la forme juste pour un réglage à
valeur unique, et déjà celle des deux autres sélecteurs de l'écran (audience du socle, visibilité de
l'atelier). Il n'y figure **que ce que le contexte permet** : l'itération porte sur `offeredFormats`
et sur rien d'autre, donc un format non offert y est ABSENT, jamais grisé (loi 4).

**L'éventail offre les QUATRE profils, filtrés par disponibilité — Mood compris (#4030).** Le fil
n'en offrait que deux (+ Réel quand la composition qualifie) : le Mood n'était atteignable que par sa
propre porte, si bien qu'écrire deux lignes ici puis vouloir en faire une humeur obligeait à fermer,
revenir et **retaper** — la loi 9 (« le contenu est préservé à travers les formats ») tombait sur le
seul profil qu'aucune bascule n'atteignait. Le Mood est offert **quand la composition est du texte
seul, non vide** : une `MeeshyPublication` de profil M n'a AUCUNE `MeeshySlide`, donc ni scène ni
objet. Son gate est la JUMELLE de celui du Réel et lui est **exclusif par construction** — l'un exige
un `MeeshySceneObject` de kind `media`, l'autre l'interdit.

**Un gate qui se referme sous les doigts est un défaut, pas une rigueur.** Posé sur le seul texte,
celui du Mood aurait retiré le profil à l'auteur qui efface sa phrase pour la réécrire : l'éventail
se serait refermé, le repli l'aurait renvoyé à la surface `document` **en pleine frappe**. Un emoji
déjà posé est la preuve qu'une `MeeshyPublication` de profil M est en cours — il tient le profil
ouvert le temps de la composition, sans pour autant racheter un `MeeshySceneObject` de kind `media`.

**Et l'ordre n'est pas négociable : le publieur AVANT l'éventail.** Un profil offert par l'éventail
sans publieur derrière est une publication qu'on peut composer et pas envoyer. Offrir `.status` sans donner à la
porte du fil sa branche d'envoi aurait armé une flèche que le plan d'envoi refuse sur son premier
`guard` — format offert, bonne surface, envoi qui ne part pas. Le pire des deux mondes, puisqu'il a
l'air de marcher.

**Le `⋯` porte ce qui agit sur la `MeeshyPublication` ENTIÈRE, et que rien d'autre à l'écran ne
fait** — pas les entrées de la surface `scène` reprises par ressemblance de nom. Transitions et
Timeline outillent une `MeeshyScene` COMPOSÉE, que la surface `document` n'édite pas ; « supprimer
les slides » a déjà son geste (le ✕ de chaque chip du rail) ; « sauvegarder le brouillon » n'a aucun
chemin ici. Restent **Retirer le fond** — poser une couleur au plan `background` était une porte à
sens unique, aucun contrôle ne l'effaçait — et **Tout effacer**, qui porte plus loin que le rail :
il vide la publication, texte · fond · lieu · transcription en plus de ses `MeeshySlide`. Aucune
entrée servie ⇒ **aucun `⋯`** : un menu vide est la forme la plus sournoise de l'UI morte, il a
l'air de marcher jusqu'au tap.

**Le composant Position porte le LIEU, pas la catégorie « position » (#4034).** Il gouverne le lieu
de la `MeeshyPublication` — à ne pas confondre avec un `MeeshySceneObject` de kind `place`, la pastille
qu'on POSE sur une scène : celui-ci décrit d'où l'on publie, celui-là décore une image. Son titre
était le mot « Position » ; le nom du lieu vivait ailleurs, dans un chip de la rangée d'outils, avec
sa propre croix. Un réglage dont l'objet se lit à l'autre bout de l'écran n'est pas un réglage —
c'est deux moitiés qu'on rapproche de tête. L'entête réunit les trois questions de l'auteur sur une
ligne : *quel lieu ?* (le nom), *est-il trouvable ?* (la bascule), *comment l'enlever ?* (une croix
en verre). Le chip de la rangée disparaît.

**Et le titre du composant descend jusqu'à l'adresse avant d'abandonner.** Un point posé à la main
n'a pas de nom : l'entête affichait alors « Position » — le mot générique — pendant que l'adresse
complète venait d'être montrée par le sélecteur, une seconde plus tôt. Une PUCE répond à « cette
`MeeshyPublication` a-t-elle un lieu ? » et peut se contenter du mot ; un TITRE répond à
« lequel ? » et doit descendre : nom, puis adresse, puis le mot en dernier recours.

**Le composant se monte sur le LIEU de la publication, jamais sur l'opt-in.** La découvrabilité « à
proximité » exige une audience publique ; le lieu, non. Garder l'ancienne garde après avoir retiré le
chip aurait fait disparaître de l'écran le lieu d'une `MeeshyPublication` privée — et avec lui le
seul moyen de le retirer. La règle d'opt-in gouverne désormais l'INTÉRIEUR du composant : sans elle,
ni bascule, ni chevron, ni détail (loi 4). Reste le nom et sa croix.

**Dans le rail, le ✕ de retrait ne se peint que sur la `MeeshySlide` SÉLECTIONNÉE.** À 40 pt il
occupe le quart du chip : viser une vignette pour amener sa slide à l'écran la supprimait.
Sélectionner reste à un geste sur tout chip, supprimer en demande deux — l'ordre juste pour une
action irréversible.

**L'ŒIL d'aperçu revient au socle** dès que la publication a une `MeeshyScene`, et seulement là. Il
ne rend rien lui-même : il remet ses `MeeshySlide` au LECTEUR (`StoryViewerView`), celui qui rendra
la `MeeshyPublication` — loi 6, un aperçu maison serait un quatrième chemin de rendu.

**Un `MeeshySceneObject` se manipule par appui long** : Monter · Reculer · Modifier · Sortir de la scène
(sauf en profil S) — chacune servie seulement si elle a un effet, jamais grisée (#4046). « Sortir de
la scène » promeut l'objet en `MeeshySlide` à lui seul ; c'est le geste inverse de « poser un
média », et le seul qui fasse traverser à un objet la frontière DEDANS/DEHORS.

## Les douze lois (doctrine, P1)

> **Alignées sur le HTML le 2026-08-28.** Cette liste et celle de la planche HTML avaient
> DIVERGÉ sur cinq des onze entrées (1, 2, 3, 6 et 11) — deux doctrines pour un seul composer,
> et rien ne le signalait. Le HTML fait foi ; ce qui suit en est la transcription.

1. **Le format est un CHAMP**, jamais un écran : on entre dans le composer, déjà réglé.
2. **Un objet, cinq familles en moins** — texte, média, sticker, son, lieu, dessin, mention deviennent un seul `MeeshySceneObject`.
3. **La scène est 9:16, toujours** ; le porteur garde son ratio, le hors-champ devient deux bandes actives. Pas de visuel ⇒ pas de scène du tout.
4. **Rien à l'écran sans raison** : un contrôle d'objet existe ssi l'objet l'accepte ET le profil l'autorise ET l'action a un effet — absent, jamais grisé.
5. **Le socle ne bouge jamais** (Audience · Aperçu · Publier), lisible sur les trois teintes du plateau.
6. **Le lecteur EST l'aperçu** : composer et viewers partagent un seul registre de rendu. WYSIWYG par construction.
7. **L'icône est le verbe** (`↻`, `♫〰`, `👁`) — jamais doublée d'un texte.
8. **Un seul temps, celui du contenu** : la lecture survit au changement de chrome (carte → détail → plein écran → PiP).
9. **La porte ne fixe que l'état INITIAL, le CONTENU est préservé** entre modes (rév. 3, 2026-08-27).
10. **L'audience se souvient PAR FORMAT** ; « dernière utilisée » est indexée S/P/R/M.
11. **Personne ne lit du vide** : l'archive est toujours restituée, et un contenu illisible devient une sentinelle dans la langue du lecteur.
12. **Le CÔTÉ dit la nature du geste** (rév. 27) : le rail *leading* fait ENTRER de la matière, le rail *trailing* AGIT sur ce qui est là. Un contrôle ne change jamais de rail — et jamais « gauche/droite », que l'arabe échange.

Deux lois du .md n'étaient PAS dans le HTML et ne sont pas perdues : « réemploi total »
est une règle de MÉTHODE (elle vit dans l'inventaire P2), et « la complexité se paie dans le
CODE » est la **dimension 12** de la roadmap produit, pas une loi du composer.

## Les sections de la planche (P0→P24)
| P | Sujet | Ce qu'on y trouve |
|---|---|---|
| P0 | Avancement | tableau de bord daté (matrice `data-state`, camembert) — DESIGN, l'issue fait foi |
| P1 | Doctrine | les douze lois ci-dessus |
| P2 | Inventaire | les ~85 vues story + feed + mood + repost + 3 viewers, et leur portage vers le modèle d'objet |
| P3 | Carte de navigation | dix portes → un composer → trois viewers |
| P4 | Anatomie | le plateau (fond configurable), la scène 9:16, le socle 3 membres, les états AMORCE/INSPECTEUR |
| P5 | Entrées & profils | l'intention connue d'avance ; la grappe « document du fil » (4 dettes) |
| P6 | La scène | 9:16 fixe, bandes actives d'ancrage, ancrage SÉMANTIQUE (rang, pas coordonnées) |
| P7 | Les outils | 9 cartes : Texte (18 styles) · Média (8 filtres) · Son · Dessin · Sticker · Lieu · Références · Fond · Slides |
| P8 | Timeline | « un plan » : pistes empilées par plan, durée horizontale, pistes fantômes, keyframes |
| P9 | Capture | l'appui long ouvre le viseur, sans mode à armer |
| P10 | Socle & publication | audience 6 niveaux, aperçu = lecteur, Publier → file offline (`PublishIntent`) |
| P11 | Étagère | une liste sectionnée : File · Brouillons · Publiées · Archive |
| P12 | Les viewers | trois chromes, un noyau ; rail figé à l'entrée du slide |
| P13 | Matrice maîtresse | chaque outil × chaque format, exactement (✓ existant / ◆ nouveau / — absent) |
| P14 | Nouveautés & arbitrages | 13 cartes neuves + O1→O16 tranchés |
| P15 | Revue système | budgets perf, portes API iOS 16→27, registre des risques |
| P16 | **Écart SOTA** | 14 manques assumés + les non-buts |
| P17 | Simplification | la passe de coupes + la **décision A′** (rupture v3) |
| P18 | Entrées externes | partage entrant (share extension) & média reçu (2 gestes) |
| P19 | Continuité & PiP | un seul temps ; **livré** (formalisation d'un contrat mergé) |
| P20 | La rupture vécue | écriture stricte v3 armée par drapeau ; **infra mergée**, reste l'armement |
| P21 | 18 styles de texte | spécimen — **18/18 résolus** (iOS + web) · un style est une POLICE ; l'EFFET (lueur · ombre · relief) est un second axe, `textEffect`, rendu par les trois clients (#4870) |
| P22 | Iconographie | le SF Symbol de chaque contrôle — **~80 % câblé** |
| P23 | Éditeurs | trim audio · rognage image · cut vidéo (noyaux SDK existants) |
| P24 | Cas d'usage | carrousels & réels, avec et sans son (matrice de garde) |

## L'écart SOTA restant (P16) — ce qui reste à faire
- **v1 / quick-win** : alt text média (#3951), presets d'animation de texte (#3952).
- **v1** : stickers interactifs + table votes (#3953/#3954), détourage « lift » (#3955), GIF animé (#3956),
  vitesse média (#3957), layouts (#3958), désactiver les commentaires (#3959).
- **Horizon ultérieur** : publication programmée (#3960), duo (#3961), co-auteur (#3962), beat-sync (#3963).
- **Non-buts** (jamais d'issue) : filtres AR de visage, live, voice changer.

## Le pilotage de tout ceci
Milestones sémantiques du projet #1, chacun un résultat :
- **#47** Le composer atteint la SOTA — les manques encore assumés
- **#48** La rupture v3 s'arme et se lit partout
- **#49** Les trois éditeurs vivent dans le composer
- **#50** Le document du fil a enfin une issue de publication
- **#51** L'audience se choisit à six niveaux, partout
- **#52** Un post porte un son de fond
- **#53** L'Étagère unifiée — brouillons, file, publiées, archive
- **#54** Le composer se montre — spécimens, glyphes et gardes
- **#55** Aucun geste du composer ne perd du contenu
- **#56** Le web compose comme iOS — parité vue par vue

Le milestone **#4 « Composer v2 — finitions »** porte déjà le gros du reste (timeline #3561, reader #3566,
file #3562/#3568, audio #3564/#3567, capture #3776, portes #3783/#3844, scène #3557, gardes #3558/#3559…).

## Vues de référence (captures) — #3989
Générées depuis le rendu du `.html` (Chrome, ×2) dans `docs/product/planche-meeshy-composer/`.
**46 captures** : 40 maquettes téléphone `<section>-figNN.png` + 6 planches de section `<section>-full.png`.

| Fichier | Vue |
|---|---|
| `p4-fig01.png` | Le composer au repos (profil Story, socle 3 membres, scène 9:16 à bandes) |
| `p5-fig01..04.png` | Les portes d'entrée (tray, feed, réels, mood/repost) |
| `p6-fig01..03.png` | La scène : porteur 9:16, porteur 16:9 à bandes, document sans scène |
| `p7-full.png` | Les 9 outils (Texte · Média · Son · Dessin · Sticker · Lieu · Références · Fond · Slides) |
| `p8-full.png` | La timeline « un plan » |
| `p9-fig01..03.png` | La capture par appui long |
| `p10-fig01..03.png` | Le socle & la publication (audience, aperçu, Publier) |
| `p11-fig01.png` | L'Étagère |
| `p12-fig01..03.png` | Les trois chromes viewers |
| `p13-full.png` | La matrice maîtresse (outil × format) |
| `p18-fig01..06.png` | Les entrées externes (partage entrant, média reçu) |
| `p19-fig01..03.png` · `p20-fig01..04.png` | Continuité/PiP · la rupture v3 vécue |
| `p21-full.png` | Les 18 styles de texte (chacun dans sa police) |
| `p22-full.png` | L'iconographie (le SF Symbol de chaque contrôle) |
| `p23-fig01..03.png` | Les éditeurs (trim audio · rognage image · cut vidéo) |
| `p24-full.png` · `p24-fig01..06.png` | Les cas d'usage (carrousels & réels, avec/sans son) |

Régénérer : ouvrir le `.html` dans un navigateur et capturer chaque `.phfig` + les sections `#p7/#p8/#p13/#p21/#p22/#p24`.
Ces captures sont des **spécimens de DESIGN** (rendu de la vision), pas l'état de l'app — l'implémentation se vérifie au simulateur (issue par issue).
