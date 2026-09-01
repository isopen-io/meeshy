import Foundation

/// VoiceOver label for one media inside a set: « Média 3 sur 7 ».
///
/// The single site that builds this string. It existed three times before 271i —
/// twice built inline from the `gallery.position` entry (the filmstrip and the
/// fullscreen gallery), and once in the feed under a SECOND key whose fourteen
/// call sites each carried their own English default, one per tile position:
/// *Media 1 of …* through *Media 5 of …*.
///
/// That second key could not be localized. One key resolves to ONE catalog entry,
/// so adding it to the catalog — the remediation the untranslated-key ratchet
/// itself prescribes — would have served the same label to all five tiles and told
/// a VoiceOver user that every image was media 1. The key was a trap, and the way
/// out was not to translate it: the app already owned the string.
/// `gallery.position` ships in all seven locales and has since it was written.
enum MediaPositionLabel {

    /// - Parameters:
    ///   - position: 1-based rank of the media in the set.
    ///   - count: total number of media in the set.
    static func text(position: Int, of count: Int) -> String {
        String(
            format: String(localized: "gallery.position", defaultValue: "Média %1$d sur %2$d", bundle: .main),
            position,
            count
        )
    }
}
