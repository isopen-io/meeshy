import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **L'ARBITRAGE des gestes du plateau — ce que la revue du lot a trouvé.**
///
/// Les quatre portes de #6142 et #6163 vivent sur la même surface, et trois
/// défauts y tenaient ensemble : deux taps déclarés sur deux vues DIFFÉRENTES
/// (l'arrangement que le fichier lui-même nomme comme fautif douze lignes plus
/// haut), un glissement monté sur le MÉDIA plutôt que sur le cadre, et un
/// glissement de page vidéo armé sur les pages VOISINES.
///
/// ## Pourquoi ces témoins interrogent la GÉOGRAPHIE et non l'effet
///
/// L'effet d'un arbitrage de gestes SwiftUI — « qui attend qui » — ne se joue
/// qu'au doigt : aucune API ne fait tomber un `TapGesture` depuis XCTest, et un
/// test qui prétendrait le faire mesurerait son propre faux. Ce qui se mesure,
/// et ce qui décide réellement du comportement, est la DÉCLARATION : SwiftUI
/// n'établit la dépendance d'échec entre un tap `count: 1` et un tap `count: 2`
/// que lorsque les deux sont déclarés sur la MÊME vue. C'est donc cette
/// propriété-là que ces témoins tiennent — la même que `GalleryImagePage`
/// documente en dix lignes depuis #6142.
@MainActor
final class MediaGalleryGestureArbitrationTests: XCTestCase {

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

