## 253i — une abstraction nommée d'après son premier appelant ne voyage pas

- **Le NOM et le FICHIER d'une abstraction décident de sa portée, autant que sa
  visibilité.** `callToggleAccessibility` était générique dans sa moindre ligne —
  trait, valeur, repli iOS 17 — et son propre commentaire énonçait la règle
  générale. Il vivait dans `CallView.swift` sous un nom d'appel : **cinq sites
  l'appliquaient, tous des surfaces d'appel**, pendant que des bascules ailleurs
  ne disaient leur état que par une couleur. C'est 252i déplacé d'un cran — là
  une GARDE était bornée par la forme qu'elle interdisait, ici une RÈGLE par le
  nom qu'on lui avait donné.
- **Avant de choisir un remède, chercher la JUMELLE du contrôle et voir ce
  qu'elle fait.** J'avais annoncé « trait + valeur » pour un bouton « j'aime » ;
  sa jumelle d'un autre écran servait depuis toujours un NOM qui varie
  (« J'aime » / « Je n'aime plus ») et une valeur qui porte le COMPTE. Un
  « j'aime » n'est pas un interrupteur. **Une jumelle est une décision déjà
  prise, souvent mieux argumentée que celle qu'on s'apprête à improviser** — et
  ici la seconde moitié du même défaut vivait dans LE MÊME FICHIER, trente
  lignes plus bas.
- **Une garde qui suit un renommage sans changer de CIBLE est une garde morte.**
  `test_..._isNotFilePrivate` lisait `CallView.swift` pour y interdire un motif ;
  le modificateur ayant déménagé, elle serait restée **verte en cessant de
  voir** — le défaut exact que 251i bis a payé d'un cycle. Renommer oblige à se
  demander non seulement « qui cherche cette chose ? » mais **« ce que ce banc
  lit contient-il encore ce qu'il juge ? »**.
- **Interdire la RÉ-ÉCRITURE n'est pas exiger l'APPLICATION**, et il faut le
  dire quand on ne peut que la première. La garde de 253i interdit de recopier
  la clé et le trait — scannable, sûr. Exiger que tout contrôle branchant sur un
  booléen expose son état demanderait un marcheur à parenthèses équilibrées ET
  la détection des noms variables **à travers un constructeur maison** : c'est
  ce motif qui a produit le seul faux positif de la mesure. Une garde partielle
  annoncée comme partielle vaut mieux qu'une garde totale qu'on croit avoir.
- **Un compteur qui rate un motif CORRECT est aussi faux qu'un compteur qui rate
  un défaut.** Cinq affinages (102 → 20 → 13 → 9 → 5 réels) : les trois derniers
  faux positifs étaient des sites JUSTES que l'instrument ne savait pas
  reconnaître — un titre variable passé par `settingsRow(title:)`, une icône
  reflétant un type et non un état, une rangée agrégée par son conteneur.
  **Mesurer un défaut, c'est savoir énoncer ce qui n'en est pas un.**
- **Un balayage qui cherche un objet par UN de ses noms d'emprunt rend un zéro
  qui veut dire « je n'ai pas regardé là » (256i).** J'ai mesuré que
  `ConversationStateStore` — 35 propriétés, 34 homonymes du ViewModel — n'était
  lu par PERSONNE, et j'allais ouvrir une issue proposant de retirer son miroir
  `messages` (une souscription Combine vivante sur le chemin le plus chaud de
  l'app). **C'était faux** : les handlers détiennent le store sous
  `private let state:` et le lisent en `state.X`, motif que mon regex
  (`stateStore.` / `store.`) ne couvrait pas. `ConversationMediaHandler` lit
  bien `state.messages`.
  > **Avant de publier un zéro, chercher l'objet par son TYPE, pas par le nom
  > qu'on suppose à sa variable.** Le coût de l'erreur n'était pas symétrique :
  > un faux positif fait perdre une revue, ce faux zéro-ci proposait de
  > supprimer du code qui MARCHE, avec une mesure à l'appui pour convaincre.
- **Un échafaudage de migration se reconnaît à son commentaire, et se
  RESPECTE.** Le store porte « Removed once the migration … is complete » : ce
  n'est pas de la duplication accidentelle mais un plan en cours, dont la fin
  est écrite. Le supprimer ou le recâbler unilatéralement, c'est jeter le
  travail de quelqu'un — et c'est architecturalement significatif, donc cela se
  remonte, jamais cela ne se décide seul.
