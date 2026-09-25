## Leçon 647 — un drapeau qui s'arme PAR INSTANCE est un inventaire : un correctif qui en arme UNE laisse le défaut entier, et sa parade rend muet ce qu'elle épargne

**Le fait.** #7059 a corrigé le `0xDEAD10CC` en posant
`Configuration.observesSuspensionNotifications` sur `AppDatabase`. Le
raisonnement était juste, mesuré sur cinq rapports, et il nommait lui-même le
piège qu'il corrigeait : « la garde `beginBackgroundTask` ne couvrait qu'UN
écrivain ; les suppressions viennent des autres ». **Le correctif a rejoué ce
piège un cran plus haut.** Le drapeau s'arme par POOL
(`DatabasePool.setupSuspension`, `DatabaseQueue.setupSuspension`), l'application
en ouvre DEUX sur deux fichiers distincts, et le build 1827 — celui qui portait
le correctif — a produit le MÊME kill : deux fils `GRDB.DatabasePool.writer`
vivants au moment de la suppression, l'un dans `sqlite3_wal_checkpoint_v2`
jusqu'à `guarded_pwrite_np`, l'autre dans un `write` synchrone.

> **Avant de croire qu'un réglage protège « la base », compter les instances qui
> le portent.** Un drapeau global protège un processus ; un drapeau de
> configuration protège l'objet qui l'a reçu, et rien d'autre. La question n'est
> pas « le drapeau est-il posé ? » mais « **combien d'objets de ce type le
> processus construit-il, et lequel ai-je armé ?** » — elle se répond par un
> `grep` du constructeur, pas par une relecture du site corrigé.

**Et le doc-comment DISAIT la lacune sans la nommer comme telle.**
`DatabaseSuspension` portait, depuis #7059 : « la suspension n'est effective que
sur les bases ouvertes avec `observesSuspensionNotifications` — **`AppDatabase`
le pose** ». La phrase énumère UN poseur. Une énumération porte toujours deux
affirmations, et la seconde n'est presque jamais vérifiée : « ce sont les sites
où la règle s'applique ». C'est la leçon 261 appliquée à un réglage plutôt qu'à
un résolveur — et c'est le grep des AVEUX de doc-comments qui l'a rendue
visible.

**Le second défaut, plus discret que le premier : la parade a rendu MUET ce
qu'elle épargnait.** `suspend()` est posé à la fin de l'entrée en arrière-plan,
`resume()` au retour au premier plan. Entre les deux, le processus n'est PAS
toujours gelé : `BGAppRefreshTask`, `BGProcessingTask` et le filet de flush du
cache le réveillent précisément là — et c'est leur raison d'être d'écrire.
Depuis #7059, le drainage de l'outbox, la synchronisation et le préfetch
levaient `SQLITE_INTERRUPT` pendant que leurs journaux annonçaient un succès.
**Rien ne plante, rien n'arrive** : un défaut bien plus difficile à voir que le
plantage qu'on venait de corriger.

> **Une garde qui suspend un processus doit énumérer ce qui le RÉVEILLE.** Poser
> une fenêtre « ici on n'écrit plus » suppose que personne ne tourne dans cette
> fenêtre. Sur iOS, c'est faux par construction. La question à poser à toute
> garde de cycle de vie : « **qui a le droit de tourner pendant que cette garde
> est posée, et que fait-il ?** »

**Ce que le lot a livré, et pourquoi sous cette forme.** Le drapeau n'a plus de
poseur libre : `DatabaseSuspension.arm(_:)` est le seul, une garde d'INVENTAIRE
balaye les sources et rougit sur tout fichier qui ouvre un `DatabasePool` sans
l'appeler, et une seconde interdit d'écrire le drapeau à la main hors du site
unique. Un relevé, pas une assertion sur deux fichiers connus : le troisième
pool rougira le jour où il est écrit, pas le jour où il tue l'application.
Cf. [[reference_inventory_guards_are_the_ones_parallel_lots_never_play]].
