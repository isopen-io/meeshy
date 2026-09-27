import Combine
import Foundation
import MeeshySDK
import os

// #8064 — l'enregistrement d'un appel, côté app : demander, consentir,
// montrer à TOUS qu'on enregistre, capter chez le demandeur, puis déposer le
// fichier et le rattacher à la bulle de l'appel.
//
// La passerelle est l'autorité. Ce contrôleur ne démarre JAMAIS la capture
// sur sa propre décision : seule la diffusion `call:recording-started` qui
// nomme ce lecteur comme enregistreur l'allume, et toute diffusion d'arrêt
// (refus, délai, arrivée d'un participant, fin d'appel) l'éteint. Une
// diffusion d'un AUTRE appel est ignorée. Miroir du contrôleur web
// (`apps/web/src/lib/calls/call-recording.ts`).

enum CallRecordingPhase: Equatable {
    case idle
    case asking(callId: String)
    case pending(callId: String, recordingId: String, requesterId: String, mine: Bool, mustAnswer: Bool)
    case recording(callId: String, recordingId: String, recorderId: String, mine: Bool)

    var recordingId: String? {
        switch self {
        case .idle, .asking: return nil
        case .pending(_, let recordingId, _, _, _): return recordingId
        case .recording(_, let recordingId, _, _): return recordingId
        }
    }

    var isActive: Bool { self != .idle }

    var isRecording: Bool {
        if case .recording = self { return true }
        return false
    }
}

enum CallRecordingNotice: Equatable {
    case stopped(reason: String, wasRecording: Bool)
    case unavailable(code: String)
    case saved
    case saveFailed
}

/// Dépose le fichier capté par le chemin des pièces jointes et rend son id.
protocol CallRecordingUploading: AnyObject {
    func upload(fileURL: URL) async throws -> String
}

final class CallRecordingTusUploader: CallRecordingUploading {
    func upload(fileURL: URL) async throws -> String {
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let credential = APIClient.shared.requestCredential else {
            throw URLError(.userAuthenticationRequired)
        }
        let result = try await TusUploadManager(baseURL: baseURL).uploadFile(
            fileURL: fileURL,
            mimeType: "audio/mp4",
            credential: credential
        )
        return result.id
    }
}

/// Ce que le contrôleur lit de l'appel en cours.
protocol CallRecordingHosting: AnyObject {
    var recordingCallId: String? { get }
}

final class CallRecordingController: ObservableObject {
    @Published private(set) var phase: CallRecordingPhase = .idle
    @Published private(set) var notice: CallRecordingNotice?

    weak var host: (any CallRecordingHosting)?

    private let socket: any CallRecordingSocketProviding
    private let recorder: any CallRecordingServiceProviding
    private let uploader: any CallRecordingUploading
    private let remote: any CallRecordingRemoteServiceProviding
    private let viewerId: () -> String?
    private let wait: (UInt64) async -> Void
    private let fileDirectory: URL
    private var activeCapture: (callId: String, recordingId: String)?
    private var subscription: AnyCancellable?
    private var changeForwarding: AnyCancellable?
    private(set) var pendingSave: Task<Void, Never>?
    private(set) var pendingStopEmission: Task<Void, Never>?
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-recording")

    static let linkAttempts = 3
    static let linkRetryDelayNs: UInt64 = 2_000_000_000

    nonisolated deinit {}

