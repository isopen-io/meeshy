import CryptoKit
import Foundation
import GRDB
import os

/// Couche L2 (SQLite) d'un `GRDBCacheStore` : toute l'E/S disque, le chiffrement
/// et le diff d'écriture. Valeur `Sendable` sans état mutable — l'acteur garde
/// l'état L1 (mémoire, ordre d'accès, clés sales) et délègue ici chaque lecture
/// ou écriture persistante. Les clés reçues sont DÉJÀ namespacées par l'acteur,
/// sauf pour les listes de clés qui rendent des clés dé-namespacées.
struct GRDBCacheL2<Value>: Sendable where Value: CacheIdentifiable & Codable {
    private let db: any DatabaseWriter
    private let namespace: String
    private let encrypted: Bool
    private let encryption: any DatabaseEncryptionProviding
    private let logger = MeeshyLog.logger(.grdbCacheStore, subsystem: .legacySDK)

    init(
        db: any DatabaseWriter,
        namespace: String,
        encrypted: Bool,
        encryption: any DatabaseEncryptionProviding
    ) {
        self.db = db
        self.namespace = namespace
        self.encrypted = encrypted
        self.encryption = encryption
    }

    /// Écriture-diff partagée par les trois chemins de persistance (save,
    /// save-préservant-fraîcheur, flush dirty) : supprime les rangées sorties
    /// du jeu, saute (empreinte `contentHash`) celles dont le plaintext n'a
    /// pas changé, ne chiffre et n'écrit que le reste. Remplace l'ancien
    /// delete-all + réécriture-chiffrement intégrale — même résultat
    /// ensembliste, coût proportionnel au CHANGEMENT.
    private func upsertEntriesDiffed(
        _ db: Database,
        keyStr: String,
        items: [Value],
        encoder: JSONEncoder,
        now: Date
    ) throws {
        let encrypt = encrypted
        let existingRows = try Row.fetchAll(
            db,
            sql: "SELECT itemId, contentHash, position FROM cache_entries WHERE key = ?",
            arguments: [keyStr]
        )
        var existingHashes: [String: String] = [:]
        var existingPositions: [String: Int] = [:]
        var existingIds: [String] = []
        for row in existingRows {
            let id: String = row["itemId"]
            existingIds.append(id)
            if let hash: String = row["contentHash"] { existingHashes[id] = hash }
            if let position: Int = row["position"] { existingPositions[id] = position }
        }
        let currentIds = Set(items.map(\.id))
        for removedId in existingIds where !currentIds.contains(removedId) {
            try CacheEntry.filter(Column("key") == keyStr && Column("itemId") == removedId).deleteAll(db)
        }
        for (index, item) in items.enumerated() {
            let json = try encoder.encode(item)
            let hash = contentHash(of: json)
            if existingHashes[item.id] == hash {
                // Payload identique — pas de re-chiffrement ni de réécriture.
                // Seul le RANG est réaligné s'il a bougé (un déplacement dans
                // la liste, ex. conversation remontée en tête, n'est pas un
                // changement de contenu).
                if existingPositions[item.id] != index {
                    try db.execute(
                        sql: "UPDATE cache_entries SET position = ? WHERE key = ? AND itemId = ?",
                        arguments: [index, keyStr, item.id]
                    )
                }
                continue
            }
            let data: Data
            if encrypt {
                guard let encryptedData = encryption.encrypt(json) else {
                    logger.error("Encryption failed for store \(self.namespace, privacy: .public), refusing to persist")
                    throw GRDBCacheError.encryptionFailed
                }
                data = encryptedData
            } else {
                data = json
            }
            let entry = CacheEntry(key: keyStr, itemId: item.id, encodedData: data, updatedAt: now, contentHash: hash, position: index)
            try entry.save(db)
        }
    }

