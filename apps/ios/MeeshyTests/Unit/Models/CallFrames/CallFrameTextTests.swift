import CoreGraphics
import XCTest
@testable import Meeshy

/// LES MOTS D'UN CADRE (#8743, spec § 4.5, § 5.3) — le miroir de `frame-text.test.ts` : les noms du
/// duo et des groupes, le nom du groupe qui ne s'écrit qu'en groupe, la marque en minuscules, le
/// texte trop long qui rétrécit puis se tronque.
final class CallFrameTextTests: XCTestCase {
    private func person(_ name: String, _ handle: String? = nil, isSelf: Bool = false) -> CallFramePerson {
        CallFramePerson(id: name.lowercased(), name: name, handle: handle, isSelf: isSelf)
    }

    private var everyone: [CallFramePerson] {
        ["Awa", "Karim", "Lina", "Tomás", "Mei"].map { person($0, $0.lowercased()) }
    }

    private func texts(groupName: String? = "Les Copains", isGroup: Bool = true) -> CallFrameTexts {
        CallFrameTexts(groupName: groupName, isGroup: isGroup, date: "29 sept. 2026", accentHex: nil)
    }

    /// Une police à chasse fixe : 0,5 em par caractère.
    private let mono: (String, CGFloat) -> CGFloat = { text, px in CGFloat(text.count) * px * 0.5 }

    // MARK: - Les noms

    func test_namesText_duo_joinsWithAnAmpersand() {
        XCTAssertEqual(CallFrameText.namesText(Array(everyone.prefix(2))), "Awa & Karim")
    }

    func test_namesText_three_listsThenAmpersand() {
        XCTAssertEqual(CallFrameText.namesText(Array(everyone.prefix(3))), "Awa, Karim & Lina")
    }

    func test_namesText_beyondThree_countsTheRest() {
        XCTAssertEqual(CallFrameText.namesText(everyone), "Awa, Karim, Lina + 2")
    }

    func test_namesText_blankName_doesNotCount() {
        XCTAssertEqual(CallFrameText.namesText([person("Awa"), person("  ")]), "Awa")
    }

    func test_handleText_carriesExactlyOneAt() {
        XCTAssertEqual(CallFrameText.handleText("awa"), "@awa")
        XCTAssertEqual(CallFrameText.handleText("@@awa "), "@awa")
    }

    func test_personLines_nameHandleBothNone() {
        let awa = person("Awa", "awa_d")
        XCTAssertEqual(CallFrameText.personLines(awa, show: .name), ["Awa"])
        XCTAssertEqual(CallFrameText.personLines(awa, show: .handle), ["@awa_d"])
        XCTAssertEqual(CallFrameText.personLines(awa, show: .both), ["Awa", "@awa_d"])
        XCTAssertEqual(CallFrameText.personLines(awa, show: .none), [])
        XCTAssertEqual(CallFrameText.listEntry(awa, show: .both), "Awa @awa_d")
    }

    func test_personLines_withoutHandle_theNameStandsIn() {
        XCTAssertEqual(CallFrameText.personLines(person("Karim"), show: .handle), ["Karim"])
        XCTAssertEqual(CallFrameText.personLines(person("Karim"), show: .both), ["Karim"])
    }

    // MARK: - Le titre

    func test_titleText_groupInAGroup_isTheGroupName() {
        XCTAssertEqual(CallFrameText.titleText(.group, people: everyone, texts: texts()), "Les Copains")
    }

    func test_titleText_groupOutsideAGroup_isTheNames() {
        XCTAssertEqual(CallFrameText.titleText(.group, people: Array(everyone.prefix(2)), texts: texts(isGroup: false)), "Awa & Karim")
    }

    func test_titleText_groupWithoutAName_isTheNames() {
        XCTAssertEqual(CallFrameText.titleText(.group, people: everyone, texts: texts(groupName: "   ")), "Awa, Karim, Lina + 2")
        XCTAssertEqual(CallFrameText.titleText(.group, people: everyone, texts: texts(groupName: nil)), "Awa, Karim, Lina + 2")
    }

    func test_titleText_brand_staysLowercaseEvenUnderUpper() {
        XCTAssertEqual(CallFrameText.titleText(.brand, people: everyone, texts: texts(), letterCase: .upper), "meeshy")
    }

    func test_titleText_date_isUppercasedUnderUpper() {
        XCTAssertEqual(CallFrameText.titleText(.date, people: everyone, texts: texts()), "29 sept. 2026")
        XCTAssertEqual(CallFrameText.titleText(.date, people: everyone, texts: texts(), letterCase: .upper), "29 SEPT. 2026")
    }

    func test_titleText_none_isEmpty() {
        XCTAssertEqual(CallFrameText.titleText(.none, people: everyone, texts: texts()), "")
    }

    // MARK: - Rétrécir jusqu'à 60 %, puis tronquer

    func test_fit_textThatFits_isUnchanged() {
        XCTAssertEqual(CallFrameText.fit("Awa", maxWidth: 100, size: 20, measure: mono), CallFrameFittedText(text: "Awa", size: 20))
    }

    func test_fit_slightlyLongText_shrinksWithoutTruncating() {
        let fitted = CallFrameText.fit("Awa & Karim", maxWidth: 88, size: 20, measure: mono)
        XCTAssertEqual(fitted.text, "Awa & Karim")
        XCTAssertLessThan(fitted.size, 20)
        XCTAssertGreaterThanOrEqual(fitted.size, 12)
        XCTAssertLessThanOrEqual(mono(fitted.text, fitted.size), 88)
    }

    func test_fit_beyondSixtyPercent_truncatesWithAnEllipsis() {
        let fitted = CallFrameText.fit("Une très longue histoire de famille", maxWidth: 60, size: 20, measure: mono)
        XCTAssertEqual(fitted.size, 12, accuracy: 0.0001)
        XCTAssertTrue(fitted.text.hasSuffix("…"))
        XCTAssertLessThanOrEqual(mono(fitted.text, fitted.size), 60)
        XCTAssertEqual(fitted.text, "Une très…")
    }

    func test_fit_neverSplitsAComposedCharacter() {
        let fitted = CallFrameText.fit("😀😀😀😀😀😀😀😀😀😀", maxWidth: 18, size: 10, measure: mono)
        XCTAssertEqual(fitted.text, "😀😀😀😀😀…")
    }

    func test_fit_noRoom_noText() {
        XCTAssertEqual(CallFrameText.fit("Awa", maxWidth: 0, size: 20, measure: mono).text, "")
        XCTAssertEqual(CallFrameText.fit("Awa", maxWidth: 2, size: 20, measure: mono).text, "")
    }
}
