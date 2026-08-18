import XCTest
@testable import MeeshyUI

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

    /// Supersession 2026-08-18 — « le trail des story doit prendre toute la
    /// largeur de l'écran jusqu'au view port et défiler derrière les boutons de
    /// droite […] de bout d'écran à bout d'écran ».
    ///
    /// La trail vivait entre le titre et les actions, DANS la rangée : sa
    /// largeur s'arrêtait au bord des boutons, et le défilement avec elle. Elle
    /// est maintenant une couche `.background` de la rangée — hors layout, donc
    /// pleine largeur (marges comprises), et DESSOUS, donc le chrome flotte
    /// au-dessus et le défilement passe derrière lui.
    ///
    /// C'est une propriété STRUCTURELLE : seul un test de source dit dans quel
    /// conteneur une vue a été posée.
    func test_theAccessoryIsAFullWidthLayerBehindTheRow_notASiblingOfTheActions() throws {
        let code = try headerSource()
        let trailing = try XCTUnwrap(code.range(of: "trailing()"))
        let accessory = try XCTUnwrap(code.range(of: "titleAccessory()"))
        XCTAssertTrue(
            trailing.lowerBound < accessory.lowerBound,
            "La trail doit être rendue APRÈS la rangée, dans son `.background` — " +
            "posée entre le titre et les actions elle redevient leur voisine, et " +
            "sa largeur s'arrête à leur bord."
        )

        let end = code.index(accessory.lowerBound, offsetBy: 400, limitedBy: code.endIndex) ?? code.endIndex
        let layer = String(code[accessory.lowerBound ..< end])
        XCTAssertTrue(
            layer.contains(".frame(maxWidth: .infinity, alignment: .leading)"),
            "La couche doit réclamer toute la largeur de la barre."
        )
        XCTAssertTrue(
            layer.contains(".allowsHitTesting(inlineAccessoryReveal > 0.5)"),
            "Sous les boutons, la piste ne doit pas capter le geste tant qu'elle " +
            "n'est pas révélée."
        )
        let background = try XCTUnwrap(
            code.range(of: ".background(alignment: .leading) {"),
            "La trail doit être posée en `.background` de la rangée — c'est ce qui " +
            "la met hors layout ET sous le chrome."
        )
        XCTAssertTrue(
            background.lowerBound < accessory.lowerBound,
            "…et l'appel doit se trouver DANS ce background."
        )
    }

    /// La trail vit DERRIÈRE la rangée : tout ce qui la recouvre et qui reste
    /// hit-testable lui vole ses taps. Un `Text` à `opacity(0)` en fait partie —
    /// SwiftUI le teste toujours — et la fente du titre, qui hugge son texte,
    /// couvre précisément les premiers anneaux : ceux qu'on atteint sans faire
    /// défiler. Invisible ne veut pas dire transparent au geste.
    func test_theHandedOverTitleAlsoReleasesTheGesture_notJustThePixels() throws {
        let code = try headerSource()
        XCTAssertTrue(
            code.contains("allowsHitTesting(inlineAccessoryReveal < 0.5)"),
            "Une fois la fente cédée, le titre doit cesser de capter les taps — " +
            "sinon les premiers anneaux de la trail sont inertes."
        )
        let title = try XCTUnwrap(code.range(of: "opacity(Double(1 - inlineAccessoryReveal))"))
        let release = try XCTUnwrap(code.range(of: "allowsHitTesting(inlineAccessoryReveal < 0.5)"))
        XCTAssertTrue(
            title.lowerBound < release.lowerBound,
            "…et cette libération doit porter sur la fente du titre elle-même."
        )
    }

    /// Le `.background` est posé APRÈS le padding horizontal de la rangée : il
    /// épouse alors la barre ENTIÈRE, gouttières comprises. Posé avant, la piste
    /// repartirait en retrait des deux bords — précisément ce qu'on corrige.
    func test_theLayerSpansTheWholeBar_paddingIncluded() throws {
        let code = try headerSource()
        let padding = try XCTUnwrap(
            code.range(of: ".padding(.horizontal, CollapsibleHeaderMetrics.barHorizontalPadding)"))
        let background = try XCTUnwrap(code.range(of: ".background(alignment: .leading) {"))
        XCTAssertTrue(
            padding.lowerBound < background.lowerBound,
            "Le fond doit venir après le padding de la rangée pour couvrir toute la barre."
        )
    }

    /// Une piste qui court sous les boutons doit pouvoir défiler AU-DELÀ d'eux,
    /// sinon son dernier anneau vient au repos sous le chrome : atteignable,
    /// jamais visible. L'encart vit dans le catalogue du header — seul endroit
    /// qui connaisse la largeur de son propre chrome.
    func test_theTrailHasEndOfTrackClearanceForTheChromeItScrollsUnder() {
        XCTAssertGreaterThanOrEqual(
            CollapsibleHeaderMetrics.accessoryTrailingClearance,
            2 * 44 + CollapsibleHeaderMetrics.roundChromeEdgeGutter,
            "Le dégagement doit couvrir la configuration la plus large en service : " +
            "deux disques de 44 pt groupés, plus la gouttière de bord."
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

    /// Corollaire de la supersession : la fente du titre ne réclame PLUS la
    /// largeur, et ne la dispute donc plus au chrome. C'est ce qui rend
    /// structurellement impossible le défaut des trois signalements de
    /// 2026-08-14/15/16 — le (+) de la liste et le (map) du feed poussés hors du
    /// viewport par une fente élastique servie avant eux.
    func test_theTitleSlotNoLongerCompetesWithTheActionsForWidth() throws {
        let code = try headerSource()
        XCTAssertFalse(
            code.contains("maxWidth: titleAccessory == nil ? nil : CGFloat.infinity"),
            "La fente ne doit plus s'élargir pour porter la trail : celle-ci est " +
            "hors layout désormais, et une fente élastique repousserait les boutons."
        )
        XCTAssertFalse(
            code.contains("layoutPriority(titleAccessory == nil ? 0 : 1)"),
            "…et elle ne doit plus réclamer de priorité contre le Spacer."
        )
    }
}
