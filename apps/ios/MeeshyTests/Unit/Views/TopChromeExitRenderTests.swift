import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// **LE MINI-LECTEUR SORT PAR LE HAUT, MESURÉ EN PIXELS PENDANT LE MOUVEMENT (#9048).**
///
/// Demande porteur 2026-10-01 : « Il ne faut pas faire disparaître mais remonter vers le haut pour
/// que le contenu remonte jusqu'à sortir hors d'écran et disparaître ! »
///
/// Un état final ne distingue rien : une barre effacée sur place, une barre qui descend en fondu et
/// une barre qui remonte hors de l'écran laissent toutes le même dernier écran. Ces témoins
/// FILMENT donc la colonne de gauche de l'écran, image après image, et jugent la trajectoire :
/// l'aplat du chrome doit rester accroché au bord haut, son bord bas ne faire que remonter, et le
/// contenu glisser au lieu de sauter.
///
/// La barre d'appel n'est pas filmée ici : `CallManager` a un `init` privé et `callState` en
/// `private(set)`, aucun témoin de ce bundle ne peut forcer un appel (même limite que
/// `TopChromeBandRenderTests`). Elle partage la règle (`TopChromeBarMotionTests`) et se vérifie au
/// simulateur avec l'appel de recette.
@MainActor
final class TopChromeExitRenderTests: XCTestCase {

    private var ecran: RenderedPixels?

    override func tearDown() {
        ecran?.dismount()
        ecran = nil
        super.tearDown()
    }

    /// L'aplat du chrome — lu depuis la production, jamais recopié.
    private var chrome: Color { TopChromeTint.audio.bandColor }

    /// Le contenu de l'app, sous les barres.
    private static let contenu = Color(.sRGB, red: 0, green: 0.85, blue: 0.35, opacity: 1)

    /// La colonne filmée : dans la marge de la barre, là où elle ne peint que son aplat.
    private let colonne = 6

    /// L'écran réel : `CallPresentationLayer`, sa pile, son `MiniAudioPlayerBar`, sur un
    /// coordinateur d'écoute injecté.
    private struct Ecran: View {
        let coordinateur: ConversationAudioCoordinator

        var body: some View {
            TopChromeExitRenderTests.contenu
                .modifier(CallPresentationLayer(
                    miniPlayerOnTapBody: {},
                    miniPlayerCurrentConversationId: { nil },
                    miniPlayerCoordinator: coordinateur
                ))
        }
    }

    /// Une image de la colonne : où l'aplat du chrome commence et finit, où le contenu commence.
    private struct Releve: CustomStringConvertible {
        let hautDuChrome: Int?
        let basDuChrome: Int?
        let hautDuContenu: Int?

        var description: String {
            "chrome \(hautDuChrome.map(String.init) ?? "∅")…\(basDuChrome.map(String.init) ?? "∅"), " +
            "contenu dès \(hautDuContenu.map(String.init) ?? "∅")"
        }
    }

    private func coordinateur(actif: Bool) -> ConversationAudioCoordinator {
        let coord = ConversationAudioCoordinator(engine: MockAudioPlaybackEngine())
        if actif { coord.test_setActiveContext(attachmentId: "a1", conversationId: "conv-A") }
        return coord
    }

    private func monter(_ vue: some View, file: StaticString = #filePath, line: UInt = #line) throws -> RenderedPixels {
        let rendu = try RenderedPixels(vue, file: file, line: line)
        ecran = rendu
        let bas = Int(rendu.root.bounds.height) - 90
        XCTAssertTrue(
            rendu.settle(borne: 4) { rendu.pixel(colonne, bas, matches: Self.contenu) },
            "Le contenu n'a jamais été peint : aucun verdict sur le chrome n'est recevable.",
            file: file, line: line
        )
        return rendu
    }

    private func releve(_ rendu: RenderedPixels) -> Releve {
        let hauteur = Int(rendu.root.bounds.height)
        let haut = (0..<hauteur).first { rendu.pixel(colonne, $0, matches: chrome) }
        let bas = haut.map { debut in
            var y = debut
            while y + 1 < hauteur, rendu.pixel(colonne, y + 1, matches: chrome) { y += 1 }
            return y
        }
        let contenu = (0..<hauteur).first { rendu.pixel(colonne, $0, matches: Self.contenu) }
        return Releve(hautDuChrome: haut, basDuChrome: bas, hautDuContenu: contenu)
    }

