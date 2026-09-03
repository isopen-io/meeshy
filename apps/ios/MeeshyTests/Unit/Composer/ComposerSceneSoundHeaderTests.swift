import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// #5011 — **le son de fond se lit en tête de scène, sans capsule et aligné sur
/// le bord gauche du DESSIN.**
///
/// > Directive porteur 2026-09-03 : « La bulle de son de fond n'a pas lieux
/// > d'être, juste la note et le spectre et la durée au dessus avec les
/// > bordures gauches alignées à celle de la scene. »
@MainActor
final class ComposerSceneSoundHeaderTests: XCTestCase {

    private let inset = ComposerRailGeometry.sceneInset(railsShown: true)
    private let ratio = CanvasGeometry.portraitRatio

    // MARK: - Le bord gauche

    /// **Le témoin du lot.** Quand la carte est contrainte par la HAUTEUR, elle
    /// se centre et son bord gauche n'est PAS celui du couloir. C'est le seul
    /// cas où « padder de `sceneInset` » et « aligner sur le dessin » rendent
    /// des réponses différentes — donc le seul cas qui prouve quoi que ce soit.
    func test_quandLaCarteEstContrainteParLaHauteur_leBordNEstPasCeluiDuCouloir() {
        let overlay = CGSize(width: 402, height: 480)
        let carteLargeur = overlay.width - 2 * inset
        let dessin = CanvasGeometry.aspectFitSize(
            in: CGSize(width: carteLargeur, height: overlay.height), ratio: ratio)
        XCTAssertLessThan(dessin.width, carteLargeur,
                          "prémisse du témoin : la carte doit être contrainte par la hauteur")

        let bord = ComposerRailGeometry.sceneLeadingInset(
            overlay: overlay, ratio: ratio, horizontalInset: inset)

        XCTAssertEqual(bord, inset + (carteLargeur - dessin.width) / 2, accuracy: 0.001)
        XCTAssertGreaterThan(bord, inset,
                             "aligner sur le couloir laisserait la ligne à gauche du dessin")
    }

    /// Et quand la LARGEUR contraint, les deux réponses coïncident — c'est
    /// pourquoi un alignement au couloir peut sembler juste sans l'être.
    func test_quandLaLargeurContraint_leBordEstCeluiDuCouloir() {
        let bord = ComposerRailGeometry.sceneLeadingInset(
            overlay: CGSize(width: 402, height: 900), ratio: ratio, horizontalInset: inset)
        XCTAssertEqual(bord, inset, accuracy: 0.001)
    }

    /// Une frame plus étroite que ses deux couloirs ne doit pas rendre un bord
    /// négatif — même garde que `sceneWidth`, pour la même raison : une valeur
    /// absurde se propage sans se signaler.
    func test_uneFrameTropEtroite_neRendJamaisUnBordNegatif() {
        let bord = ComposerRailGeometry.sceneLeadingInset(
            overlay: CGSize(width: 10, height: 100), ratio: ratio, horizontalInset: inset)
        XCTAssertGreaterThanOrEqual(bord, 0)
    }

    /// Le bord suit le RATIO, pas un réglage : un fond paysage ne se cadre pas
    /// comme un portrait, et la ligne doit suivre.
    func test_leBordSuitLeRatio() {
        let overlay = CGSize(width: 402, height: 480)
        let portrait = ComposerRailGeometry.sceneLeadingInset(
            overlay: overlay, ratio: CanvasGeometry.portraitRatio, horizontalInset: inset)
        let paysage = ComposerRailGeometry.sceneLeadingInset(
            overlay: overlay, ratio: CanvasGeometry.landscapeRatio, horizontalInset: inset)
        XCTAssertNotEqual(portrait, paysage, accuracy: 0.001)
    }

    // MARK: - Ce que la ligne PORTE, et ce qu'elle ne porte plus

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// **Plus de capsule.** C'est la moitié visible de la directive, et elle se
    /// garde à la source : la ligne ne dessine ni fond ni contour.
    func test_laLigne_neDessineAucuneCapsule() throws {
        let code = try source("ComposerSceneSoundHeader.swift")
        XCTAssertFalse(code.contains("Capsule("),
                       "la trace de scène est NUE — la capsule reste à la surface document")
        XCTAssertFalse(code.contains(".background(RoundedRectangle"),
                       "un enclos rectangulaire serait la même bulle sous un autre nom")
    }

    /// **Et le bord ne vient pas d'un littéral.** Le `16` d'origine alignait sur
    /// rien ; un nombre écrit à la main ici serait juste par accident et faux au
    /// premier changement de ratio.
    func test_leBord_vientDeLaRegle_pasDUnLitteral() throws {
        let code = try source("ComposerSceneSoundHeader.swift")
        XCTAssertTrue(code.contains(".padding(.leading, leadingInset)"),
                      "le bord gauche doit venir de la mesure, pas d'une marge écrite ici")
        XCTAssertFalse(code.contains(".padding(.horizontal, 16)"),
                       "l'ancienne marge alignait la ligne sur le couloir, pas sur le dessin")
    }

    /// **Un seul vocabulaire pour les deux traces.** La capsule et la ligne nue
    /// montent la MÊME rangée ; deux compositions auraient divergé au premier
    /// libellé ajouté.
    func test_lesDeuxTraces_montentLaMemeRangee() throws {
        for fichier in ["ComposerSceneSoundHeader.swift", "ComposerAvatarSoundBadge.swift"] {
            XCTAssertTrue(try source(fichier).contains("ComposerSoundTraceRow("),
                          "\(fichier) compose sa propre rangée au lieu de partager celle des deux")
        }
    }

