import Foundation
import MeeshySDK

/// #16665 — un fait de capture vu par cet appareil : un pair (ou moi) capture
/// ou enregistre l'écran, ou l'enregistrement consenti de l'appel commence ou
/// s'arrête (`docs/product/appels-vue-finale.md` loi 13).
struct CallCaptureSignal: Equatable, Sendable {
    let userId: String
    let displayName: String
    let kind: CallTranscriptCaptureKind
    /// Faux seulement pour la FIN d'un enregistrement d'écran.
    let isActive: Bool
    let isLocal: Bool
    let at: Date
}

/// La capsule rouge R1 : qui capture l'écran de l'appel en ce moment.
struct CallCaptureAlert: Equatable, Sendable {
    let id: String
    let userId: String
    let displayName: String
    /// Une capture ponctuelle passe ; un enregistrement reste tant qu'il dure.
    let isTransient: Bool
}

/// Les captures de l'appel en cours : les lignes datées du journal et la
/// capsule à montrer. Un même début (même personne, même sorte) ne s'écrit
/// qu'une fois par fenêtre de 5 s, comme la passerelle le garde. Ma propre
/// capture entre au journal, jamais dans la capsule.
struct CallCaptureLedger: Equatable, Sendable {
    static let dedupeWindow: TimeInterval = 5

    let marks: [CallTranscriptCapture]
    let recorders: [CallCaptureAlert]
    let flash: CallCaptureAlert?

    init(marks: [CallTranscriptCapture] = [], recorders: [CallCaptureAlert] = [], flash: CallCaptureAlert? = nil) {
        self.marks = marks
        self.recorders = recorders
        self.flash = flash
    }

    var alert: CallCaptureAlert? { flash ?? recorders.last }

    func applying(_ signal: CallCaptureSignal, id: String) -> CallCaptureLedger {
        guard signal.isActive else {
            return CallCaptureLedger(marks: marks, recorders: recorders.filter { $0.userId != signal.userId }, flash: flash)
        }
        guard !isDuplicate(signal) else { return self }
        let mark = CallTranscriptCapture(id: id, userId: signal.userId, displayName: signal.displayName, kind: signal.kind, capturedAt: signal.at)
        let alert = CallCaptureAlert(id: id, userId: signal.userId, displayName: signal.displayName, isTransient: signal.kind == .screenshot)
        let showsAlert = !signal.isLocal && signal.kind.namesCapturer
        return CallCaptureLedger(
            marks: marks + [mark],
            recorders: showsAlert && signal.kind == .recording
                ? recorders.filter { $0.userId != signal.userId } + [alert]
                : recorders,
            flash: showsAlert && signal.kind == .screenshot ? alert : flash
        )
    }

    func dismissingFlash(_ id: String) -> CallCaptureLedger {
        guard flash?.id == id else { return self }
        return CallCaptureLedger(marks: marks, recorders: recorders, flash: nil)
    }

    private func isDuplicate(_ signal: CallCaptureSignal) -> Bool {
        marks.contains {
            $0.userId == signal.userId && $0.kind == signal.kind
                && abs(signal.at.timeIntervalSince($0.capturedAt)) < Self.dedupeWindow
        }
    }
}

/// Le fil (`GET /calls/:callId/transcript`) vers le domaine : une sorte
/// inconnue de ce client se laisse de côté, ma propre ligne porte mon nom.
enum CallTranscriptCaptureMapping {
    static func captures(_ remote: [APICallTranscriptCapture], localUserId: String, localName: String) -> [CallTranscriptCapture] {
        remote.compactMap { wire in
            guard let kind = CallTranscriptCaptureKind(rawValue: wire.kind) else { return nil }
            let userId = wire.userId ?? wire.participantId
            return CallTranscriptCapture(
                id: wire.id,
                userId: userId,
                displayName: userId == localUserId ? localName : (wire.displayName ?? ""),
                kind: kind,
                capturedAt: wire.at
            )
        }
    }
}

/// Une ligne du journal : une phrase, ou une capture datée.
enum CallJournalItem<Speech> {
    case speech(Speech)
    case capture(CallTranscriptCapture)
}

extension CallJournalItem: Equatable where Speech: Equatable {}

extension CallJournalItem: Identifiable where Speech == CallTranscriptionSegment {
    var id: String {
        switch self {
        case .speech(let segment): return segment.id.uuidString
        case .capture(let capture): return capture.id
        }
    }
}

/// Le journal FIDÈLE (loi 7) : les captures s'insèrent à leur heure parmi les
/// phrases, pendant l'appel comme après. À heure égale, la phrase passe avant.
enum CallJournalTimeline {
    static func merged<Speech>(
        _ speech: [Speech],
        time: (Speech) -> Date,
        captures: [CallTranscriptCapture]
    ) -> [CallJournalItem<Speech>] {
        let ordered = captures.sorted { $0.capturedAt < $1.capturedAt }
        let woven = speech.reduce(into: (items: [CallJournalItem<Speech>](), rest: ordered[...])) { acc, line in
            let at = time(line)
            let due = acc.rest.prefix { $0.capturedAt < at }
            acc.items.append(contentsOf: due.map { CallJournalItem<Speech>.capture($0) })
            acc.rest = acc.rest.dropFirst(due.count)
            acc.items.append(.speech(line))
        }
        return woven.items + woven.rest.map { CallJournalItem<Speech>.capture($0) }
    }
}
