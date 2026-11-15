## 260i — mesurer un ORDRE par des offsets de texte, c'est mesurer l'ordre de DÉCLARATION

- **Sonde close par la négative : le cache-first du dépôt est sain.** 126
  `ProgressView` réels, 33 « suspects » — presque tous des spinners d'ACTION
  (bouton d'envoi, 2FA) ou des pieds de PAGINATION posés après des lignes déjà
  rendues. Ni les uns ni les autres ne violent la doctrine, qui vise l'écran qui
  REMPLACE son contenu par une roue. Rien à corriger.

- **Quatre faux positifs sur quatre, par un instrument qui ne pouvait pas être
  juste.** Pour savoir si un ViewModel lit le cache AVANT le réseau, j'ai comparé
  l'offset du premier `CacheCoordinator` à celui du premier appel de service —
  dans le TEXTE du fichier. Sur `ConversationListViewModel` (1600+ lignes), une
  propriété de service déclarée en tête gagne toujours contre un cache lu au
  milieu d'une fonction. Le verdict « réseau avant cache » était faux pour les
  quatre VM signalés : lu sur le chemin d'appel réel, `ConversationListViewModel`
  est au contraire exemplaire — les quatre cas de `CacheResult` distingués, et
  `.expired` va récupérer la charge sur disque pour qu'une resync hors-ligne ne
  laisse jamais l'écran plus vide que ce qu'il a.

  > **Un ORDRE ne se lit pas sur des octets, il se lit sur un chemin
  > d'exécution.** Une heuristique positionnelle mesure où le code est ÉCRIT, pas
  > quand il TOURNE — et sur un gros fichier les deux n'ont aucun rapport.

- **Ce qui a sauvé la mesure est le même réflexe qu'aux trois itérations
  précédentes** : ne pas publier un chiffre sans aller lire le site qu'il accuse.
  Le premier flag ouvert (`ConversationListViewModel`, l'écran principal de
  l'app) était aussi le plus grave — et donc celui qu'il fallait vérifier en
  premier, pas en dernier. **Ouvrir d'abord le suspect dont l'accusation coûterait
  le plus cher si elle était fausse.**

- **Un résultat NÉGATIF est un livrable**, à condition d'être consigné avec son
  instrument : sans cette note, la prochaine session relance la même sonde,
  retrouve les mêmes 33 « suspects » et les mêmes 4 « violations », et refait le
  chemin. Ce qui se consigne n'est pas « rien à faire » mais **pourquoi
  l'instrument mentait**.