    func writeToL2(_ items: [Value], for keyStr: String, fetchedAt: Date) throws {
        let encoder = MeeshyCoders.encoder(.persistence)
        // .sortedKeys : l'empreinte contentHash exige des octets DÉTERMINISTES
        // pour un même payload — sans ordre de clés garanti, deux encodes du
        // même item peuvent différer et le skip ne fire jamais (réécriture
        // intégrale silencieuse). Le décodage est insensible à l'ordre, les
        // rangées historiques restent lisibles.
        encoder.outputFormatting = [.sortedKeys]
        do {
            try db.write { db in
                let now = Date()
                try upsertEntriesDiffed(db, keyStr: keyStr, items: items, encoder: encoder, now: now)

                // Preserve any cursor state that callers persisted via
                // `saveCursor` — `save()` only owns lastFetchedAt and
                // totalCount, not the pagination metadata.
                let existingCursor = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db)
                let meta = DBCacheMetadata(
                    key: keyStr,
                    nextCursor: existingCursor?.nextCursor,
                    hasMore: existingCursor?.hasMore ?? false,
                    totalCount: items.count,
                    lastFetchedAt: fetchedAt
                )
                try meta.save(db)
            }
        } catch let cacheError as GRDBCacheError {
            // Propagate the strict encryption error so callers can react
            // (e.g. show a recovery flow). The DB write was rolled back by
            // GRDB's transaction wrapper.
            throw cacheError
        } catch {
            self.logger.error("Failed to persist to L2 for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    /// stores-08 — miroir de writeToL2 qui ne fait PAS avancer lastFetchedAt
    /// (préservé depuis la métadonnée existante ; repli sur now pour une clé
    /// neuve). Curseur de pagination préservé lui aussi.
    func writeToL2PreservingFreshness(_ items: [Value], for keyStr: String) throws -> Date {
        let encoder = MeeshyCoders.encoder(.persistence)
        // .sortedKeys : l'empreinte contentHash exige des octets DÉTERMINISTES
        // pour un même payload — sans ordre de clés garanti, deux encodes du
        // même item peuvent différer et le skip ne fire jamais (réécriture
        // intégrale silencieuse). Le décodage est insensible à l'ordre, les
        // rangées historiques restent lisibles.
        encoder.outputFormatting = [.sortedKeys]
        do {
            return try db.write { db in
                let now = Date()
                try upsertEntriesDiffed(db, keyStr: keyStr, items: items, encoder: encoder, now: now)
                let existingMeta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db)
                let preservedAt = existingMeta?.lastFetchedAt ?? now
                let meta = DBCacheMetadata(
                    key: keyStr,
                    nextCursor: existingMeta?.nextCursor,
                    hasMore: existingMeta?.hasMore ?? false,
                    totalCount: items.count,
                    lastFetchedAt: preservedAt
                )
                try meta.save(db)
                return preservedAt
            }
        } catch let cacheError as GRDBCacheError {
            throw cacheError
        } catch {
            self.logger.error("Failed to persist (preserving freshness) to L2 for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    func readFromL2(for keyStr: String) -> (items: [Value], lastFetchedAt: Date)? {
        let decoder = MeeshyCoders.decoder(.persistence)
        let encrypt = encrypted
        let encryption = self.encryption
        let logger = self.logger
        do {
            return try db.read { db in
                guard let meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else {
                    return nil
                }

                // Ordre explicite (v8) — repli rowid pour les rangées pré-v8,
                // qui reproduisent l'ancien ordre d'insertion du delete-all.
                let entries = try CacheEntry.fetchAll(
                    db,
                    sql: "SELECT * FROM cache_entries WHERE key = ? ORDER BY COALESCE(position, rowid)",
                    arguments: [keyStr]
                )
                guard !entries.isEmpty else { return nil }

                let items: [Value] = entries.compactMap { entry in
                    // On encrypted stores, a `nil` decrypt result means the
                    // row is unreadable (corrupted key, wrong-key tampering,
                    // or a leftover row written under a previous identity).
                    // Skip it instead of feeding garbage ciphertext to the
                    // JSON decoder — the caller will treat the key as empty.
                    let raw: Data
                    if encrypt {
                        guard let decrypted = encryption.decrypt(entry.encodedData) else {
                            logger.warning("Decryption failed for key \(keyStr, privacy: .public), skipping entry")
                            return nil
                        }
                        raw = decrypted
                    } else {
                        raw = entry.encodedData
                    }
                    // Une entrée illisible est ignorée (comme le skip de
                    // déchiffrement juste au-dessus) mais doit se voir : c'est
                    // un cache écrit par un schéma antérieur.
                    return decoder.decodeOrLog(Value.self, from: raw,
                                               field: "L2 cache entry", id: keyStr,
                                               logger: logger)
                }

                return items.isEmpty ? nil : (items, meta.lastFetchedAt)
            }
        } catch {
            self.logger.error("Failed to load from L2 for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Backing write for `debugRewindFetchTimestamp` — updates only the
    /// `lastFetchedAt` column of an existing metadata row. No-op (does not
    /// synthesize a row) when `keyStr` has no persisted metadata, mirroring
    /// `loadIgnoringExpiry`'s "nil when never saved" contract.
    func rewriteL2FetchTimestamp(_ date: Date, for keyStr: String) {
        do {
            try db.write { db in
                guard var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else { return }
                meta.lastFetchedAt = date
                try meta.save(db)
            }
        } catch {
            logger.error("Failed to rewind lastFetchedAt for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    func deleteL2(for keyStr: String) {
        do {
            try db.write { db in
                try CacheEntry.filter(Column("key") == keyStr).deleteAll(db)
                try DBCacheMetadata.filter(Column("key") == keyStr).deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate L2 for key \(keyStr): \(error)")
        }
    }

    /// Purge les lignes L2 de CE store, et de lui seul.
    ///
    /// Tous les `GRDBCacheStore` partagent les tables `cache_entries` et
    /// `cache_metadata` : seule la clé, préfixée `"<namespace>:"`, les
    /// distingue. La version précédente faisait `CacheEntry.deleteAll(db)` sans
    /// filtre — vider un seul store emportait TOUS les autres (messages, feed,
    /// stories, préférences…). La perte restait invisible tant que les autres
    /// stores répondaient depuis leur L1 : elle n'apparaissait qu'au démarrage
    /// à froid suivant, ce qui l'a rendue indétectable en usage normal.
    ///
    /// Le filtre passe par `substr` et NON par `LIKE 'ns:%'` : `_` est un
    /// joker `LIKE` (un caractère quelconque), et le préfixe seul ne suffirait
    /// pas non plus — `prefs` et `prefs-user` coexistent dans le coordinator,
    /// donc le séparateur `:` doit faire partie du motif comparé.
    ///
    /// Namespace VIDE : aucun préfixe ne permet d'identifier les lignes du
    /// store, `substr(key, 1, 0) = ''` est vrai partout et l'on retombe donc —
    /// volontairement — sur la purge globale historique. Tous les stores du
    /// `CacheCoordinator` sont namespacés ; ce cas ne concerne que les stores
    /// construits à la main (tests, usages ad hoc).
    func deleteAllL2() {
        let prefix = namespace.isEmpty ? "" : "\(namespace):"
        do {
            try db.write { db in
                try CacheEntry
                    .filter(sql: "substr(key, 1, ?) = ?", arguments: [prefix.count, prefix])
                    .deleteAll(db)
                try DBCacheMetadata
                    .filter(sql: "substr(key, 1, ?) = ?", arguments: [prefix.count, prefix])
                    .deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate all L2: \(error)")
        }
    }

    func bumpLastFetchedAtInL2(to date: Date, for keyStr: String) {
        do {
            try db.write { db in
                guard var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else { return }
                meta.lastFetchedAt = date
                try meta.save(db)
            }
        } catch {
            logger.error("Failed to touch L2 lastFetchedAt for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    func writeCursorToL2(nextCursor: String?, hasMore: Bool, for keyStr: String) {
        do {
            try db.write { db in
                if var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) {
                    // Merge: keep existing lastFetchedAt/totalCount, only
                    // update the cursor fields. This preserves the
                    // freshness signal owned by `save()`.
                    meta.nextCursor = nextCursor
                    meta.hasMore = hasMore
                    try meta.save(db)
                } else {
                    // No prior metadata row — synthesise one with a
                    // current timestamp so reads know when the cursor
                    // was first observed.
                    let meta = DBCacheMetadata(
                        key: keyStr,
                        nextCursor: nextCursor,
                        hasMore: hasMore,
                        totalCount: nil,
                        lastFetchedAt: Date()
                    )
                    try meta.save(db)
                }
            }
        } catch {
            logger.error("Failed to persist cursor for key \(keyStr): \(error)")
        }
    }

    func readCursorFromL2(for keyStr: String) -> PaginationCursor? {
        do {
            return try db.read { db in
                guard let meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else {
                    return nil
                }
                return PaginationCursor(nextCursor: meta.nextCursor, hasMore: meta.hasMore)
            }
        } catch {
            logger.error("Failed to load cursor from L2 for key \(keyStr): \(error)")
            return nil
        }
    }

    /// Empreinte de changement d'un item (SHA-256 hex du JSON plaintext,
    /// préfixé de l'identité de la clé sur les stores chiffrés). Le blob
    /// chiffré est non déterministe (nonce frais à chaque encrypt) — seul un
    /// hash du plaintext permet de détecter « payload identique ». Mélanger
    /// l'identité de clé garantit qu'un changement de clé (perte Keychain,
    /// destroyKey) invalide TOUTES les empreintes : chaque rangée est alors
    /// réécrite sous la clé courante au lieu de rester indéchiffrable.
    private func contentHash(of json: Data) -> String {
        var hasher = SHA256()
        if encrypted {
            hasher.update(data: Data(encryption.keyFingerprint.utf8))
        }
        hasher.update(data: json)
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    func flushKeyToL2(keyStr: String, items: [Value]) -> Bool {
        let encoder = MeeshyCoders.encoder(.persistence)
        // .sortedKeys : l'empreinte contentHash exige des octets DÉTERMINISTES
        // pour un même payload — sans ordre de clés garanti, deux encodes du
        // même item peuvent différer et le skip ne fire jamais (réécriture
        // intégrale silencieuse). Le décodage est insensible à l'ordre, les
        // rangées historiques restent lisibles.
        encoder.outputFormatting = [.sortedKeys]
        do {
            try db.write { db in
                // P2-2a — écriture-diff : un flush dirty de 600 items dont 1 a
                // changé n'écrit plus qu'1 rangée (ni re-chiffrement ni UPDATE
                // pour les payloads identiques).
                try upsertEntriesDiffed(db, keyStr: keyStr, items: items, encoder: encoder, now: Date())

                // Preserve cursor state AND the network-fetch freshness clock
                // across flushes. A dirty flush is triggered by purely-LOCAL
                // mutations (update/upsert/mergeUpdate), so resetting
                // `lastFetchedAt` to `now` here would make stale data read as
                // `.fresh` after L1 eviction / restart and suppress the
                // stale-while-revalidate refresh. Only `save()` (a genuine
                // network fetch, see writeToL2) may advance lastFetchedAt; we
                // fall back to `now` only when no prior metadata exists (a key
                // created purely locally with no network counterpart).
                let existingMeta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db)
                let meta = DBCacheMetadata(
                    key: keyStr,
                    nextCursor: existingMeta?.nextCursor,
                    hasMore: existingMeta?.hasMore ?? false,
                    totalCount: items.count,
                    lastFetchedAt: existingMeta?.lastFetchedAt ?? Date()
                )
                try meta.save(db)
            }
            return true
        } catch {
            // Returning `false` keeps the dirty key in the set so the next
            // flush window retries. On encryption failure this means the
            // mutation stays in L1 (visible to the user) but never reaches
            // disk — preferable to a silent plaintext leak.
            self.logger.error("Failed to flush dirty key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Toutes les clés (dé-namespacées) dont une entrée L2 porte `itemId`.
    /// Lit `cache_entries`, qui indexe déjà le couple (key, itemId) — inutile de
    /// désérialiser les payloads pour savoir QUI contient l'item.
    func keysHolding(itemId: String) -> [String] {
        let prefix = namespace.isEmpty ? "" : "\(namespace):"
        do {
            let keys = try db.read { db in
                try String.fetchAll(
                    db,
                    sql: "SELECT DISTINCT key FROM cache_entries WHERE itemId = ?",
                    arguments: [itemId]
                )
            }
            return keys.compactMap { key in
                guard prefix.isEmpty else {
                    return key.hasPrefix(prefix) ? String(key.dropFirst(prefix.count)) : nil
                }
                return key
            }
        } catch {
            logger.error("Failed to list keys holding \(itemId, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    /// Toutes les clés (dé-namespacées) persistées par CE store.
    func keys() -> [String] {
        let prefix = namespace.isEmpty ? "" : "\(namespace):"
        do {
            let keys = try db.read { db in
                try String.fetchAll(
                    db,
                    sql: "SELECT DISTINCT key FROM cache_entries WHERE substr(key, 1, ?) = ?",
                    arguments: [prefix.count, prefix]
                )
            }
            return keys.map { String($0.dropFirst(prefix.count)) }
        } catch {
            logger.error("Failed to list keys of \(self.namespace, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    /// Toutes les valeurs persistées de CE store, toutes clés confondues.
    ///
    /// Sert à reconstruire l'attribution « URL de média → domaine » : les
    /// stores disque ne savent pas à quel domaine appartient un fichier, seule
    /// la relecture des payloads permet de le dire (cf. `CacheMediaAttribution`).
    ///
    /// Dédupliqué par `itemId` : un même post vit sous plusieurs clés
    /// (`main-feed`, `<postId>`, `bookmarks`, la clé du pager de réels) et
    /// serait sinon compté autant de fois qu'il est indexé.
    ///
    /// La fraîcheur est volontairement IGNORÉE : un payload périmé occupe
    /// toujours de la place et ses médias sont toujours sur le disque. Filtrer
    /// sur le TTL ferait basculer ces fichiers dans le résidu « non attribué »
    /// alors qu'on sait parfaitement à qui ils appartiennent.
    func allValues() async -> [Value] {
        let prefix = namespace.isEmpty ? "" : "\(namespace):"
        let decoder = MeeshyCoders.decoder(.persistence)
        let encrypt = encrypted
        let encryption = self.encryption
        var seenItemIds = Set<String>()
        var values: [Value] = []
        do {
            let rows: [CacheEntry] = try await db.read { db in
                try CacheEntry
                    .filter(sql: "substr(key, 1, ?) = ?", arguments: [prefix.count, prefix])
                    .fetchAll(db)
            }
            for row in rows {
                guard seenItemIds.insert(row.itemId).inserted else { continue }
                let raw: Data
                if encrypt {
                    guard let decrypted = encryption.decrypt(row.encodedData) else { continue }
                    raw = decrypted
                } else {
                    raw = row.encodedData
                }
                guard let value = try? decoder.decode(Value.self, from: raw) else { continue }
                values.append(value)
            }
        } catch {
            logger.error("Inventaire L2 impossible pour \(self.namespace, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        return values
    }

    /// Octets occupés en base par les payloads de CE store.
    ///
    /// `length(encodedData)` sur les lignes du namespace : c'est la taille
    /// réelle des blobs, mesurée par SQLite. On ne compte ni l'overhead des
    /// pages ni les index — annoncer la place rendue au système exigerait un
    /// `VACUUM`, que l'on ne déclenche pas ici. La valeur est donc un plancher
    /// exact du contenu, jamais une estimation inventée.
    func byteSize() async -> Int {
        let prefix = namespace.isEmpty ? "" : "\(namespace):"
        do {
            return try await db.read { db in
                try Int.fetchOne(
                    db,
                    sql: "SELECT COALESCE(SUM(LENGTH(encodedData)), 0) FROM cache_entries WHERE substr(key, 1, ?) = ?",
                    arguments: [prefix.count, prefix]
                ) ?? 0
            }
        } catch {
            logger.error("Mesure L2 impossible pour \(self.namespace, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return 0
        }
    }
}
