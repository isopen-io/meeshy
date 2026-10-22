import Foundation
import GRDB
import os

extension CacheCoordinator {
    public func cachedTranslations(for messageId: String) -> [TranslationData]? {
        // TTL enforcement on read: if the entry is older than 24h, drop it so
        // we don't serve stale machine output when a better translation could
        // be produced on demand.
        if let stamp = translationTimestamps[messageId],
           Date().timeIntervalSince(stamp) > Self.translationMaxAge {
            translationCache.removeValue(forKey: messageId)
            translationTimestamps.removeValue(forKey: messageId)
            if let idx = translationInsertionOrder.firstIndex(of: messageId) {
                translationInsertionOrder.remove(at: idx)
            }
            return nil
        }
        return translationCache[messageId]
    }

    /// Éviction CIBLÉE des traductions d'UN message, RAM et table GRDB.
    ///
    /// Appelée quand le contenu du message a changé (édition) : ses traductions
    /// décrivent alors un texte qui n'existe plus. Sans la ligne disque, la
    /// purge en mémoire serait cosmétique — `loadTranslationCaches()` la
    /// réinjecterait au prochain démarrage. Jumelle par MESSAGE de
    /// `invalidateTranslationCaches()`, qui vide les trois caches de
    /// traduction/transcription en entier ; `clearTranslationCacheDB()` en est
    /// le pendant disque global. Les caches de transcription et d'audio
    /// traduit ne sont PAS touchés : éditer le texte d'un message ne périme
    /// pas la piste enregistrée.
    public func invalidateTranslations(for messageId: String) {
        translationCache.removeValue(forKey: messageId)
        translationTimestamps.removeValue(forKey: messageId)
        if let idx = translationInsertionOrder.firstIndex(of: messageId) {
            translationInsertionOrder.remove(at: idx)
        }
        deleteTranslationCacheRows(messageId: messageId)
    }

    private nonisolated func deleteTranslationCacheRows(messageId: String) {
        do {
            try db.write { db in
                _ = try TranslationCacheRecord
                    .filter(Column("messageId") == messageId)
                    .deleteAll(db)
            }
        } catch {
            logger.error("Failed to delete cached translations for \(messageId): \(error.localizedDescription)")
        }
    }

    public func cachedTranslations(for messageIds: [String]) -> [String: [TranslationData]] {
        var result: [String: [TranslationData]] = [:]
        for msgId in messageIds {
            if let translations = cachedTranslations(for: msgId) {
                result[msgId] = translations
            }
        }
        return result
    }

    public func cachedTranscription(for messageId: String) -> TranscriptionReadyEvent? {
        transcriptionCache[messageId]
    }

    public func cachedAudioTranslations(for messageId: String) -> [AudioTranslationEvent]? {
        audioTranslationCache[messageId]
    }

    // MARK: - Public Cache Methods (called by ConversationSyncEngine)

