import XCTest

/// Directive user 2026-08-13 : au scroll, « il ne faut pas réduire juste les
/// titres, il faut intégrer le trail de story à l'emplacement où se trouve le
/// titre textuel […] de sorte qu'on ne voit plus meeshy Feed et meeshy chats
/// mais le trail de story à gauche des boutons d'actions ».
///
/// Le slot `accessory` rendait auparavant une SECONDE rangée sous la barre : le
/// titre survivait, rétréci, au-dessus d'une trail qui poussait le contenu vers
/// le bas. La règle est un ÉCHANGE, pas un empilement — et c'est une propriété
/// structurelle du header, que seule une garde de source peut épingler (un test
/// de rendu SwiftUI ne dit pas DANS QUEL conteneur une vue a été posée).
final class CollapsibleHeaderInlineAccessoryGuardTests: XCTestCase {

    private func headerSource() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Navigation/CollapsibleHeader.swift"),
                encoding: .utf8
            )
        )
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Un seul call site : la trail est rendue à UN endroit, dans la barre. Deux
    /// appels signeraient le retour de la rangée du bas à côté de la fente.
    func test_theTitleAccessoryIsRenderedExactlyOnce() throws {
        XCTAssertEqual(
            occurrences(of: "titleAccessory()", in: try headerSource()), 1,
            "Le slot titleAccessory doit être rendu une seule fois — dans la fente du titre."
        )
    }

    /// Les DEUX slots coexistent, et c'est délibéré : `accessory` reste une
    /// rangée PERMANENTE sous la barre (les sous-onglets de la découverte), que
    /// la bascule du titre ne doit ni effacer ni déplacer. Les fondre en un seul
    /// slot ferait disparaître ces sous-onglets au scroll.
    func test_thePermanentRowBelowTheBarSurvivesAlongsideTheTitleSlot() throws {
        let code = try headerSource()
        // Comptes disjoints : la casse sépare les deux appels — `accessory()`
        // n'est pas un suffixe de `titleAccessory()` (le « A » majuscule).
        XCTAssertEqual(
            occurrences(of: "accessory()", in: code), 1,
            "La rangée permanente sous la barre doit rester rendue, distincte de la fente du titre."
        )
        let bar = try XCTUnwrap(code.range(of: "titleAccessory()"))
        let row = try XCTUnwrap(code.range(of: "if let accessory {"))
        XCTAssertTrue(
            bar.lowerBound < row.lowerBound,
            "La rangée permanente reste SOUS la barre, donc après elle dans le VStack."
        )
    }

    /// La position : entre le titre et le `Spacer` qui précède les actions. La
    /// trail se retrouve donc bien « à gauche des boutons d'actions ». Depuis
    /// 3ae86ff5b le `Spacer` est à `minLength: 0` — l'écart visuel a déménagé
    /// sur les actions (`titleActionsGap`) ; l'ORDRE, lui, n'a pas bougé.
    func test_theAccessorySitsInTheTitleSlotLeftOfTheTrailingActions() throws {
        let code = try headerSource()
        let title = try XCTUnwrap(code.range(of: "if let titleView"))
        let accessory = try XCTUnwrap(code.range(of: "titleAccessory()"))
        let spacer = try XCTUnwrap(code.range(of: "Spacer(minLength: 0)"))
        let trailing = try XCTUnwrap(code.range(of: "trailing()"))

        XCTAssertTrue(
            title.lowerBound < accessory.lowerBound,
            "L'accessoire partage la fente du titre : il se pose avec lui, pas avant."
        )
        XCTAssertTrue(
            accessory.lowerBound < spacer.lowerBound && spacer.lowerBound < trailing.lowerBound,
            "…et il reste À GAUCHE des boutons d'actions, le Spacer entre eux."
        )
        XCTAssertTrue(
            code.contains("padding(.leading, CollapsibleHeaderMetrics.titleActionsGap)"),
            "L'écart trail↔actions vit sur les actions (titleActionsGap), réservé avec elles."
        )
    }

    /// Le fondu croisé : le titre s'efface AVEC la même courbe qui révèle
    /// l'accessoire. Sans ce lien, la fente afficherait les deux superposés.
    func test_theTitleFadesOutOnTheSameCurveThatFadesTheAccessoryIn() throws {
        let code = try headerSource()
        XCTAssertTrue(
            code.contains("opacity(Double(1 - inlineAccessoryReveal))"),
            "Le titre doit CÉDER la fente — pas seulement rétrécir."
        )
        XCTAssertTrue(
            code.contains("opacity(Double(inlineAccessoryReveal))"),
            "…et l'accessoire doit la prendre sur exactement la même courbe."
        )
        XCTAssertTrue(
            code.contains("CollapsibleHeaderMetrics.inlineAccessoryReveal(scrollOffset: scrollOffset)"),
            "La courbe vient du catalogue partagé, jamais de bornes recopiées sur place."
        )
    }

    /// Un titre invisible qui reste dans l'arbre d'accessibilité annoncerait un
    /// en-tête que personne ne voit, devant des anneaux bien réels.
    func test_theHandedOverTitleLeavesTheAccessibilityTree() throws {
        XCTAssertTrue(
            try headerSource().contains("accessibilityHidden(inlineAccessoryReveal > 0.5)"),
            "Une fois la fente cédée, le titre disparaît aussi pour VoiceOver."
        )
    }

    /// Sans accessoire, rien ne change : le titre continue de se serrer contre
    /// son texte. La largeur pleine n'est réclamée que par une trail horizontale.
    func test_onlyAnAccessoryClaimsTheFullWidthOfTheSlot() throws {
        let code = try headerSource()
        XCTAssertTrue(
            code.contains("maxWidth: titleAccessory == nil ? nil : CGFloat.infinity"),
            "Les headers sans accessoire gardent leur mise en page d'origine."
        )
        // Le `Spacer` qui précède les actions est flexible lui aussi : sans
        // priorité, un HStack partagerait la place en deux et la moitié de la
        // largeur destinée à la trail finirait en gouttière vide.
        XCTAssertTrue(
            code.contains("layoutPriority(titleAccessory == nil ? 0 : 1)"),
            "La fente doit remporter la place face au Spacer, sinon la trail n'en reçoit que la moitié."
        )
    }
}
