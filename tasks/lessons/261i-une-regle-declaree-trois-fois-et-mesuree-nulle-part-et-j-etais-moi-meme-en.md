## 261i — une règle déclarée trois fois et mesurée nulle part ; et j'étais moi-même en infraction

- **Le budget de taille de fichier (800–1100 lignes, directive 2026-08-28) n'avait
  aucun instrument.** Répété dans le `CLAUDE.md` racine et les `CLAUDE.md` de
  répertoire, mesuré par aucun test : 42 fichiers hors budget, 88 338 lignes
  cumulées, et rien pour empêcher le 43ᵉ. C'est la forme de #4292 poussée d'un
  cran : là un cliquet avait cessé de mordre, ici il n'y en avait jamais eu.

- **J'ai violé la règle cinq fois dans cette même session, sans m'en apercevoir.**
  257i et 259i ont ajouté des lignes à `MeeshyApp` (1310), `MessageListViewController`
  (3568), `ConversationMediaViews` (1212), `ReelsPlayerView` (2104) et
  `StoryViewerView+Content` (3211) — tous déjà hors budget, alors que la directive
  dit « ajouter à un fichier déjà hors budget est INTERDIT : on extrait d'abord ».
  Les ajouts étaient minuscules et justifiés ; ce n'est pas l'excuse qui compte,
  c'est que **rien ne pouvait me le dire** — ni la relecture, ni la CI.

- **Le piège au moment d'écrire le cliquet : pinner sur AUJOURD'HUI.** Le réflexe
  est de relever la mesure du jour (88 338) et de la sceller. Cela aurait
  incorporé mes propres 70 lignes de régression dans le plafond — exactement le
  jeu de mou que je venais de reprocher au cliquet i18n deux itérations plus tôt.
  **Un cliquet posé sur l'état qu'on vient de dégrader légitime la dégradation.**
  Pinné sur l'état d'AVANT (88 268), il rougit sur `main` tel quel : la dette a
  donc dû être PAYÉE dans le même lot (extraction de 93 lignes vers
  `RecordingWaveformBars.swift`, relocalisation pure) pour repasser au vert.

- **Trois nombres valent mieux que 42 plafonds individuels.** Un plafond par
  fichier interdit la croissance mais rougit dès qu'un fichier légitimement
  DÉCOUPÉ fait disparaître son nom — la garde punirait alors le geste qu'elle veut
  encourager. Un plafond dur pour les fichiers neufs + une liste qui ne peut que
  rétrécir + un cumul qui ne peut que descendre obtiennent le même effet en
  laissant la découpe passer.

- **Découper « par responsabilité, pas par tranche » se vérifie au moment de
  choisir la coupe.** `AnimatedWaveformBar` et `AudioLevelBar` sont sorties
  ENSEMBLE parce qu'elles sont les deux barres de la même bande d'enregistrement —
  l'une anime une hauteur, l'autre suit le niveau du micro. Extraire la première
  seule aurait rendu le compte, et laissé sa jumelle orpheline.
