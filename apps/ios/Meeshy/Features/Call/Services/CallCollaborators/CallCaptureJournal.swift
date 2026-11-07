import Foundation
import Combine
import MeeshySDK

/// #16665 — les captures de l'appel en cours, pour l'écran d'appel et pour le
/// journal gardé à la fin (`docs/product/appels-vue-finale.md` loi 13). Le
/// collaborateur ne décide rien : il tient le registre (`CallCaptureLedger`)
/// que le routeur de signalisation et l'observateur de l'application
/// alimentent. Il vit avec le journal des phrases (`CallTranscriptionService`),
/// qu'il suit à travers l'appel réduit, les sous-titres coupés et une
/// reconnexion, et qui le purge à la fin de l'appel.
@MainActor
final class CallCaptureJournal: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var ledger = CallCaptureLedger()

    private let makeId: () -> String

    init(makeId: @escaping () -> String = { UUID().uuidString }) {
        self.makeId = makeId
    }

    var marks: [CallTranscriptCapture] { ledger.marks }
    var alert: CallCaptureAlert? { ledger.alert }

    func record(_ signal: CallCaptureSignal) {
        ledger = ledger.applying(signal, id: makeId())
    }

    func dismissFlash(_ id: String) {
        ledger = ledger.dismissingFlash(id)
    }

    func reset() {
        ledger = CallCaptureLedger()
    }
}

extension CallCaptureSignal {
    /// La capture d'un pair, relayée par la passerelle (`call:screen-capture-alert`).
    static func remote(_ alert: CallScreenCaptureAlertData, displayName: String, at: Date) -> CallCaptureSignal {
        CallCaptureSignal(
            userId: alert.capturerId,
            displayName: displayName,
            kind: alert.captureKind == .screenshot ? .screenshot : .recording,
            isActive: alert.isCapturing,
            isLocal: false,
            at: at
        )
    }

    /// Ma propre capture, au moment où elle part sur le fil.
    static func local(userId: String, displayName: String, kind: CallScreenCaptureKind, isCapturing: Bool, at: Date) -> CallCaptureSignal {
        CallCaptureSignal(
            userId: userId,
            displayName: displayName,
            kind: kind == .screenshot ? .screenshot : .recording,
            isActive: isCapturing,
            isLocal: true,
            at: at
        )
    }

    /// Un pair parti (raccroché, coupure) n'enverra jamais la fin de son
    /// enregistrement d'écran : son départ l'éteint, sans ligne au journal.
    static func participantLeft(userId: String, at: Date) -> CallCaptureSignal {
        CallCaptureSignal(userId: userId, displayName: "", kind: .recording, isActive: false, isLocal: false, at: at)
    }

    /// Le début et la fin de l'enregistrement CONSENTI de l'appel. Une demande
    /// refusée ou échue n'a rien enregistré : elle n'entre pas au journal.
    static func callRecording(_ event: CallRecordingSocketEvent, at: Date) -> CallCaptureSignal? {
        switch event {
        case .requested:
            return nil
        case .started(let started):
            return CallCaptureSignal(userId: started.recorderId, displayName: "", kind: .callRecordingStarted, isActive: true, isLocal: false, at: at)
        case .stopped(let stopped):
            guard stopped.wasRecording else { return nil }
            return CallCaptureSignal(userId: stopped.byUserId ?? "", displayName: "", kind: .callRecordingStopped, isActive: true, isLocal: false, at: at)
        }
    }
}

/// Le nom de qui capture : le roster du groupe (source de confiance), puis
/// l'interlocuteur du duo. Vide quand rien ne le dit — l'écran écrit alors
/// « Un participant ».
enum CallCaptureNames {
    static func displayName(for userId: String, roster: GroupCallRoster, fallback: String?) -> String {
        if let member = roster.member(userId), !member.displayName.isEmpty {
            return member.displayName
        }
        return fallback ?? ""
    }
}
