import XCTest
@testable import Meeshy

/// Règles de présentation d'une carte de « Mes stories » (spec 2026-08-01).
///
/// Trois décisions y sont prises, et toutes trois sont pures — donc testées
/// ici plutôt que dans une `View` : le voile gris, le libellé de date, et le
/// jeu de glyphes de la bande basse.
@MainActor
final class MyStoryCardPresentationTests: XCTestCase {

    /// Dates RELATIVES à un `now` injecté : une fixture à date absolue pourrit
    /// dès que le calendrier avance.
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let locale = Locale(identifier: "fr_FR")

    // MARK: - Voile des stories périmées

    func test_isVeiled_storyStillAlive_isNotVeiled() {
        XCTAssertFalse(
            MyStoryCardPresentation.isVeiled(expiresAt: now.addingTimeInterval(3600), now: now),
            "Une story encore active se montre sans teinte")
    }

    func test_isVeiled_expiredStory_isVeiled() {
        XCTAssertTrue(
            MyStoryCardPresentation.isVeiled(expiresAt: now.addingTimeInterval(-1), now: now))
    }

    func test_isVeiled_storyWithoutExpiry_isNotVeiled() {
        XCTAssertFalse(
            MyStoryCardPresentation.isVeiled(expiresAt: nil, now: now),
            "Sans date d'expiration, rien n'a expiré")
    }

    func test_isVeiled_exactlyAtExpiry_isVeiled() {
        XCTAssertTrue(
            MyStoryCardPresentation.isVeiled(expiresAt: now, now: now),
            "L'instant d'expiration appartient au passé — la borne est fermée")
    }

    // MARK: - Libellé de date

    func test_dateLabel_underOneMonth_isRelative() {
        let label = MyStoryCardPresentation.dateLabel(
            for: now.addingTimeInterval(-2 * 24 * 3600), now: now, locale: locale)

        XCTAssertTrue(label.contains("2"), "Un « il y a 2 jours » doit porter la quantité : \(label)")
        XCTAssertFalse(label.contains("/"), "Sous un mois, aucune date absolue : \(label)")
    }

    func test_dateLabel_justNow_isRelative() {
        let label = MyStoryCardPresentation.dateLabel(
            for: now.addingTimeInterval(-30), now: now, locale: locale)
        XCTAssertFalse(label.isEmpty)
    }

    func test_dateLabel_overOneMonth_isAnExactDate() {
        let label = MyStoryCardPresentation.dateLabel(
            for: now.addingTimeInterval(-40 * 24 * 3600), now: now, locale: locale)

        XCTAssertFalse(label.lowercased().contains("il y a"),
                       "Passé un mois, on donne la date exacte, pas un relatif : \(label)")
    }

    /// La bascule se joue au mois, pas à 30 jours fixes : un mois calendaire
    /// dure 28 à 31 jours selon l'endroit où l'on se trouve.
    func test_dateLabel_switchesAtOneCalendarMonth() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        let oneMonthAgo = calendar.date(byAdding: .month, value: -1, to: now)!

        let justInside = MyStoryCardPresentation.dateLabel(
            for: oneMonthAgo.addingTimeInterval(60), now: now, locale: locale)
        let justOutside = MyStoryCardPresentation.dateLabel(
            for: oneMonthAgo.addingTimeInterval(-60), now: now, locale: locale)

        XCTAssertTrue(justInside.lowercased().contains("il y a"),
                      "Juste sous le mois : relatif — \(justInside)")
        XCTAssertFalse(justOutside.lowercased().contains("il y a"),
                       "Juste au-delà : date exacte — \(justOutside)")
    }

    /// Défaut existant relevé par la revue d'architecture : le libellé était
    /// composé en préfixant « il y a » à un formateur qui le produisait déjà,
    /// d'où un « il y a il y a 3 jours » annoncé par VoiceOver.
    func test_dateLabel_neverDoublesTheRelativePrefix() {
        let label = MyStoryCardPresentation.dateLabel(
            for: now.addingTimeInterval(-3 * 24 * 3600), now: now, locale: locale)
        let occurrences = label.lowercased().components(separatedBy: "il y a").count - 1
        XCTAssertLessThanOrEqual(occurrences, 1, "« il y a il y a … » : \(label)")
    }

    // MARK: - Bande de glyphes

    func test_glyphs_publishedStory_hasTheFourUsualOnes() {
        XCTAssertEqual(
            MyStoryCardPresentation.glyphs(for: .published),
            [.viewsAndReactions, .reactions, .comments, .more])
    }

    func test_glyphs_draft_replacesEngagementWithPublish() {
        let glyphs = MyStoryCardPresentation.glyphs(for: .draft)

        XCTAssertEqual(glyphs, [.publish, .more])
        XCTAssertFalse(glyphs.contains(.viewsAndReactions),
                       "Un brouillon n'a ni vues ni réactions à montrer")
        XCTAssertFalse(glyphs.contains(.comments))
    }

    func test_everyGlyph_hasASymbolAndAnAccessibilityLabel() {
        for glyph in MyStoryGlyph.allCases {
            XCTAssertFalse(glyph.systemImage.isEmpty, "\(glyph) sans symbole")
            XCTAssertFalse(glyph.accessibilityLabel.isEmpty, "\(glyph) sans libellé VoiceOver")
        }
    }

    // MARK: - Actions du menu « … »

    func test_moreActions_publishedStory_keepsTheExistingSet() {
        XCTAssertFalse(MyStoryCardPresentation.moreActions(for: .published).isEmpty)
    }

    func test_moreActions_draft_offersEditAndDelete() {
        let actions = MyStoryCardPresentation.moreActions(for: .draft)
        XCTAssertTrue(actions.contains(.edit))
        XCTAssertTrue(actions.contains(.delete))
    }

    /// « Programmer la publication » est une capacité NOUVELLE (aucun
    /// `scheduledAt` en base ni au gateway). L'entrée reste derrière un
    /// drapeau tant qu'elle n'est pas réellement implémentée : offrir une
    /// action qui ne fait rien est pire que ne pas l'offrir.
    func test_moreActions_draft_hidesSchedulingWhileUnsupported() {
        XCTAssertFalse(
            MyStoryCardPresentation.moreActions(for: .draft, capabilities: .init(scheduling: false))
                .contains(.schedule))
        XCTAssertTrue(
            MyStoryCardPresentation.moreActions(for: .draft, capabilities: .init(scheduling: true))
                .contains(.schedule))
    }
}
