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
            .appendingPathComponent("Meeshy/Features/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_lesSources_sontLisibles() throws {
        XCTAssertTrue(try source("MeeshyComposerHost+Surfaces.swift").contains("sceneSurface"))
        XCTAssertTrue(try source("ComposerSceneSurface.swift").contains("struct ComposerSceneSurface"))
    }

    /// **Le meuble sert le retrait à la scène** — la seule surface qui compose
    /// depuis le #13864 (la surface document est partie). Le compte reste la
    /// garde : `0` est le défaut de #4918 rejoué, une trace sans retrait.
    func test_leRetrait_estServiALaScene() throws {
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
        let sites = hote.components(separatedBy: "onDeleteBackgroundSound:").count - 1
        XCTAssertEqual(sites, 1, "le retrait doit être servi à la surface SCÈNE — \(sites) site(s) trouvé(s)")
    }

    /// **Et la pastille de scène porte le menu.** Servir la valeur sans monter
    /// le menu donnerait un rappel que personne n'appelle (loi 4).
    func test_laPastilleDeScene_porteLeMenu() throws {
        let code = try source("ComposerSceneSoundHeader.swift")
        XCTAssertTrue(code.contains("ComposerSoundActionsMenu"),
                      "la pastille du fond est montée sans son menu de retrait")
        XCTAssertTrue(code.contains("supprimer: onDelete"),
                      "le menu n'est pas branché sur le retrait du FOND")
    }

    /// **La pastille de scène est MONTÉE, et une seule fois** (#5001).
    ///
    /// Sans ce témoin, le déménagement ci-dessus serait vert avec une capsule
    /// que personne n'affiche : `ComposerSceneSoundHeader` porterait sa règle et
    /// son menu dans un fichier qu'aucune surface ne monte — une vue sans
    /// consommateur n'a aucun site où rougir (leçon 483).
    ///
    /// Et le second `XCTAssertFalse` garde l'autre moitié du lot : la capsule ne
    /// doit pas rester AUSSI en bas. Deux capsules pour un même objet seraient
    /// deux vocabulaires, et la seconde se lirait comme un second son.
    /// Depuis #13839, le retrait d'un son de fond passe par le menu du bouton
    /// Son, posé une seule fois sur la scène — plus par une trace en tête.
    func test_leRetraitDuSonDeFond_aUnSeulSite_leBoutonSon() throws {
        let surface = try source("ComposerSceneSurface.swift")
        XCTAssertFalse(surface.contains("ComposerAvatarSoundBadge"),
                       "une capsule est restée en bas — deux témoins pour un seul fond")
        XCTAssertTrue(surface.contains("onDelete: onDeleteBackgroundSound"),
                      "la surface ne relaie plus le retrait du son de fond à son repos")
        let repos = try source("ComposerSceneOverlayChrome.swift")
        XCTAssertEqual(repos.components(separatedBy: "ComposerSoundActionsMenu(").count - 1, 1,
                       "un seul menu de retrait : deux se superposeraient")
    }

    /// **Le menu est PARTAGÉ, pas recopié.** Il était `private` à la surface
    /// document — c'est cette clôture qui privait le plateau de tout chemin de
    /// retrait. Le rendre `private` de nouveau, ou en écrire un second,
    /// ramènerait le défaut sous un autre nom.
    func test_leMenu_estUnSiteUnique() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/ComposerSoundActionsMenu.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("struct ComposerSoundActionsMenu"))
        XCTAssertFalse(code.contains("private struct ComposerSoundActionsMenu"),
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
