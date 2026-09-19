import CoreGraphics
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import XCTest
@testable import Meeshy

/// **#7037 — le couloir haut du plein écran reste DANS la fenêtre, quoi que la
/// page montre.**
///
/// ## Ce que la recette a mesuré
///
/// Simulateur Meeshy-iOS26 (402 × 874), une pièce de post ouverte depuis le
/// fil : `Button « Fermer » x = −326,3` — la croix ENTIÈRE hors de l'écran, 286
/// pt à gauche du viewport. Le plein écran ne se fermait plus que par un geste,
/// jamais par le contrôle qui l'annonce.
///
/// **Le ⋯ n'était PAS de la partie, mesure à l'appui.** L'issue avait élargi le
/// périmètre en supposant qu'il sortait par l'autre bord du même `HStack`. Il
/// n'existe simplement pas sur une page SCÈNE (#6709), et les pages qui le
/// portent — pièces jointes de conversation, médias de post — n'ont pas de sol,
/// donc pas d'élargissement. Son absence sur un post est une décision de
/// produit, pas cette régression.
///
/// ## La cause, MESURÉE — et ce n'est pas le carrousel
///
/// Le `ZStack` racine adopte la taille de son plus grand enfant, et le diagnostic
/// de l'issue accusait le pager. **Mesure au harnais : il est innocent.** Un
/// `ScrollView(.horizontal)` REND la largeur qu'on lui propose (402) et garde ses
/// 1 206 pt de contenu à l'intérieur ; sonde posée sur un pager de trois pages,
/// la croix reste à x = 14. La pellicule aussi est innocente.
///
/// Le seul enfant qui DICTE sa taille est le **SOL de scène** (`SceneFloorView`,
/// SDK) : `Image.resizable().scaledToFill()` sans cadre ni rognage REND ses cotes
/// agrandies, et le `ZStack` les adopte. Sondé dans une fenêtre de 402 :
///
/// ```
/// empreinte portrait (36 × 64) → couloir large de   437,3 → bord gauche à x =   −3,7
/// empreinte paysage  (64 × 36) → couloir large de 1 383,3 → bord gauche à x = −476,7
/// ```
///
/// C'est la forme du média de la scène — pas le nombre de pièces — qui décide de
/// l'ampleur. L'issue avait lu « plusieurs pièces » parce qu'un post à une seule
/// scène portrait ne perd que 3,7 pt : le défaut y est présent et invisible.
///
/// ## Pourquoi l'INVARIANCE, et pas seulement la position
///
/// « la croix est à 14 pt du bord » fige une cote ; **« la place du chrome ne
/// dépend pas de ce que la page montre » nomme la RÈGLE**, et elle est plus
/// forte : elle tombe pour toute couche du plateau qui se remettrait à dicter sa
/// taille au lieu de prendre celle qu'on lui propose, y compris sous un contrôle
/// qui n'existe pas encore. Le #6751 était le même symptôme sur l'autre axe — le
/// clavier poussait la racine et « Fermer » tombait à y = −47 — et il a été
/// corrigé sans témoin : c'est ce silence qui a laissé le défaut revenir à
/// l'horizontale.
///
/// Le témoin lit ce que VoiceOver lit — libellé et cadre d'écran — dans une
/// fenêtre réelle, par le harnais `RenderedScreen`. **Aucune loi de valeur ne
/// peut le remplacer** : la taille adoptée d'un `ZStack` n'est pas une valeur que
/// le dépôt calcule, c'est un verdict que SwiftUI rend au montage.
@MainActor
final class MediaGalleryChromeReachTests: XCTestCase {

    // MARK: - Fabriques

    private static let window = CGSize(width: 402, height: 874)

