import Foundation
import MeeshySDK
import os

// MARK: - Moteur

/// Le moteur de reconnaissance sur l'appareil, vu par le transcripteur de
/// vocal. `EdgeTranscriptionService` (SDK, Apple Speech) en est l'unique
/// implémentation ; le protocole n'existe que pour l'injecter en test — un
/// runner n'a ni fichier audio ni autorisation `Speech`.
@MainActor
protocol VoiceNoteTranscriptionEngineProviding: AnyObject {
    var isAuthorized: Bool { get }
    func transcribe(audioURL: URL, locale: Locale, timeout: TimeInterval) async throws -> OnDeviceTranscription
}

extension EdgeTranscriptionService: VoiceNoteTranscriptionEngineProviding {}

// MARK: - Service

/// Transcription d'un vocal de conversation SUR L'APPAREIL, dès l'arrêt de
/// l'enregistrement (#4948, D-AUDIO-01).
///
/// Meilleur effort, par construction :
/// - **jamais de demande d'autorisation** : si `Speech` n'est pas déjà
///   accordé, on rend `nil` sans prompt — le consentement vocal à l'envoi
///   (`ConversationView.shouldPromptVoiceConsent`) gouverne déjà ce que
///   l'utilisateur accepte, et une seconde boîte système au milieu d'un envoi
///   serait une friction que le produit n'a pas décidée ;
/// - **délai plafonné** (`timeout`) : le moteur borne lui-même la
///   reconnaissance, l'attente à l'envoi ne dure jamais plus ;
/// - **`nil` sur tout échec** : la bulle optimiste part telle quelle et le
///   serveur (Whisper) reste le repli — l'inverse d'avant, où le serveur était
///   l'unique voie et où un échec translator laissait le vocal muet à vie.
///
/// Le résultat est retenu par identifiant de pièce jointe, le temps que
/// l'envoi le pose sur la bulle (`messageTranscriptions[tempId]`, même slice
/// que l'insert) et le fasse voyager avec l'upload TUS (`transcription`).
@MainActor
protocol VoiceNoteLocalTranscribing: AnyObject {
    /// Lance la reconnaissance en tâche de fond ; rend immédiatement.
    /// Idempotent par `attachmentId`.
    func beginTranscription(attachmentId: String, audioURL: URL, durationMs: Int, languageCode: String)
    /// Résultat déjà connu, sans attendre — ce que le slice optimiste peut poser.
    func transcription(for attachmentId: String) -> MessageTranscription?
    /// Attend la fin de la reconnaissance (bornée par le délai du moteur).
    func awaitTranscription(for attachmentId: String) async -> MessageTranscription?
    /// Oublie une pièce (envoyée, ou retirée du tiroir).
    func discard(attachmentId: String)
}

extension VoiceNoteLocalTranscribing {
    /// Transcriptions déjà connues des pièces `attachmentIds`, dans l'ordre
    /// des pièces — la première est celle de la bulle (`messageTranscriptions`).
    func knownTranscriptions(for attachmentIds: [String]) -> [MessageTranscription] {
        attachmentIds.compactMap { transcription(for: $0) }
    }

    /// Même chose en attendant celles encore en cours.
    func awaitTranscriptions(for attachmentIds: [String]) async -> [MessageTranscription] {
        var collected: [MessageTranscription] = []
        for attachmentId in attachmentIds {
            if let transcription = await awaitTranscription(for: attachmentId) {
                collected.append(transcription)
            }
        }
        return collected
    }
}

@MainActor
final class VoiceNoteLocalTranscriber: VoiceNoteLocalTranscribing {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors tâche. Corps vide, donc rien d'isolé à toucher.
    nonisolated deinit {}

    static let shared = VoiceNoteLocalTranscriber()

    /// Un vocal de conversation dure rarement plus d'une minute ; Apple Speech
    /// le reconnaît en quelques secondes. Au-delà de ce plafond, l'envoi part
    /// sans transcription locale plutôt que d'attendre.
    static let defaultTimeout: TimeInterval = 8

    /// Résultats retenus au plus — un vocal enregistré puis retiré du tiroir
    /// n'a pas de site qui l'oublie ; la borne garantit qu'il ne reste pas en
    /// mémoire pour toujours.
    static let retainedResultsCap = 8

    private let engine: any VoiceNoteTranscriptionEngineProviding
    private let timeout: TimeInterval
    private var inFlight: [String: Task<MessageTranscription?, Never>] = [:]
    private var results: [String: MessageTranscription] = [:]
    private var retentionOrder: [String] = []

    init(
        engine: any VoiceNoteTranscriptionEngineProviding = EdgeTranscriptionService.shared,
        timeout: TimeInterval = VoiceNoteLocalTranscriber.defaultTimeout
    ) {
        self.engine = engine
        self.timeout = timeout
    }

