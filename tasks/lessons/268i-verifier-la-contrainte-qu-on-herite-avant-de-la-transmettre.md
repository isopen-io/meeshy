## 268i — vérifier la contrainte qu'on HÉRITE avant de la transmettre

- **Une contrainte plausible, écrite une fois, fige une tâche indéfiniment.**
  #4308 disait : « mécanique, mais à faire avec un compilateur : 648 littéraux
  Swift, dont beaucoup contiennent des apostrophes (`J'aime`) et des accents ;
  une erreur d'échappement casse la compilation ». Je l'ai répétée telle quelle
  dans deux itérations. **Ni l'apostrophe ni l'accent ne s'échappent dans un
  littéral Swift** — seuls `"` et `\`. Mesuré : sur 504 divergences, **500 ne
  demandent aucun échappement** et **zéro** contient un guillemet, un antislash
  ou un saut de ligne. Le risque énoncé n'existait pas sur ce lot.
  La question à poser à toute contrainte héritée : **quelle mesure la
  soutient ?** — et si la réponse est « aucune », la mesurer coûte quelques
  minutes contre des itérations de blocage.

- **Un remplacement de masse se fait sur des BORNES vérifiées, pas sur une
  expression régulière.** Les 498 littéraux ont été réécrits aux offsets absolus
  extraits du segment d'appel à parenthèses équilibrées, chaque borne contrôlée
  avant écriture (`src[start:end] == inline`), les éditions appliquées de DROITE
  à GAUCHE pour que les décalages restent valides. Puis trois contrôles par
  fichier : mêmes clés, mêmes lignes, mêmes appels. Sans le contrôle « mêmes
  clés », une borne fausse aurait réécrit un identifiant de clé au lieu de son
  libellé — un défaut que la compile n'attrape pas et que les deux règles ne
  voient pas.

- **Classer ce qui RESTE par sa NATURE, pas seulement le compter.** Les 34 sites
  non réconciliables se sont révélés être deux familles distinctes : des clés
  **absentes du catalogue** (leur `defaultValue` s'affiche partout — il manque une
  entrée, pas un alignement) et des clés **PLURIELLES**. J'ai d'abord écrit
  « plurielles » pour les quatre premières et j'allais l'étendre aux 34 : la
  vérification a montré que la majorité était absente du catalogue. **Un
  échantillon ne nomme pas une population.**

- **Une garde peut contenir un cas qu'aucune correction ne satisfait.** La règle
  B compare le littéral à `sourceValues[key]`, lu depuis le `stringUnit` PLAT ;
  une clé plurielle n'en a pas, la valeur est `nil`, et la comparaison échoue
  quoi qu'on écrive. Trois fichiers sont donc inépinglables **par construction**,
  pas par dette. C'est la famille du correctif 226i — qui avait appris la
  pluralité à `loadTranslations` et l'a oubliée pour `values`. **Quand un
  correctif enseigne une notion à UN lecteur de catalogue, chercher les autres
  lecteurs du même catalogue.**