    /// Capture image après image jusqu'à ce que `fin` passe, ou la borne.
    private func filmer(_ rendu: RenderedPixels, borne: TimeInterval, jusqua fin: (Releve) -> Bool) -> [Releve] {
        var images: [Releve] = []
        let echeance = Date().addingTimeInterval(borne)
        while Date() < echeance {
            rendu.capture()
            let image = releve(rendu)
            images.append(image)
            if fin(image) { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.016))
        }
        return images
    }

    // MARK: - La sortie

    /// **LE témoin de la demande.** Le lecteur seul occupe le haut ; la croix le ferme. La barre et
    /// la bande de la barre système remontent ensemble jusqu'à sortir par le bord haut, et le
    /// contenu de l'app remonte dans le même mouvement.
    func test_fermer_lecteurSeul_barreEtBandeSortentParLeHaut_etLeContenuSuit() throws {
        let coord = coordinateur(actif: true)
        let rendu = try monter(Ecran(coordinateur: coord))
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.settle(borne: 4) {
                let image = releve(rendu)
                return image.hautDuChrome == 0 && (image.basDuChrome ?? 0) > encart + 20
            },
            "Préalable : la barre et sa bande doivent occuper le haut — \(releve(rendu))."
        )
        let repos = releve(rendu)
        let basAuRepos = try XCTUnwrap(repos.basDuChrome)
        let contenuAuRepos = try XCTUnwrap(repos.hautDuContenu)

        coord.close()

        let images = filmer(rendu, borne: 3) { $0.hautDuChrome == nil && ($0.hautDuContenu ?? .max) <= encart + 1 }
        let film = images.map(\.description).joined(separator: "\n")

        XCTAssertTrue(
            images.allSatisfy { ($0.hautDuChrome ?? 0) <= 1 },
            "L'aplat doit rester accroché au bord HAUT de l'écran pendant toute la sortie : il sort par " +
            "le haut. Une image où il commence plus bas, c'est la bande effacée d'un coup au-dessus d'une " +
            "barre qui s'en va autrement.\n\(film)"
        )
        let bas = images.compactMap(\.basDuChrome)
        XCTAssertTrue(
            zip(bas, bas.dropFirst()).allSatisfy { $1 <= $0 + 2 },
            "Le bord bas de l'aplat ne doit faire que REMONTER.\n\(film)"
        )
        XCTAssertTrue(
            bas.contains { $0 > 4 && $0 < basAuRepos - 4 },
            "Aucune image intermédiaire : la barre a disparu au lieu de remonter.\n\(film)"
        )
        XCTAssertTrue(
            images.compactMap(\.hautDuContenu).contains { $0 > encart + 3 && $0 < contenuAuRepos - 3 },
            "Le contenu doit GLISSER vers le haut avec la barre, pas sauter à sa place finale.\n\(film)"
        )
        let derniere = try XCTUnwrap(images.last)
        XCTAssertNil(derniere.hautDuChrome, "Il ne doit plus rester un pixel du chrome.\n\(film)")
        XCTAssertLessThanOrEqual(
            derniere.hautDuContenu ?? .max, encart + 1,
            "À la fin, le contenu commence sous la barre système.\n\(film)"
        )
    }

    // MARK: - L'arrivée

    /// Le mouvement inverse : une écoute démarre, la barre descend du haut sous sa bande, et le
    /// contenu s'écarte en glissant.
    func test_demarrer_lecteur_barreDescendDuHaut_etLeContenuSEcarte() throws {
        let coord = coordinateur(actif: false)
        let rendu = try monter(Ecran(coordinateur: coord))
        let encart = Int(rendu.safeAreaTop)

        XCTAssertTrue(
            rendu.settle(borne: 4) { releve(rendu).hautDuChrome == nil },
            "Préalable : aucune barre, aucun chrome — \(releve(rendu))."
        )

        coord.test_setActiveContext(attachmentId: "a1", conversationId: "conv-A")

        var stables = 0
        var precedente: Releve?
        let images = filmer(rendu, borne: 3) { image in
            let immobile = image.hautDuChrome != nil
                && image.basDuChrome == precedente?.basDuChrome
                && image.hautDuContenu == precedente?.hautDuContenu
            stables = immobile ? stables + 1 : 0
            precedente = image
            return stables >= 6
        }
        let film = images.map(\.description).joined(separator: "\n")
        let finale = try XCTUnwrap(images.last)
        let basFinal = try XCTUnwrap(finale.basDuChrome, "La barre n'est jamais apparue.\n\(film)")
        let contenuFinal = try XCTUnwrap(finale.hautDuContenu)

        XCTAssertTrue(
            images.allSatisfy { ($0.hautDuChrome ?? 0) <= 1 },
            "L'aplat doit pendre du bord haut pendant toute l'arrivée : la barre descend sous sa bande.\n\(film)"
        )
        let bas = images.compactMap(\.basDuChrome)
        XCTAssertTrue(
            zip(bas, bas.dropFirst()).allSatisfy { $1 >= $0 - 2 },
            "Le bord bas de l'aplat ne doit faire que DESCENDRE.\n\(film)"
        )
        XCTAssertTrue(
            bas.contains { $0 > encart + 3 && $0 < basFinal - 3 },
            "Aucune image intermédiaire : la barre est apparue au lieu de descendre.\n\(film)"
        )
        XCTAssertTrue(
            images.compactMap(\.hautDuContenu).contains { $0 > encart + 3 && $0 < contenuFinal - 3 },
            "Le contenu doit GLISSER vers le bas, pas sauter sous la barre.\n\(film)"
        )
    }
}
