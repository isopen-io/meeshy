## 266i — un motif qui RESSEMBLE à un défaut connu peut être la forme correcte d'une autre règle

- **`map(String.init)` sur des clés déjà `String` a fait rougir la CI.**
  `Dictionary.keys` porte des `String` ; y appliquer `String.init` laissait le
  compilateur choisir entre une dizaine d'initialiseurs génériques —
  `ambiguous use of 'init'`, bundle de tests non compilé, 26 minutes perdues. La
  conversion demandée était `String → String` : **une conversion dont la source
  et la cible sont le même type n'est pas une conversion, c'est un oubli.**
  Sans compilateur ici, rien ne me contredit — d'où la relecture adversariale
  AVANT le push, et le fait de préférer partout un idiome déjà passé en CI à un
  idiome seulement plausible.

- **Un motif qui ressemble à un défaut connu peut être la forme correcte d'une
  AUTRE règle.** `@State private var isMutedMirror = SharedAVPlayerManager.shared.isMuted`
  a la silhouette exacte du bug SwiftUI classique (une `@State` semée depuis un
  singleton n'est qu'un instantané figé). Les douze sites portent tous leur
  `.onReceive` apparié : c'est la loi « Zero Unnecessary Re-render » appliquée
  correctement — on ne s'abonne pas à l'objet global, on miroite la primitive et
  on la resynchronise. **Vérifier l'appariement, jamais reconnaître la
  silhouette.**

- **Un pourcentage de non-conformité n'est pas un défaut tant qu'on n'a pas lu ce
  que le code FAIT.** 19 ViewModels sur 30 n'exposent pas `loadState` — 63 % de
  non-conformité à une règle de la bible, ce qui ressemble à une trouvaille.
  `BookmarksViewModel` lit pourtant le cache AVANT de toucher `isLoading`, sert
  `.fresh` sans réseau et rafraîchit `.stale` en tâche de fond : le comportement
  que la règle protège est là, sous un autre nom. C'est le piège du 260i
  retourné — là l'instrument mentait, ici il dit vrai et sa CONCLUSION est
  quand même fausse.

- **Une doctrine peut nommer un composant qui n'existe pas sans être fausse.**
  `SkeletonPlaceholder` n'apparaît dans aucun `.swift` du dépôt ; c'est un nom
  GÉNÉRIQUE de la bible, réalisé sous quinze noms de domaine. La règle est mieux
  tenue que ce qu'elle demandait — mais le lecteur qui cherche le nom écrit ne
  trouve rien et peut conclure l'inverse. **Un nom de doctrine qui ne
  correspond à aucun symbole doit dire qu'il est générique, et lister ce qui le
  réalise**, sinon il coûte une enquête à chaque lecteur.

- **Quatre balayages négatifs d'affilée ne sont pas un échec de méthode.** 254i,
  255i, 260i, 262i puis les cinq sondes du 266i : sur un dépôt mûr, la mesure
  qui ne trouve rien est le résultat le plus fréquent, et le publier vaut mieux
  que de forcer une trouvaille. Ce qu'il faut en tirer n'est pas « chercher
  ailleurs » mais **« que laisse cette sonde derrière elle ? »** — ici, une
  matrice de cinq écrans nommée par la bible et gardée par rien.
