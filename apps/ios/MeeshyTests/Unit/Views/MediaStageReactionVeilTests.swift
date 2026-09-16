import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **La rangée de réactions est SEULE sur la scène** (#6789, directive porteur
/// 2026-09-16 : « Lorsqu'on affiche les reactions, les autres controlleurs
/// doivent disparaitre »).
///
/// Ce fichier tient les deux moitiés du lot, et elles ne se mesurent pas de la
/// même façon : la LOI s'éprouve par son verdict, le CÂBLAGE par la source —
/// parce qu'un booléen juste que personne ne lit ne retire rien de l'écran.
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
@MainActor
final class MediaStageReactionVeilTests: XCTestCase {

    private func corridors(mediaCount: Int = 6) -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34,
                                    attachments: MediaGalleryLot.imagesOnly(mediaCount))
    }

    // MARK: - Ce que la rangée efface

    /// Le cas NOMINAL, et le seul que la directive change : cadré, rangée
    /// ouverte ⇒ plus un contrôle.
    func test_whenTheReactionRowIsOpen_noPlateauChromeIsPainted() {
        XCTAssertFalse(MediaStageReactionVeil.showsChrome(presentation: .carded, pickerOpen: true))
    }

    /// Au repos, le plateau est là : la directive retire le chrome PENDANT le
    /// geste, elle ne supprime pas le plateau.
    func test_atRest_theCardedPlateauIsPainted() {
        XCTAssertTrue(MediaStageReactionVeil.showsChrome(presentation: .carded, pickerOpen: false))
    }

    /// **Deux façons de n'avoir aucun chrome, et elles ne se confondent pas.**
    /// Le plein cadre a RENDU la place du plateau (#6142) ; la rangée ouverte la
    /// VOILE. La conjonction doit dire non dans les deux cas — sans quoi ouvrir
    /// la rangée en plein cadre ferait réapparaître le chrome qu'on venait de
    /// congédier.
    func test_inFullFrame_theChromeStaysGoneWhateverTheRowDoes() {
        XCTAssertFalse(MediaStageReactionVeil.showsChrome(presentation: .full(pausedOnEntry: false),
                                                          pickerOpen: false))
        XCTAssertFalse(MediaStageReactionVeil.showsChrome(presentation: .full(pausedOnEntry: true),
                                                          pickerOpen: true))
    }

    // MARK: - Ce que la rangée ne touche PAS

    /// **Le voile efface le chrome, il ne libère pas sa place.**
    ///
    /// C'est LA raison d'être d'un second type plutôt que d'une réutilisation de
    /// `StagePresentation` : cet état-là commande aussi les cotes, donc l'avoir
    /// basculé aurait fait GRANDIR le média à l'ouverture de la rangée et
    /// rétrécir au choix de l'émoji — la pièce qu'on vise bouge sous le doigt
    /// pendant qu'on la vise.
    func test_theVeil_neverMovesTheMedia() {
        for état in [StagePresentation.carded,
                     .full(pausedOnEntry: false),
                     .full(pausedOnEntry: true)] {
            XCTAssertEqual(MediaStageReactionVeil.geometryPresentation(état, pickerOpen: true),
                           MediaStageReactionVeil.geometryPresentation(état, pickerOpen: false),
                           "la rangée ouverte ne change AUCUNE cote de \(état)")
        }
    }

    /// Et la conséquence, mesurée là où elle se voit : les deux retraits que le
    /// pager reçoit sont identiques rangée ouverte et rangée fermée.
    func test_thePagerInsets_areIdenticalWithAndWithoutTheRow() {
        let réserves = corridors()
        for ouverte in [true, false] {
            let état = MediaStageReactionVeil.geometryPresentation(.carded, pickerOpen: ouverte)
            XCTAssertEqual(MediaGalleryStage.topInset(presentation: état, corridors: réserves),
                           réserves.safeTop + réserves.top)
            XCTAssertEqual(MediaGalleryStage.bottomInset(presentation: état, corridors: réserves),
                           réserves.rail + réserves.transport + réserves.safeBottom + réserves.gutter)
        }
    }

    // MARK: - Où la rangée se pose

    /// **La marge basse ne dodge plus les couloirs : ils ne sont plus là.**
    ///
    /// Elle valait `rail + transport + 8` pour ne pas couvrir les deux bandes
    /// qui servent à PARCOURIR. La directive les efface — une marge qui les
    /// éviterait laisserait maintenant une centaine de points de vide sous les
    /// émojis. Le témoin mesure l'INVARIANCE, parce que c'est elle la règle :
    /// deux lots aux couloirs très différents rendent la même marge.
    func test_theRowRestsOnTheGutter_whateverTheCorridorsWouldHaveReserved() {
        let court = corridors(mediaCount: 1)
        let long = corridors(mediaCount: 24)

        XCTAssertEqual(MediaStageReactionVeil.rowBottomInset(corridors: court),
                       court.gutter,
                       "le jeu vertical se lit sur la MÊME table que le cadre et le rail")
        XCTAssertEqual(MediaStageReactionVeil.rowBottomInset(corridors: long),
                       MediaStageReactionVeil.rowBottomInset(corridors: court),
                       "la marge est INVARIANTE aux couloirs — c'est ce que le voile veut dire")
        XCTAssertNotEqual(MediaStageReactionVeil.rowBottomInset(corridors: long),
                          long.rail + long.transport + long.gutter,
                          "l'ancienne règle (#6161) ne doit plus se lire nulle part")
    }

    // MARK: - Ce que la source doit porter pour que tout ceci ait un effet

    private func source(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let actions = "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Actions.swift"
    private static let geometry = "Meeshy/Features/Main/Views/ConversationMediaGalleryView+Geometry.swift"

    /// **La couche du plateau consulte le voile, et rien d'autre.**
    ///
    /// Une loi vraie qu'aucun `body` ne lit ne retire rien de l'écran — c'est le
    /// piège de la « loi que personne ne consulte », et c'est précisément
    /// l'écart que ce lot répare : `showsPlateau` était juste, la rangée montait
    /// par-dessus, et tout le chrome restait peint dessous.
    func test_theOverlayLayer_readsTheVeil() throws {
        let code = try source(Self.gallery)
        guard let couche = declarationBody(startingAt: "var overlayLayer", in: code) else {
            return XCTFail("`overlayLayer` introuvable — la garde ne mesurerait rien.")
        }

        XCTAssertTrue(couche.contains("MediaStageReactionVeil.showsChrome("),
                      "la couche doit consulter le voile, pas `stagePresentation.showsPlateau` seul")
        XCTAssertFalse(couche.contains("if stagePresentation.showsPlateau {"),
                       """
                       L'ancienne conjonction survit : le chrome resterait peint sous la \
                       rangée d'émojis, ce que la directive du 2026-09-16 interdit.
                       """)
        XCTAssertFalse(couche.contains(".allowsHitTesting(stagePresentation.showsPlateau)"),
                       """
                       Le hit-test doit suivre le VOILE : pendant le fondu la couche est \
                       encore là, et un doigt qui rate un émoji atteindrait un bouton en \
                       train de disparaître.
                       """)
    }

    /// **La marge de la rangée se LIT sur la loi**, elle ne recompose pas les
    /// couloirs. Ce site a déjà recopié une conjonction du plateau une fois
    /// (#6161), et la copie avait aussitôt oublié la bande de transport de
    /// #6162.
    func test_theRowInset_readsTheLaw() throws {
        let code = try source(Self.actions)
        guard let marge = declarationBody(startingAt: "var reactionBarBottomInset", in: code) else {
            return XCTFail("`reactionBarBottomInset` introuvable — la garde ne mesurerait rien.")
        }

        XCTAssertTrue(marge.contains("MediaStageReactionVeil.rowBottomInset("))
        XCTAssertFalse(marge.contains("stageCorridors.rail + stageCorridors.transport"),
                       "l'ancienne somme a été remplacée, pas doublée")
    }

    /// **La géométrie passe par le voile.**
    ///
    /// Une règle qui se contenterait de NE PAS appeler la géométrie ne se teste
    /// pas : elle se perd au premier lot qui ajoute un appel. En faisant passer
    /// les trois sites par `geometryPresentation`, l'invariance devient une
    /// propriété qu'on peut éprouver — et la signature dit la règle sur place.
    func test_theSolverReadsTheVeiledPresentation() throws {
        let code = try source(Self.geometry)

        XCTAssertTrue(code.contains("var stageGeometryPresentation: StagePresentation"),
                      "le site unique de l'état servi au solveur")
        XCTAssertTrue(code.contains("MediaStageReactionVeil.geometryPresentation("))

        for site in ["var plateauTopInset", "var plateauBottomInset",
                     "func stage(for attachment: MessageAttachment)"] {
            guard let corps = declarationBody(startingAt: site, in: code) else {
                return XCTFail("`\(site)` introuvable — la garde ne mesurerait rien.")
            }
            XCTAssertTrue(corps.contains("stageGeometryPresentation"),
                          "`\(site)` doit recevoir l'état SERVI, jamais `stagePresentation` brut")
        }
    }

    /// Le corps d'une déclaration, borné par SES accolades — jamais par un
    /// nombre de caractères : une fenêtre fixe se remplit des retraits laissés
    /// par les commentaires retirés et rougit sur un code juste.
    private func declarationBody(startingAt marker: String, in code: String) -> String? {
        guard let start = code.range(of: marker),
              let open = code[start.lowerBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var index = open
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { return String(code[start.lowerBound...index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }
}
