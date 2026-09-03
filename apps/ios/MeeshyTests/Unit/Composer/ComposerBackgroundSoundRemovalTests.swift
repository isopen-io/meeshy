import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Le son de fond se retire, et depuis les DEUX surfaces** (#4930).
///
/// ## Le défaut que ce lot ferme
///
/// `ComposerSoundColumn.opensEditor` refuse d'ouvrir la feuille pour un son
/// EMPRUNTÉ — à juste titre, pour protéger le crédit de son auteur (#4668). Or
/// le retrait vivait DANS cette feuille, par une décision de site unique tout
/// aussi juste (#4696 : « trois boutons dispersés auraient été trois lois »).
///
/// > Fermer la porte avait donc emporté le RETRAIT avec elle, sans que personne
/// > le décide. La question à poser à une garde n'est pas « refuse-t-elle la
/// > bonne chose ? » mais **« qu'est-ce qui empruntait la même porte ? »**
///
/// ## Pourquoi ce fichier compte des CONSOMMATEURS
///
/// #4918 est né d'une valeur qui avait **un seul** consommateur là où il en
/// fallait deux : `avatarBadgeSound` était servi à `documentSurface` et pas à
/// `sceneSurface`, si bien qu'un son de fond posé sur une story ne laissait
/// aucune trace. Rien ne rougissait — une valeur servie une fois est
/// parfaitement valide.
///
/// Le même piège guette ce lot : servir le retrait à une surface et pas à
/// l'autre. Ces témoins comptent donc les sites, ce qu'aucun test de règle ne
/// peut faire.
@MainActor
final class ComposerBackgroundSoundRemovalTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_lesSources_sontLisibles() throws {
        XCTAssertTrue(try source("MeeshyComposerHost+Surfaces.swift").contains("sceneSurface"))
        XCTAssertTrue(try source("ComposerSceneSurface.swift").contains("struct ComposerSceneSurface"))
        XCTAssertTrue(try source("ComposerDocumentSurface.swift").contains("struct ComposerDocumentSurface"))
    }

    /// **Le meuble sert le retrait aux DEUX surfaces.**
    ///
    /// Le compte est la garde : `1` est le défaut de #4918 rejoué, et il se lit
    /// exactement comme un câblage complet tant qu'on ne compte pas.
    func test_leRetrait_estServiAuxDeuxSurfaces() throws {
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
        let sites = hote.components(separatedBy: "onDeleteBackgroundSound:").count - 1
        XCTAssertEqual(sites, 2,
                       "le retrait doit être servi à la surface DOCUMENT et à la surface "
                       + "SCÈNE. \(sites) site(s) trouvé(s) — un seul est le défaut de #4918 "
                       + "rejoué : la trace existait, mais une seule surface la recevait.")
    }

    /// **Et les deux pastilles portent le menu.** Servir la valeur sans monter
    /// le menu donnerait un rappel que personne n'appelle — la loi 4 vue depuis
    /// l'autre bout de la chaîne.
    func test_lesDeuxPastilles_portentLeMenu() throws {
        for fichier in ["ComposerDocumentSurface.swift", "ComposerSceneSurface.swift"] {
            let code = try source(fichier)
            XCTAssertTrue(code.contains("ComposerSoundDeletionMenu"),
                          "\(fichier) monte la pastille du fond sans son menu de retrait")
            XCTAssertTrue(code.contains("supprimer: onDeleteBackgroundSound"),
                          "\(fichier) monte le menu sans le brancher sur le retrait du FOND")
        }
    }

    /// **Le menu est PARTAGÉ, pas recopié.** Il était `private` à la surface
    /// document — c'est cette clôture qui privait le plateau de tout chemin de
    /// retrait. Le rendre `private` de nouveau, ou en écrire un second,
    /// ramènerait le défaut sous un autre nom.
    func test_leMenu_estUnSiteUnique() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSoundDeletionMenu.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("struct ComposerSoundDeletionMenu"))
        XCTAssertFalse(code.contains("private struct ComposerSoundDeletionMenu"),
                       "le rendre privé le retirerait à la surface scène, qui n'en a pas d'autre")
    }

    // MARK: - La règle du retrait, et ses deux `nil` qui ne disent pas la même chose

    private func fond(id: String) -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = true
        return son
    }

    /// Un fond RÉEL se retire.
    func test_unFondReel_seRetire() {
        let son = fond(id: "bg-1")
        XCTAssertEqual(
            ComposerBackgroundSoundReplacement.supersededId(background: son, audioObjects: [son]),
            "bg-1")
    }

    /// **Un fond LEGACY n'a rien à retirer, et le menu ne doit pas paraître.**
    ///
    /// `resolvedBackgroundAudio` le synthétise depuis `backgroundAudioId` : il
    /// n'existe dans aucun tableau. Offrir « Supprimer le son » sur lui
    /// promettrait un retrait qui n'aurait pas lieu — pire qu'une absence, parce
    /// que l'auteur croirait avoir agi.
    func test_unFondLegacy_nOffrePasDeRetrait() {
        XCTAssertNil(
            ComposerBackgroundSoundReplacement.supersededId(
                background: fond(id: "legacy-bg-audio"), audioObjects: []))
    }
}
