# `jvm-check` ne prouve que `:core:model` — un lot qui touche `sdk-core` attend `android.yml`

**Date** : 2026-11-18 · **Issue** : #19650 · **Correctif** : 3c34847299

## Ce qui s'est passé

Le lot Android de #19650 (bf51c7d3fc) a été poussé sur `dev` après un `jvm-check`
vert (2 308 tests). Dans `SocketEventNames.kt`, il avait REMPLACÉ
`COMMUNITY_DELETED` par `CALL_CONVERSATION_CHANGED` au lieu de l'ajouter à côté.
`:core:model` compilait, puisque rien n'y lit cette constante. `sdk-core`
(`CommunityDeletedBinding`, #19592) ne compilait plus. Une autre session l'a
réparé.

## La règle

- `./apps/android/meeshy.sh jvm-check` ne compile QUE `:core:model`. Un vert y
  prouve les lois pures, jamais un module qui les consomme (`sdk-core`,
  `feature/*`, `app`).
- Un lot qui touche un autre module que `:core:model` ne part sur `dev` qu'après
  un `workflow_dispatch` d'`android.yml` vert sur sa tête (ou, faute de file CI,
  un Gradle local complet sur les modules touchés).
- Un fichier de constantes PARTAGÉ (`SocketEventNames.kt`, `event-names.ts`) se
  relit en diff avant la poussée : une ligne ajoutée doit apparaître en `+` sans
  `-` en face. Une fusion de deux sessions sur la même liste remplace aussi
  facilement qu'elle ajoute.