    func beginTranscription(attachmentId: String, audioURL: URL, durationMs: Int, languageCode: String) {
        guard inFlight[attachmentId] == nil, results[attachmentId] == nil else { return }
        guard engine.isAuthorized else {
            Logger.voiceNoteTranscriber.info("Speech non autorisé — vocal \(attachmentId, privacy: .public) envoyé sans transcription locale")
            return
        }
        let locale = EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: languageCode))
        let engine = self.engine
        let timeout = self.timeout
        inFlight[attachmentId] = Task { [weak self] in
            let outcome = await Self.recognize(
                engine: engine, attachmentId: attachmentId, audioURL: audioURL,
                locale: locale, timeout: timeout, durationMs: durationMs, languageCode: languageCode
            )
            self?.complete(attachmentId: attachmentId, with: outcome)
            return outcome
        }
    }

    func transcription(for attachmentId: String) -> MessageTranscription? {
        results[attachmentId]
    }

    func awaitTranscription(for attachmentId: String) async -> MessageTranscription? {
        if let known = results[attachmentId] { return known }
        guard let task = inFlight[attachmentId] else { return nil }
        return await task.value
    }

    func discard(attachmentId: String) {
        inFlight[attachmentId]?.cancel()
        inFlight[attachmentId] = nil
        results[attachmentId] = nil
        retentionOrder.removeAll { $0 == attachmentId }
    }

    // MARK: - Privé

    private static func recognize(
        engine: any VoiceNoteTranscriptionEngineProviding,
        attachmentId: String, audioURL: URL, locale: Locale, timeout: TimeInterval,
        durationMs: Int, languageCode: String
    ) async -> MessageTranscription? {
        do {
            let result = try await engine.transcribe(audioURL: audioURL, locale: locale, timeout: timeout)
            guard !Task.isCancelled else { return nil }
            return messageTranscription(from: result, attachmentId: attachmentId, durationMs: durationMs, languageCode: languageCode)
        } catch {
            Logger.voiceNoteTranscriber.info("Transcription locale absente pour \(attachmentId, privacy: .public) : \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func complete(attachmentId: String, with outcome: MessageTranscription?) {
        guard inFlight[attachmentId] != nil else { return }
        inFlight[attachmentId] = nil
        guard let outcome else { return }
        results[attachmentId] = outcome
        retentionOrder.append(attachmentId)
        while retentionOrder.count > Self.retainedResultsCap {
            results[retentionOrder.removeFirst()] = nil
        }
    }

    /// Le modèle de bulle, depuis le résultat du moteur. La langue posée est
    /// celle du composer (code court, ex. `fr`) — le moteur rend un identifiant
    /// de locale (`fr-FR`) que ni le Prisme ni le serveur ne parlent — et un
    /// texte vide n'est pas une transcription.
    nonisolated static func messageTranscription(
        from result: OnDeviceTranscription, attachmentId: String, durationMs: Int, languageCode: String
    ) -> MessageTranscription? {
        let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let segments = result.segments.map {
            MessageTranscriptionSegment(text: $0.text, startTime: $0.timestamp, endTime: $0.timestamp + $0.duration, speakerId: nil)
        }
        return MessageTranscription(
            attachmentId: attachmentId, text: text, language: languageCode,
            confidence: result.confidence, durationMs: durationMs, segments: segments, speakerCount: nil
        )
    }
}

// MARK: - Projections

extension MessageTranscription {
    /// Même transcription sous l'identifiant SERVEUR de la pièce : après
    /// l'upload, la bulle réconciliée lit `messageTranscriptionsByAttachment`
    /// sous cet id-là, pas sous l'id local du tiroir.
    nonisolated func rekeyed(attachmentId: String) -> MessageTranscription {
        MessageTranscription(
            attachmentId: attachmentId, text: text, language: language, confidence: confidence,
            durationMs: durationMs, segments: segments, speakerCount: speakerCount
        )
    }

    /// Ce qui part dans `Upload-Metadata` (clé `transcription`) — la forme que
    /// `tus-handler.ts` valide et que le translator lit en passthrough
    /// (`startMs`/`endMs`). Un segment sans horodatage ne dit rien au karaoké :
    /// il n'est pas transporté.
    nonisolated var tusUploadMetadata: TusUploadTranscriptionMetadata {
        let timed = segments.compactMap { segment -> TusUploadTranscriptionMetadata.Segment? in
            guard let start = segment.startTime, let end = segment.endTime else { return nil }
            return .init(text: segment.text, startMs: Int((start * 1000).rounded()), endMs: Int((end * 1000).rounded()))
        }
        return TusUploadTranscriptionMetadata(
            text: text, language: language, confidence: confidence, durationMs: durationMs,
            segments: timed.isEmpty ? nil : timed
        )
    }
}

private extension Logger {
    nonisolated static let voiceNoteTranscriber = Logger(subsystem: "me.meeshy.app", category: "voice-note-transcriber")
}
