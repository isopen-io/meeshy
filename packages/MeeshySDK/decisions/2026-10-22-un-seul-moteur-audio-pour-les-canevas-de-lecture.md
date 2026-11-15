## Un seul moteur audio pour les canevas de lecture, observé pour les changements de sortie (#9878)

**Contexte** : chaque `StoryCanvasUIView` créait son `ReaderAudioMixer`, et chaque mixer son
`AVAudioEngine` — jusqu'à 4 dans le lecteur de stories, 5 autour d'un réel, un par carte-scène
visible, créés même sans son. Un seul jouait (`PlaybackCoordinator`), tous gardaient unité d'E/S,
nodes et fichiers. Aucun n'observait `AVAudioEngineConfigurationChange` : brancher des AirPods
arrêtait le moteur, et le son ne revenait qu'au changement de slide. `AVAudioFile(forReading:)`
s'ouvrait sur le fil principal, pendant le balayage.

**Décision** :
- `ReaderAudioEngineHost` (MeeshyUI, `Story/Audio/`) possède UN `AVAudioEngine`. Les canevas
  passent `ReaderAudioEngineHost.reader` ; un mixer créé par `ReaderAudioMixer()` garde un hôte à
  lui (témoins). Chaque mixer attache/détache ses `AVAudioPlayerNode` sur le moteur de son hôte.
- Un mixer ne pause ni n'arrête plus le moteur : il dit à l'hôte qu'il ne joue plus, et l'hôte
  applique `ReaderAudioEngineIdleLaw` à l'ensemble des clients — un joue ⇒ tourne ; des nodes
  attendent ⇒ pause (ressources gardées, la page suivante démarre sans allocation) ; plus rien ⇒
  arrêt.
- `AVAudioEngineConfigurationChange` du moteur de l'hôte ⇒ redémarrage, puis chaque mixer qui
  jouait replanifie sa passe depuis son ANCRE (même origine, écoulé en temps réel, entrée en cours
  de piste). `mediaServicesWereReset` ⇒ moteur neuf, chaque mixer y rattache ses nodes.
- Les fichiers s'ouvrent hors du fil principal (`loadAndConfigure`, `loadAndConfigureBackground`) ;
  un ticket de configuration et la question `isStillWanted` de l'hôte font taire un chargement
  rattrapé par une slide plus récente.

**Alternatives rejetées** :
- *Un hôte par lecteur, injecté par le contexte de lecture.* Le canevas naît avant son contexte
  (`setReaderContext` arrive après l'init) : il aurait fallu reconstruire le mixer au premier
  contexte, et les surfaces de lecture ne jouent de toute façon qu'une à la fois.
- *Préparer les voisins en moteurs « endormis ».* C'est l'état d'avant : l'unité d'E/S et les
  nodes de chaque moteur restent tenus, et la mémoire croît avec la fenêtre.
