## Leçon 649 — les témoins peuvent être DISPENSÉS de la règle qu'ils sont là pour garder, et rien ne le dit

2026-09-20, #7153 / #7165 (`services/gateway/jest.config.json`). Le transform ts-jest du gateway porte `diagnostics: { ignoreCodes: [2322, 2339, 2345, 2740] }`, pour **1 348 suites**. Ce sont, très exactement, les quatre codes qui attrapent une dérive d'API : type inassignable, propriété inexistante, **argument de forme divergente**, propriétés obligatoires manquantes.

**Conséquence mesurée.** Dans les cinq suites réveillées, `createNotification` était appelée sans `context`, sans `metadata`, sans `priority` — trois paramètres OBLIGATOIRES. Aucune erreur de compilation. Le défaut n'apparaissait qu'à l'exécution, au premier déréférencement, sous la forme d'un plantage avalé (cf. leçon 648). Deux méthodes avaient de plus gagné un second argument — `markAsRead(id, userId)`, `deleteNotification(id, userId)` — qui est une **garde de propriété** : les témoins appelaient encore la version à un argument, et la dispense les empêchait de le dire.

**Le contre-témoin est la clé, et il est gratuit.** En annotant les mêmes littéraux avec `Parameters<NotificationService['createNotification']>[0]`, la dérive est remontée SUR-LE-CHAMP en `TS2739` — un code qui n'est pas dans la liste. Les deux formes décrivent le même défaut ; seule la seconde est visible. **Se lier à la signature plutôt qu'à un type jumeau transforme une panne d'exécution en erreur de compilation**, sans rien changer d'autre.

**Et le type jumeau existait.** `CreateNotificationData` décrivait une forme PLATE que le service n'accepte plus, avec zéro consommateur de production : il n'était plus un contrat, seulement un objet qui en avait l'air.

> **Avant de croire un témoin vert, demander de quelles règles il est DISPENSÉ.** Une liste d'exemptions posée pour débloquer une migration survit à la migration, vaut pour tout le dépôt, et ne se signale nulle part. Et quand un type décrit une API, préférer la SIGNATURE au type jumeau : le premier ne peut pas dériver de ce qu'il décrit.

Cf. [[reference_the_gateway_jest_config_removes_suites_and_exempts_type_errors]], [[reference_a_typecheck_and_a_test_run_cover_disjoint_file_sets]], [[reference_bun_test_runs_without_typing_so_green_witnesses_prove_nothing]].
