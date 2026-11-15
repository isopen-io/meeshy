## Une conversation obsolète n'est pas un objet de signalement : elle est détruite à 48 h (2026-11-03, #14691)

**Statut** : Accepté — remplace l'option (a) de la décision du 2026-11-02 (#14676)

### Contexte

Le 2026-11-02 (#14676, option a), la purge des conversations obsolètes
(`jobs/obsolete-conversation-purge.ts`) avait appris à reculer de 6 h toute
conversation visée par un signalement non clos — la conversation, l'un de ses
messages ou l'un de ses membres —, jusqu'à la clôture du dernier signalement.
Le porteur a tranché autrement le 2026-11-03.

### Décision (porteur)

Rendre une conversation obsolète, c'est la demande d'un membre de tout effacer.
Dès l'émission, la conversation est gelée côté serveur, n'a plus AUCUNE trace
chez les clients, et elle est détruite au bout de 48 h. **Ces 48 h SONT la
fenêtre de modération** : un signalement déjà émis se traite pendant ce délai,
et il ne le prolonge pas.

- La purge ne lit plus aucun signalement. Une conversation échue à 48 h se
  purge, signalement ouvert ou non. `OBSOLETE_PURGE_REPORT_HOLD_MS`,
  `CLOSED_REPORT_STATUSES` et le compteur `held` du rapport de passe sont retirés.
- Le recul sur ERREUR transitoire reste : une conversation dont la purge échoue
  recule de `OBSOLETE_PURGE_RETRY_DELAY_MS` (6 h) et ne bloque pas la file.
- Les options (b), (c) et (d) de #14676 qui ouvraient un signalement depuis les
  clients pendant les 48 h sont écartées. L'option (c) RETENUE le 2026-11-02 —
  l'expéditeur d'une demande non acceptée ne rend pas la directe obsolète — ne
  change pas.

### Conséquences

- Rétrocompatible : aucune route, aucun champ, aucun événement ne change. Le
  rapport de passe perd `held`, qu'aucun consommateur ne lisait.
- `POST /admin/reports` (`routes/reports/target.ts`) ne distingue pas une
  conversation obsolète : ses membres restent `isActive`, donc un appel forgé
  peut encore créer un signalement visant la conversation ou l'un de ses
  messages pendant les 48 h. C'est neutre pour cette décision (le signalement
  ne retient plus rien), mais il pointera une entité détruite après la purge.
