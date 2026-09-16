import XCTest
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le fond d'une scène se peint UNE fois** (#6791, directive porteur
/// 2026-09-16).
///
/// > « Il faut utiliser le fond comme canvas une fois plutôt que de refaire un
/// > cadre de canvas […] en plein écran puis encore plein écran, on a deux
/// > fonds thumbHash au lieu d'en avoir qu'une et centrer la scène ! »
///
/// ## Ce que la recette a mesuré, et pourquoi aucun témoin ne le voyait
///
/// Mesuré au simulateur le 2026-09-16, sur une scène de post ouverte en plein
/// cadre : le profil de luminance de la capture montre DEUX dégradés dorés
/// distincts au-dessus du média — `rgb(214,190,102)` puis `rgb(208,200,97)` —,
/// deux couches qui étirent le MÊME hachage dans deux cadres différents.
///
/// La galerie habille le hors-champ du cadre avec le ThumbHash
/// (`MediaStageBackdrop`, #6143) ; le canvas qu'elle monte par-dessus repeint le
/// sien (`StoryLetterboxFill`), parce que `GalleryScenePage` ne passait jamais
/// `servesLetterboxFill` et laissait donc le défaut `true`.
///
/// **La règle n'est pas neuve : c'est #6636, jamais câblé ici.** « Si rien ne
/// sort des cadres de l'image, il ne faut pas afficher le canvas : considère le
/// fond du plein écran ! » Le lecteur de stories la porte depuis ce jour-là
/// (`imageOnlyRect(of:)` → `servesLetterboxFill:`) ; la page scène de la
/// galerie, née après, ne l'a jamais reçue — une règle qui naît hors d'une
/// surface naît hors de toutes les gardes de cette surface.
///
/// ## Pourquoi la décision se lit sur `imageAspect`, et non sur le letterbox
///
/// Une page scène se PRÉSENTE déjà au rapport de son image quand la scène n'est
/// qu'une image (`PostGalleryLot.sceneAspect` → `SceneFraming.presentationAspect`).
/// Dans ce cas, les bandes de la scène 9:16 sortent du cadre présenté : les
/// peindre paie un calque et un bitmap que personne ne voit (loi 8), et leur
/// hachage transparaît là où la galerie peint déjà le sien.
///
/// Quand la scène porte un objet hors de l'image, la bande est au contraire une
/// SURFACE de composition (#4519) — l'auteur y a posé quelque chose, et elle
/// doit rester peinte. La même question décide donc du rapport ET du fond : une
/// seule loi, deux conséquences, jamais deux prédicats à tenir d'accord.
@MainActor
final class GallerySceneBackdropUnicityTests: XCTestCase {

    // MARK: - Fabriques

    private static let paysage = 16.0 / 9.0

    /// Le fond tel qu'il ENTRE : posé au centre, à l'échelle 1, sans rotation ni
    /// recadrage — ce que `SceneFraming.isUntouched` exige pour reconnaître une
    /// scène qui n'est qu'une image.
    private func fond(aspect: Double = paysage) -> ObjectV3 {
        ObjectV3(id: "fond", kind: .media,
                 anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 0,
                 transform: TransformV3(),
                 payload: ["isBackground": .bool(true),
                           "postMediaId": .string("m1"),
                           "aspectRatio": .number(aspect)])
    }

    /// Un texte posé BAS, donc dans la bande que l'image laisse : il fait de la
    /// bande une surface de composition.
    private func texteSurLaBande() -> ObjectV3 {
        ObjectV3(id: "texte", kind: .text,
                 anchor: .free(x: 0.5, y: 0.95),
                 plane: .content, z: 1,
                 transform: TransformV3(),
                 payload: ["text": .string("Paris")])
    }

    private func item(_ objets: [ObjectV3], carrierAspect: Double? = nil) -> GallerySceneItem {
        let scene = SceneV3(id: "s1", objects: objets, carrierAspect: carrierAspect)
        let document = CanvasV3(scenes: [scene])
        return GallerySceneItem(
            id: "p1#0",
            postId: "p1",
            document: document,
            sceneIndex: 0,
            carrier: StoryItem(id: "p1", createdAt: Date(timeIntervalSince1970: 0)),
            mediaId: "m1",
            aspect: PostGalleryLot.sceneAspect(document, sceneIndex: 0),
            moves: false,
            thumbHash: "hachage",
            thumbnailURL: nil
        )
    }

    // MARK: - Le fond, une seule fois

    /// **LE témoin de l'issue.** Une scène qui n'est qu'une image se présente au
    /// rapport de son image ; ses bandes sortent alors du cadre, et le canvas ne
    /// doit plus les peindre — la galerie peint déjà le hachage sous le cadre.
    func test_uneSceneQuiNestQuUneImage_neFaitPlusPeindreLesBandesAuCanvas() {
        let page = item([fond()])

        XCTAssertEqual(page.aspect, CGFloat(Self.paysage), accuracy: 0.0001,
                       "fusible : cette scène se présente bien au rapport de son image")
        XCTAssertFalse(page.servesLetterboxFill,
                       "le fond est peint par la galerie : le canvas ne le repeint pas")
    }

    /// **Le fusible.** Un objet posé sur la bande en fait une surface de
    /// composition : la scène garde son gabarit ET ses bandes. Sans ce témoin,
    /// une page qui supprimerait TOUJOURS le remplissage passerait le premier.
    func test_unObjetPoseSurLaBande_gardeLeRemplissageDuCanvas() {
        let page = item([fond(), texteSurLaBande()])

        XCTAssertEqual(page.aspect, CGFloat(SceneFraming.sceneAspect), accuracy: 0.0001,
                       "fusible : un objet hors de l'image ramène le gabarit de la scène")
        XCTAssertTrue(page.servesLetterboxFill,
                      "l'auteur a posé quelque chose dans la bande : elle reste peinte")
    }

    /// Une scène qui porte son propre cadre (`carrierAspect`) n'est jamais
    /// réinterprétée comme une image — `imageAspect` échoue FERMÉE — donc elle
    /// garde ses bandes.
    func test_uneSceneQuiPorteSonCadre_gardeSesBandes() {
        XCTAssertTrue(item([fond()], carrierAspect: Self.paysage).servesLetterboxFill)
    }

    /// Une scène sans fond image — du texte sur une couleur — n'a aucune image
    /// dont se réclamer : rien ne change pour elle.
    func test_uneSceneSansImage_gardeSesBandes() {
        XCTAssertTrue(item([texteSurLaBande()]).servesLetterboxFill)
    }

    // MARK: - La décision atteint le player

    /// **Une règle qui n'est pas TRANSMISE n'a corrigé personne.** Le défaut ne
    /// venait pas d'un mauvais calcul mais d'un fil jamais branché : la page
    /// montait le player sans lui passer la décision, et le défaut `true` du
    /// SDK repeignait la bande.
    func test_laPageScene_transmetLaDecisionAuPlayer() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"))
        let page = try XCTUnwrap(code.range(of: "struct GalleryScenePage"))
        let suite = String(code[page.lowerBound...])

        XCTAssertTrue(suite.contains("servesLetterboxFill:"),
                      "la page scène doit DIRE au player si la bande se peint")
        XCTAssertTrue(suite.contains("item.servesLetterboxFill"),
                      "et la valeur vient de la loi de la page, jamais d'un littéral")
    }
}
