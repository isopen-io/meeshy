import XCTest

/// Source-level accessibility guard for the message bubble's translation flag
/// strip — the entry point of the Prisme Linguistique (original + system +
/// regional/custom + device locale, tap to reveal a secondary language inline).
///
/// The active flag is signalled ONLY by visuals: a larger `.caption` font and a
/// colored underline shown when the flag is active. Without a spoken state, a
/// VoiceOver user cannot tell which language is currently displayed on the
/// bubble (WCAG 1.4.1).
///
/// **Cette garde SUIT son hôte (leçon 248i).** La règle vivait dans
/// `BubbleFooter.footerFlagPill` ; elle a DÉMÉNAGÉ dans `LanguageFlagChip`, la
/// source unique que les huit copies de cette puce servent désormais. La garde
/// vérifie donc les deux moitiés — le pied de bulle DÉLÈGUE, et la source
/// unique ANNONCE — plutôt que de se raccourcir à la moitié restée sur place :
/// se contenter d'exiger la délégation la rendrait verte le jour où la source
/// unique perdrait le trait, c'est-à-dire exactement sur la régression qu'elle
/// prétend interdire.
final class BubbleFooterAccessibilityTests: XCTestCase {

    private func appSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_footerFlagPill_delegatesToTheSingleFlagChip() throws {
        let source = try appSource("Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift")
        guard let range = source.range(of: "private func footerFlagPill(") else {
            XCTFail("BubbleFooter.swift must define the footerFlagPill() builder"); return
        }
        let body = String(source[range.lowerBound...])
        XCTAssertTrue(
            body.contains("LanguageFlagChip(") && body.contains("metrics: .compact"),
            "Le pied de bulle doit servir la puce partagée en registre `.compact` — "
            + "réécrire le drapeau sur place recrée la neuvième table."
        )
        XCTAssertTrue(
            body.contains("isActive: flag.isActive"),
            "L'état actif doit être TRANSMIS à la puce : sans lui, la puce annonce "
            + "toujours la même chose et le soulignement ment."
        )
    }

    func test_theFlagChip_announcesWhichLanguageIsDisplayed() throws {
        let chip = try appSource("Meeshy/Features/Main/Components/LanguageFlagChip.swift")
        XCTAssertTrue(
            chip.contains(".accessibilityValue(isActive ? Self.shownValue() : \"\")"),
            "La langue lue ne doit pas tenir qu'à la taille du drapeau et à un "
            + "soulignement de 1,5 pt (WCAG 1.4.1) : la puce active porte une valeur."
        )
        XCTAssertTrue(
            chip.contains(".accessibilityAddTraits(isActive ? .isSelected : [])"),
            "Le trait `.isSelected` est la seconde moitié de l'annonce d'état — "
            + "c'est lui que le rotor et les gestes de VoiceOver lisent."
        )
    }
}
