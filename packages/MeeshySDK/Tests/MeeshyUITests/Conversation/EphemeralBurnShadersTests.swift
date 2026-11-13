import Testing
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// Le shader de la combustion (#17938) : la ressource Metal est COMPILÉE dans
/// le module et porte la fonction ; l'effet n'est actif que dans son temps ;
/// le calque agrandi a les marges de la conception.
@MainActor
@Suite("Combustion d'un éphémère — le shader Metal")
struct EphemeralBurnShadersTests {

    @Test("default.metallib est dans le bundle du module et porte meeshyEphemeralBurn")
    func metallibCarriesTheFunction() throws {
        let url = try #require(EphemeralBurnShaders.metallibURL, "default.metallib absent : le .metal n'a pas été compilé en ressource")
        let bytes = try Data(contentsOf: url)
        #expect(bytes.range(of: Data(EphemeralBurnShaders.functionName.utf8)) != nil,
                "la fonction \(EphemeralBurnShaders.functionName) manque à default.metallib")
    }

    @Test("le temps de l'effet est l'intervalle ouvert ]0, 1[")
    func activeWindow() {
        #expect(!EphemeralBurnShaders.isActive(0))
        #expect(EphemeralBurnShaders.isActive(0.01))
        #expect(EphemeralBurnShaders.isActive(0.99))
        #expect(!EphemeralBurnShaders.isActive(1))
        #expect(!EphemeralBurnShaders.isActive(-0.2))
    }

    @Test("le calque est agrandi de 24 pt sur les côtés et 48 pt en haut")
    func overhang() {
        #expect(EphemeralBurnOverhang.horizontal == 24)
        #expect(EphemeralBurnOverhang.top == 48)
        #expect(EphemeralBurnShaders.maxSampleOffset.width >= 28)
        #expect(EphemeralBurnShaders.maxSampleOffset.height >= 28)
    }

    @Test("le préchauffage termine sans lever, et se rejoue sans coût")
    func precompileIsSafe() async {
        await EphemeralBurnShaders.precompile()
        await EphemeralBurnShaders.precompile()
    }
}
