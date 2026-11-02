## La fenêtre lointaine des réels n'amorce que la tête du fichier (#11288)

### Contexte

Le palier « amorcé » de la fenêtre des réels (N±3 à N±10) téléchargeait chaque
fichier ENTIER : un balayage rapide de vingt réels en tirait vingt, quand la
plupart ne seraient jamais vus. `primeBytes` existait dans la loi jumelle, mais
le registre ne savait pas servir une plage.

### Décision

- **La tête seule.** `ReelPreloadWindow.headBytes` (ajout iOS, la jumelle web
  n'a rien à changer) rend l'amorce de `primeBytes`, bornée par le tier de
  l'appareil (bas 256 Ko, moyen 512 Ko). `DiskCacheStore.prefetchHead` la
  demande par `Range: bytes=0-<n>` dans un `ProgressiveMediaDownload`, gardé
  HORS du cache dans `ProgressiveHeadLedger` (16 têtes au plus).
- **La reprise à l'élection.** Le transfert suivant de la même clé
  (`startTransfer` : préchargement proche, lecteur, téléchargement d'une
  surface) prend la tête et la complète par `Range: bytes=<n>-` dans le même
  fichier : aucun octet ne repart, et un lecteur lit la tête dès l'élection.
- **Rien de corrompu.** `ProgressiveResumeLaw` n'accepte une reprise que si la
  réponse est un `206` qui commence à l'octet attendu ; sinon
  `RangeNotHonoredError`, rien n'est écrit ni adopté. Un serveur qui ignore
  `Range` pour la tête rend le fichier entier : il est coupé au budget, la tête
  est oubliée et l'élection repart du début.
- **Une tête au repos ne se joue pas sans élection** : `readableDownload(startsTransfer: false)`
  ne la rend pas (elle se figerait au bout de ses octets).

### Conséquences

- Octets par balayage de vingt réels : estimés divisés (seule la tête des
  lointains voyage) — argumenté, non mesuré.
- Un MP4 dont `moov` est en fin de fichier ne gagne rien à la tête ; les vidéos
  publiées par l'app sont `faststart`.
