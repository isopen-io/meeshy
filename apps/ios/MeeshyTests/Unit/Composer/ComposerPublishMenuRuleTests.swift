import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Publier propose le format et l'agencement quand la publication porte
/// plusieurs médias** (#6502, directive porteur 2026-09-14).
///
/// > « dès qu'on publie plus d'une image, ou que la publication a une vidéo,
/// > lors de l'appui sur publier, on a un menu liquid glass avec choix,
/// > sous-menu dépliable pour les posts de comment agencer les médias —
/// > supprimer le sélecteur en haut qui permet de choisir ce qu'on publie ! »
///
/// La règle est PURE : ce qui décide du menu, de ses entrées et du canal d'envoi
/// s'éprouve sans monter une vue. Les gardes de source de la fin ne portent que
/// sur ce qu'aucune valeur ne peut dire — l'éventail n'est plus monté, la
/// flèche monte le menu, le brouillon transporte l'agencement choisi.
final class ComposerPublishMenuRuleTests: XCTestCase {

    // MARK: - Fabriques

    private func image(_ nom: String) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/\(nom).jpg"), mimeType: "image/jpeg", durationMs: nil)
    }

    private func video(_ nom: String, ms: Int) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/\(nom).mp4"), mimeType: "video/mp4", durationMs: ms)
    }

    private func son(_ nom: String) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/\(nom).m4a"), mimeType: "audio/m4a", durationMs: 12_000)
    }

    private func slide(id: String, objets: [(id: String, kind: StoryMediaKind)] = [], texte: String? = nil) -> StorySlide {
        var s = StorySlide()
        s.id = id
        s.effects.mediaObjects = objets.map {
            StoryMediaObject(id: $0.id, mediaURL: "file:///tmp/\($0.id)", kind: $0.kind, aspectRatio: 1.0)
        }
        if let texte {
            s.effects.textObjects = [StoryTextObject(id: "t-\(id)", text: texte, x: 0.5, y: 0.5)]
        }
        return s
    }

    private func kinds(documentMedia: [ComposerDocumentMedia] = [],
                       slides: [StorySlide] = [],
                       slideImageIds: Set<String> = [],
                       bridgedSources: Set<URL> = []) -> [FeedMediaType] {
        ComposerPublishMenuRule.mediaKinds(slides: slides,
                                           slideImageIds: slideImageIds,
                                           documentMedia: documentMedia,
                                           bridgedSources: bridgedSources)
    }

    // MARK: - QUAND le menu paraît — la directive, au mot près

    func test_uneImage_publieDirectement_sansMenu() {
        XCTAssertFalse(ComposerPublishMenuRule.offersMenu(mediaKinds: kinds(documentMedia: [image("a")])))
    }

    func test_deuxImages_ouvrentLeMenu() {
        XCTAssertTrue(ComposerPublishMenuRule.offersMenu(
            mediaKinds: kinds(documentMedia: [image("a"), image("b")])))
    }

    /// Ce n'est PAS `qualifiesAsReel` : celui-là exige 3 s de vidéo. Une vidéo
    /// d'une seconde ne fait pas un réel, et elle ouvre pourtant le menu.
    func test_uneVideoDUneSeconde_ouvreLeMenu() {
        XCTAssertTrue(ComposerPublishMenuRule.offersMenu(
            mediaKinds: kinds(documentMedia: [video("v", ms: 1_000)])))
    }

    /// …et l'audio ne compte pas, là où `qualifiesAsReel` le compte.
    func test_unSonSeul_publieDirectement_sansMenu() {
        XCTAssertFalse(ComposerPublishMenuRule.offersMenu(mediaKinds: kinds(documentMedia: [son("s")])))
    }

    func test_leTexteSeul_publieDirectement_sansMenu() {
        XCTAssertFalse(ComposerPublishMenuRule.offersMenu(
            mediaKinds: kinds(slides: [slide(id: "s1", texte: "bonjour")])))
    }

    /// « Toutes slides confondues » — le piège de `reelGate`, qui ne lit que la
    /// slide courante.
    func test_lesImages_seComptentToutesSlidesConfondues() {
        let slides = [slide(id: "s1", objets: [("o1", .image)]),
                      slide(id: "s2", objets: [("o2", .image)])]
        XCTAssertTrue(ComposerPublishMenuRule.offersMenu(mediaKinds: kinds(slides: slides)))
    }

    /// L'image de FOND de l'atelier ne vit pas dans `effects` : elle est une
    /// image comme une autre pour l'auteur qui l'a posée.
    func test_lImageDeFondDUneSlide_compteCommeUneImage() {
        let slides = [slide(id: "s1"), slide(id: "s2", objets: [("o2", .image)])]
        XCTAssertTrue(ComposerPublishMenuRule.offersMenu(
            mediaKinds: kinds(slides: slides, slideImageIds: ["s1"])))
    }

    /// Un média du document POSÉ sur la scène vit à deux endroits — la liste du
    /// meuble et un objet de slide. Il ne compte qu'une fois : sans cela, une
    /// seule photo ouvrirait le menu.
    func test_unMediaDuDocumentPoseSurLaScene_neCompteQuUneFois() {
        let photo = image("a")
        let slides = [slide(id: "s1", objets: [("o1", .image)])]
        let vus = kinds(documentMedia: [photo], slides: slides, bridgedSources: [photo.url])
        XCTAssertEqual(vus, [.image])
        XCTAssertFalse(ComposerPublishMenuRule.offersMenu(mediaKinds: vus))
    }

    // MARK: - CE QUE le menu offre

    private let candidats: [ComposerFormat] = [.story, .post, .reel]

    func test_seulsLesFormatsDeLaPorte_apparaissent_dansSonOrdre() {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post, .reel],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        XCTAssertEqual(entrees.map(\.format), candidats)
        XCTAssertFalse(entrees.map(\.format).contains(.status),
                       "Un format que la porte ne propose pas n'a rien à faire au menu.")
    }

    func test_leReel_estGrise_avecSaRaison() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: [.story, .post],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let reel = try XCTUnwrap(entrees.first { $0.format == .reel })
        XCTAssertFalse(reel.isChoosable)
        XCTAssertEqual(reel.reason,
                       ComposerFormatAvailability.reason(for: .reel, carriesMoreThanText: true),
                       "La raison est celle de la règle de disponibilité — jamais une phrase recopiée.")
        XCTAssertFalse(reel.reason?.isEmpty ?? true, "Un refus sans raison n'enseigne rien.")
        XCTAssertTrue(try XCTUnwrap(entrees.first { $0.format == .post }).isChoosable)
    }

    func test_leSousMenuPost_nExistequAvecPlusDUneSlide() throws {
        let une = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                  carriesMoreThanText: true, slideCount: 1,
                                                  layoutsTravel: true)
        XCTAssertEqual(try XCTUnwrap(une.first { $0.format == .post }).layouts, [],
                       "Une slide seule n'a rien à disposer : Post est un bouton simple.")

        let deux = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                   carriesMoreThanText: true, slideCount: 2,
                                                   layoutsTravel: true)
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .post }).layouts, ComposerMosaicChoice.ordered)
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .story }).layouts, [],
                       "Une story ne s'affiche jamais en mosaïque.")
        XCTAssertEqual(try XCTUnwrap(deux.first { $0.format == .reel }).layouts, [],
                       "Le sous-menu est celui du POST, et de lui seul.")
    }

    /// Le canal document ne téléverse que les fichiers du meuble. Sous l'atelier,
    /// les médias vivent dans des objets qu'il ne voit pas : offrir « Post +
    /// agencement » y publierait un canevas SANS ses fichiers.
    func test_leSousMenuPost_seRetire_quandLeDocumentNePortePasLesFichiers() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                      carriesMoreThanText: true, slideCount: 3,
                                                      layoutsTravel: false)
        XCTAssertEqual(try XCTUnwrap(entrees.first { $0.format == .post }).layouts, [])
    }

    func test_chaqueEntree_publieEnUnSeulGeste() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: candidats, offered: candidats,
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let post = try XCTUnwrap(entrees.first { $0.format == .post })
        XCTAssertEqual(post.choices, ComposerMosaicChoice.ordered.map { ComposerPublishChoice(format: .post, layout: $0) })
        XCTAssertEqual(try XCTUnwrap(entrees.first { $0.format == .story }).choices,
                       [ComposerPublishChoice(format: .story, layout: nil)])
    }

    // MARK: - Le menu entier : absent, ou un vrai choix

    func test_leMenu_estAbsent_sansLaMatiereQuiLAppelle() {
        XCTAssertNil(ComposerPublishMenuRule.menu(mediaKinds: [.image], candidates: candidats,
                                                  offered: candidats, carriesMoreThanText: true,
                                                  slideCount: 1, layoutsTravel: true))
    }

    func test_leMenu_estAbsent_quandIlNOffreQuUnSeulChoix() {
        XCTAssertNil(ComposerPublishMenuRule.menu(mediaKinds: [.image, .image], candidates: [.post],
                                                  offered: [.post], carriesMoreThanText: true,
                                                  slideCount: 1, layoutsTravel: true),
                     "Une entrée unique sans sous-menu est une affordance sans choix (loi 4).")
    }

    func test_leMenu_offreLesAgencements_memeAUnSeulFormat() throws {
        let menu = try XCTUnwrap(ComposerPublishMenuRule.menu(mediaKinds: [.image, .image], candidates: [.post],
                                                              offered: [.post], carriesMoreThanText: true,
                                                              slideCount: 2, layoutsTravel: true))
        XCTAssertEqual(menu.first?.layouts, ComposerMosaicChoice.ordered)
    }

    // MARK: - OÙ part la publication choisie

    func test_leCanalSuitLeChoix() {
        typealias R = ComposerPublishMenuRule.Route
        let cas: [(ComposerSurfaceKind, ComposerPublishChoice, R)] = [
            (.scene, .init(format: .story, layout: nil), .atelier),
            (.scene, .init(format: .post, layout: nil), .atelier),
            (.scene, .init(format: .post, layout: .wave), .document),
            (.document, .init(format: .story, layout: nil), .storyScene),
            (.document, .init(format: .post, layout: nil), .document),
            (.document, .init(format: .post, layout: .hero), .document),
            (.document, .init(format: .reel, layout: nil), .document),
            (.mood, .init(format: .status, layout: nil), .document)
        ]
        for (surface, choix, attendu) in cas {
            XCTAssertEqual(ComposerPublishMenuRule.route(surface: surface, choice: choix), attendu,
                           "\(surface) · \(choix)")
        }
    }

    func test_leDocument_portetousLesFichiers_seulementQuandChaqueObjetEstPasseParLeMeuble() {
        let slides = [slide(id: "s1", objets: [("o1", .image)]), slide(id: "s2", objets: [("o2", .video)])]
        XCTAssertTrue(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: [], bridgedObjectIds: ["o1", "o2"]))
        XCTAssertFalse(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: [], bridgedObjectIds: ["o1"]))
        XCTAssertFalse(ComposerPublishMenuRule.documentCarriesEveryMedia(
            slides: slides, slideImageIds: ["s1"], bridgedObjectIds: ["o1", "o2"]),
                       "Une image de fond de l'atelier n'est pas un fichier du meuble.")
    }

    // MARK: - L'agencement choisi ARRIVE dans le brouillon

    func test_lAgencementChoisi_arriveDansLeCanvasPublie() throws {
        let entrees = ComposerPublishMenuRule.entries(candidates: [.post], offered: [.post],
                                                      carriesMoreThanText: true, slideCount: 2,
                                                      layoutsTravel: true)
        let slides = [slide(id: "s1", objets: [("o1", .image)]), slide(id: "s2", objets: [("o2", .image)])]
        for choix in try XCTUnwrap(entrees.first).choices {
            let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
                format: choix.format, sceneIsPresent: true, slides: slides, layout: choix.layout))
            XCTAssertEqual(porte.canvasV3?.layout, choix.layout)
        }
    }

    private func hostCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ texte: String) -> String {
        texte.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func bloc(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var corps = ""
        for c in code[debut.lowerBound...] {
            corps.append(c)
            if c == "{" { profondeur += 1 }
            if c == "}" {
                profondeur -= 1
                if profondeur == 0 { return corps }
            }
        }
        return nil
    }

    func test_leBrouillon_transporteLeChoixDuGeste() throws {
        let code = try hostCode()
        let brouillon = try XCTUnwrap(bloc("func documentDraft(", dans: code),
                                      "Le brouillon est introuvable — la garde ne mesurerait RIEN.")
        let compacte = compact(brouillon)
        XCTAssertTrue(compacte.contains("format:choice.format"), "Le format du GESTE, pas celui d'ouverture.")
        XCTAssertTrue(compacte.contains("forcePlainPost:choice.format==.post"))
        XCTAssertTrue(compacte.contains("layout:choice.layout"),
                      "Sans cette ligne l'agencement choisi au menu partirait dans le repli.")
    }

    // MARK: - Gardes de source retournées : l'éventail est parti, la flèche porte le choix

    func test_lEventail_nEstPlusMonteNullePart() throws {
        let code = compact(try hostCode())
        XCTAssertGreaterThan(code.count, 20_000, "Unité du meuble vide — garde verte par omission.")
        for disparu in ["ComposerFormatFan(", "formatChip", "plateauTools", "mountsFormatFan", "formatFan:"] {
            XCTAssertFalse(code.contains(compact(disparu)), "« \(disparu) » est revenu dans le meuble.")
        }
    }

    func test_laFleche_monteLeMenu() throws {
        let code = try hostCode()
        let fleche = try XCTUnwrap(bloc("var publishButton", dans: code))
        XCTAssertTrue(compact(fleche).contains("ComposerPublishMenu("),
                      "La flèche porte le menu : c'est là que l'auteur sait ce qu'il publie.")
        XCTAssertTrue(compact(fleche).contains("publishCapsule("),
                      "…dans l'habillage partagé, qui porte le gate.")
    }
}
