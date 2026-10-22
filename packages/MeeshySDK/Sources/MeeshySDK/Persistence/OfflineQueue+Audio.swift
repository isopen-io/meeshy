import Foundation
import Combine
import GRDB
import os

extension OfflineQueue {
    // MARK: - Audio offline (write-ahead 2-step)

    public enum EnqueueAudioError: Error, Sendable {
        /// `pool.write` of the outbox record itself threw. The audio file was
        /// not yet copied — the caller can safely surface the error and let
        /// the user retry without leaving a phantom on disk.
        case outboxWriteFailed(underlying: Error)
        /// `FileManager.copyItem` failed after the outbox record was inserted.
        /// We marked the record `.failed` to prevent the flusher from retrying
        /// against a missing file. The caller should also roll back any
        /// optimistic UI it inserted.
        case audioCopyFailed(underlying: Error)
        /// `configure(pool:)` was never called.
        case poolNotConfigured
    }

    /// Result of an `enqueueAudio` call. The relative `localAudioPath` is
    /// returned so the caller can update its optimistic UI to reference the
    /// stable persisted path (under `Documents/pending-audio/`) instead of
    /// the volatile `tmp/recording_*.m4a` URL that `sourceAudioURL` pointed at.
    public struct EnqueueAudioResult: Sendable {
        public let outboxId: String
        public let localAudioPath: String
    }