    init(
        socket: (any CallRecordingSocketProviding)? = nil,
        recorder: (any CallRecordingServiceProviding)? = nil,
        uploader: (any CallRecordingUploading)? = nil,
        remote: (any CallRecordingRemoteServiceProviding)? = nil,
        viewerId: (() -> String?)? = nil,
        wait: ((UInt64) async -> Void)? = nil,
        fileDirectory: URL? = nil,
        events: AnyPublisher<CallRecordingSocketEvent, Never>? = nil
    ) {
        let resolvedSocket = socket ?? MessageSocketManager.shared
        self.socket = resolvedSocket
        self.recorder = recorder ?? CallRecordingService()
        self.uploader = uploader ?? CallRecordingTusUploader()
        self.remote = remote ?? CallRecordingRemoteService.shared
        self.viewerId = viewerId ?? { AuthManager.shared.currentUser?.id }
        self.wait = wait ?? { try? await Task.sleep(nanoseconds: $0) }
        self.fileDirectory = fileDirectory ?? FileManager.default.temporaryDirectory
        subscription = (events ?? resolvedSocket.callRecordingEvents)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.receive(event) }
    }

    func forwardChanges(to publisher: ObservableObjectPublisher) {
        changeForwarding = objectWillChange.sink { [weak publisher] _ in publisher?.send() }
    }

    // MARK: - Diffusions de la passerelle

    func receive(_ event: CallRecordingSocketEvent) {
        guard let callId = host?.recordingCallId, event.callId == callId else { return }
        switch event {
        case .requested(let requested):
            let viewer = viewerId()
            let mine = requested.requesterId == viewer
            phase = .pending(
                callId: callId,
                recordingId: requested.recordingId,
                requesterId: requested.requesterId,
                mine: mine,
                mustAnswer: !mine && viewer.map { requested.requiredUserIds.contains($0) } == true
            )
        case .started(let started):
            let mine = started.recorderId == viewerId()
            phase = .recording(callId: callId, recordingId: started.recordingId, recorderId: started.recorderId, mine: mine)
            if mine { beginCapture(callId: callId, recordingId: started.recordingId) }
        case .stopped(let stopped):
            guard phase.recordingId == stopped.recordingId || activeCapture?.recordingId == stopped.recordingId else { return }
            finishCapture()
            phase = .idle
            notice = .stopped(reason: stopped.reason, wasRecording: stopped.wasRecording)
        }
    }

    // MARK: - Gestes

    @discardableResult
    func request() -> Task<Void, Never>? {
        guard phase == .idle, let callId = host?.recordingCallId else { return nil }
        phase = .asking(callId: callId)
        notice = nil
        return Task { [weak self] in
            guard let self else { return }
            do {
                let recordingId = try await socket.requestCallRecording(callId: callId)
                guard phase == .asking(callId: callId) else { return }
                phase = .pending(
                    callId: callId,
                    recordingId: recordingId,
                    requesterId: viewerId() ?? "",
                    mine: true,
                    mustAnswer: false
                )
            } catch {
                guard phase == .asking(callId: callId) else { return }
                phase = .idle
                notice = .unavailable(code: (error as? CallRecordingRefusal)?.code ?? "INTERNAL_ERROR")
            }
        }
    }

    @discardableResult
    func answer(accepted: Bool) -> Task<Void, Never>? {
        guard case .pending(let callId, let recordingId, let requesterId, let mine, true) = phase else { return nil }
        phase = .pending(callId: callId, recordingId: recordingId, requesterId: requesterId, mine: mine, mustAnswer: false)
        return Task { [weak self] in
            do {
                try await self?.socket.answerCallRecording(callId: callId, recordingId: recordingId, accepted: accepted)
            } catch {
                self?.logger.error("call recording answer refused: \(String(describing: error))")
            }
        }
    }

    @discardableResult
    func stop() -> Task<Void, Never>? {
        switch phase {
        case .idle:
            return nil
        case .asking:
            phase = .idle
            return nil
        case .pending(let callId, let recordingId, _, _, _), .recording(let callId, let recordingId, _, _):
            let wasRecording = phase.isRecording
            finishCapture()
            phase = .idle
            notice = .stopped(reason: "stopped", wasRecording: wasRecording)
            return Task { [weak self] in
                try? await self?.socket.stopCallRecording(callId: callId, recordingId: recordingId)
            }
        }
    }

    func dismissNotice() {
        notice = nil
    }

    func callEnded() {
        finishCapture()
        phase = .idle
    }

    // MARK: - Capture

    private func beginCapture(callId: String, recordingId: String) {
        guard activeCapture == nil else { return }
        let fileURL = fileDirectory.appendingPathComponent("appel-\(callId)-\(recordingId).m4a")
        do {
            try recorder.start(fileURL: fileURL)
            activeCapture = (callId, recordingId)
        } catch {
            logger.error("call recording capture failed: \(error.localizedDescription)")
            phase = .idle
            notice = .saveFailed
            pendingStopEmission = Task { [weak self] in
                try? await self?.socket.stopCallRecording(callId: callId, recordingId: recordingId)
            }
        }
    }

    private func finishCapture() {
        guard let capture = activeCapture else { return }
        activeCapture = nil
        guard let fileURL = recorder.stop() else { return }
        pendingSave = Task { [weak self] in
            await self?.save(fileURL: fileURL, callId: capture.callId, recordingId: capture.recordingId)
        }
    }

    private func save(fileURL: URL, callId: String, recordingId: String) async {
        defer { try? FileManager.default.removeItem(at: fileURL) }
        do {
            let attachmentId = try await uploader.upload(fileURL: fileURL)
            try await link(callId: callId, recordingId: recordingId, attachmentId: attachmentId, attempt: 1)
            notice = .saved
        } catch {
            logger.error("call recording save failed: \(String(describing: error))")
            notice = .saveFailed
        }
    }

    /// Le fichier peut arriver avant la bulle de l'appel (409
    /// `CALL_BUBBLE_MISSING`) : on réessaie ce cas-là seulement.
    private func link(callId: String, recordingId: String, attachmentId: String, attempt: Int) async throws {
        do {
            _ = try await remote.link(callId: callId, recordingId: recordingId, attachmentId: attachmentId)
        } catch APIError.serverError(409, _) where attempt < Self.linkAttempts {
            await wait(Self.linkRetryDelayNs)
            try await link(callId: callId, recordingId: recordingId, attachmentId: attachmentId, attempt: attempt + 1)
        }
    }
}
