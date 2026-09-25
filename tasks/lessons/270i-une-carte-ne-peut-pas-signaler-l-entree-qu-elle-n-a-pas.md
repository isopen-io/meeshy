## 270i — une carte ne peut pas signaler l'entrée qu'elle n'a pas

**Contexte** — 269i lègue « 29 clés absentes du catalogue ». Le remesurage en rend
114, dont 22 appartiennent à `MeeshyWidgets`. Or `apps/ios/MeeshyWidgets/Localizable.xcstrings`
existe depuis que la cible existe : 39 clés, les sept locales. C'est la GARDE qui
lisait le mauvais catalogue — `catalogByTargetFragment` nommait deux des trois
catalogues du dépôt.

- **Une table de résolution incomplète ne produit pas d'échec, elle produit une
  MESURE FAUSSE.** Une cible non mappée retombe silencieusement sur le catalogue
  de l'app : ses clés y sont absentes, donc comptées non traduites alors qu'elles
  sont traduites, et ses sources restent inépinglables bien qu'elles passent déjà
  toutes les règles. Le cliquet portait 22 dettes inexistantes sur 114 et refusait
  une protection déjà acquise. **Un chiffre qui ne bouge pas n'est pas un chiffre
  qui est juste.**

- **Un témoin écrit DEPUIS la carte ne peut pas voir ce qui n'y est pas.** Toutes
  les gardes de la suite consommaient `catalogByTargetFragment` — aucune ne
  pouvait donc constater son entrée manquante : une table ne se lit que pour les
  entrées qu'elle a. Le témoin doit venir de la source qui connaît l'INVENTAIRE
  COMPLET — ici le système de fichiers : « tout `.xcstrings` de l'arbre iOS est
  soit le catalogue de l'app, soit mappé », plus la direction inverse (aucun
  mappage mort) et un sondage par fragment (le mappage RÉSOUT vraiment). C'est la
  forme, appliquée à une table de configuration, de la leçon 261 : une énumération
  porte deux affirmations — « ces entrées sont justes » (vérifiable) et « ce sont
  toutes les entrées » (presque jamais vérifiée).

- **Les trous d'un catalogue ne sont pas dispersés : ce sont les VALEURS
  MANQUANTES de familles par ailleurs traduites.** `DeliveryStatus` a six cas, le
  compositeur émet une clé par cas, trois sont au catalogue et trois non : un
  lecteur d'écran arabophone entendait trois états en arabe et trois en français
  dans la même phrase. La pastille de synchronisation annonce ses 53 opérations en
  sept langues et ses deux boutons en français. **Le code, lui, a l'air complet —
  la complétude qu'on vérifie à l'œil est celle du `switch`, pas celle du
  catalogue.** À une clé absente, demander non seulement « que voit
  l'utilisateur ? » mais **« quelles sont ses SŒURS, et sont-elles là ? »**

- **Compléter une famille attrape ce qu'un balayage par égalité de chaîne laisse
  derrière.** Dix des onze clés remplies l'ont été en copiant verbatim une entrée
  portant déjà le même français ; la onzième, `a11y.delivery.sending`, n'a pas de
  jumelle textuelle (« en cours d'envoi » vs « Envoi en cours ») et n'aurait été
  trouvée par aucune recherche d'égalité. Et sa CASSE se déduit sans rien inventer :
  les trois sœurs déjà au catalogue portent la forme mi-phrase en minuscule dans
  les six mêmes langues (`gesendet` là où la bulle dit `Gesendet`). **Une famille
  à moitié traduite documente sa propre convention — c'est la ressource la moins
  chère et la plus sûre pour remplir l'autre moitié.**

- **Un témoin qui n'a jamais été exécuté est une hypothèse.** Le premier jet de
  `test_everyPerTargetCatalogIsMapped` élisait les catalogues par leur EXTENSION
  (`.xcstrings`) et rougissait : deux cibles expédient aussi un
  `InfoPlist.xcstrings`, qui localise des valeurs d'`Info.plist` lues par le
  système — pas une table adressable depuis `String(localized:)`. Le critère juste
  est le NOM DE FICHIER (`Localizable.xcstrings`), la table par défaut. Sans chaîne
  d'outils Apple dans cet environnement, **simuler la garde ligne à ligne avant de
  l'expédier à la CI** est le minimum : ici, la simulation a coûté deux minutes et
  évité un cycle CI de cinquante.

- **Un test qui code en dur une chaîne de la langue SOURCE atteste que la chaîne
  n'est PAS localisée.** `FocalVoiceOverParityTests` cherchait le segment
  d'accusé de livraison par le littéral `"lu"`, force-unwrappé. Il passait
  uniquement parce que `a11y.delivery.read` était absente du catalogue : toutes
  les locales retombaient sur le `defaultValue` français. La clé ajoutée, le
  simulateur anglais de la CI rend « read », l'index vaut `nil`, `signal trap` —
  1 échec sur 9 062. **Un tel test est un cliquet à l'envers : il ne rougit pas
  quand la traduction manque, il rougit quand elle ARRIVE**, et le prix se paie
  au moment exact où l'on répare le défaut. Corollaire mesuré sur le voisin :
  `contains("lu")` passait sur un contenu texte « Sa**lu**t » — donc même si le
  segment gardé avait disparu. Demander sa valeur au CATALOGUE, comme le
  faisaient déjà tous les tests voisins.

- **« Zéro ligne de production modifiée » n'est pas « zéro changement de
  comportement ».** Entrer une clé au catalogue change ce que `String(localized:)`
  rend dans les six autres locales — c'est l'objet même du lot. Avant de conclure
  qu'un lot de catalogue est inerte, chercher qui COMPARE ces chaînes : tests
  d'abord, code de production ensuite.

- **« La CI est verte » ne veut rien dire tant qu'on n'a pas lu ce que la CI a
  EXÉCUTÉ.** Le gate iOS de ce dépôt est un opt-in par mot-clé dans le SUJET du
  commit de tête (« smoke test » / « run test » / « to test ») ; sans lui, le job
  macOS compile et saute `Run iOS tests`. Le premier run de la PR 270i est sorti
  vert sans exécuter un seul test — le workflow le dit dans le NOM du check
  (« Build app (app + cibles de test) » vs « Build app + tests unitaires »), et
  c'est la seule chose qui distingue les deux verts. **Lire les étapes du job, pas
  sa conclusion.** `workflow_dispatch` force la suite complète sans pousser de
  commit vide.