    /// Les deux occupants du couloir haut, nommés comme VoiceOver les annonce.
    private static var closeLabel: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }

    private static var menuLabel: String {
        String(localized: "gallery.menu.more", defaultValue: "Autres actions", bundle: .main)
    }

    /// L'empreinte d'un aplat, ENCODÉE par le SDK plutôt qu'écrite à la main : sa
    /// FORME est alors connue, et c'est la forme qui décide de l'ampleur du
    /// défaut. Le paysage est le cas coûteux (couloir de 1 355 pt mesuré), le
    /// portrait le cas silencieux (409 pt) — les deux se mesurent.
    private static func fingerprint(_ size: CGSize) -> String {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let flat = UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor(red: 0.310, green: 0.275, blue: 0.898, alpha: 1).setFill()
            context.cgContext.fill(CGRect(origin: .zero, size: size))
        }
        return flat.toThumbHash() ?? ""
    }

    private static let landscapeHash = fingerprint(CGSize(width: 64, height: 36))
    private static let portraitHash = fingerprint(CGSize(width: 36, height: 64))

    /// Un lot de SCÈNES de post — pièces synthétiques au MIME de scène, comme
    /// `PostGalleryLot` les compose, plus le contexte qui les déclare scènes.
    /// C'est ce contexte qui fait monter le sol : sans lui la galerie garde son
    /// noir plat, et le défaut ne se voit pas.
    private static func sceneLot(count: Int, hash: String)
        -> (attachments: [MessageAttachment], context: GallerySceneContext) {
        let post = FeedPost(
            id: "p1",
            author: "Demo",
            authorId: "u1",
            authorUsername: "demo",
            type: "post",
            content: "",
            timestamp: Date(timeIntervalSince1970: 0)
        )
        let document = CanvasV3(scenes: (0..<max(1, count)).map { SceneV3(id: "s\($0)", objects: []) })
        let attachments = (0..<max(1, count)).map { index in
            MessageAttachment(
                id: "p1#\(index)",
                mimeType: GallerySceneItem.mimeType,
                thumbHash: hash,
                uploadedBy: post.authorId,
                createdAt: post.timestamp
            )
        }
        let scenes = attachments.enumerated().reduce(into: [String: GallerySceneItem]()) { map, pair in
            map[pair.element.id] = GallerySceneItem(
                id: pair.element.id,
                postId: post.id,
                document: document,
                sceneIndex: pair.offset,
                carrier: StoryItem(id: post.id, createdAt: post.timestamp),
                mediaId: nil,
                aspect: SceneShape.aspect,
                canvasAspect: SceneShape.aspect,
                moves: false,
                thumbHash: hash,
                thumbnailURL: nil
            )
        }
        return (attachments, GallerySceneContext(post: post,
                                                 scenes: scenes,
                                                 captions: [:],
                                                 playerLanguages: ["fr"],
                                                 captionLanguages: ["fr"]))
    }

    /// Ce que le couloir haut occupe réellement. Le diagnostic voyage avec les
    /// cadres : un rouge de géométrie doit dire QUI a dicté le cadre, pas
    /// seulement que la croix est partie.
    private struct Corridor {
        let close: CGRect
        /// **`nil` est une réponse légitime** : une page SCÈNE n'offre pas le ⋯
        /// (#6709 — une œuvre composée n'est pas le fichier de sa vignette, donc
        /// pas de requête, donc pas de menu : loi 4). Le témoin le NOMME au lieu
        /// de le traiter en absence de rendu, sans quoi il accuserait la
        /// géométrie d'une décision de produit.
        let menu: CGRect?
        let diagnostic: String
    }

    private func corridor(
        _ nom: String,
        attachments: [MessageAttachment],
        sceneContext: GallerySceneContext? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) -> Corridor? {
        guard let first = attachments.first else {
            XCTFail("\(nom) : lot vide", file: file, line: line)
            return nil
        }
        let screen = RenderedScreen(
            ConversationMediaGalleryView(
                allAttachments: attachments,
                startAttachmentId: first.id,
                accentColor: "6366F1",
                sceneContext: sceneContext
            ),
            size: Self.window,
            file: file,
            line: line
        )
        defer { screen.dismount() }

        let diagnostic = "\(nom) · " + Self.describe(screen)
        guard let close = screen.frame(labeledPrefix: Self.closeLabel) else {
            XCTFail("aucune croix rendue — \(diagnostic)", file: file, line: line)
            return nil
        }
        return Corridor(close: close,
                        menu: screen.frame(labeledPrefix: Self.menuLabel),
                        diagnostic: diagnostic)
    }

    private func assertInsideWindow(
        _ corridor: Corridor,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(
            corridor.close.minX >= 0 && corridor.close.maxX <= Self.window.width,
            """
            la croix est hors de la fenêtre — x = \(corridor.close.minX) … \(corridor.close.maxX) \
            pour une fenêtre de \(Self.window.width) · \(corridor.diagnostic)
            """,
            file: file, line: line
        )
        guard let menu = corridor.menu else { return }
        XCTAssertTrue(
            menu.minX >= 0 && menu.maxX <= Self.window.width,
            """
            le menu ⋯ est hors de la fenêtre — x = \(menu.minX) … \(menu.maxX) \
            pour une fenêtre de \(Self.window.width) · \(corridor.diagnostic)
            """,
            file: file, line: line
        )
    }

    // MARK: - Les deux contrôles sont ATTEIGNABLES

    /// **La surface où le défaut vit : une page SCÈNE**, la seule qui monte un
    /// sol. Tout ce qui s'aligne sur un BORD du plateau partait avec lui ; ici
    /// c'est la croix, et ce sera demain tout contrôle qu'on y posera.
    ///
    /// Le PAYSAGE est le rang qui fait tomber le témoin (−476 pt) ; le PORTRAIT
    /// est celui qui ne le fait pas tomber d'assez (−3,7 pt) pour qu'une recette
    /// le voie, et la pièce UNIQUE celui où l'on croyait que la règle juste et la
    /// règle absente rendaient le même verdict — elles ne le rendent pas, c'est
    /// la forme de l'empreinte qui décide, jamais le nombre de pièces. Les trois
    /// sont mesurés : leçon 261 appliquée à la géométrie.
    ///
    /// **Le ⋯ n'est pas mesuré ici, et ce n'est pas un oubli.** Une page scène
    /// n'en offre aucun (#6709 : sa seule URL est la vignette de son média, et
    /// l'enregistrer sortirait un fond sans le texte ni les stickers de
    /// l'auteur). Le témoin l'AFFIRME, pour qu'une future apparition du menu sur
    /// cette surface soit une décision et non un accident — et parce que c'est ce
    /// que la mesure a répondu à la question « le ⋯ sort-il par l'autre bord ? » :
    /// sur les pages qui ont un sol il n'existe pas, sur celles qui l'ont il n'y
    /// a pas de sol.
    func test_uneSceneDePost_laisseLaCroixDansLaFenetre() {
        let cas: [(String, Int, String)] = [
            ("scène paysage ×3", 3, Self.landscapeHash),
            ("scène portrait ×3", 3, Self.portraitHash),
            ("scène paysage ×1", 1, Self.landscapeHash),
        ]
        for (nom, count, hash) in cas {
            let lot = Self.sceneLot(count: count, hash: hash)
            guard let corridor = corridor(nom, attachments: lot.attachments, sceneContext: lot.context)
            else { continue }
            assertInsideWindow(corridor)
            XCTAssertNil(corridor.menu,
                         "\(nom) : une page scène n'offre pas le ⋯ (#6709) — si elle en montre un, " +
                         "c'est que la règle a changé, et ce témoin doit le dire")
        }
    }

    /// La non-régression du chemin qui allait déjà bien : une pièce jointe de
    /// conversation n'a pas de sol de scène, et son couloir ne bouge pas.
    func test_unePieceJointeDeConversation_gardeSonCouloir() {
        for pieces in [1, 3, 7] {
            guard let corridor = corridor("pièces jointes ×\(pieces)",
                                          attachments: MediaGalleryLot.imagesOnly(pieces))
            else { continue }
            assertInsideWindow(corridor)
        }
    }

    // MARK: - L'INVARIANT

    /// **La place du couloir haut ne dépend NI de ce que la page montre, NI du
    /// nombre de pièces.** La référence est le lot de pièces jointes, dont la
    /// recette n'a jamais rien eu à reprocher : tout autre lot doit poser sa
    /// croix et son menu exactement aux mêmes abscisses.
    func test_laPlaceDuCouloirHaut_neDependNiDuContenuNiDuNombreDePieces() {
        guard let reference = corridor("référence — 1 pièce jointe",
                                       attachments: MediaGalleryLot.imagesOnly(1))
        else { return }

        var mesures: [(String, Corridor)] = []
        for pieces in [3, 7] {
            if let c = corridor("pièces jointes ×\(pieces)",
                                attachments: MediaGalleryLot.imagesOnly(pieces)) {
                mesures.append(("pièces jointes ×\(pieces)", c))
            }
        }
        for (nom, count, hash) in [("scène paysage ×3", 3, Self.landscapeHash),
                                   ("scène portrait ×3", 3, Self.portraitHash),
                                   ("scène paysage ×1", 1, Self.landscapeHash)] {
            let lot = Self.sceneLot(count: count, hash: hash)
            if let c = corridor(nom, attachments: lot.attachments, sceneContext: lot.context) {
                mesures.append((nom, c))
            }
        }

        for (nom, mesure) in mesures {
            XCTAssertEqual(
                mesure.close.minX, reference.close.minX, accuracy: 0.5,
                """
                la croix se déplace avec le contenu — \(reference.close.minX) sur la référence, \
                \(mesure.close.minX) sur « \(nom) » · \(mesure.diagnostic)
                """
            )
            // Le ⋯ ne se compare que là où il existe : une page scène n'en offre
            // pas (#6709), et une absence VOULUE n'est pas un déplacement.
            guard let menu = mesure.menu, let attendu = reference.menu else { continue }
            XCTAssertEqual(
                menu.maxX, attendu.maxX, accuracy: 0.5,
                """
                le menu ⋯ se déplace avec le contenu — \(attendu.maxX) sur la référence, \
                \(menu.maxX) sur « \(nom) » · \(mesure.diagnostic)
                """
            )
        }
    }

    // MARK: - Ce que le harnais a vu

    /// Un rouge de géométrie doit nommer le coupable : la racine rendue, et toute
    /// vue plus large que la fenêtre. C'est ce relevé-là qui a innocenté le pager
    /// et accusé le sol de scène, sans relancer la recette au simulateur.
    private static func describe(_ screen: RenderedScreen) -> String {
        let larges = oversized(screen.root)
        return "racine \(screen.root.bounds.size) · plus larges que la fenêtre : "
            + (larges.isEmpty ? "aucune" : larges.joined(separator: ", "))
    }

    private static func oversized(_ view: UIView) -> [String] {
        let own = view.bounds.width > window.width + 1
            ? ["\(type(of: view)) w=\(Int(view.bounds.width.rounded()))"]
            : []
        return own + view.subviews.flatMap { oversized($0) }
    }
}
