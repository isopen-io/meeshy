import XCTest
@testable import Meeshy

/// **La frappe revient dans la pastille, qui enfle puis redescend** (issue
/// #6188, directive porteur 2026-09-12).
///
/// L'accentuation avait été reprise TROIS fois en dix jours — pulse fixe
/// (#4018), liée à la durée du signal (#4026), fenêtre réarmable (#4050) —
/// puis retirée le 2026-08-28 (#4066) au profit d'une capsule naissant dans la
/// Dynamic Island. La directive du 2026-09-12 rend l'annonce à la pastille.
/// C'est la cinquième révision du même geste : ces témoins existent pour que la
/// suivante trouve un comportement ÉNONCÉ, et non un réglage à deviner.
@MainActor
final class TypingAnnouncementLawTests: XCTestCase {

    private func entry(_ id: String, label: String = "@alice") -> SyncPillEntry {
        SyncPillEntry(id: id, label: label, iconName: nil, dotStyle: .brand, source: nil)
    }

    // MARK: - Ce qui s'annonce

    func test_announcement_picksATypingEntry() {
        let found = TypingAnnouncementLaw.announcement(among: [entry("typing.c1")])

        XCTAssertEqual(found?.id, "typing.c1")
    }

    /// Un envoi en file ou une reconnexion sont des faits de SYNCHRONISATION :
    /// la pastille les porte déjà sous sa forme normale, sans accent.
    func test_announcement_ignoresNonTypingEntries() {
        let found = TypingAnnouncementLaw.announcement(among: [
            entry("outbox.p1"),
            entry("status.offline"),
        ])

        XCTAssertNil(found)
    }

    /// Deux emphases qui se succéderaient se liraient comme un clignotement :
    /// une seule entrée est retenue, la plus récente.
    func test_announcement_keepsOnlyTheMostRecentTypingEntry() {
        let found = TypingAnnouncementLaw.announcement(among: [
            entry("typing.c1"),
            entry("typing.c2"),
        ])

        XCTAssertEqual(found?.id, "typing.c2")
    }

    func test_announcement_isNilWhenNothingIsNew() {
        XCTAssertNil(TypingAnnouncementLaw.announcement(among: []))
    }

    // MARK: - L'emphase : elle enfle, et elle REDESCEND

    /// Le défaut de 2026-08 n'était pas une mauvaise amplitude — c'était une
    /// pastille qui restait grosse. Le repos est donc le premier fait énoncé.
    func test_scale_returnsToRestWhenNotEmphasizing() {
        XCTAssertEqual(TypingAnnouncementLaw.scale(emphasizing: false), 1)
    }

    func test_scale_growsWhileEmphasizing() {
        XCTAssertEqual(
            TypingAnnouncementLaw.scale(emphasizing: true),
            TypingAnnouncementLaw.emphasisScale
        )
    }

    /// « Préserver la taille initiale et l'augmenter juste par ×1,1 par rapport
    /// à la taille initiale lorsqu'on a de la frappe » (#10840, retour porteur
    /// 2026-10-16). ×1,18 (#6188) puis ×1,5 (#4018) avant lui.
    func test_emphasisScale_isOnePointOneTimesTheRestingSize() {
        XCTAssertEqual(TypingAnnouncementLaw.emphasisScale, 1.1, accuracy: 0.0001)
    }

    // MARK: - Les points d'activité ne font pas respirer la capsule

    /// « Préserver la taille initiale quand des utilisateurs écrivent » : les
    /// points « . .. ... » qui suivent « @alice » changeaient la LARGEUR de la
    /// capsule deux fois par seconde pendant toute la frappe. La place des trois
    /// points est réservée ; seuls les points visibles changent.
    func test_activityDots_neverOutgrowTheirReservedSlot() {
        for phase in 0..<12 {
            let visible = SyncPillActivityDots.visible(phase: phase)
            XCTAssertFalse(visible.isEmpty)
            XCTAssertLessThanOrEqual(visible.count, SyncPillActivityDots.reserved.count)
            XCTAssertTrue(SyncPillActivityDots.reserved.hasPrefix(visible))
        }
    }

    /// Le libellé ne se compose plus en concaténant les points : c'est cette
    /// concaténation qui faisait varier la largeur rendue.
    func test_syncPill_neverAppendsTheDotsToTheLabel() throws {
        let source = try String(contentsOfFile: Self.syncPillSourcePath, encoding: .utf8)

        XCTAssertFalse(source.contains("label + (showsDots"),
                       "SyncPill concatène encore les points au libellé : la capsule respire à chaque tic")
        XCTAssertTrue(source.contains("SyncPillActivityDots.reserved"),
                      "SyncPill ne réserve pas la place des trois points")
    }

    private static var syncPillSourcePath: String {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/SyncPill.swift").path
    }

    /// Sans palier, l'œil qui regarde ailleurs au mauvais moment ne voit rien :
    /// les trois temps existent, et le total est leur somme — la peau programme
    /// son retour dessus, un écart laisserait la pastille enflée.
    func test_emphasisTotalDuration_isTheSumOfItsThreePhases() {
        XCTAssertEqual(
            TypingAnnouncementLaw.emphasisTotalDuration,
            TypingAnnouncementLaw.emphasisRiseDuration
                + TypingAnnouncementLaw.emphasisHoldDuration
                + TypingAnnouncementLaw.emphasisFallDuration,
            accuracy: 0.0001
        )
    }

    /// L'accent dit « quelqu'un vient de commencer » ; la pastille, sous sa
    /// forme normale, porte « quelqu'un écrit encore » jusqu'à son propre repos
    /// (`SyncPill.idleHideDelay`, 6 s). Confondre les deux durées est
    /// exactement ce que les révisions #4026 et #4050 faisaient.
    func test_theEmphasisIsFarShorterThanThePillsOwnRest() {
        XCTAssertLessThan(TypingAnnouncementLaw.emphasisTotalDuration, 6.0)
    }

    // MARK: - Où mène l'annonce

    /// Toucher l'annonce ouvre la conversation où l'on écrit : le préfixe
    /// encode cet identifiant, et c'est un fait vérifié plutôt qu'une
    /// convention orale entre `typingEntries` et ses lecteurs.
    func test_conversationId_isReadFromTheEntryIdentifier() {
        XCTAssertEqual(
            TypingAnnouncementLaw.conversationId(fromEntryId: "typing.conv-42"),
            "conv-42"
        )
    }

    func test_conversationId_isNilForAnEntryThatIsNotATyping() {
        XCTAssertNil(TypingAnnouncementLaw.conversationId(fromEntryId: "outbox.p1"))
    }

    /// Un préfixe nu ne désigne aucune conversation : rendre `""` ferait router
    /// vers une destination vide, ce qu'aucun appelant ne sait refuser.
    func test_conversationId_isNilWhenThePrefixCarriesNothing() {
        XCTAssertNil(TypingAnnouncementLaw.conversationId(fromEntryId: "typing."))
    }
}