    public func cacheTranslation(_ event: TranslationEvent) {
        let msgId = event.messageId
        var existing = translationCache[msgId] ?? []
        let isNew = translationCache[msgId] == nil
        for translation in event.translations {
            if let idx = existing.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
                existing[idx] = translation
            } else {
                existing.append(translation)
            }
        }
        translationCache[msgId] = existing
        // Stamp/refresh the age marker so the TTL reset on every new
        // broadcast — server-pushed updates keep the entry hot.
        translationTimestamps[msgId] = Date()
        if isNew {
            translationInsertionOrder.append(msgId)
            evictTranslationCacheIfNeeded()
        }
        // Persist this specific translation immediately (incremental, not full rewrite)
        persistTranslationIncremental(messageId: msgId, translations: existing, cachedAt: translationTimestamps[msgId] ?? Date())
    }

    public func cacheTranscription(_ event: TranscriptionReadyEvent) {
        transcriptionCache[event.messageId] = event
    }

    public func cacheAudioTranslation(_ event: AudioTranslationEvent) {
        let msgId = event.messageId
        var existing = audioTranslationCache[msgId] ?? []
        if let idx = existing.firstIndex(where: { $0.translatedAudio.targetLanguage == event.translatedAudio.targetLanguage }) {
            existing[idx] = event
        } else {
            existing.append(event)
        }
        audioTranslationCache[msgId] = existing
    }

    private func evictTranslationCacheIfNeeded() {
        while translationCache.count > Self.maxTranslationCacheEntries, let oldest = translationInsertionOrder.first {
            translationInsertionOrder.removeFirst()
            translationCache.removeValue(forKey: oldest)
            translationTimestamps.removeValue(forKey: oldest)
        }
    }

    // MARK: - Translation Cache Persistence

    private func persistTranslationIncremental(messageId: String, translations: [TranslationData], cachedAt: Date) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            try db.write { db in
                // Delete existing records for this message, then insert fresh
                try TranslationCacheRecord
                    .filter(Column("messageId") == messageId)
                    .deleteAll(db)
                for translation in translations {
                    let data = try encoder.encode(translation)
                    let record = TranslationCacheRecord(
                        messageId: messageId,
                        targetLanguage: translation.targetLanguage,
                        encodedData: data,
                        cachedAt: cachedAt
                    )
                    try record.save(db)
                }
            }
        } catch {
            logger.error("Failed to persist translation for \(messageId): \(error)")
        }
    }

    func loadTranslationCaches() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let cutoff = Date().addingTimeInterval(-Self.translationMaxAge)
        do {
            let records: [TranslationCacheRecord] = try db.read { db in
                try TranslationCacheRecord
                    .filter(Column("cachedAt") > cutoff)
                    .fetchAll(db)
            }
            // cache-02 — GC des rows au-delà du cutoff : le full-rewrite
            // supprimé assurait accessoirement cette purge ; sans elle la
            // table croît sans borne. Write séparé et loggé : un échec de GC
            // ne doit pas empêcher le chargement.
            do {
                try db.write { db in
                    _ = try TranslationCacheRecord
                        .filter(Column("cachedAt") <= cutoff)
                        .deleteAll(db)
                }
            } catch {
                logger.error("Failed to GC stale translation cache rows: \(error.localizedDescription, privacy: .public)")
            }
            var loaded: [String: [TranslationData]] = [:]
            var stamps: [String: Date] = [:]
            var order: [String] = []
            for record in records {
                let translation = try decoder.decode(TranslationData.self, from: record.encodedData)
                loaded[record.messageId, default: []].append(translation)
                if stamps[record.messageId] == nil {
                    stamps[record.messageId] = record.cachedAt
                    order.append(record.messageId)
                }
            }
            translationCache = loaded
            translationTimestamps = stamps
            translationInsertionOrder = order
        } catch {
            logger.error("Failed to load translation cache from GRDB: \(error)")
        }
        logger.info("Loaded translation caches: \(self.translationCache.count) translations, \(self.transcriptionCache.count) transcriptions, \(self.audioTranslationCache.count) audio translations")

        // One-time cleanup: remove legacy UserDefaults keys
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_translations")
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_transcriptions")
        UserDefaults.standard.removeObject(forKey: "meeshy_cache_audio_translations")
    }

    nonisolated func clearTranslationCacheDB() {
        do {
            try db.write { db in _ = try TranslationCacheRecord.deleteAll(db) }
        } catch {
            logger.error("Failed to clear translation cache table: \(error.localizedDescription)")
        }
    }

    /// Purge ciblée des 3 caches in-memory de traduction/transcription +
    /// la table GRDB `TranslationCacheRecord`. Exposé publiquement pour
    /// que le pull-to-refresh (ou tout autre flow voulant re-traduire)
    /// puisse forcer un re-fetch des traductions sans toucher aux
    /// stores principaux (conversations, messages, etc.).
    ///
    /// Cas d'usage : l'utilisateur tire-pour-rafraîchir et veut
    /// récupérer les éventuelles re-traductions côté serveur (modèle
    /// NLLB mis à jour, contenu édité, langue préférée changée).
    public func invalidateTranslationCaches() {
        translationCache.removeAll()
        translationInsertionOrder.removeAll()
        translationTimestamps.removeAll()
        transcriptionCache.removeAll()
        audioTranslationCache.removeAll()
        clearTranslationCacheDB()
    }
}