    /// Result of an `enqueueAudios` call (multi-track). `localAudioPaths`
    /// holds the N stable relative paths (under
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a`) the caller
    /// can use to reference the persisted tracks in its optimistic UI.
    public struct EnqueueAudiosResult: Sendable {
        public let outboxId: String
        public let localAudioPaths: [String]
    }

    /// Phase 4 §6.3 audio offline write-ahead. Atomicity between the SQLite
    /// outbox row and the on-disk audio file is impossible (two persistence
    /// systems), so we do it in two ordered phases :
    ///
    /// 1. Phase A — INSERT `OutboxRecord` referencing
    ///    `Documents/pending-audio/<clientMessageId>/0.m4a` (single-track is a
    ///    degenerate multi-track message routed through `enqueueAudios`, which
    ///    stores under the per-message subdir and records the path in
    ///    `localAudioPaths`). The record is `.pending` and the file does NOT
    ///    exist yet.
    /// 2. Phase B — `FileManager.copyItem` the source audio into that
    ///    pending path. On failure we UPDATE the outbox row to `.failed`
    ///    so the flusher does not retry against a missing file.
    /// 3. Phase C — best-effort delete the original `tmp/` source.
    ///
    /// Crash recovery between Phase A and Phase B is handled by
    /// `bootRecovery()` which sweeps `.pending` records whose referenced audio
    /// paths (`localAudioPath` and/or `localAudioPaths`) do not exist on disk
    /// and marks them `.failed`.
    /// The `clientMessageId` end-to-end dedup contract guarantees that an
    /// audio that actually reached the server before the crash will not
    /// produce a duplicate when the flusher replays whatever survived.
    @discardableResult
    public func enqueueAudio(
        sourceAudioURL: URL,
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil
    ) async throws -> EnqueueAudioResult {
        // Single-track audio is a degenerate multi-track message. Routing it
        // through `enqueueAudios([url], …)` keeps the write-ahead invariants
        // (outbox row first, files second, `.failed` on copy error) in one
        // place. The stored path lives under the per-message subdir
        // (`pending-audio/<cid>/0.m4a`) — `absoluteAudioPath(forStored:)`
        // resolves it identically, so existing readers keep working.
        let result = try await enqueueAudios(
            sourceAudioURLs: [sourceAudioURL],
            conversationId: conversationId,
            content: content,
            clientMessageId: clientMessageId,
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId
        )
        return EnqueueAudioResult(
            outboxId: result.outboxId,
            localAudioPath: result.localAudioPaths.first ?? ""
        )
    }

    /// Multi-track variant of `enqueueAudio`: persists N audio files as a
    /// SINGLE `OutboxRecord` (one logical message carrying N audio tracks).
    /// Same write-ahead ordering as the single-file path — the outbox row is
    /// inserted first (Phase A), then each source URL is copied into
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a` (Phase B). A
    /// copy failure on any track flips the row to `.failed` so the flusher
    /// never replays against a missing file. Boot recovery handles a crash
    /// between phases.
    @discardableResult
    public func enqueueAudios(
        sourceAudioURLs: [URL],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        protection: MessageProtectionIntent = .none
    ) async throws -> EnqueueAudiosResult {
        guard let pool = outboxPool else { throw EnqueueAudioError.poolNotConfigured }

        let relativePaths: [String] = try sourceAudioURLs.indices.map { index in
            try Self.pendingAudioRelativePath(for: clientMessageId, index: index)
        }
        let outboxId = "ofq_\(UUID().uuidString)"
        let now = Date()

        let item = OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: conversationId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentIds: nil,
            attachmentKinds: Array(repeating: AttachmentKind.audio.rawValue, count: sourceAudioURLs.count),
            localAudioPath: nil,
            localAudioPaths: relativePaths,
            protectionFlags: protection.persistedFlags,
            ephemeralDuration: protection.ephemeralDurationSeconds,
            createdAt: now
        )

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase A — UPSERT outbox row first. If this throws, the files are
        // still untouched on disk and the caller can retry. Un ré-enfilage sur
        // le même `clientMessageId` réutilise la row `.pending` existante au
        // lieu d'en créer une jumelle (cf. `upsertPendingSendRow`).
        let effectiveOutboxId: String
        do {
            effectiveOutboxId = try await pool.write { db in
                try Self.upsertPendingSendRow(
                    db,
                    preferredId: outboxId,
                    conversationId: conversationId,
                    clientMessageId: clientMessageId,
                    payload: payload,
                    createdAt: now
                )
            }
        } catch {
            throw EnqueueAudioError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each audio into the per-message pending subdir. On
        // any failure, mark the row `.failed` so the flusher does not retry
        // against a missing file. We must NOT throw before that update lands.
        do {
            for (source, relativePath) in zip(sourceAudioURLs, relativePaths) {
                let absolutePath = Self.absoluteAudioPath(forStored: relativePath)
                let dst = URL(fileURLWithPath: absolutePath)
                if FileManager.default.fileExists(atPath: absolutePath) {
                    try FileManager.default.removeItem(at: dst)
                }
                try FileManager.default.copyItem(at: source, to: dst)
            }
        } catch {
            // S6 — a copy failure is permanent (the source bytes are
            // unreadable), so the row is TERMINAL: mark `.exhausted`
            // (GC-eligible via purgeExhaustedOlderThan) rather than `.failed`,
            // which the flusher never picks up and the GC never reclaims, so it
            // would leak in the outbox + SyncPill across every session.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox
                        SET status = ?, lastError = ?, updatedAt = ?
                        WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Audio copy failed: \(copyError.localizedDescription)",
                            Date(),
                            effectiveOutboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark audio outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            // Best-effort clean any partially-copied tracks so they don't leak.
            for relativePath in relativePaths {
                FileManager.default.removeItemLogging(atPath: Self.absoluteAudioPath(forStored: relativePath), context: "enqueueAudio partial-copy cleanup")
            }
            // Terminal signal so a live ViewModel resolves the optimistic bubble.
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .sendMessage,
                clientMessageId: clientMessageId,
                conversationId: conversationId,
                lastError: "Audio copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueAudioError.audioCopyFailed(underlying: copyError)
        }

        // Phase C — best-effort cleanup of the original tmp files. A failure
        // here is benign: the files live in `tmp/` and the OS reclaims them
        // on its own schedule.
        for source in sourceAudioURLs {
            FileManager.default.removeItemLogging(at: source, context: "enqueueAudio tmp source cleanup")
        }

        // Mirror the new item into the in-memory queue so the hot retry
        // path picks it up on the next reconnect without re-reading the
        // outbox.
        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued \(sourceAudioURLs.count) audio track(s) for conversation \(conversationId, privacy: .public), message \(clientMessageId, privacy: .public)")
        await refreshPendingCount()
        mutationEnqueued.send(())

        return EnqueueAudiosResult(outboxId: effectiveOutboxId, localAudioPaths: relativePaths)
    }

