import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Ce qui monte au-dessus de la scène y est SEUL** (#6789 pour la traînée
/// d'émojis, #6817 pour la barre de réponse — deux directives porteur du
/// 2026-09-16 : « Lorsqu'on affiche les reactions, les autres controlleurs
/// doivent disparaitre », puis « Le fait de répondre à un attachement/scène doit
/// faire comme pour les réactions : faire disparaître les décorateurs et
/// autres »).
///
/// Ce fichier tient les deux moitiés du lot, et elles ne se mesurent pas de la
/// même façon : la LOI s'éprouve par son verdict, le CÂBLAGE par la source —
/// parce qu'un booléen juste que personne ne lit ne retire rien de l'écran.
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
@MainActor
final class MediaStageVeilTests: XCTestCase {

    private func corridors(mediaCount: Int = 6) -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34,
                                    attachments: MediaGalleryLot.imagesOnly(mediaCount))
    }

    // MARK: - Ce que la rangée efface

    /// Le cas NOMINAL, et le seul que la directive change : cadré, rangée
    /// ouverte ⇒ plus un contrôle.
    func test_whenTheReactionRowIsOpen_noPlateauChromeIsPainted() {
        XCTAssertFalse(MediaStageVeil.showsChrome(presentation: .carded, overlays: .init(reactionRow: true, replyBar: false)))
    }

    /// Au repos, le plateau est là : la directive retire le chrome PENDANT le
    /// geste, elle ne supprime pas le plateau.
    func test_atRest_theCardedPlateauIsPainted() {
        XCTAssertTrue(MediaStageVeil.showsChrome(presentation: .carded, overlays: .closed))
    }

    /// **Deux façons de n'avoir aucun chrome, et elles ne se confondent pas.**
    /// Le plein cadre a RENDU la place du plateau (#6142) ; la rangée ouverte la
    /// VOILE. La conjonction doit dire non dans les deux cas — sans quoi ouvrir
    /// la rangée en plein cadre ferait réapparaître le chrome qu'on venait de
    /// congédier.
    func test_inFullFrame_theChromeStaysGoneWhateverTheRowDoes() {
        XCTAssertFalse(MediaStageVeil.showsChrome(presentation: .full(pausedOnEntry: false),
                                                          overlays: .closed))
        XCTAssertFalse(MediaStageVeil.showsChrome(presentation: .full(pausedOnEntry: true),
                                                          overlays: .init(reactionRow: true, replyBar: false)))
    }

    // MARK: - Ce que la barre de réponse efface

    /// **La seconde ouverture, et la raison d'être du renommage** (#6817).
    ///
    /// Le voile ne connaît plus « les réactions » : il connaît ce qui est MONTÉ.
    /// Répondre à une pièce jointe monte une barre de saisie qui cite le média —
    /// et le rail des vignettes, la bande de transport, le bouton « Fermer », le
    /// menu ⋯, la carte d'auteur et la colonne d'actions restaient peints
    /// derrière elle pendant qu'on écrivait.
    func test_whenTheReplyBarIsUp_noPlateauChromeIsPainted() {
        XCTAssertFalse(MediaStageVeil.showsChrome(presentation: .carded,
                                                  overlays: .init(reactionRow: false, replyBar: true)))
    }

    /// **Les deux ouvertures répondent de la même façon** — c'est ce que la
    /// directive demande mot pour mot (« faire comme pour les réactions »), et
    /// c'est ce qu'un type SOMME de deux drapeaux garantit là où deux appels
    /// parallèles auraient pu diverger.
    func test_bothOvertures_veilTheSameWay() {
        let traînée = MediaStageVeil.Overlays(reactionRow: true, replyBar: false)
        let réponse = MediaStageVeil.Overlays(reactionRow: false, replyBar: true)
        let lesDeux = MediaStageVeil.Overlays(reactionRow: true, replyBar: true)

        for ouverture in [traînée, réponse, lesDeux] {
            XCTAssertFalse(MediaStageVeil.showsChrome(presentation: .carded, overlays: ouverture),
                           "une ouverture montée efface le chrome, quelle qu'elle soit")
            XCTAssertTrue(ouverture.isOpen)
        }
        XCTAssertFalse(MediaStageVeil.Overlays.closed.isOpen)
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
            for ouverture in [MediaStageVeil.Overlays(reactionRow: true, replyBar: false),
                              MediaStageVeil.Overlays(reactionRow: false, replyBar: true),
                              MediaStageVeil.Overlays(reactionRow: true, replyBar: true)] {
                XCTAssertEqual(MediaStageVeil.geometryPresentation(état, overlays: ouverture),
                               MediaStageVeil.geometryPresentation(état, overlays: .closed),
                               "\(ouverture) ne change AUCUNE cote de \(état)")
            }
        }
    }

    /// Et la conséquence, mesurée là où elle se voit : les deux retraits que le
    /// pager reçoit sont identiques rangée ouverte et rangée fermée.
    func test_thePagerInsets_areIdenticalWithAndWithoutTheRow() {
        let réserves = corridors()
        for ouverte in [true, false] {
            let état = MediaStageVeil.geometryPresentation(.carded, overlays: .init(reactionRow: ouverte, replyBar: false))
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

        XCTAssertEqual(MediaStageVeil.rowBottomInset(corridors: court),
                       court.gutter,
                       "le jeu vertical se lit sur la MÊME table que le cadre et le rail")
        XCTAssertEqual(MediaStageVeil.rowBottomInset(corridors: long),
                       MediaStageVeil.rowBottomInset(corridors: court),
                       "la marge est INVARIANTE aux couloirs — c'est ce que le voile veut dire")
        XCTAssertNotEqual(MediaStageVeil.rowBottomInset(corridors: long),
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

        XCTAssertTrue(couche.contains("MediaStageVeil.showsChrome("),
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

    /// **Le site unique des ouvertures lit les DEUX états de la vue** (#6817).
    ///
    /// La loi est juste dès qu'elle reçoit `replyBar: true` — encore faut-il que
    /// quelqu'un le lui dise. C'est exactement l'écart que ce lot répare pour la
    /// seconde fois : au #6789 la loi existait et `overlayLayer` ne la
    /// consultait pas ; ici elle la consulte, et le drapeau de la barre de
    /// réponse serait resté à `false` pour toujours sans cette garde.
    func test_theOverlaysSite_readsBothOvertures() throws {
        let code = try source(Self.gallery)
        guard let site = declarationBody(startingAt: "var stageOverlays", in: code) else {
            return XCTFail("`stageOverlays` introuvable — la garde ne mesurerait rien.")
        }

        XCTAssertTrue(site.contains("reactionRow: reactionBarOpen"),
                      "la traînée d'émojis est la première ouverture (#6789)")
        XCTAssertTrue(site.contains("replyBar: replyTarget != nil"),
                      """
                      La barre de réponse n'est pas câblée : le chrome resterait peint \
                      derrière elle, ce que la directive du 2026-09-16 interdit.
                      """)
    }

    /// **Les deux ouvertures ne coexistent pas.**
    ///
    /// Elles vivent dans deux `@State` indépendants, donc rien dans le TYPE ne
    /// les empêche d'être montées ensemble : la traînée d'émojis flotterait
    /// au-dessus de la barre de saisie, deux surfaces se disputant le même bas
    /// d'écran. Le voile ne peut pas trancher cela — il ne fait que constater —,
    /// c'est donc au geste qui ouvre la seconde de congédier la première.
    func test_openingTheReply_closesTheReactionRow() throws {
        let code = try source(Self.gallery)
        guard let actions = declarationBody(startingAt: "private func mediaActions", in: code),
              let route = actions.range(of: "case .composeInPlace:"),
              let suite = actions.range(of: "case .handOffToThread:") else {
            return XCTFail("La route de réponse en place est introuvable — la garde ne mesurerait rien.")
        }

        let branche = String(actions[route.upperBound..<suite.lowerBound])
        XCTAssertTrue(branche.contains("reactionBarOpen = false"),
                      """
                      Ouvrir la barre de réponse doit refermer la traînée d'émojis : sinon \
                      les deux ouvertures se posent au même endroit de l'écran.
                      """)
        XCTAssertTrue(branche.contains("replyTarget = att"))
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

        XCTAssertTrue(marge.contains("MediaStageVeil.rowBottomInset("))
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
        XCTAssertTrue(code.contains("MediaStageVeil.geometryPresentation("))

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
