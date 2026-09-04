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
        // **Le compte se fait sur les DEUX fichiers depuis le #5069.** La
        // surface DOCUMENT a quitté `+Surfaces` pour `+DocumentSurface` — le
        // fichier d'origine dépassait le plafond de 1200 lignes.
        //
        // Sans cette somme, la garde tomberait à `1` et rendrait son propre
        // message d'échec : « un seul est le défaut de #4918 rejoué ». Elle
        // accuserait un câblage INTACT d'être à moitié fait, parce qu'elle
        // chercherait au mauvais endroit. C'est le piège propre aux gardes qui
        // lisent un fichier PAR SON NOM : elles ne suivent pas le code qui
        // déménage, et leur rouge désigne alors la mauvaise cause.
        //
        // Ce que la règle dit n'a pas changé : le retrait est servi aux deux
        // surfaces. Ce qui change est le nombre de fichiers où elles vivent.
        // Un seul `try`, en TÊTE : Swift refuse un `try` à droite d'un opérateur
        // non affectant — il ne couvre que l'expression de tête d'une
        // affectation, et le couvre alors ENTIÈREMENT.
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
            + source("MeeshyComposerHost+DocumentSurface.swift")
        let sites = hote.components(separatedBy: "onDeleteBackgroundSound:").count - 1
        XCTAssertEqual(sites, 2,
                       "le retrait doit être servi à la surface DOCUMENT et à la surface "
                       + "SCÈNE. \(sites) site(s) trouvé(s) — un seul est le défaut de #4918 "
                       + "rejoué : la trace existait, mais une seule surface la recevait.")
    }

    /// **Et les deux pastilles portent le menu.** Servir la valeur sans monter
    /// le menu donnerait un rappel que personne n'appelle — la loi 4 vue depuis
    /// l'autre bout de la chaîne.
    ///
    /// **Le site de la pastille de SCÈNE a changé au #5001** : la capsule est
    /// montée en tête de la surface et vit désormais dans
    /// `ComposerSceneSoundHeader.swift`. Ce témoin RE-VISE, il ne s'allège pas —
    /// une garde de source ancre sur une PLACE, et ne distingue pas d'elle-même
    /// « ce site a perdu sa protection » de « la protection a déménagé »
    /// (leçon 486). Le second témoin ci-dessous est l'assertion qui manquait, et
    /// c'est elle qui rend le déménagement sûr.
    func test_lesDeuxPastilles_portentLeMenu() throws {
        // Le rappel ne porte pas le même NOM aux deux endroits : la surface
        // document tient l'état du meuble, l'en-tête de scène reçoit une
        // closure. Épingler chaque site sur SON nom garde la précision qu'un
        // préfixe commun aurait perdue.
        for (fichier, rappel) in [("ComposerDocumentSurface.swift", "onDeleteBackgroundSound"),
                                  ("ComposerSceneSoundHeader.swift", "onDelete")] {
            let code = try source(fichier)
            XCTAssertTrue(code.contains("ComposerSoundActionsMenu"),
                          "\(fichier) monte la pastille du fond sans son menu de retrait")
            XCTAssertTrue(code.contains("supprimer: \(rappel)"),
                          "\(fichier) monte le menu sans le brancher sur le retrait du FOND")
        }
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
    func test_laPastilleDeScene_estMonteeUneSeuleFois() throws {
        let surface = try source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("ComposerSceneSoundHeader("),
                      "la surface scène ne monte pas l'en-tête : la capsule existe et ne se voit nulle part")
        XCTAssertFalse(surface.contains("ComposerAvatarSoundBadge"),
                       "la capsule est restée en bas EN PLUS de l'en-tête — deux capsules pour un seul fond")
        XCTAssertEqual(surface.components(separatedBy: "ComposerSceneSoundHeader(").count - 1, 1,
                       "un seul montage : deux en-têtes se peindraient l'un sous l'autre")
    }

    /// **Le menu est PARTAGÉ, pas recopié.** Il était `private` à la surface
    /// document — c'est cette clôture qui privait le plateau de tout chemin de
    /// retrait. Le rendre `private` de nouveau, ou en écrire un second,
    /// ramènerait le défaut sous un autre nom.
    func test_leMenu_estUnSiteUnique() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerSoundActionsMenu.swift")
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