    public struct EnqueueMediaResult: Sendable {
        public let outboxId: String
        public let localMediaPaths: [String]

        public init(outboxId: String, localMediaPaths: [String]) {
            self.outboxId = outboxId
            self.localMediaPaths = localMediaPaths
        }
    }

    public enum EnqueueMediaError: Error, Sendable {
        case poolNotConfigured
        case outboxWriteFailed(underlying: Error)
        case mediaCopyFailed(underlying: Error)
    }

    /// S7b — durable write-ahead for an OFFLINE visual-media (photo/video)
    /// message, the parity twin of `enqueueAudios`. Phase A inserts the
    /// `.pending` outbox row referencing relative `localMediaPaths`; Phase B
    /// copies each source file under `Documents/pending-media/` (preserving the
    /// extension so the dispatcher can derive the MIME). A copy failure is
    /// permanent (the source bytes are unreadable) so the row is flipped
    /// `.exhausted` + cleaned + a terminal signal emitted (cf. S6), rather than
    /// retried against a missing file. The dispatcher (ST3) replays
    /// `localMediaPaths` via TUS on flush; until that lands this method has no
    /// caller, so no row can mis-dispatch.
    @discardableResult
    public func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        copyAttachmentsFromClientMessageId: String? = nil,
        sticker: MessageSticker? = nil,
        deletesSourceFiles: Bool = true,
        createdAt: Date? = nil,
        protection: MessageProtectionIntent = .none, originalNames: [String?]? = nil
    ) async throws -> EnqueueMediaResult {
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }

        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: clientMessageId, index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        let outboxId = "ofq_\(UUID().uuidString)"
        // Un partage repris trois jours après sa création ne doit pas être
        // antidaté au jour de la reprise — le relais texte préserve déjà
        // l'horodatage d'origine (`SharePendingSendConsumer`).
        let now = createdAt ?? Date()

        let item = OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: conversationId,
            content: content ?? "",
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            attachmentIds: nil,
            attachmentKinds: kinds,
            localAudioPath: nil,
            localAudioPaths: nil,
            localMediaPaths: relativePaths, localMediaOriginalNames: originalNames,
            sticker: sticker,
            copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId,
            protectionFlags: protection.persistedFlags,
            ephemeralDuration: protection.ephemeralDurationSeconds,
            createdAt: now
        )

        let payload: Data
        do {
            payload = try encoder.encode(item)
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase A — UPSERT outbox row first (write-ahead). If this throws, the
        // source files are still untouched and the caller can retry. Un
        // ré-enfilage sur le même `clientMessageId` réutilise la row `.pending`
        // existante au lieu d'en créer une jumelle (cf. `upsertPendingSendRow`).
        let effectiveOutboxId: String
        do {
            effectiveOutboxId = try await pool.write { db in
                try Self.upsertPendingSendRow(
                    db,
                    preferredId: outboxId,
                    conversationId: conversationId,
                    clientMessageId: clientMessageId,
                    payload: payload,
                    createdAt: now
                )
            }
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each media file into the per-message pending subdir.
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            // S6 — a copy failure is permanent; mark the row terminal so it
            // doesn't leak, clean partial copies, and emit the terminal signal.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox SET status = ?, lastError = ?, updatedAt = ? WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Media copy failed: \(copyError.localizedDescription)",
                            Date(),
                            effectiveOutboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark media outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            for relativePath in relativePaths {
                FileManager.default.removeItemLogging(atPath: Self.absoluteMediaPath(forStored: relativePath), context: "enqueueMedia partial-copy cleanup")
            }
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .sendMessage,
                clientMessageId: clientMessageId,
                conversationId: conversationId,
                lastError: "Media copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueMediaError.mediaCopyFailed(underlying: copyError)
        }

        // Phase C — nettoyage des sources temporaires. DÉSACTIVÉ quand les
        // octets sont PARTAGÉS entre plusieurs cibles : les supprimer après la
        // première laisserait les suivantes sans rien à téléverser. Le dernier
        // consommateur les rend lui-même.
        if deletesSourceFiles {
            for source in sourceMediaURLs {
                FileManager.default.removeItemLogging(at: source, context: "enqueueMedia tmp source cleanup")
            }
        }

        if items.count >= Self.maxQueueSize {
            items.removeFirst()
        }
        items.append(item)
        logger.info("Enqueued \(sourceMediaURLs.count) media file(s) for conversation \(conversationId, privacy: .public), message \(clientMessageId, privacy: .public)")
        await refreshPendingCount()
        mutationEnqueued.send(())

        return EnqueueMediaResult(outboxId: effectiveOutboxId, localMediaPaths: relativePaths)
    }

    /// Phase B of a write-ahead media enqueue: copies each source file to its
    /// pending-media destination (overwriting a stale file at the same key).
    /// Shared by `enqueueMedia` (messages) and `enqueuePostMedia` (posts). Throws
    /// on the first copy failure — the caller flips the row terminal (S6).
    static func copyPendingMediaFiles(sources: [URL], to relativePaths: [String]) throws {
        for (source, relativePath) in zip(sources, relativePaths) {
            let absolutePath = absoluteMediaPath(forStored: relativePath)
            let dst = URL(fileURLWithPath: absolutePath)
            if FileManager.default.fileExists(atPath: absolutePath) {
                try FileManager.default.removeItem(at: dst)
            }
            try FileManager.default.copyItem(at: source, to: dst)
        }
    }

    /// U1b — durable write-ahead for an OFFLINE media POST, the parity twin of
    /// `enqueueMedia` (messages). Computes the pending paths, inserts the
    /// `.createPost` row referencing them via the generic enqueue (write-ahead),
    /// then copies each source under `Documents/pending-media/<cmid>/` (extension
    /// preserved, ce qui reste le REPLI du dispatcher pour dériver le MIME —
    /// mais le MIME DÉCLARÉ, quand l'appelant en a un, voyage désormais dans la
    /// charge : une extension inconnue de la table retombait sur
    /// `application/octet-stream` et faisait perdre au gateway la nature audio
    /// du fichier). A copy failure is permanent → the row is flipped
    /// `.exhausted` + cleaned + a terminal signal emitted (S6), rather than
    /// retried against a missing file. The dispatcher (U1b ST1) replays
    /// `localMediaPaths` via TUS on flush.
    @discardableResult
    public func enqueuePostMedia(
        sourceMediaURLs: [URL],
        /// SANS défaut, délibérément — voir la REQUIREMENT du protocole. Un
        /// site qui n'a aucun MIME sous la main passe `nil` en toutes lettres.
        sourceMediaMimeTypes: [String]?,
        clientMutationId cmid: String,
        content: String?,
        visibility: String,
        /// Destinataires nommés d'une audience EXCEPT/ONLY. Le payload
        /// persisté les portait déjà (`CreatePostPayload.visibilityUserIds`,
        /// relu au flush) — rien ne les y METTAIT : un post hors-ligne à
        /// audience nommée partait donc sans sa liste, et le gateway le
        /// refusait (`CreatePostSchema`).
        ///
        /// Défaut `nil` : une audience nommée est l'EXCEPTION. Sans lui, ce
        /// paramètre — glissé avant des paramètres à valeur par défaut —
        /// casserait tout appelant existant, ce que le build de l'app n'a pas
        /// vu (les appelants vivent dans les tests du PACKAGE, compilés à part).
        visibilityUserIds: [String]? = nil,
        originalLanguage: String? = nil,
        type: String? = nil,
        location: SharedPlace? = nil,
        mentions: [PostMentionInput]? = nil,
        discoverabilityPrecision: DiscoverabilityPrecision? = nil,
        /// SANS défaut, délibérément — voir la REQUIREMENT du protocole. Tout
        /// appelant DÉCLARE s'il a une transcription embarquée ou non ; un
        /// média visuel passe `nil` en toutes lettres.
        mobileTranscription: MobileTranscriptionPayload?,
        /// **Le canvas** (#4756). SANS défaut, pour la même raison que
        /// `mobileTranscription` juste au-dessus : un appelant qui n'a pas de
        /// scène écrit `nil` en toutes lettres. Un défaut ferait disparaître le
        /// canvas d'un site d'appel sans casser la moindre compilation — le
        /// mode de panne exact que ce champ vient de payer une fois.
        storyEffects: StoryEffects?,
        /// Les légendes par fichier, alignées par INDEX sur `sourceMediaURLs`
        /// (#4756) — l'index est la seule identité qui survive à la
        /// relocalisation des fichiers.
        mediaCaptions: [String?]?,
        /// Les alternatives textuelles, sur le même index et pour la même
        /// raison : c'est la seule identité qui survive à la relocalisation.
        mediaAlts: [String?]?,
        /// L'identifiant d'objet de canvas de chaque fichier — le chaînon de
        /// l'adoption (#5280).
        mediaObjectIds: [String?]?,
        /// L'autorisation d'extraction du son (#3996). SANS défaut, même
        /// discipline que `mobileTranscription`/`storyEffects` juste
        /// au-dessus : chaque appelant DÉCLARE `nil` ou sa vraie valeur.
        allowSoundExtraction: Bool?
    ) async throws -> EnqueueMediaResult {
        guard let pool = outboxPool else { throw EnqueueMediaError.poolNotConfigured }

        let relativePaths: [String] = try sourceMediaURLs.indices.map { index in
            try Self.pendingMediaRelativePath(
                for: cmid, index: index, ext: sourceMediaURLs[index].pathExtension)
        }
        let payload = CreatePostPayload(
            clientMutationId: cmid,
            content: content ?? "",
            attachmentIds: [],
            visibility: visibility,
            originalLanguage: originalLanguage,
            localMediaPaths: relativePaths,
            type: type,
            visibilityUserIds: visibilityUserIds,
            location: location,
            mentions: mentions,
            discoverabilityPrecision: discoverabilityPrecision,
            mobileTranscription: mobileTranscription,
            localMediaMimeTypes: sourceMediaMimeTypes,
            storyEffects: storyEffects,
            mediaCaptions: mediaCaptions,
            mediaAlts: mediaAlts,
            mediaObjectIds: mediaObjectIds,
            allowSoundExtraction: allowSoundExtraction
        )

        // Phase A — write-ahead INSERT of the `.createPost` row (referencing the
        // not-yet-copied paths) via the generic enqueue, so a crash mid-copy
        // leaves a recoverable row (the dispatcher skips missing files).
        let outboxId: String
        do {
            _ = try await enqueue(.createPost, payload: payload, conversationId: nil)
            outboxId = "ofqm_\(cmid)"
        } catch {
            throw EnqueueMediaError.outboxWriteFailed(underlying: error)
        }

        // Phase B — copy each source into the per-cmid pending subdir.
        do {
            try Self.copyPendingMediaFiles(sources: sourceMediaURLs, to: relativePaths)
        } catch {
            // S6 — a copy failure is permanent; flip the row terminal so it
            // doesn't leak, clean partial copies, and emit the terminal signal.
            let copyError = error
            do {
                try await pool.write { db in
                    try db.execute(sql: """
                        UPDATE outbox SET status = ?, lastError = ?, updatedAt = ? WHERE id = ?
                        """, arguments: [
                            OutboxStatus.exhausted.rawValue,
                            "Post media copy failed: \(copyError.localizedDescription)",
                            Date(),
                            outboxId
                        ])
                }
            } catch {
                logger.error("Failed to mark post-media outbox row .exhausted after copy error: \(error.localizedDescription, privacy: .public)")
            }
            for relativePath in relativePaths {
                FileManager.default.removeItemLogging(atPath: Self.absoluteMediaPath(forStored: relativePath), context: "enqueuePostMedia partial-copy cleanup")
            }
            emitRetryExhausted(OfflineRetryExhausted(
                kind: .createPost,
                clientMessageId: cmid,
                conversationId: "",
                lastError: "Post media copy failed: \(copyError.localizedDescription)"
            ))
            throw EnqueueMediaError.mediaCopyFailed(underlying: copyError)
        }

        // Phase C — best-effort cleanup of the original tmp sources.
        for source in sourceMediaURLs {
            FileManager.default.removeItemLogging(at: source, context: "enqueueMedia tmp source cleanup")
        }

        logger.info("Enqueued \(sourceMediaURLs.count) media file(s) for offline post, cmid \(cmid, privacy: .public)")
        return EnqueueMediaResult(outboxId: outboxId, localMediaPaths: relativePaths)
    }

    // MARK: - Audio File Helpers

    /// Returns the absolute on-disk path for a pending audio file given the
    /// stored relative path persisted in `OfflineQueueItem.localAudioPath`.
    /// Stored paths are relative to `Documents/` so they survive container
    /// directory churn between OS upgrades.
    public static func absoluteAudioPath(forStored relativePath: String) -> String {
        if relativePath.hasPrefix("/") { return relativePath }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return documents.appendingPathComponent(relativePath).path
    }

    /// Builds the canonical relative path under `Documents/pending-audio/`
    /// for a given `clientMessageId`. Creates the parent directory if needed.
    public static func pendingAudioRelativePath(for clientMessageId: String) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents.appendingPathComponent(pendingAudioDirectoryName, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return "\(pendingAudioDirectoryName)/\(clientMessageId).m4a"
    }

    /// Builds the canonical relative path under
    /// `Documents/pending-audio/<clientMessageId>/<index>.m4a` for a single
    /// track of a multi-track audio message. Creates the per-message
    /// subdirectory if needed so the subsequent `copyItem` finds a destination
    /// directory. Resolves to the right absolute file via
    /// `absoluteAudioPath(forStored:)` (which simply prepends `Documents/`).
    public static func pendingAudioRelativePath(for clientMessageId: String, index: Int) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents
            .appendingPathComponent(pendingAudioDirectoryName, isDirectory: true)
            .appendingPathComponent(clientMessageId, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return "\(pendingAudioDirectoryName)/\(clientMessageId)/\(index).m4a"
    }

    // MARK: - S7b — pending visual-media paths

    public static let pendingMediaDirectoryName = "pending-media"

    /// Resolve a stored media relative path (under `Documents/`) to absolute —
    /// same Documents-relative resolution as audio.
    public static func absoluteMediaPath(forStored relativePath: String) -> String {
        absoluteAudioPath(forStored: relativePath)
    }

    /// Absolute on-disk paths of every pending media/audio file a send item
    /// references. Used to reclaim them when the send is cancelled/superseded
    /// (delete-before-flush) so they don't orphan under `Documents/pending-*/`.
    static func pendingLocalFileAbsolutePaths(for item: OfflineQueueItem) -> [String] {
        var paths = (item.localMediaPaths ?? []).map { absoluteMediaPath(forStored: $0) }
        paths += (item.localAudioPaths ?? []).map { absoluteAudioPath(forStored: $0) }
        if let single = item.localAudioPath, !single.isEmpty {
            paths.append(absoluteAudioPath(forStored: single))
        }
        return paths
    }

    /// Canonical relative path under
    /// `Documents/pending-media/<clientMessageId>/<index>.<ext>` for one track of
    /// an offline visual-media message. The original extension is PRESERVED so
    /// the dispatcher can derive the upload MIME per file. Creates the
    /// per-message subdir so the subsequent `copyItem` finds a destination.
    public static func pendingMediaRelativePath(for clientMessageId: String, index: Int, ext: String) throws -> String {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = documents
            .appendingPathComponent(pendingMediaDirectoryName, isDirectory: true)
            .appendingPathComponent(clientMessageId, isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        let safeExt = ext.isEmpty ? "bin" : ext.lowercased()
        return "\(pendingMediaDirectoryName)/\(clientMessageId)/\(index).\(safeExt)"
    }
}
