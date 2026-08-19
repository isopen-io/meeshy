import Foundation

/// The live-captions button's 3-state cycle: off → translated → original → off.
/// Derived from two flags that already exist on `CallView` (`transcriptionService
/// .isShowingOverlay`, the local user's own captions panel, and `showOriginalText`,
/// a local display-only flag) rather than adding a third source of truth — see
/// `docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md` §1.
///
/// Le pilote est le PANNEAU, pas `isTranscribing` : depuis que ce device
/// capture aussi pour servir un pair qui écoute (`TranscriptionCapturePolicy`),
/// `isTranscribing` peut être vrai sans que l'utilisateur local ait demandé
/// quoi que ce soit — le bouton s'allumerait tout seul.
enum CaptionsMode: Equatable, Sendable {
    case off
    case translated
    case original

    /// `isShowingCaptions` takes priority: a stale `showOriginalText` left over from a
    /// previous activation must never surface `.original` while captions are off.
    init(isShowingCaptions: Bool, showOriginalText: Bool) {
        guard isShowingCaptions else {
            self = .off
            return
        }
        self = showOriginalText ? .original : .translated
    }

    /// The state one tap advances to. `.translated` is always the entry point when
    /// turning captions on — a user reactivating captions should never land straight
    /// on "original" without having asked for it this session.
    var next: CaptionsMode {
        switch self {
        case .off: return .translated
        case .translated: return .original
        case .original: return .off
        }
    }
}


// MARK: - Transcription capture policy

/// Ce que la couche d'appel doit faire de la capture locale, une fois
/// confrontés le panneau local et l'écoute des pairs.
nonisolated enum TranscriptionCaptureAction: Equatable, Sendable {
    case start
    case stop
    case none
}

/// **Qui fait transcrire ce device.** Un device ne transcrit que son PROPRE
/// micro (jamais l'audio distant) : pour que chacun lise l'autre, il faut
/// donc que chacun capture. Tant que la capture n'était liée qu'au panneau
/// local, activer les sous-titres ne rendait l'utilisateur qu'ÉMETTEUR — le
/// pair recevait tout, lui ne recevait rien tant que le pair n'activait pas
/// de son côté (spec 2026-07-10 « toggle manuel, jamais automatique »).
///
/// La règle est maintenant : **ce device capture dès que quelqu'un écoute**,
/// que ce soit son propre panneau ou celui d'un pair (signalé par
/// `call:transcription-active`). L'utilisateur reste maître de ce qu'il
/// VOIT — la réception est toujours filtrée par son propre panneau ; c'est
/// seulement ce qu'il ÉMET qui suit l'écoute réelle de l'appel, et l'icône
/// sous-titres porte l'indicateur du pair actif pour que ce ne soit jamais
/// silencieux.
nonisolated enum TranscriptionCapturePolicy {
    /// `nonisolated` OBLIGATOIRE : sous `SWIFT_DEFAULT_ACTOR_ISOLATION =
    /// MainActor` (project.yml), un enum nu devient `@MainActor` et cette loi
    /// pure cesse d'être appelable depuis un contexte non isolé — y compris
    /// son propre test.
    static func action(
        localPanelOpen: Bool,
        peerCaptionsActive: Bool,
        isCapturing: Bool
    ) -> TranscriptionCaptureAction {
        let someoneIsListening = localPanelOpen || peerCaptionsActive
        if someoneIsListening && !isCapturing { return .start }
        if !someoneIsListening && isCapturing { return .stop }
        return .none
    }
}
