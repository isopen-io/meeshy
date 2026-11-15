## Leçon 633 — rendre un prédicat fail-closed ne sauve que ses usages POSITIFS : sa négation reste menteuse, et troque un gate qui explose contre un gate qui ment

**Le rouge.** `dev` bloqué une nuit sur « Gate états du fil » (#7048, PR #7050) : `paintedAt` passait les coordonnées d'une `boundingBox` à `page.screenshot({ clip })` sans vérifier qu'elles tombaient dans le viewport. Le virtualiseur sortait la rangée de l'écran entre deux mesures (mesurée à **y = −297**), Playwright levait « Clipped area is either empty or outside the resulting image », et l'exception remontait en `uncaughtException`.

**Ce que le journal désignait.** Des dizaines de lignes « A bad HTTP response code (404) … fetching the script ». **Bruit délibéré** : le gate démarre son serveur en `{ serviceWorker: false }`, et les exécutions VERTES portent le même bruit. Il n'était imprimé que parce que `pageDiagnostics()` s'exécute depuis le handler `uncaughtException`. Le premier diagnostic y a perdu son temps.

> **Un diagnostic déclenché par une panne n'est pas la panne.** Avant de suivre ce qu'il montre, demander : **cette ligne est-elle aussi présente quand tout va bien ?** Si oui, elle ne juge rien.

**Le correctif évident, et son piège.** Faire rendre à `paintedAt` le MOTIF de son refus (une chaîne) au lieu de lever, puis rendre `near()` fail-closed — `Array.isArray(rgb) && …`. Correct pour toute règle POSITIVE : une sonde perdue la fait tomber.

**Ce que ça casse en silence.** Le même fichier portait une règle NÉGATIVE — « la rangée plate arrondit CHAQUE case : le coin intérieur est HORS média » — écrite `!near(coin, INDIGO)`. Sur une sonde perdue, `near` rend `false`, donc `!near` rend **VRAI** : le témoin aurait été déclaré SATISFAIT **au moment précis où la mesure venait d'échouer**. Verdir par ABSENCE DE SUJET.

**Le troc.** Un gate qui EXPLOSE se voit dans le journal ; un gate qui MENT ne se voit nulle part. S'arrêter à `near` aurait donc **aggravé** le défaut tout en fermant l'issue.

**Règle.** Quand on rend un prédicat fail-closed, **énumérer ses usages NÉGATIFS avant de conclure** — `grep '!predicat('`. Chacun a besoin de sa jumelle, qui n'est pas la négation : `loin(v, c) = estUneMesure(v) && !near(v, c)`. Les deux sens doivent exiger que la mesure ait EU LIEU. C'est la forme, sur un prédicat, de la règle déjà payée sur les gardes : [[reference_guard_direction_decides_failure_direction]].

**Corollaire de portée.** Le défaut vivait dans la SEULE des quatre sondes de pixels du fichier qui n'appariait pas `scrollIntoView({ block: 'center' })` à son `waitForRowSettled` — les trois autres le faisaient. `waitForRowSettled` attend qu'une rangée cesse de BOUGER, jamais qu'elle soit À L'ÉCRAN : les deux attentes ne sont pas substituables, et un inventaire des sites voisins l'aurait dit avant la CI.
