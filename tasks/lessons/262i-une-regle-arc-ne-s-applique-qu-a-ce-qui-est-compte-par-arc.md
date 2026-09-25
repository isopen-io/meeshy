## 262i — une règle ARC ne s'applique qu'à ce qui est compté par ARC

- **Quatre règles déclarées, zéro violation.** `print()` interdit, `try!`
  interdit, couleurs littérales interdites, secrets hors `UserDefaults` : 0, 0, 0
  et 0. Le dépôt est discipliné là où il s'est donné des règles nettes. Le
  balayage a de la valeur quand même — il dit à la prochaine session de ne pas
  refaire ces sondes.

- **La seule « prise » était un faux positif PAR CONSTRUCTION.** Mon scanner a
  signalé un `Timer.scheduledTimer` capturant `self` sans `[weak self]`, ce que
  la règle du dépôt interdit explicitement. Sauf que l'hôte,
  `UniversalComposerBar`, est une **struct** SwiftUI : `[weak self]` y est
  INEXPRIMABLE (le mot-clé exige un type classe), il n'y a pas de compteur de
  références à casser, et le timer est invalidé en cinq points dont la
  disparition. La classe qui possède réellement un timer, `CameraView`, écrit
  bien `[weak self]`.

  > **Avant de reprocher une règle ARC à un site, vérifier que le site est
  > compté par ARC.** `[weak self]`, les cycles de rétention, `unowned` : tout
  > cela ne veut rien dire sur une valeur. Une règle recopiée sur des structs
  > produit un faux positif à CHAQUE balayage — et celui qui la lit sans
  > vérifier « corrige » du code qui ne compilera pas.

- **Un compte élevé ne dit pas si c'est une paresse ou une contrainte.** 80
  `AnyView` contre une règle qui dit « éviter » : le réflexe est d'annoncer 80
  défauts. Lus, ce sont des effacements de type à une FRONTIÈRE D'API — un
  paramètre qui accepte une vue optionnelle. Les retirer exige de rendre les
  signatures génériques et de toucher tous les appelants : une refonte, pas un
  remplacement, et donc pas un lot qu'on tente sans compilateur. **Compter, puis
  LIRE avant de qualifier** — sinon on ouvre une issue qui promet un nettoyage
  d'une heure pour un chantier de plusieurs jours.

- **Deux sondes négatives d'affilée ne sont pas un échec de la boucle.** 260i et
  262i n'ont rien corrigé parce qu'il n'y avait rien à corriger sur ces axes.
  Ce qui serait un échec, c'est de fabriquer un changement pour que l'itération
  « produise » quelque chose. Le livrable d'une sonde négative est la carte :
  quels axes sont sains, et POURQUOI l'instrument se trompe là où il crie.
