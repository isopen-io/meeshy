import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// MARK: - Reel Audio Language Resolver (Prisme, pure)

/// Prisme Linguistique — pure resolution of the TTS language to auto-select for
/// an audio reel, mirroring `FeedPost.resolved(preferredLanguages:)`: walks the
/// user's preferred languages IN PRIORITY order and stops at the first rank
/// that is served — either because the audio's ORIGINAL language occupies
/// that rank (nothing to translate, returns `nil`), or because a translated
/// audio is available for it (returns that language). The original language
/// competes for ITS rank in the chain; it is never tested as a short-circuit
/// ahead of the loop (Prisme rule 3, 2026-08-10) — with preferred languages
/// `["en", "fr"]`, original `fr`, and an `en` translated audio available, the
/// `en` translation wins because it occupies rank 1. Returns `nil` when
/// nothing should be auto-selected (the original stays authoritative; the
/// user can still pick a language via a flag).
///
/// Extracted as a pure function (mirrors `ReelMediaAutostart`) so the
/// rank-based resolution is unit-testable without instantiating the view.
/// Fixes the bug where `autoSelectPreferredAudioLanguage` iterated the TTS
/// payload order first — a French audio for a French-preferring user was
/// auto-switched to whichever TTS translation the payload listed first
/// (e.g. English), because the original-language short-circuit didn't exist
/// and the preferred-language priority order was never honored.
///
/// **Ce type n'est plus une loi — c'est une PROJECTION** (#4926). Son corps
/// réécrivait mot pour mot le parcours de rang d'`AudioTrackLanguageResolver` :
/// même règle, même exactitude, deux implémentations. Deux lois JUSTES qui
/// disent la même chose ne rougissent nulle part le jour où l'une évolue, et le
/// § Prisme du `CLAUDE.md` racine nomme ce motif comme la cause de trois
/// familles de résolveurs divergentes en trois cycles.
///
/// Il reste, parce que son NOM dit ce que le réel demande et que ses témoins
/// gardent le comportement depuis la surface qui l'emploie. Il ne calcule plus.
enum ReelAudioLanguageResolver {
    nonisolated static func preferredAudioLanguage(
        original: String?,
        preferredLanguages: [String],
        availableLanguages: [String]
    ) -> String? {
        AudioTrackLanguageResolver.resolve(
            originalLanguage: original ?? "",
            preferredLanguages: preferredLanguages,
            availableLanguages: availableLanguages
        )
    }
}
