import Foundation

/// The live-captions button's 3-state cycle: off → translated → original → off.
/// Derived from two flags that already exist on `CallView` (`transcriptionService
/// .isTranscribing`, the service's authoritative on/off state, and `showOriginalText`,
/// a local display-only flag) rather than adding a third source of truth — see
/// `docs/superpowers/specs/2026-07-11-call-control-buttons-harmonization-design.md` §1.
enum CaptionsMode: Equatable, Sendable {
    case off
    case translated
    case original

    /// `isTranscribing` takes priority: a stale `showOriginalText` left over from a
    /// previous activation must never surface `.original` while captions are off.
    init(isTranscribing: Bool, showOriginalText: Bool) {
        guard isTranscribing else {
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
