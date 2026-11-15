## Une migration GRDB est un type, et son identifiant ne change jamais

**Contexte**: quatre migrateurs jouent 44 identifiants (`AppDatabase` 10, `MessageDatabaseMigrations` 24,
`FeedDatabaseMigrations` 9, `SearchIndexMigrations` 1), chacun dans un `registerAll` de 140 à 394 lignes.
`SearchIndexMigrations` est inséré au MILIEU du migrateur de l'app, entre `v6_tus_upload_checkpoint` et
`v7_cache_entries_itemId_index`. GRDB identifie une migration par son NOM et rejoue dans l'ordre
d'enregistrement : renommer un identifiant, ou en insérer un avant un identifiant déjà appliqué,
rejoue une migration sur une base installée (`CREATE TABLE` en double, échec, `openOrRecover` efface le
cache). Les pannes de persistance, elles, disparaissaient dans des `try?`.

**Décision**:
- Une migration est une struct `DatabaseMigration` (`identifier` + `migrate(_:)`) ; chaque migrateur
  publie une table ordonnée `static let all`, et `registerAll(in:)` enregistre depuis cette table.
  Les corps sont déplacés tels quels, seule l'indentation change.
- L'ordre de `all` recopie l'ordre historique, y compris l'entrelacement (App : le Search entre v6 et v7 ;
  Message : `outbox` avant `messages_cached_time_string`, `messages_send_attempts` avant
  `outbox_v3_waiting_for_fanout_origin_since`). Le découpage en fichiers (`+Tables`, `+Outbox`, `+Columns`)
  ne dicte jamais l'ordre.
- Les quatre migrateurs restent DISTINCTS : `MessageStoreSession` et la NSE jouent Message puis Feed sur le
  même pool, et le chemin rapide `hasCompletedMigrations` lit chaque migrateur seul.
- Un identifiant ajouté s'ajoute EN FIN de table. Les témoins `DatabaseMigrationTableTests` portent les
  listes littérales ; `DatabaseMigrationUpgradePathTests` rejoue chaque préfixe installé jusqu'au schéma
  d'une installation neuve.
- `MeeshyLog` porte le sous-système unique `me.meeshy.app` et `bestEffort` consigne au lieu d'avaler.
  Le contexte est une `StaticString` : aucun identifiant ne s'interpole dans un journal `.public`.
  Les journaux `grdb` quittent `com.meeshy.sdk` pour `me.meeshy.app` : un filtre Console ou un sysdiagnose
  qui ciblait l'ancien sous-système se met à jour.
- Le repli en mémoire de `AppDatabase` enchaîne des ouvreurs (mémoire, puis fichier temporaire), consigne
  chaque échec, et ne contient plus de `try!`. Si tous échouent, `preconditionFailure` après un `.fault` :
  SQLite indisponible rend le processus inutilisable.

**Alternatives rejetées**:
- *Un migrateur unique Message + Feed.* Casse le chemin rapide et le jeu séparé de la NSE.
- *Renommer les identifiants en conventions uniformes.* Rejoue des migrations sur toutes les bases installées.
- *Un `bestEffort` qui avale sans consigner.* C'est le défaut qu'il remplace.

**Suivi**: 416 sites `try? await` (dont 118 du motif `save/applyEvent/upsert/write`) restent à convertir
vers `bestEffort`, et 253 `Logger(subsystem:)` vers `MeeshyLog` (#11092, dette consignée).
