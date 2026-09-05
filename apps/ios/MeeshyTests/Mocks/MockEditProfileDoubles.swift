import Foundation
@testable import Meeshy
@testable import MeeshySDK

// MARK: - MockOfflineQueue

final class MockOfflineQueue: OfflineQueueing, @unchecked Sendable {
    struct EnqueueCall {
        let kind: OutboxKind
        let payload: any Codable & Sendable
        let conversationId: String?
    }

    var enqueueResult: Result<String, Error> = .success("mock-cmid")
    var enqueueCalls: [EnqueueCall] = []
    var lastPayload: (any Codable & Sendable)?
    /// Per-cmid continuation; tests yield `.applied` / `.exhausted` to simulate
    /// the OutboxFlusher outcome.
    var outcomeContinuations: [String: AsyncStream<OutboxOutcome>.Continuation] = [:]

    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String {
        enqueueCalls.append(EnqueueCall(kind: kind, payload: payload, conversationId: conversationId))
        lastPayload = payload
        return try enqueueResult.get()
    }

    /// Ce que l'écrivain a DEMANDÉ à la file avant d'enfiler, dans l'ordre.
    /// Observable pour que le témoin puisse vérifier le KIND et l'ANCRE de la
    /// question : interroger l'ancre globale ferait qu'une seule republication
    /// en attente bloquerait toutes les autres cartes.
    var hasUnsentRowCalls: [(kind: OutboxKind, anchor: String)] = []
    /// Réponse FORCÉE de la file, indépendante de ce que ce double a enregistré.
    /// C'est ainsi qu'un témoin met en scène une ligne gravée lors d'un
    /// lancement PRÉCÉDENT — le cas qu'aucun verrou porté par le processus ne
    /// peut retenir.
    var hasUnsentRowStub: Bool?

    /// Double FIDÈLE de `OfflineQueue.hasUnsentRow(kind:anchor:)` : rien ne
    /// draine ce double, donc toute ligne qu'il a enregistrée est encore en
    /// route. La réponse se lit dans `enqueueCalls`, jamais dans un compteur
    /// séparé qui pourrait diverger de ce qui a réellement été gravé.
    func hasUnsentRow(kind: OutboxKind, anchor: String) async -> Bool {
        hasUnsentRowCalls.append((kind: kind, anchor: anchor))
        if let hasUnsentRowStub { return hasUnsentRowStub }
        return enqueueCalls.contains { $0.kind == kind && $0.conversationId == anchor }
    }

    struct EnqueuePostMediaCall {
        let sourceMediaURLs: [URL]
        /// Le MIME DÉCLARÉ de chaque fichier — observable ici, sinon un vocal
        /// pourrait repartir annoncé `application/octet-stream` sans qu'aucun
        /// test ne puisse le voir.
        let sourceMediaMimeTypes: [String]?
        let clientMutationId: String
        let content: String?
        let visibility: String
        /// Destinataires nommés d'une audience EXCEPT/ONLY — observables ici,
        /// sinon un post hors-ligne pourrait les perdre sans qu'aucun test ne
        /// puisse le voir.
        let visibilityUserIds: [String]?
        let originalLanguage: String?
        let type: String?
        let location: SharedPlace?
        let mentions: [PostMentionInput]?
        let discoverabilityPrecision: DiscoverabilityPrecision?
        /// Ce qui QUALIFIE un enregistrement vocal — observable ici, sinon un
        /// vocal routé par la file durable pourrait perdre en silence la
        /// transcription faite sur l'appareil, et le serveur la referait.
        let mobileTranscription: MobileTranscriptionPayload?
        /// **LE CANVAS — observable ici, sinon rien ne peut le voir** (#4756).
        ///
        /// Un mock qui reçoit un paramètre et ne l'enregistre PAS ne teste pas
        /// ce paramètre : le témoin passe, et le champ peut disparaître du
        /// chemin sans que rien ne rougisse. C'est la raison écrite au-dessus
        /// pour le MIME déclaré, pour l'audience nommée et pour la
        /// transcription — trois champs qui ont déjà été perdus en silence.
        let storyEffects: StoryEffects?
        /// Les légendes par fichier (#4756) — observables ici, même raison que
        /// les quatre champs au-dessus : un mock qui reçoit sans enregistrer
        /// ne teste pas ce qu'il reçoit.
        let mediaCaptions: [String?]?
        let mediaAlts: [String?]?
        let mediaObjectIds: [String?]?
    }

