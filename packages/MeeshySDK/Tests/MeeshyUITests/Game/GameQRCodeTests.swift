import Testing
@testable import MeeshyUI

/// L'ENCODEUR QR (#9554) — le lien de parrainage part en carré QR sur la carte du jeu, et ce carré
/// est le MÊME que celui du web. Le témoin est un VECTEUR CONNU : chaque matrice de référence sort
/// de libqrencode, et l'encodeur doit rendre la même, module pour module — version, masque,
/// correction d'erreur et entrelacement compris. Compter des modules ne prouverait rien : une
/// matrice fausse a la bonne taille.
@Suite("Jeu Meeshy — encodeur QR")
struct GameQRCodeTests {

    private func rows(_ matrix: GameQRMatrix?) -> [String] {
        (matrix?.modules ?? []).map { row in row.map { $0 ? "1" : "0" }.joined() }
    }

    @Test("la matrice est celle d'une implémentation indépendante", arguments: GameQRVectors.all)
    func matrixMatchesTheReference(reference: GameQRReference) {
        let matrix = GameQRCode.encode(reference.text)
        #expect(matrix?.version == reference.version)
        #expect(matrix?.size == reference.rows.count)
        #expect(rows(matrix) == reference.rows)
    }

    @Test("la plus petite version qui porte le texte en correction M : 26 octets tiennent en v2, 27 passent en v3")
    func smallestVersion() {
        #expect(GameQRCode.encode(String(repeating: "x", count: 14))?.version == 1)
        #expect(GameQRCode.encode(String(repeating: "x", count: 15))?.version == 2)
        #expect(GameQRCode.encode(String(repeating: "x", count: 26))?.version == 2)
        #expect(GameQRCode.encode(String(repeating: "x", count: 27))?.version == 3)
        #expect(GameQRCode.encode(String(repeating: "x", count: 27))?.size == 29)
    }

    @Test("les octets comptent, pas les caractères")
    func bytesNotCharacters() {
        #expect(GameQRCode.encode(String(repeating: "é", count: 7))?.version == 1)
        #expect(GameQRCode.encode(String(repeating: "é", count: 8))?.version == 2)
    }

    @Test("un plafond de version : au-delà, pas de matrice plutôt qu'une matrice illisible")
    func versionCeiling() {
        let text = String(repeating: "x", count: 27)
        #expect(GameQRCode.encode(text, maxVersion: 3)?.version == 3)
        #expect(GameQRCode.encode(text, maxVersion: 2) == nil)
        #expect(GameQRCode.encode(text, maxVersion: 0) == nil)
        #expect(GameQRCode.encode(text, maxVersion: -3) == nil)
        #expect(GameQRCode.encode(String(repeating: "x", count: 3000)) == nil)
    }

    @Test("un carré de `size` rangées de `size` modules, et le masque retenu")
    func squareShape() throws {
        let matrix = try #require(GameQRCode.encode("https://meeshy.me/r/Ab3dE9"))
        #expect(matrix.modules.count == 25)
        #expect(matrix.modules.allSatisfy { $0.count == 25 })
        #expect((0...7).contains(matrix.mask))
    }

    @Test("le même texte rend la même matrice")
    func deterministic() {
        #expect(GameQRCode.encode("https://meeshy.me/r/Ab3dE9") == GameQRCode.encode("https://meeshy.me/r/Ab3dE9"))
    }
}
