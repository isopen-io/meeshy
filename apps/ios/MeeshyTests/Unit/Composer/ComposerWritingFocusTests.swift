import XCTest
import MeeshyUI
@testable import Meeshy

/// **Clavier levé, le rail d'outils ne chevauche plus le socle ni ne passe sous
/// le clavier** (#6131), parce qu'ÉCRIRE retire tout contrôleur du bas (#6132).
///
/// > « Si le clavier s'affiche, on a pas besoin d'avoir d'autre contrôleur en
/// > bas. » — directive porteur 2026-09-12.
///
/// La question de l'issue — le rail se RESSERRE-t-il ou s'EFFACE-t-il ? — est
/// tranchée pour l'effacement : écrire une légende ou un corps de post, ce
/// n'est pas poser un objet, et un rail resserré resterait un contrôleur du bas
/// que le geste en cours ne peut pas utiliser. Le chevron du volet, la coche et
/// la capsule de langue restent : ils QUALIFIENT ou TERMINENT ce geste-là.
final class ComposerWritingFocusTests: XCTestCase {

    // MARK: - La règle

    func test_isShown_ecritureEnCours_retireLesPortesLeRailDroitEtLeSocle() {
        for outilOuvert in [false, true] {
            let servis = Set(ComposerToolFocus.Chrome.allCases.filter {
                ComposerToolFocus.isShown($0, toolIsOpen: outilOuvert, writesText: true)
            })
            XCTAssertFalse(servis.contains(.sceneDoors), "le rail des portes passe sous le clavier (#6131)")
            XCTAssertFalse(servis.contains(.trailingRail), "le rail droit est un contrôleur du bas (#6132)")
            XCTAssertFalse(servis.contains(.socle), "écrire n'est pas publier (#6132)")
        }
    }

    /// **Ce qui sert l'écriture RESTE** — le volet de la légende EST le champ
    /// qu'on remplit, et la barre haute porte la seule sortie du composer.
    func test_isShown_ecritureEnCours_garderLeVoletEtLaBarreHaute() {
        XCTAssertTrue(ComposerToolFocus.isShown(.description, toolIsOpen: false, writesText: true),
                      "le volet de la légende est le champ en cours de saisie (#6126)")
        XCTAssertTrue(ComposerToolFocus.isShown(.topBar, toolIsOpen: false, writesText: true))
        XCTAssertTrue(ComposerToolFocus.isShown(.soundTrace, toolIsOpen: false, writesText: true))
    }

    /// **Sans écriture, la règle ne change RIEN** — sur toutes les paires.
    /// C'est la moitié qu'on oublie : tout ce qui a disparu pendant la frappe
    /// revient à la sortie du geste (#6132, critère de fin).
    func test_isShown_sansEcriture_rendExactementLaReponseDeLOutil() {
        for chrome in ComposerToolFocus.Chrome.allCases {
            for outilOuvert in [false, true] {
                XCTAssertEqual(ComposerToolFocus.isShown(chrome, toolIsOpen: outilOuvert, writesText: false),
                               ComposerToolFocus.isShown(chrome, toolIsOpen: outilOuvert),
                               "\(chrome) / outil ouvert = \(outilOuvert)")
            }
        }
    }

    /// **Les étages du bas cèdent au clavier** : références, jetons d'objet et
    /// rangée basse sont tous des contrôleurs du bas.
    func test_lowerFloorsAreShown_ecritureEnCours_faux() {
        XCTAssertFalse(ComposerToolFocus.lowerFloorsAreShown(writesText: true))
        XCTAssertTrue(ComposerToolFocus.lowerFloorsAreShown(writesText: false))
    }

    // MARK: - Le BRANCHEMENT, qu'aucune valeur ne voit

