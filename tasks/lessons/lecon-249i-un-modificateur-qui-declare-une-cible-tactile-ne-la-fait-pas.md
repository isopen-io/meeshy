## Leçon 249i — un modificateur qui DÉCLARE une cible tactile ne la fait pas respecter

- **`contentShape` définit la zone sensible DE LA VUE À LAQUELLE IL S'APPLIQUE.**
  Écrit après un `.onTapGesture`, il agrandit une vue qui ne porte plus le geste :
  la cible reste celle du contenu, et la revue voit un 44 qui n'est jamais servi.
  L'idiome SwiftUI l'écrit AVANT le geste. Deux surfaces du dépôt posaient
  `.meeshyTapTarget(44)` en dernier, sous quatre modificateurs
  d'accessibilité irréprochables — **du bon côté de la revue, du mauvais côté de
  l'idiome**. C'est la forme, côté interaction, de la règle du cycle 124 : la
  question n'est pas « la garde est-elle posée ? » mais « gouverne-t-elle bien ce
  qui part ? ».
- **Et le correctif juste ne réordonne pas : il supprime la question.** La zone
  sensible d'un `Button` EST le cadre de son label. Un `onTapGesture` n'est
  d'ailleurs pas un contrôle — il faut lui rajouter `.isButton` à la main, et il
  reste hors du clavier complet, du pointeur iPad et des styles de bouton.
  Devant un ordre de modificateurs qui « doit » être respecté, chercher la forme
  qui rend l'ordre indifférent.
- **Un savoir enfermé dans la fonction qui l'applique ne protège que cette
  fonction.** Des huit copies de la puce de langue, une seule avait le bon
  contrôle ET la bonne cible : le pied de bulle, dont le doc-comment expliquait
  déjà, en huit lignes, pourquoi un `onTapGesture` n'y marche pas et pourquoi le
  `contentShape` doit vivre DANS le label. Rien de cela n'avait voyagé vers les
  sept autres. **Avant d'écrire un contrôle, chercher s'il en existe une copie
  qui a déjà payé le problème** — la trouver vaut mieux que la refaire, et la
  faire remonter en source unique vaut mieux que la citer.
- **Aucune des huit n'était complètement fausse — chacune n'avait raison que sur
  un tiers du contrôle** (le contrôle natif, la cible, l'état énoncé). C'est le
  mode d'échec le plus tenace du dépôt : une surface qui figure déjà dans la
  colonne des sites conformes ne se rouvre pas. La question qui les attrape n'est
  pas « quelle surface est fausse ? » mais **« quel CONTRÔLE le dépôt
  recopie-t-il ? »** — la précédente (« quel CONTENU ? ») avait rendu les neuf
  tables d'étiquettes de 248i.
- **Une cible qu'on ne peut pas honorer se DOCUMENTE, elle ne se rabote pas en
  silence** : trois registres (44 pt là où la rangée l'héberge, 22 pt au pied
  d'une bulle parce qu'élargir grandirait chaque bulle traduite, 32 pt sur une
  superposition parce que le tap de la vidéo pilote la lecture). Et **jamais de
  `padding` négatif pour élargir sans coûter de place** : deux puces à 4 pt
  d'écart y verraient leurs zones se CHEVAUCHER, et une frappe imprécise
  servirait la MAUVAISE langue — pire que le défaut corrigé, qui ne faisait rien.
- **Une garde SUIT son hôte** (rappel de 248i, revenu spontanément) : quand la
  règle testée déménage vers une source unique, la garde vérifie les DEUX
  moitiés — le site délègue, la source annonce. N'exiger que la délégation la
  rendrait verte le jour où la source unique perdrait la règle, c'est-à-dire sur
  la régression exacte qu'elle prétend interdire.
