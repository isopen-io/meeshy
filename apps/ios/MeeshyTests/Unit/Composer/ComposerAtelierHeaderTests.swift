import XCTest
@testable import Meeshy
import MeeshyUI

/// #4124 — **la scène de l'atelier se centre, respire, et sa description
/// s'écrit par-dessus.**
///
/// Quatre demandes du porteur, et trois d'entre elles se prouvent par une RÈGLE
/// plutôt que par un pixel : le cadrage (`StoryCanvasFraming`, éprouvé côté
/// SDK), la place du chip (`ComposerFormatFanPlacement`) et le fait que la
/// description ne prenne plus de place au repos. La quatrième — le flou et le
/// bouton au-dessus du clavier — est une STRUCTURE de vue, d'où les gardes de
/// source qui suivent.
final class ComposerAtelierHeaderTests: XCTestCase {

    // MARK: - La place du chip de type

    /// Le résultat attendu, dit par la règle : le chip descend dans la rangée
    /// de l'atelier, contre la fermeture.
    func test_lAtelier_porteLeChipDansSaRangee() {
        XCTAssertEqual(ComposerFormatFanPlacement.place(for: .scene), .atelierHeader)
    }

    /// **Et la rangée du plateau disparaît sous l'atelier** — c'est la seconde
    /// barre que le header d'un seul tenant interdit. Le mood la garde : il n'a
    /// aucune barre haute à lui.
    func test_lesTroisPlaces_sontExclusives() {
        let places = [ComposerSurfaceKind.scene, .document, .mood]
            .map(ComposerFormatFanPlacement.place(for:))
        XCTAssertEqual(Set(places).count, 3,
                       "Une place par surface : c'est l'exhaustivité du `switch` qui interdit deux sélecteurs.")
        XCTAssertEqual(ComposerFormatFanPlacement.place(for: .mood), .plateauRow)
    }

    // MARK: - Le cadrage

    /// La directive, dite par la règle du SDK : **au repos, la scène est une
    /// carte**. Les deux exceptions sont les deux immersions que des directives
    /// antérieures ont posées, et elles tiennent.
    func test_leCadrage_carde_saufQuandLImmersionEstLeSujet() {
        XCTAssertTrue(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: false, textActive: false))
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: false, drawingActive: true, textActive: false),
                       "Le dessin reste immersif (2026-07-11).")
        XCTAssertFalse(StoryCanvasFraming.isCarded(bandPresent: true, drawingActive: false, textActive: true),
                       "L'édition texte reste immersive (2026-07-28), et elle l'emporte.")
    }

    /// Une carte, c'est une marge ET un rayon — pas seulement un facteur
    /// d'échelle. Ce témoin garde les deux, sur le cas nominal 9:16.
    func test_uneCarte_aUneMargeEtUnRayon() {
        let resultat = StoryCanvasFraming.resolve(.init(
            viewport: CGSize(width: 402, height: 874),
            headerInset: 115, bottomInset: 130, sideInset: 14,
            state: .carded, cardedCornerRadius: 22))
        XCTAssertEqual(resultat.cornerRadius, 22)
        XCTAssertLessThan(resultat.scale, 1, "La carte NE remplit PAS le viewport — c'est ce qui fait l'air autour.")
        XCTAssertGreaterThan(resultat.scale, 0)
    }

    // MARK: - Les sources

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func host() throws -> String {
        try source("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Le fusible.**
    func test_laSource_estLisibleEtNonVide() throws {
        XCTAssertGreaterThan(try host().count, 20_000)
        XCTAssertTrue(try host().contains("struct MeeshyComposerHost"))
    }

    /// **LA garde du « supprimez le Touchez pour écrire en bas ».** La
    /// description n'est plus montée SOUS la surface : elle s'ouvre par l'icône
    /// et n'occupe l'écran que quand on l'écrit. Sans ce témoin, la remettre
    /// dans le `body` reprendrait en silence la place que la scène centrée
    /// réclame.
    func test_laDescription_neVitPlusSousLaSurface() throws {
        let code = try host()
        guard let corps = declarationBody(startingAt: "var body: some View", in: code) else {
            return XCTFail("Le `body` du meuble est introuvable")
        }
        let compacte = compact(corps)
        XCTAssertTrue(compacte.contains("socle"), "Le bloc lu n'est pas celui du body.")
        XCTAssertFalse(compacte.contains("mountedSurface==.scene{sceneDescriptionSection}"),
                       "La description est revenue occuper le bas en permanence.")
        XCTAssertTrue(compacte.contains("ifeditsSceneDescription{sceneDescriptionLayer}"),
                      "Elle doit s'ouvrir en COUCHE, par-dessus tout.")
    }

    /// Le flou vient du MATÉRIAU, jamais d'un `.blur()` : ce dernier aurait
    /// re-rendu le canvas — `StoryCanvasUIView` reconstruit ses layers à chaque
    /// `layoutSubviews` — pour un effet que le système compose à coût nul.
    func test_leFlou_vientDuMateriau_jamaisDUnBlur() throws {
        let code = try host()
        guard let couche = declarationBody(startingAt: "private var sceneDescriptionLayer: some View",
                                           in: code) else {
            return XCTFail("`sceneDescriptionLayer` est introuvable")
        }
        let compacte = compact(couche)
        XCTAssertTrue(compacte.contains(".fill(.ultraThinMaterial)"))
        XCTAssertFalse(compacte.contains(".blur(radius:"),
                       "Un `.blur` re-rendrait le canvas à chaque image.")
        XCTAssertTrue(compacte.contains("placement:.keyboard"),
                      "« Terminé » se pose là où le système le met : au-dessus du clavier.")
    }

    /// L'atelier reçoit son accessoire de rangée haute — sans ce câblage, le
    /// chip n'aurait PLUS aucun site de montage : la règle l'a retiré du
    /// plateau, et rien ne le peindrait.
    func test_lAtelier_recoitSonAccessoireDeRangee() throws {
        let compacte = compact(try host())
        XCTAssertTrue(compacte.contains(".storyComposerHeaderLeadingAccessory{"))
        XCTAssertTrue(compacte.contains("atelierDescriptionButton"))
    }

    private func declarationBody(startingAt anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var body = ""
        for character in code[start.lowerBound...] {
            body.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
        }
        return nil
    }
}