    private func compact(_ s: String) -> String { s.filter { !$0.isWhitespace } }

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    func test_surface_consulteLEcriturePourSesRailsEtSesEtages() throws {
        let surface = compact(try source("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
        XCTAssertTrue(surface.contains("structComposerSceneSurface"), "le fichier lu n'est pas la surface")
        XCTAssertTrue(surface.contains("varwritesText:Bool=false"),
                      "la surface doit SAVOIR qu'on écrit — sans quoi elle ne peut rien céder")
        XCTAssertTrue(surface.contains("guardComposerToolFocus.isShown(.sceneDoors,toolIsOpen:toolIsOpen,writesText:writesText),"),
                      "le rail des portes demande à la règle s'il survit à l'écriture (#6131)")
        XCTAssertTrue(surface.contains("ifComposerToolFocus.isShown(.trailingRail,toolIsOpen:toolIsOpen,writesText:writesText){"),
                      "le rail droit demande à la règle s'il survit à l'écriture (#6132)")
        XCTAssertTrue(surface.contains("ComposerToolFocus.lowerFloorsAreShown(writesText:writesText)"),
                      "les étages du bas demandent à la règle s'ils survivent à l'écriture (#6132)")
        XCTAssertTrue(surface.contains("value:writesText)"),
                      "le retour du chrome à la sortie du geste s'anime, il ne saute pas (#6132)")
    }

    /// Les DEUX chemins d'écriture — légende et corps — passent par le même
    /// terme `writesText` (`editsSceneDescription || editsPostContent`).
    func test_hote_remetLEcritureALaSurface() throws {
        let hote = compact(AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource()))
        XCTAssertTrue(hote.contains("writesText:writesText,"),
                      "l'hôte doit remettre à la surface le geste d'écriture en cours (#6131)")
        XCTAssertTrue(hote.contains("varwritesText:Bool{editsSceneDescription||editsPostContent}"),
                      "les deux chemins d'écriture — légende et corps — forment UN terme")
    }

    // MARK: - #9448 · Le CORPS du post n'écrit pas la légende

    /// **Écrire le corps du post retire le volet de légende**, que le panneau du
    /// corps recouvre. Recouvert, il restait dans l'arbre : VoiceOver atteignait
    /// « Abc » et « Replier la description » sous le panneau (recette du
    /// 2026-10-05). Ce qui est caché n'est pas MONTÉ — donc hors de l'arbre.
    func test_ecrireLeCorps_retireLeVoletDeLegende() {
        XCTAssertFalse(ComposerToolFocus.isShown(.description, toolIsOpen: false, writing: .postBody),
                       "le volet de légende est sous le panneau du corps : il sort de l'arbre (#9448)")
        XCTAssertTrue(ComposerToolFocus.isShown(.description, toolIsOpen: false, writing: .sceneLegend),
                      "écrire la LÉGENDE garde son volet : c'est le champ (#6126)")
        XCTAssertTrue(ComposerToolFocus.isShown(.description, toolIsOpen: false, writing: .nothing))
        XCTAssertFalse(ComposerToolFocus.isShown(.description, toolIsOpen: true, writing: .nothing),
                       "un outil ouvert retire toujours le volet")
    }

    /// Sur toute autre pièce de chrome, la réponse est celle de `writesText`.
    func test_isShownWriting_rendLaReponseDeWritesTextHorsDuVolet() {
        for chrome in ComposerToolFocus.Chrome.allCases where chrome != .description {
            for ecriture in [ComposerWriting.nothing, .sceneLegend, .postBody] {
                for outilOuvert in [false, true] {
                    XCTAssertEqual(ComposerToolFocus.isShown(chrome, toolIsOpen: outilOuvert, writing: ecriture),
                                   ComposerToolFocus.isShown(chrome, toolIsOpen: outilOuvert,
                                                             writesText: ecriture.writesText),
                                   "\(chrome) / \(ecriture) / outil ouvert = \(outilOuvert)")
                }
            }
        }
    }

    func test_writing_seResoutDesDeuxDrapeauxDeLHote() {
        XCTAssertEqual(ComposerWriting.resolve(editsSceneDescription: false, editsPostContent: false), .nothing)
        XCTAssertEqual(ComposerWriting.resolve(editsSceneDescription: true, editsPostContent: false), .sceneLegend)
        XCTAssertEqual(ComposerWriting.resolve(editsSceneDescription: false, editsPostContent: true), .postBody)
        XCTAssertFalse(ComposerWriting.nothing.writesText)
        XCTAssertTrue(ComposerWriting.sceneLegend.writesText)
        XCTAssertTrue(ComposerWriting.postBody.writesText)
    }

    // MARK: - #9448 · La sortie s'efface AVANT que la barre revienne

    /// **Le chrome revient APRÈS le fondu du panneau, jamais pendant.** Le
    /// panneau du corps glissait ~150 ms par-dessus @ # et Public / Publier,
    /// qui revenaient au même instant. Le retour attend donc la fin du fondu ;
    /// l'aller, lui, part tout de suite.
    func test_leRetourDuChrome_attendLaFinDuFonduDuPanneau() {
        let fondu = ComposerToolFocus.transition(reduceMotion: false)
        XCTAssertNotNil(fondu)
        XCTAssertEqual(ComposerWritingExit.chromeAnimation(reduceMotion: false, writesText: true), fondu,
                       "l'aller n'attend rien")
        XCTAssertEqual(ComposerWritingExit.chromeAnimation(reduceMotion: false, writesText: false),
                       fondu?.delay(ComposerWritingExit.zoneFadeOut),
                       "le retour attend que le panneau soit parti")
        XCTAssertGreaterThan(ComposerWritingExit.zoneFadeOut, 0)
        XCTAssertLessThan(ComposerWritingExit.zoneFadeOut, 0.2,
                          "un fondu long laisserait le panneau suivre le clavier qui descend")
    }

    /// **Reduce Motion : aucune animation**, ni délai — l'échange est sec, donc
    /// aucune image ne montre les deux à la fois.
    func test_reduceMotion_echangeSansAnimation() {
        XCTAssertNil(ComposerWritingExit.chromeAnimation(reduceMotion: true, writesText: true))
        XCTAssertNil(ComposerWritingExit.chromeAnimation(reduceMotion: true, writesText: false))
    }

    func test_panneauDuCorps_sEffaceEnFonduSansGlisser() throws {
        let zone = compact(try source("Meeshy/Features/Main/Composer/ComposerSceneDescriptionEditor.swift"))
        XCTAssertTrue(zone.contains("structComposerSceneDescriptionEditor"), "le fichier lu n'est pas la zone")
        XCTAssertFalse(zone.contains(".move(edge:"),
                       "un glissement fait traverser la barre Public / Publier au panneau (#9448)")
        XCTAssertTrue(zone.contains(".transition(ComposerWritingExit.zoneTransition(reduceMotion:reduceMotion))"),
                      "la sortie passe par la règle, Reduce Motion compris")
    }

    func test_branchement_hoteEtSurface_passentParLaRegleDeSortie() throws {
        let hote = compact(AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource()))
        XCTAssertTrue(hote.contains(".modifier(ComposerWritingAnimation(writesText:writesText))"),
                      "le socle revient par la même règle que les rails (#9448)")
        XCTAssertFalse(hote.contains("value:editsPostContent)"),
                       "un ressort non différé ramenait le socle sous le panneau qui part")
        XCTAssertTrue(hote.contains("writesPostBody:editsPostContent,"),
                      "la surface doit savoir QUEL texte on écrit")
        let surface = compact(try source("Meeshy/Features/Main/Composer/ComposerSceneSurface.swift"))
        XCTAssertTrue(surface.contains("ComposerToolFocus.isShown(.description,toolIsOpen:toolIsOpen,writing:writing)"),
                      "le volet demande à la règle s'il survit à l'écriture du corps")
        XCTAssertTrue(surface.contains(
            ".animation(ComposerWritingExit.chromeAnimation(reduceMotion:reduceMotion,writesText:writesText),value:writesText)"),
                      "les rails reviennent APRÈS le panneau, pas pendant")
    }
}