    private func compact(_ code: String) -> String {
        code.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    func test_theGuardReadsANonEmptySource() throws {
        XCTAssertGreaterThan(try source().count, 5_000)
    }

    // MARK: - 1 · Les deux taps du tiers latéral vivent sur la MÊME vue

    /// **Le défaut bloquant de la revue.** `MediaStageSeekZones` portait son
    /// `SpatialTapGesture(count: 2)` sur une vue ENFANT pendant que le tap
    /// d'entrée en plein cadre vivait sur l'ANCÊTRE de la page. Deux issues, une
    /// aussi mauvaise que l'autre : soit l'enfant consomme le toucher et la
    /// porte la plus fréquente du lot meurt sur les deux tiers latéraux, soit
    /// les deux recognizers tirent et un saut de ±10 s fait AUSSI basculer le
    /// cadrage — deux fois, le cadre changeant de cotes entre les deux taps.
    ///
    /// La réunion se fait sur la ZONE et non sur la page, et c'est le seul
    /// arrangement qui satisfasse les deux doctrines à la fois : le centre garde
    /// son tap immédiat (il ne porte aucun geste), les deux latérales déclarent
    /// leurs deux taps ensemble, double d'abord.
    func test_theLateralZone_declaresBothTaps_theDoubleFirst() throws {
        let code = try source()
        guard let zones = declarationBody(startingAt: "struct MediaStageSeekZones", in: code),
              let zone = declarationBody(startingAt: "private func zone(width:", in: zones) else {
            XCTFail("`MediaStageSeekZones.zone(width:)` introuvable"); return
        }

        guard let double = zone.range(of: "SpatialTapGesture(count: 2"),
              let simple = zone.range(of: ".onTapGesture {") else {
            XCTFail("la zone latérale doit déclarer SES deux taps, pas seulement le double")
            return
        }
        XCTAssertTrue(double.lowerBound < simple.lowerBound,
                      "le double se déclare AVANT le simple : c'est cet ordre qui fait différer le simple")
    }

    /// Et le tap simple qui y est déclaré est bien CELUI de #6142 : la zone le
    /// relaie, elle ne s'en invente pas un autre.
    func test_theVideoPage_handsTheStageDoor_toTheArmedZones() throws {
        let code = try source()
        guard let video = declarationBody(startingAt: "struct GalleryVideoPage", in: code) else {
            XCTFail("`GalleryVideoPage` introuvable"); return
        }

        XCTAssertTrue(compact(video).contains("onSingleTap:{onEnterStage(.tap)}"),
                      "la zone latérale reçoit la porte du tap, sinon elle la tue sur deux tiers du cadre")
    }

    /// Le centre, lui, ne change pas : aucun geste, donc aucun retard — c'est
    /// `onTapGesture` de la page qui le sert, et c'est pour cela qu'il reste
    /// immédiat.
    func test_theCentreZone_stillCarriesNoGesture() throws {
        let code = try source()
        guard let zones = declarationBody(startingAt: "struct MediaStageSeekZones", in: code),
              let corps = declarationBody(startingAt: "var body: some View", in: zones) else {
            XCTFail("`MediaStageSeekZones` introuvable"); return
        }
        XCTAssertTrue(corps.contains(".allowsHitTesting(false)"),
                      "le centre laisse passer le tap simple sans l'attendre")
    }

    // MARK: - 2 · Le glissement couvre le CADRE, sur les deux natures

    /// **Les deux natures répondent au même geste sur la même surface.** La page
    /// vidéo monte son glissement sur le conteneur ; la page image le montait
    /// sur `imageLayer`, c'est-à-dire sur la vue déjà `.aspectRatio(.fit)` — donc
    /// jamais sur le hors-champ. Or le cadre letterboxe par CONSTRUCTION dès que
    /// le plancher de 330 pt mord : une 16:9 rend ~206 pt de média dans 330 pt de
    /// cadre, soit ~124 pt de bandes où le haut n'ouvrait rien et le bas ne
    /// fermait rien — pendant que l'appui long et les deux taps, eux, y
    /// répondaient.
    ///
    /// Pire cas, et c'est lui qui décide : `hasRenderableSource == false` ne
    /// montait AUCUN glissement, et la page ne se fermait plus au doigt.
    func test_theVerticalDrag_ofTheImagePage_mountsOnTheFrame_notOnTheFittedMedium() throws {
        let code = try source()
        guard let image = declarationBody(startingAt: "struct GalleryImagePage", in: code),
              let corps = declarationBody(startingAt: "var body: some View", in: image) else {
            XCTFail("`GalleryImagePage.body` introuvable"); return
        }

        guard let forme = corps.range(of: ".contentShape(Rectangle())"),
              let drag = corps.range(of: ".gesture(stageDragGesture") else {
            XCTFail("le glissement du cadre est introuvable dans le corps de la page image")
            return
        }
        XCTAssertTrue(forme.lowerBound < drag.lowerBound,
                      "le glissement se monte sur le CADRE — après sa forme tactile — jamais sur le média ajusté")
    }

    /// **Un glissement armé sur une page VOISINE décide pour un média que
    /// personne ne regarde.** Sa jumelle image est gardée depuis #6142, et
    /// l'appui long de la ligne suivante l'est aussi, avec la raison écrite au
    /// SDK : « `isActive` désarme les pages voisines ». L'argument vaut mot pour
    /// mot pour le glissement — et la conséquence y dépasse le cadrage, puisque
    /// la branche `.dismisses` lit `videoManager.activeURL` pour décider entre le
    /// PiP et la libération du player.
    func test_theVerticalDrag_ofTheVideoPage_disarmsTheNeighbourPages() throws {
        let code = try source()
        guard let video = declarationBody(startingAt: "struct GalleryVideoPage", in: code),
              let corps = declarationBody(startingAt: "var body: some View", in: video) else {
            XCTFail("`GalleryVideoPage.body` introuvable"); return
        }

        XCTAssertTrue(compact(corps).contains(".gesture(stageDragGesture,including:isActive?.all:.none)"),
                      "le glissement de la page vidéo se désarme hors de la page active, comme sa jumelle image")
    }

    // MARK: - 3 · L'appui long cède au pincement EN COURS, pas seulement au zoom commis

    /// `isZoomed` lit `committedScale`, écrit en FIN de geste : pendant le
    /// PREMIER pincement, `scale` bouge déjà et `committedScale` vaut encore 1,
    /// donc l'appui long restait armé. Doigts posés ≥ 0,4 s avec moins de 10 pt
    /// de dérive sur le toucher suivi ⇒ plein cadre et pause au milieu d'un zoom.
    ///
    /// La règle du SDK dit « un média déjà TRANSFORMÉ a pris le doigt » ; elle ne
    /// dit pas « déjà commis ». Le prédicat doit donc lire l'état VIVANT.
    func test_theLongPress_yieldsToAPinchInProgress_notOnlyToACommittedZoom() throws {
        let code = try source()
        guard let image = declarationBody(startingAt: "struct GalleryImagePage", in: code),
              let predicat = declarationBody(startingAt: "private var isTransformed: Bool", in: image) else {
            XCTFail("`isTransformed` introuvable sur la page image"); return
        }

        XCTAssertTrue(compact(predicat).contains("scale>1"),
                      "le prédicat lit l'échelle VIVANTE, sinon un pincement lent franchit la porte")

        guard let arme = declarationBody(startingAt: "private var longPressArmed: Bool", in: image) else {
            XCTFail("`longPressArmed` introuvable"); return
        }
        XCTAssertTrue(compact(arme).contains("isTransformed:isTransformed"),
                      "c'est ce prédicat vivant que la règle partagée reçoit")
    }

    // MARK: - 4 · Le voile du bas ne prend aucune touche

    /// **Un dégradé est une vue RENDUE, donc testée aux touches.** Posé en fond
    /// du bloc bas, dans une couche hit-testable montée au-dessus du pager, il
    /// faisait des ~110 pt du bas du cadre une zone morte : ni la porte du tap,
    /// ni le glissement horizontal qui feuillette n'y atteignaient le pager.
    ///
    /// Le composant de légende partagé refuse explicitement ce comportement pour
    /// lui-même — « le canvas garde ses gestes de navigation sous la légende » —
    /// et l'hôte le réintroduisait une couche plus haut, hors de portée de la
    /// garde du composant.
    func test_theVeilOfTheFrame_takesNoTouch() throws {
        let code = try source()
        guard let voile = declarationBody(startingAt: "var cadreOverlay: some View", in: code) else {
            XCTFail("`cadreOverlay` introuvable"); return
        }

        XCTAssertTrue(compact(voile).contains("LinearGradient("),
                      "le voile reste un dégradé — c'est son opacité au DOIGT qui change, pas son dessin")
        XCTAssertTrue(compact(voile).contains(".allowsHitTesting(false)"),
                      "le voile ne vole ni le tap de #6142 ni le feuilletage du pager")
    }
}
