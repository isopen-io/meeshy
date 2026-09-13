import XCTest
import SwiftUI
@testable import MeeshyUI

/// **L'habillage de la barre de réaction devient une OPTION de l'appelant**
/// (directive porteur 2026-09-11, #6083 : « pas de contour, agrandir la taille
/// des emojis »).
///
/// La capsule `QuickReactionStripChrome` était une décision du COMPOSANT :
/// tout hôte recevait la pilule Liquid Glass, sans moyen de la refuser. Elle est
/// juste partout où la barre se pose SUR une liste de messages — elle sépare la
/// rangée du fond qu'elle survole. Elle a tort sur une story plein écran, où la
/// scène est déjà le fond et où la pilule ajoute un cadre que la directive
/// refuse.
///
/// > La question « faut-il un paramètre ? » se répond en demandant si un hôte
/// > pourrait légitimement vouloir l'autre valeur. Ici oui — d'où `chrome`,
/// > et non un retrait pur comme pour la barre de défilement de la légende
/// > (`MediaCaptionScrollChromeGuardTests`).
///
/// Le DÉFAUT est `.capsule` : les six consommateurs existants ne passent rien
/// et ne changent donc pas d'un pixel. C'est la moitié du contrat que ce
/// fichier garde — l'autre étant que `.none` ne peigne RIEN.
final class EmojiReactionPickerChromeTests: XCTestCase {

    // MARK: - 1 · Le type de l'habillage

    /// Test NON `@MainActor` : le paquet est sous `defaultIsolation(MainActor)`,
    /// donc ce témoin ne compile QUE si l'énumération est `nonisolated`. Un
    /// habillage est une VALEUR — il doit pouvoir être décidé, transporté et
    /// comparé hors du main actor (règle de composition d'une charge de vue).
    func test_lHabillage_estUneValeurNonIsolee() {
        let capsule = EmojiReactionPickerChrome.capsule
        let sans: EmojiReactionPickerChrome = .none

        XCTAssertEqual(capsule, .capsule)
        XCTAssertEqual(sans, EmojiReactionPickerChrome.none)
        XCTAssertNotEqual(capsule, sans, "Les deux habillages doivent être DISTINGUABLES par ==")
    }

    /// `Sendable` vérifié au COMPILATEUR : la valeur traverse une frontière de
    /// concurrence. Une conformance déclarée mais fausse ferait rougir ici.
    func test_lHabillage_traverseUneFrontiereDeConcurrence() async {
        let chrome: EmojiReactionPickerChrome = .none
        let traverse = await Task.detached { chrome }.value
        XCTAssertEqual(traverse, EmojiReactionPickerChrome.none)
    }

    // MARK: - 2 · Le défaut protège les consommateurs existants

    @MainActor
    func test_leDefaut_estLaCapsule() {
        XCTAssertEqual(
            EmojiReactionPicker().chrome, .capsule,
            "Sans `chrome:`, la barre garde SA pilule — sinon les six sites existants "
                + "perdraient leur fond au premier build."
        )
    }

    @MainActor
    func test_leDefaut_tientAussiQuandLesAutresParametresSontPasses() {
        // Le paramètre est inséré JUSTE APRÈS `scrollable` : tout appel existant
        // qui passe `scrollable:` puis ses closures doit continuer de compiler
        // ET de rendre la capsule.
        let picker = EmojiReactionPicker(
            quickEmojis: ["❤️", "🔥"],
            style: .dark,
            scale: 2,
            scrollable: true,
            onReact: { _ in },
            onDismiss: {},
            onExpandFullPicker: {}
        )
        XCTAssertEqual(picker.chrome, .capsule)
    }

    @MainActor
    func test_lHabillageDemande_seTransporteJusquAlaVue() {
        let picker = EmojiReactionPicker(scale: 2, scrollable: true, chrome: .none)
        XCTAssertEqual(picker.chrome, EmojiReactionPickerChrome.none)
        XCTAssertEqual(picker.scale, 2)
        XCTAssertTrue(picker.scrollable)
    }

    // MARK: - 3 · `.none` ne peint RIEN (garde de source)

    /// Non-vacuité : les deux rangées existent là où la garde regarde. Sans cet
    /// ancrage, un renommage rendrait les deux assertions suivantes vertes en
    /// ne mesurant plus rien.
    func test_lesDeuxRangees_sontBienLaOuLaGardeRegarde() throws {
        let code = try source()
        XCTAssertNotNil(corps("private var quickEmojiStrip: some View {", dans: code),
                        "`quickEmojiStrip` introuvable — la garde ci-dessous ne mesurerait rien.")
        XCTAssertNotNil(corps("private var scrollableQuickEmojiStrip: some View {", dans: code),
                        "`scrollableQuickEmojiStrip` introuvable — idem.")
    }

    /// AUCUNE des deux rangées ne doit appliquer la capsule INCONDITIONNELLEMENT.
    /// C'est exactement la forme qu'avait le défaut : `.modifier(QuickReactionStripChrome(...))`
    /// posé en fin de rangée, hors de toute branche.
    func test_aucuneRangee_nAppliqueLaCapsuleSansCondition() throws {
        let code = try source()
        for ancre in ["private var quickEmojiStrip: some View {",
                      "private var scrollableQuickEmojiStrip: some View {"] {
            guard let corpus = corps(ancre, dans: code) else {
                return XCTFail("\(ancre) introuvable")
            }
            XCTAssertFalse(
                compact(corpus).contains(".modifier(QuickReactionStripChrome("),
                "\(ancre) applique la capsule en dur : `chrome: .none` ne pourrait pas la retirer."
            )
            XCTAssertTrue(
                compact(corpus).contains("chromed("),
                "\(ancre) doit passer par le point de décision unique `chromed(_:)`."
            )
        }
    }

    /// Le point de décision existe, et il porte bien les DEUX issues : peindre
    /// la capsule, ou rendre le contenu NU.
    func test_leChromed_renvoieLeContenuNuPourNone() throws {
        let code = try source()
        guard let corpus = corps("private func chromed", dans: code) else {
            return XCTFail("`chromed(_:)` introuvable — il n'y a plus de point de décision d'habillage.")
        }
        let plat = compact(corpus)
        XCTAssertTrue(plat.contains("case.capsule:"),
                      "La branche `.capsule` doit être explicite.")
        XCTAssertTrue(plat.contains("case.none:"),
                      "La branche `.none` doit être explicite.")
        XCTAssertTrue(plat.contains("QuickReactionStripChrome("),
                      "La branche `.capsule` doit toujours poser la pilule.")
        guard let debutNone = plat.range(of: "case.none:") else { return XCTFail("branche .none introuvable") }
        XCTAssertFalse(
            String(plat[debutNone.upperBound...]).contains("QuickReactionStripChrome("),
            "`.none` ⇒ ni capsule ni fond : rien ne doit être peint après cette branche."
        )
    }

    // MARK: - Helpers

    private func source() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre),
              let ouvrante = code[debut.lowerBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var resultat = ""
        var index = ouvrante
        while index < code.endIndex {
            let caractere = code[index]
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func compact(_ code: String) -> String {
        code.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .replacingOccurrences(of: "\t", with: "")
    }
}