    var enqueuePostMediaCalls: [EnqueuePostMediaCall] = []
    /// When set, `enqueuePostMedia` throws this instead of recording a success —
    /// drives the synchronous rollback path in tests.
    var enqueuePostMediaError: Error?

    @discardableResult
    func enqueuePostMedia(
        sourceMediaURLs: [URL],
        sourceMediaMimeTypes: [String]?,
        clientMutationId: String,
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        type: String?,
        location: SharedPlace?,
        mentions: [PostMentionInput]?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        mobileTranscription: MobileTranscriptionPayload?,
        storyEffects: StoryEffects?,
        mediaCaptions: [String?]?,
        mediaAlts: [String?]?,
        mediaObjectIds: [String?]?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        enqueuePostMediaCalls.append(EnqueuePostMediaCall(
            sourceMediaURLs: sourceMediaURLs,
            sourceMediaMimeTypes: sourceMediaMimeTypes,
            clientMutationId: clientMutationId,
            content: content,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: originalLanguage,
            type: type,
            location: location,
            mentions: mentions,
            discoverabilityPrecision: discoverabilityPrecision,
            mobileTranscription: mobileTranscription,
            storyEffects: storyEffects,
            mediaCaptions: mediaCaptions,
            mediaAlts: mediaAlts,
            mediaObjectIds: mediaObjectIds
        ))
        if let enqueuePostMediaError { throw enqueuePostMediaError }
        return OfflineQueue.EnqueueMediaResult(
            outboxId: "ofqm_\(clientMutationId)",
            localMediaPaths: sourceMediaURLs.map { $0.lastPathComponent }
        )
    }

    /// Stubbed recovery result; tests set this to simulate a stuck offline item.
    var recoverLastUnsentPostResult: RecoveredOfflinePost?
    var recoverLastUnsentPostCalls: [(types: Set<String>, olderThan: TimeInterval)] = []
    var cancelCreatePostCalls: [String] = []

    func recoverLastUnsentPost(
        matchingTypes: Set<String>,
        olderThan: TimeInterval
    ) async -> RecoveredOfflinePost? {
        recoverLastUnsentPostCalls.append((matchingTypes, olderThan))
        return recoverLastUnsentPostResult
    }

    func cancelCreatePost(clientMutationId: String) async {
        cancelCreatePostCalls.append(clientMutationId)
    }

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome> {
        AsyncStream<OutboxOutcome> { continuation in
            outcomeContinuations[cmid] = continuation
        }
    }

    /// Test helper — yields an outcome on the stream for `cmid` and finishes
    /// the stream (single-shot, matches production semantics).
    func emitOutcome(_ outcome: OutboxOutcome, for cmid: String) {
        outcomeContinuations[cmid]?.yield(outcome)
        outcomeContinuations[cmid]?.finish()
    }
}

// MARK: - MockProfileCache

final class MockProfileCacheWriter: ProfileCacheWriting, @unchecked Sendable {
    var saveProfileResult: Result<Void, Error> = .success(())
    var saveProfileCalls: [(user: MeeshyUser, userId: String)] = []

    func saveProfile(_ user: MeeshyUser, for userId: String) async throws {
        saveProfileCalls.append((user, userId))
        try saveProfileResult.get()
    }
}

// MARK: - MockFeedbackToast

@MainActor
final class MockFeedbackToast: FeedbackToastSurfacing {
    var successMessages: [String] = []
    var errorMessages: [String] = []
    /// Actions de tap capturées (renvoi vers les Réglages après un refus de
    /// permission) — les exécuter dans un test ouvrirait les Réglages, donc on
    /// se contente de vérifier leur présence.
    var errorTapActions: [() -> Void] = []

    func showSuccess(_ message: String) { successMessages.append(message) }
    func showError(_ message: String)   { errorMessages.append(message) }
    func showError(_ message: String, tapAction: @escaping () -> Void) {
        errorMessages.append(message)
        errorTapActions.append(tapAction)
    }
}

// MARK: - MockHaptic

@MainActor
final class MockHaptic: HapticSurfacing {
    var successCount = 0
    var errorCount = 0

    func success() { successCount += 1 }
    func error()   { errorCount += 1 }
}
