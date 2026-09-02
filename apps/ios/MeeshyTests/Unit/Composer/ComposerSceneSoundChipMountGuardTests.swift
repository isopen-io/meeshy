import XCTest
@testable import Meeshy

/// **La puce sonore est bien MONTÉE sur la scène du meuble** (#4722, directive
/// porteur 2026-09-01 : « en chip resizable sur la scène »).
///
/// Le meuble savait DÉJÀ répondre à cette puce — `onItemEdit` traite
/// `case .audio` depuis le #4671 — mais aucune surface ne la peignait :
/// `AudioForegroundChip` n'était monté que par l'atelier `StoryComposerView` et
/// par le viewer. La branche était vivante, l'objet invisible.
///
/// > Un rappel câblé pour un objet que personne ne rend ne rougit nulle part.
/// > C'est la forme la plus discrète de « feature non alimentée » : le code du
/// > consommateur est là, complet, et il attend un producteur qui n'existe pas.
///
/// Ces témoins lisent la SOURCE parce que ce qu'ils prouvent est un ASSEMBLAGE,
/// pas une valeur — et parce que le point qui se perdrait en silence est
/// l'endroit du montage, pas son existence.
final class ComposerSceneSoundChipMountGuardTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private var surface: String {
        get throws { try source("ComposerSceneSurface.swift") }
    }

    /// La puce est montée, et en mode COMPOSER — le mode lecteur n'a ni
    /// déplacement ni redimensionnement.
    func test_laPuceSonore_estMontee_enModeComposer() throws {
        let code = try surface
        XCTAssertTrue(code.contains("AudioForegroundChip("))
        XCTAssertTrue(code.contains("mode: .composer"))
    }

    /// **Par le slot qui ne CAPTURE pas.** `canvasOverlay` éteint le hit-test du
    /// canvas (`allowsHitTesting(canvasOverlay == nil)`) : y faire passer la
    /// puce aurait rendu la scène entière inerte pour le texte, le sticker et
    /// le média — un défaut qu'on ne voit pas en regardant la puce.
    func test_ellePasse_parLeSlotQuiNeCapturePas() throws {
        XCTAssertTrue(try surface.contains("objectOverlay:"))
    }

    /// **Pas de puce pendant le DESSIN**, comme dans l'atelier : le calque de
    /// tracé prend la carte entière, et une puce qui resterait dessus
    /// promettrait un doigt qu'elle ne recevrait pas.
    func test_laPuce_seRetirePendantLeDessin() throws {
        XCTAssertTrue(try surface.contains("objectOverlay: drawingSurface == nil"))
    }

    /// **Le FOND n'est pas une puce.** Un son de fond est un attribut de la
    /// scène — il porte son crédit à côté de l'avatar, pas une capsule posée au
    /// milieu de l'image. Le peindre ici ferait lire deux pistes là où il n'y
    /// en a qu'une, et un doublon de cette forme ne se lit pas comme un
    /// doublon.
    func test_leSonDeFOND_nEstPasPeintCommeUnePuce() throws {
        XCTAssertTrue(try surface.contains("filter { $0.isBackground != true }"))
    }

    /// **Le binding résout par IDENTIFIANT, jamais par index.**
    ///
    /// C'est LA décision qui se perdrait en silence : l'atelier capture l'index
    /// de l'énumération et le relit à chaque accès. C'est juste tant que la
    /// liste ne bouge pas — et un son supprimé pendant qu'un autre est saisi
    /// décale tous ceux qui le suivent, si bien que le geste finit sur le
    /// voisin. Le témoin épingle la forme sûre parce que la forme fausse
    /// PASSERAIT tous les autres témoins de ce fichier.
    func test_leBinding_resoutParIdentifiant_pasParIndex() throws {
        let code = try surface
        XCTAssertTrue(code.contains("first { $0.id == objet.id }"))
        XCTAssertTrue(code.contains("firstIndex(where: { $0.id == objet.id })"))
    }

    /// Une écriture dont l'objet a DISPARU est ignorée plutôt que réinsérée :
    /// relâcher un geste sur un son qu'on vient de supprimer ne doit pas le
    /// faire revenir.
    func test_uneEcritureSurUnSonDisparu_neLeRessuscitePas() throws {
        let code = try surface
        guard let set = code.range(of: "set: { nouveau in") else {
            return XCTFail("le binding doit avoir un setter explicite")
        }
        let suite = String(code[set.lowerBound...].prefix(400))
        XCTAssertTrue(suite.contains("else { return }"),
                      "l'absence d'index doit sortir, jamais ajouter")
    }

    /// **Le meuble sert la porte qui MÈNE à cette puce.** Le montage seul ne
    /// suffit pas : sans chemin d'ajout, la surface peindrait parfaitement une
    /// liste toujours vide — c'est exactement l'état du 2026-09-01 au matin,
    /// à la puce près.
    func test_leCheminDAjout_existeAussi() {
        XCTAssertTrue(ComposerSceneCapabilities.doors.contains(.sound))
    }
}
