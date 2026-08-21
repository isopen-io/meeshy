import XCTest
@testable import Meeshy

/// Gardes de `BackgroundSoundBadge` (Lot E, Task E1 — « l'annonce du fond :
/// un résolveur, trois surfaces »). B3.3-5 :
///
/// - B3.5 (existence) : `.none` ⇒ rien — pas de placeholder.
/// - B3.4 (provenance) : `.original` ⇒ note PUIS onde, SI ET SEULEMENT SI
///   la piste est ORIGINALE ; `.credit` ⇒ marquee crédit, JAMAIS la
///   note+onde (mentirait sur la provenance), même à métadonnées `nil`
///   (cache froid ⇒ « ♫ — » générique).
///
/// La vue n'est pas instanciable proprement en test (même limite que
/// `StoryHeaderMetaGuardTests`/`StoryTrayWiringGuardTests` : pas de
/// ViewInspector dans ce dépôt) — les trois premières gardes lisent donc la
/// SOURCE, bornées par les `case` du switch plutôt que par une fenêtre de
/// caractères fixe (`MyStoriesSourceCorpus`, déjà comment-strippée). Le
/// texte du crédit, lui, est une fonction PURE (`creditText`) — testée
/// directement, sans détour par la vue.
final class BackgroundSoundBadgeTests: XCTestCase {

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Components/BackgroundSoundBadge.swift")
    }

    /// Le bloc de code entre deux marqueurs (le second exclu). `end == nil`
    /// borne jusqu'à la fin du fichier — sûr ici : `.credit` est le DERNIER
    /// cas du switch, rien après lui ne mentionne `StoryHeaderAudioWaveform`.
    private func block(from start: String, to end: String?, in text: String) -> String {
        guard let startRange = text.range(of: start) else { return "" }
        let tail = text[startRange.upperBound...]
        guard let end, let endRange = tail.range(of: end) else { return String(tail) }
        return String(tail[..<endRange.lowerBound])
    }

    // MARK: - B3.5 existence : .none ⇒ EmptyView, jamais de placeholder

    func test_noneCase_rendersEmptyView() throws {
        let text = try source()
        let noneBlock = block(from: "case .none:", to: "case .original:", in: text)
        XCTAssertFalse(noneBlock.isEmpty, "case .none: introuvable dans BackgroundSoundBadge.swift")
        XCTAssertTrue(
            noneBlock.contains("EmptyView()"),
            "B3.5 : sans piste, l'annonce ne rend RIEN — jamais de placeholder."
        )
    }

    // MARK: - B3.4 provenance : .original ⇒ note PUIS onde

    func test_originalCase_rendersMusicNoteThenWaveform() throws {
        let text = try source()
        let originalBlock = block(from: "case .original:", to: "case .credit", in: text)
        XCTAssertFalse(originalBlock.isEmpty, "case .original: introuvable dans BackgroundSoundBadge.swift")
        guard let note = originalBlock.range(of: #"Image(systemName: "music.note")"#),
              let waveform = originalBlock.range(of: "StoryHeaderAudioWaveform(") else {
            XCTFail("Une piste ORIGINALE doit afficher la note musicale ET l'onde animée (♫〰).")
            return
        }
        XCTAssertTrue(
            note.lowerBound < waveform.lowerBound,
            "L'onde vient à la suite de la note — même convention que l'ancien header du reader."
        )
    }

    // MARK: - B3.4 provenance : .credit ne dégénère JAMAIS vers la note+onde

    func test_creditCase_neverRendersWaveform() throws {
        let text = try source()
        let creditBlock = block(from: "case .credit", to: nil, in: text)
        XCTAssertFalse(creditBlock.isEmpty, "case .credit introuvable dans BackgroundSoundBadge.swift")
        XCTAssertFalse(
            creditBlock.contains("StoryHeaderAudioWaveform("),
            "Une piste de BIBLIOTHÈQUE — même sans métadonnées résolues (cache froid) — ne " +
            "doit jamais rendre la note+onde : mentirait sur la provenance (B3.4, « si et " +
            "seulement si »)."
        )
    }

    // MARK: - Texte du crédit — fonction pure, testable sans instancier la vue

    func test_creditText_withFullMetadata_joinsTitleHandleAndDuration() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: "sam", duration: 15),
            "Nuits d'été · @sam · 0:15"
        )
    }

    func test_creditText_withNoMetadata_isGenericCreditNote() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: nil, duration: nil),
            "♫ —",
            "Cache froid (aucune métadonnée résolue) ⇒ crédit générique — jamais un repli " +
            "vers la note+onde (B3.4, « si et seulement si »)."
        )
    }

    func test_creditText_stripsLeadingAtFromUsername() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: nil, username: "@sam", duration: nil),
            "@sam"
        )
    }

    func test_creditText_withTitleOnly_omitsDanglingSeparators() {
        XCTAssertEqual(
            BackgroundSoundBadge.creditText(title: "Nuits d'été", username: nil, duration: nil),
            "Nuits d'été"
        )
    }
}
