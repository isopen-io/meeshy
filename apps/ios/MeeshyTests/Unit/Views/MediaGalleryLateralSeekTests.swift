import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **La quatrième porte de la galerie : le double tap latéral d'une vidéo**
/// (#6163).
///
/// La loi est éprouvée hors écran par `MediaStageSeekTests` (SDK) : quel tiers
/// recule, lequel avance, lequel ne réclame rien, et comment le saut se borne.
/// Ce fichier tient l'autre moitié — **ce que la galerie en FAIT** — et il pose
/// ses questions sur la géographie réellement armée, parce que c'est là que
/// vivent les deux défauts que la règle pure ne peut pas attraper : une zone
/// posée sur une largeur que la règle ne reconnaît pas, et un double tap armé
/// au centre qui retarderait le tap simple de #6142.
@MainActor
final class MediaGalleryLateralSeekTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
    }

    /// Le corps d'une déclaration, borné par SES accolades — jamais par un
    /// nombre de caractères : une fenêtre fixe se remplit des retraits laissés
    /// par les commentaires retirés et rougit sur un code juste.
    private func declarationBody(startingAt marker: String, in code: String) -> String? {
        guard let start = code.range(of: marker),
              let open = code[start.upperBound...].firstIndex(of: "{") else { return nil }
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

    func test_theGuardReadsANonEmptySource() throws {
        XCTAssertGreaterThan(try source().count, 5_000)
    }

    // MARK: - La règle décide, la vue ne recopie aucun tiers

    /// **Un tiers recopié dans un `body` est un tiers qui dérive.** La décision
    /// passe par la règle du SDK, et par elle seule.
    func test_theDecision_goesThroughTheSharedRule() throws {
        let code = try source()

        XCTAssertTrue(code.contains("MediaStageSeek.resolve("),
                      "le tiers touché se décide par la règle, pas par une comparaison locale")
        XCTAssertTrue(code.contains("MediaStageSeek.lateralWidth("),
                      "les zones armées se dimensionnent par la MÊME arithmétique")
    }

    /// **Le saut est BORNÉ par la règle, pas re-borné par le player.**
    /// `skip(seconds:)` ferait une seconde arithmétique d'extrémités, sur une
    /// durée qui n'est pas celle que la règle a lue — deux bornages pour un
    /// geste, et la garantie « jamais un état invalide » perdrait son site
    /// unique.
    func test_theBoundedTarget_isWhatReachesThePlayer() throws {
        let code = try source()

        XCTAssertTrue(code.contains("seek(to: jump.to)"),
                      "la position que la règle a bornée est celle qui part au player")
        XCTAssertFalse(code.contains(".skip(seconds:"),
                       "les ±10 s ne reviennent pas par l'API du player")
    }

    // MARK: - Le centre reste immédiat

    /// **LA collision avec #6142.** Un double tap retarde le tap simple de deux
    /// cent cinquante à trois cents millisecondes. Le tap est la porte la plus
    /// fréquente du plein cadre : armer le double sur toute la scène le
    /// ralentirait partout. La zone centrale n'est donc pas « une zone qui rend
    /// `nil` » — c'est une zone qui ne porte AUCUN geste.
    func test_theCentreZone_carriesNoGestureAtAll() throws {
        let code = try source()
        guard let zones = declarationBody(startingAt: "struct MediaStageSeekZones", in: code),
              let corps = declarationBody(startingAt: "var body: some View", in: zones) else {
            XCTFail("`MediaStageSeekZones` introuvable"); return
        }

        XCTAssertTrue(corps.contains(".allowsHitTesting(false)"),
                      "le centre laisse passer le tap simple sans l'attendre")
        XCTAssertEqual(corps.components(separatedBy: "zone(width: lateral)").count - 1, 2,
                       "deux régions armées, et deux seulement")
        XCTAssertFalse(corps.contains("SpatialTapGesture"),
                       "le geste n'est monté que par les deux régions latérales, jamais sur la pile entière")
    }

    // MARK: - Le double tap de ZOOM garde l'image

    /// **La collision la plus dangereuse du lot, et elle ne peut pas se
    /// produire.** La page image porte un double tap de ZOOM depuis #4014. Les
    /// deux gestes sont séparés par la NATURE du média : le zoom appartient à
    /// l'image, qui a des pixels à inspecter et aucune durée ; le saut appartient
    /// à la vidéo, qui a une durée et aucun zoom. La règle le redit une seconde
    /// fois (`test_aMediumWithoutDuration_claimsNothingAnywhere`, SDK) — mais un
    /// hôte qui monterait les zones sur la page image retarderait quand même son
    /// zoom d'une fenêtre de double tap, sans que la règle n'y puisse rien.
    func test_theSeekZones_neverMountOnTheImagePage() throws {
        let code = try source()
        guard let image = declarationBody(startingAt: "struct GalleryImagePage", in: code) else {
            XCTFail("`GalleryImagePage` introuvable"); return
        }

        XCTAssertFalse(image.contains("MediaStageSeekZones"),
                       "une image n'a pas de piste à parcourir : ses deux taps restent le zoom et la porte")
        XCTAssertTrue(image.contains(".onTapGesture(count: 2) { toggleZoom() }"),
                      "le double tap de zoom reste intact")
    }

    /// Et elles montent sur la page VIDÉO — une règle que personne n'appelle est
    /// un moteur sans arbre : verte de partout, inerte au doigt.
    func test_theSeekZones_mountOnTheVideoPage() throws {
        let code = try source()
        guard let video = declarationBody(startingAt: "struct GalleryVideoPage", in: code) else {
            XCTFail("`GalleryVideoPage` introuvable"); return
        }

        XCTAssertTrue(video.contains("MediaStageSeekZones("),
                      "la vidéo est le seul média du lot qui ait une piste à parcourir")
        XCTAssertTrue(video.contains("isPlayerAttached"),
                      "sans piste attachée il n'y a rien à parcourir : la loi 4 refuse un geste sans effet")
    }
}
