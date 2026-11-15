## Leçon 65 — le module sans CI n'est pas stable, c'est le module dont personne ne mesure l'instabilité (même cycle, session parallèle)

Deux sessions ont convergé sur la même découverte Android (leçon 63). En creusant le chemin qu'elle
désigne — `OutboxFlushWorker` — le défaut le plus grave du cycle est apparu, et il n'a **pas** pu
être corrigé :

- `SendResult` documente le contrat (`TransientFailure` = « réseau coupé, 5xx, timeout » ;
  `PermanentFailure` = « 4xx autre que 404 »), `ARCHITECTURE.md §5` l'exige nommément
  (« transient-vs-permanent classification, 404-as-success »), et `ApiError` porte bien `httpStatus`.
  **Quatorze des quinze senders l'ignorent** et écrasent tout échec en `TransientFailure`. Seul
  `SEND_FRIEND_REQUEST` classe correctement — le patron existe déjà dans le dépôt, appliqué à une
  lane sur quinze.
- `OutboxDrainer` est en **FIFO strict** et une `TransientFailure` **arrête la lane**. Un 403
  définitif (fenêtre d'édition dépassée, auteur retiré de la conversation) bloque donc tous les
  messages suivants de cette conversation pendant 5 tentatives à backoff exponentiel — de l'ordre de
  cinq minutes de blocage de tête de file pour une erreur qui ne guérira jamais.
- À l'épuisement, `onExhausted` n'a aucun cas pour `EDIT_MESSAGE` / `DELETE_MESSAGE` (`else -> Unit`)
  alors que `editOptimistic` a déjà peint l'édition localement : l'appareil montre le texte édité
  pour toujours, le serveur n'a rien appliqué, personne d'autre ne le voit.

**Leçons :**

1. **Le module le moins outillé accumule les défauts les plus graves, et c'est mécanique.**
   `.github/workflows/` ne contient **aucun** job Gradle : Android n'est vérifié par rien. Ce n'est
   pas un hasard si c'est là qu'on trouve à la fois le défaut le plus sévère du cycle et la croyance
   fausse qui a failli coûter une régression. Un module sans CI ne produit aucun signal — ni rouge,
   ni vert — et l'absence de rouge se lit comme de la santé.
2. **Ne pas livrer ce qu'on ne peut pas prouver.** Le correctif était rédigeable de tête. Il n'a pas
   été écrit : `dl.google.com` est refusé par la politique réseau de l'environnement (403 sur
   CONNECT), donc ni le SDK Android ni le dépôt Maven Google ne sont atteignables, `:sdk-core:test`
   ne peut pas tourner, et aucune CI ne l'aurait rattrapé. Du Kotlin non compilé et non testé sur
   `main` est une régression déguisée en correctif. **Ce qu'on livre quand on ne peut pas livrer le
   code, c'est la mesure complète et le correctif esquissé** — consignés en tête du reste ouvert.
3. **Vérifier qu'on PEUT prouver avant de choisir la tête du cycle, pas après l'avoir écrite.**
   La faisabilité de la vérification (toolchain présent ? CI existante ?) fait partie du choix de la
   cible, au même titre que la gravité du défaut. Ici, elle a fait basculer le cycle d'Android vers
   la gateway — où le défaut jumeau (`PATCH /messages/:messageId` sans garde de vacuité) était, lui,
   entièrement testable.
