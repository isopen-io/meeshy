## Une vidéo se lit dans le transfert qui remplit le cache (#9881)

**Contexte** : sur un cache vide, le fond et les vidéos de premier plan d'une story lisaient l'URL
`https` en streaming ET la téléchargeaient à part pour le cache : deux requêtes par média, une
troisième pour lire la taille naturelle du fond, puis un `replaceCurrentItem` vers le fichier local
en pleine lecture (second démarrage à froid). À l'inverse, une bulle attendait la fin du fichier
avant sa première image.

**Décision** :
- `MediaFileDownloader.stream(_:profile:into:progress:)` télécharge en flux (tâche de données, même
  session par profil) dans un `ProgressiveMediaDownload` : un fichier de transit écrit en tête, lu
  par une poignée ouverte dès sa création — elle survit à l'adoption du fichier par le cache.
- Le store vidéo (`readsWhileDownloading: true`) fait passer TOUT transfert en flux du funnel par ce
  chemin. Le transfert lisible est inscrit au registre `inFlightTasks` comme les autres : le
  préchargeur, le centre de téléchargement et le lecteur le rejoignent, une purge l'annule, et la
  fin l'adopte sous sa clé selon `MediaCacheDirective` (#9478 : `no-store` non gardé, 404 évincé).
- `ProgressiveURLAsset` (schéma `meeshy-cache://`) et son `ProgressiveAssetLoader` servent au
  lecteur les plages demandées depuis ce fichier, par la loi pure `ProgressiveRangeLaw` (servir ce
  qui est arrivé, attendre le reste, finir quand la plage est couverte).
- `CacheCoordinator.videoPlaybackAsset(for:startsTransfer:)` rend le fichier s'il est sur le disque,
  l'asset lisible sinon. `startsTransfer` reste à l'appelant : une story l'ouvre, une bulle ne fait
  que rejoindre un téléchargement que la politique réseau a déjà autorisé.

**Alternatives rejetées** :
- *Des requêtes de plage par lecteur, à côté du téléchargement.* Le serveur sert les plages et un
  ETag (S10), mais chaque plage est une requête de plus pour les mêmes octets : c'est le double
  téléchargement qu'on retire.
- *Attendre le fichier entier, puis lire en local.* Une grosse story ne finit pas de descendre avant
  l'avance automatique de la slide sur réseau d'appareil (régression du 2026-05-20).

**Conséquences** : un MP4 dont l'atome `moov` est en fin de fichier ne démarre qu'à la fin du
transfert (le lecteur attend la plage de queue au lieu de l'ouvrir à part) ; les médias publiés par
l'app (`shouldOptimizeForNetworkUse`, `MediaCompressor.swift`) et transcodés par la passerelle
(`+faststart`, `video-transcode-plan.ts`) portent l'en-tête en tête. Le transfert ouvert par une story continue après son
départ de l'écran et finit dans le cache, comme le préchargement le faisait déjà.
