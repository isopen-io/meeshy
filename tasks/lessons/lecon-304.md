## Leçon 304

**Une chaîne dont chaque maillon est correct peut n'avoir aucun LECTEUR — et
extraire une vue est le geste qui crée cette forme.**

Les quatre portes du rail du composer n'ouvraient rien. Le porteur l'a vu à
l'écran ; aucun test ne le disait, et pour cause — chaque maillon était juste :
le rail remontait la porte, `handleRailDoor` aiguillait, `handleDocumentTool`
posait bien `showsPhotoPicker = true`.

Ce qui manquait était **le lecteur**. Les huit `.sheet` / `.photosPicker` /
`.fileImporter` étaient attachés à l'expression `documentSurface` — la vue qui
n'est PAS montée quand une scène existe. Le booléen passait à `true` et personne
ne le lisait.

C'est la forme du cycle 122 (« un contenu résolu doit être SERVI, pas seulement
transporté ») portée à une VUE : la question à poser à un état de présentation
n'est pas « qui l'ÉCRIT ? » mais **« quelle vue MONTÉE le lit ? »**.

> **Extraire une vue déplace ce qu'elle PORTE, et laisse derrière ce qui était
> ACCROCHÉ à elle.** Les modificateurs d'un `some View` ne sont pas dans le
> corps du composant qu'on déplace : ils sont sur l'expression qui l'appelle, et
> aucun compilateur ne les suit. Après toute extraction de surface, énumérer les
> modificateurs restés sur l'ancienne expression et demander, pour chacun :
> *est-il propre à cette vue, ou au meuble ?*

**Le commentaire disait déjà la bonne règle, et ça n'a rien empêché.** Le bloc
portait, mot pour mot : « trois sélecteurs montés ICI, **sur le meuble**, jamais
dans `ComposerDocumentSurface` ». La phrase était juste ; « ici » désignait
l'expression `documentSurface`, pas le meuble. Tant qu'il n'y eut qu'une vue à
monter, le demi-pas n'a rien coûté — c'est #4070, en portant le meuble à quatre
vues, qui a rendu la différence visible. Rappel de la fiche « un commentaire qui
énonce un invariant plus large que son correctif devient une loi » : ici
l'invariant était BON et le code ne le tenait pas, ce qui est le cas symétrique
et se lit tout aussi mal.

**Ce qui ferme la classe est un INVENTAIRE, pas un déplacement.** Déplacer les
huit modificateurs rejouerait le défaut à la cinquième surface. La garde
(`ComposerIntakePortalsTests`) lit les `@State private var shows…` DE LA SOURCE
— jamais une liste recopiée, qui serait verte sur un neuvième sélecteur — et
exige que chacun ait son lecteur au-dessus de l'aiguillage.

**Corollaire d'instrumentation, appris dans la même heure** : `idb ui
describe-all` **ne remonte pas toujours une présentation modale**. Trois taps de
suite ont rendu un arbre identique à celui du composer, et j'ai failli conclure
« la mention est inerte » — la CAPTURE D'ÉCRAN montrait la feuille
« Mentionner » ouverte. Un « rien ne s'est ouvert » lu dans l'arbre
d'accessibilité n'est pas une preuve ; la capture tranche.