    /// **L'onde ne quitte pas la capsule.** L'extraction a laissé `wave` et
    /// `barCount` sans appelant dans `ComposerAvatarSoundBadge` — du code qui
    /// compile et que personne ne monte (leçon 483). Ce témoin garde le
    /// nettoyage.
    func test_lExtraction_neLaissePasDOndeOrpheline() throws {
        let code = try source("ComposerAvatarSoundBadge.swift")
        XCTAssertFalse(code.contains("barCount"),
                       "la capsule ne dessine plus l'onde : son compteur de barres n'a plus d'objet")
        XCTAssertFalse(code.contains("AudioWaveform.displayHeight"),
                       "le tracé vit dans la rangée partagée")
    }

    // MARK: - La règle de service, inchangée

    private func fond() -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.isBackground = true
        return son
    }

    /// Le dépouillement ne touche pas à QUI décide : un outil ouvert efface la
    /// trace, comme avant.
    func test_unOutilOuvert_effaceToujoursLaTrace() {
        XCTAssertNil(ComposerSceneSoundTrace.served(background: fond(), toolIsOpen: true))
        XCTAssertNotNil(ComposerSceneSoundTrace.served(background: fond(), toolIsOpen: false))
    }
    /// **La trace se pose JUSTE au-dessus de la carte** (#5017).
    ///
    /// > Directive porteur 2026-09-03 : « bord gauche aligné sur la scène il
    /// > faut mettre **juste au dessus de la scene** ! »
    ///
    /// Mesuré avant correctif au simulateur : ligne à `y ≈ 300`, carte à
    /// `y ≈ 513` — deux cent treize points de vide entre l'étiquette et ce
    /// qu'elle étiquette. Posée en FRÈRE dans la pile, la trace se collait sous
    /// la barre haute ; le vide n'était pas une marge à régler mais la moitié
    /// haute du CENTRAGE de la carte dans la hauteur qu'on lui donne.
    ///
    /// Le témoin épingle donc le MÉCANISME, pas une distance : le montage passe
    /// par l'ancre, et l'ancre lit `ComposerRailGeometry`. Un correctif qui
    /// rapprocherait la trace par un `padding(.top, 200)` resterait rouge — et
    /// c'est le but, puisqu'un littéral se démentirait au premier autre ratio.
    func test_soundHeader_isAnchoredAboveTheCard_notMountedAsASibling() throws {
        let surface = try source("ComposerSceneSurface.swift")
        let ancre = "ancreAuDessusDuDessin("
        XCTAssertTrue(surface.contains(ancre + "\n" ) || surface.contains(ancre),
                      "l'ancre haute doit exister")
        guard let posee = surface.range(of: ancre + "\n"),
              let montee = surface.range(of: "ComposerSceneSoundHeader(") else {
            return XCTFail("l'en-tête doit être monté DANS l'ancre haute")
        }
        XCTAssertTrue(posee.upperBound <= montee.lowerBound,
                      "l'en-tête est monté DANS `ancreAuDessusDuDessin`, jamais en frère de la pile")
    }

    /// **L'écart vient de la RÈGLE, jamais d'un littéral** (#5017).
    ///
    /// La carte est ajustée à son ratio puis CENTRÉE : le vide du haut vaut
    /// celui du bas et change avec le ratio comme avec la taille de l'écran.
    /// `sceneBottomInset` le calcule déjà pour le rail bas — l'ancre haute est
    /// sa jumelle et lit la MÊME fonction. Deux calculs parallèles dériveraient
    /// au premier ratio ajouté, l'un des deux rougissant sans que l'autre bouge.
    func test_upperAnchor_readsTheGeometryRule_neverALiteralInset() throws {
        let surface = try source("ComposerSceneSurface.swift")
        // Le corps se borne par la DÉCLARATION suivante, jamais par un `// MARK:` :
        // `AppSourceGuard.stripComments` dépouille la source avant de la rendre,
        // donc un témoin ancré sur un commentaire cherche un repère que le texte
        // qu'il lit ne contient plus. Écrit ici après l'avoir fait tomber.
        guard let debut = surface.range(of: "private func ancreAuDessusDuDessin") else {
            return XCTFail("l'ancre haute doit exister")
        }
        let apres = debut.upperBound ..< surface.endIndex
        let suivante = ["\n    private ", "\n    var ", "\n    func "]
            .compactMap { surface.range(of: $0, range: apres)?.lowerBound }
            .min() ?? surface.endIndex
        let fin = suivante ..< suivante
        let corps = String(surface[debut.upperBound ..< fin.lowerBound])
        XCTAssertTrue(corps.contains("ComposerRailGeometry.sceneBottomInset("),
                      "l'ancre haute lit la règle, comme sa jumelle basse")
        XCTAssertTrue(corps.contains("dimensions[.bottom]"),
                      "le contenu se soulève de SA hauteur — aucune hauteur n'est écrite ni mesurée")
        for littéral in ["padding(.top, 2", "padding(.top, 1", "offset(y: -2", "offset(y: -1"] {
            XCTAssertFalse(corps.contains(littéral),
                           "aucune distance en dur dans l'ancre : `\(littéral)` se démentirait au premier autre ratio")
        }
    }

}
