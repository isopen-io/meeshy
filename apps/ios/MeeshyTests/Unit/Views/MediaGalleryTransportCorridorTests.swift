import XCTest
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La progression d'une vidéo vit dans le COULOIR du plateau** (#6162,
/// directive porteur 2026-09-12 : *« la progression pour les vidéos et scène
/// avec durée doit être en bas juste au-dessus du rail de défilement […] la
/// durée de la vidéo peut être positionnée plus discrètement et le bouton
/// pause/play plus transparent au centre »*).
///
/// ## Le piège que ce fichier existe pour tenir
///
/// La réserve de la bande se calcule pour le **LOT**, pas pour la page ouverte.
/// Écrite « si CE média a une durée », elle ferait changer le cadre de taille
/// en glissant d'une vidéo vers une image — et un cadre qui saute pendant le
/// geste coûte plus cher que les quarante-huit points qu'on aurait économisés
/// sur les pages sans durée. Le témoin qui l'attrape n'interroge donc pas une
/// vidéo : il interroge un lot MÊLÉ, et compare les deux pages entre elles.
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
@MainActor
final class MediaGalleryTransportCorridorTests: XCTestCase {

    // MARK: - Fabriques

    private static let viewport = CGSize(width: 390, height: 844)
    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    /// Même RATIO pour les deux natures : c'est ce qui rend la comparaison des
    /// deux pages décidable. Deux ratios différents rendraient deux cadres
    /// différents pour une raison légitime, et le témoin ne dirait plus rien de
    /// la réserve.
    ///
    /// **Et ce ratio est 9:16, pas 16:9 — c'est la moitié du témoin qui ne se
    /// voit pas.** Une 16:9 pose son cadre au PLANCHER (330 pt) dans les deux
    /// cas : la règle juste et la règle fausse y rendent le même verdict, et le
    /// témoin serait vert des deux côtés du diff. Seule une nature contrainte
    /// par la HAUTEUR laisse la réserve apparaître dans le cadre.
    private static let ratio = (width: 1_080, height: 1_920)

    private func image(_ suffixe: String) -> MessageAttachment {
        MessageAttachment(
            id: "img-\(suffixe)",
            mimeType: "image/jpeg",
            fileSize: 204_800,
            fileUrl: "https://cdn.meeshy.me/\(suffixe).jpg",
            width: Self.ratio.width,
            height: Self.ratio.height,
            uploadedBy: "u-1"
        )
    }

    private func video(_ suffixe: String, durationMs: Int = 12_000) -> MessageAttachment {
        MessageAttachment(
            id: "vid-\(suffixe)",
            mimeType: "video/mp4",
            fileSize: 4_204_800,
            fileUrl: "https://cdn.meeshy.me/\(suffixe).mp4",
            width: Self.ratio.width,
            height: Self.ratio.height,
            duration: durationMs,
            uploadedBy: "u-1"
        )
    }

    private func corridors(_ attachments: [MessageAttachment]) -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: attachments)
    }

    private func stage(_ attachment: MessageAttachment,
                       in lot: [MessageAttachment],
                       _ presentation: MediaStageFraming.Presentation = .carded)
        -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: Self.viewport,
            mediaRatio: MediaGalleryStage.ratio(of: attachment),
            presentation: presentation,
            corridors: corridors(lot)
        )
    }

    private func unit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    private func compact(_ code: String) -> String {
        code.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    // MARK: - 1. LE témoin de l'issue — la réserve est celle du LOT

    /// **Un lot mêlant une vidéo et une image rend le MÊME cadre sur les deux
    /// pages.** C'est la seule formulation qui tombe : une réserve calculée
    /// pour la page ouverte donnerait deux cadres hauts de quarante-huit points
    /// d'écart, et le média sauterait sous le doigt pendant le glissement.
    func test_theBand_isReservedForTheLot_soTheFrameNeverJumpsBetweenPages() {
        let lot = [video("a"), image("b")]
        let surLaVideo = stage(lot[0], in: lot)
        let surLImage = stage(lot[1], in: lot)

        // **Le témoin prouve d'abord qu'il PEUT tomber.** Un cadre posé sur son
        // plancher serait identique des deux côtés quelle que soit la réserve —
        // l'égalité ci-dessous ne dirait alors rien du tout.
        XCTAssertEqual(surLaVideo.frame.height,
                       603 - TransportLayout.barHeight, accuracy: 0.5,
                       "9:16 : le cadre est contraint par la HAUTEUR, donc la bande s'y voit")
        XCTAssertGreaterThan(surLaVideo.frame.height, MediaGalleryStage.minimumFrameHeight,
                             "et il n'est pas au plancher, où toute réserve deviendrait invisible")

        XCTAssertEqual(
            surLaVideo.frame, surLImage.frame,
            "le cadre d'une vidéo et celui d'une image du MÊME lot sont identiques — "
                + "sinon le cadre saute pendant le geste, ce qui est pire que la place perdue"
        )
    }

    /// Et la réserve ne dépend pas de la POSITION de la vidéo dans le lot :
    /// c'est bien « un média du lot porte une durée », pas « le premier ».
    func test_theBand_isReserved_whicheverPositionTheVideoHolds() {
        XCTAssertEqual(corridors([image("a"), image("b"), video("c")]).transport,
                       corridors([video("c"), image("a"), image("b")]).transport)
    }

    // MARK: - 2. Ce qu'elle vaut, et quand elle ne vaut rien

    /// **La hauteur est celle que la barre de transport occupe RÉELLEMENT.**
    /// Le témoin porte sur l'IDENTITÉ, jamais sur le nombre : recopier 48
    /// resterait vert le jour où la barre change de gabarit — c'est-à-dire
    /// exactement le jour où le cadre et la bande se désaccorderaient.
    func test_theBandHeight_isTheTransportBarsOwn_neverACopy() {
        XCTAssertEqual(corridors([video("a")]).transport, TransportLayout.barHeight,
                       "la bande EST la barre du SDK, pas un nombre voisin")
    }

    /// **Un lot sans aucune durée ne réserve rien.** Il n'y a pas de temps à
    /// montrer, donc rien à mettre dans la bande — et la hauteur revient au
    /// cadre, la seule chose qu'on est venu regarder (loi 4).
    func test_aLotWithoutAnyDuration_reservesNoBandAtAll() {
        XCTAssertEqual(corridors([image("a"), image("b")]).transport, 0)
    }

    /// Une durée NULLE n'est pas une durée : un attachement vidéo dont le
    /// serveur n'a pas encore calculé la durée ne fait pas naître une bande vide.
    func test_aZeroDuration_isNotADuration() {
        XCTAssertEqual(corridors([video("a", durationMs: 0)]).transport, 0)
    }

    /// **Un média seul à durée réserve quand même sa bande.** La règle du rail
    /// ne s'applique pas ici : un rail sert à parcourir une série, une
    /// progression sert à parcourir UN média.
    func test_aLoneVideo_stillReservesItsBand() {
        XCTAssertEqual(corridors([video("a")]).transport, TransportLayout.barHeight)
        XCTAssertEqual(corridors([video("a")]).rail, 0, "un média seul n'a rien à parcourir")
    }

    // MARK: - 3. En plein cadre, la bande rend sa hauteur

    /// Le plein cadre n'est pas un fondu de chrome : c'est une reprise de place.
    /// La bande part avec les autres couloirs, sinon elle laisserait quarante-huit
    /// points de noir là où l'on vient de tout rendre au média.
    func test_inFullFrame_theBandGivesItsHeightBack() {
        let lot = [video("a"), image("b")]

        XCTAssertEqual(
            MediaGalleryStage.bottomInset(presentation: .full(pausedOnEntry: false),
                                          corridors: corridors(lot)), 0)
        XCTAssertEqual(stage(lot[0], in: lot, .full).frame, Self.viewport)
    }

    /// Et en cadré, le retrait bas du pager compte la bande — les deux couches
    /// lisent la MÊME table, sinon le cadre dessiné et le cadre calculé diffèrent
    /// d'une bande entière.
    func test_carded_thePagerBottomInset_countsTheBand() {
        let reserves = corridors([video("a"), image("b")])

        XCTAssertEqual(
            MediaGalleryStage.bottomInset(presentation: .carded, corridors: reserves),
            reserves.rail + reserves.transport + reserves.safeBottom + reserves.gutter
        )
    }

    // MARK: - 4. La géographie : la bande est ENTRE le cadre et le rail

    func test_theBand_livesBetweenTheCadreAndTheRail() throws {
        let code = try unit()
        guard let plateau = corps("private var controlsOverlay: some View {", dans: code) else {
            return XCTFail("`controlsOverlay` introuvable")
        }

        guard let cadre = plateau.range(of: "cadreRegion"),
              let bande = plateau.range(of: "transportCorridor"),
              let rail = plateau.range(of: "railCorridor") else {
            return XCTFail("les quatre bandes du plateau ne se lisent pas dans l'ordre")
        }
        XCTAssertLessThan(cadre.lowerBound, bande.lowerBound,
                          "la bande vient après le cadre")
        XCTAssertLessThan(bande.lowerBound, rail.lowerBound,
                          "et JUSTE AU-DESSUS du rail — c'est la directive, mot pour mot")
    }

    /// **Elle a quitté le cadre.** Le témoin est négatif parce que le défaut
    /// qu'il retient est un RETOUR : l'overlay du cadre est l'endroit où elle
    /// vivait depuis #6141, et l'y remettre serait le geste naturel du prochain
    /// lot qui touchera au transport.
    func test_theBand_noLongerSitsOnTheCadreOverlay() throws {
        let code = try unit()
        guard let overlay = corps("var cadreOverlay: some View {", dans: code) else {
            return XCTFail("`cadreOverlay` introuvable")
        }

        XCTAssertFalse(compact(overlay).contains("transportCorridor"),
                       "la progression ne se pose plus SUR le média : elle est descendue au couloir")
        XCTAssertTrue(compact(overlay).contains("bottomOverlay"),
                      "la légende et l'auteur, eux, restent sur le cadre")
    }

    // MARK: - 5. Ce que la bande porte, et ce qu'elle ne porte plus

    /// **Plus aucun ±10 s, et la garde le mesure sur le PLACEMENT.** Les gater
    /// sur l'absence de `.scrubber` aurait laissé le prochain hôte les
    /// ressusciter en ajoutant une option ; #6163 les remplace par un geste.
    func test_theBand_carriesNoSkipButtonAnymore() throws {
        let code = try unit()

        for glyphe in ["gobackward.10", "goforward.10"] {
            XCTAssertFalse(code.contains(glyphe),
                           "les ±10 s partent avec #6162 — un geste les remplace (#6163)")
        }
        XCTAssertFalse(TransportLayout.showsSkip(placement: .corridor,
                                                 controls: .fullscreenDefault))
        XCTAssertFalse(TransportLayout.showsSkip(placement: .center,
                                                 controls: .fullscreenDefault))
    }

    /// **La durée vient de l'ATTACHEMENT, jamais du player.** Elle doit être
    /// lisible avant que la première image ne soit décodée — un `manager.duration`
    /// vaut zéro tant que l'`AVPlayerItem` n'a pas chargé ses pistes, donc la
    /// bande annoncerait « 0:00 » sur exactement la page qu'on vient d'ouvrir.
    func test_theDuration_comesFromTheAttachment_neverFromThePlayer() throws {
        let code = try unit()
        guard let bande = corps("var transportCorridor: some View {", dans: code),
              let libelle = corps("var currentDurationLabel: String? {", dans: code) else {
            return XCTFail("`transportCorridor` ou `currentDurationLabel` introuvable")
        }

        XCTAssertTrue(compact(libelle).contains("durationFormatted"),
                      "la durée se lit sur la pièce jointe")
        XCTAssertFalse(compact(bande).contains(".duration]"),
                       "`.duration` n'entre pas dans le jeu de contrôles : ce serait la "
                           + "durée du PLAYER, nulle tant que les pistes ne sont pas chargées")
        XCTAssertFalse(compact(bande).contains("manager.duration"))
    }

    /// **Et une durée NULLE n'affiche rien.** Le libellé applique le MÊME
    /// prédicat que la réserve : un « 0:00 » servi parce que le serveur n'a pas
    /// encore calculé la durée est pire qu'une bande vide — on le croit.
    func test_aZeroDuration_showsNoLabel() {
        XCTAssertFalse(MediaGalleryStage.carriesDuration([video("a", durationMs: 0)]))
        XCTAssertTrue(MediaGalleryStage.carriesDuration([video("a")]))
    }

    /// **Le muet reste ATTEIGNABLE.** La bande est le seul endroit du plateau
    /// qui porte encore la barre du SDK : si elle perdait `.mute`, la galerie
    /// n'aurait plus aucun muet — et les deux gardes qui l'affirment
    /// (`FullscreenGallerySoundScopeGuardTests`) resteraient VERTES, car elles
    /// mesurent la présence du composant, pas celle de l'option.
    func test_theBand_keepsTheMuteReachable() throws {
        let code = try unit()
        guard let bande = corps("var transportCorridor: some View {", dans: code) else {
            return XCTFail("`transportCorridor` introuvable")
        }

        XCTAssertTrue(compact(bande).contains(".mute"),
                      "sans `.mute` ici, plus aucun muet dans toute la galerie")
        XCTAssertTrue(compact(bande).contains("placement:.corridor"),
                      "et elle se rend en gabarit de couloir — sans capsule de verre")
    }

    // MARK: - 6. Le play/pause reste au centre du média, plus transparent

    func test_thePlayPause_staysAtTheCenterOfTheMedia_andGrowsTransparent() throws {
        let code = try unit()
        guard let centre = corps("var cadreCenterPlayPause: some View {", dans: code) else {
            return XCTFail("`cadreCenterPlayPause` introuvable")
        }
        let plat = compact(centre)

        XCTAssertTrue(plat.contains("placement:.center"),
                      "le play/pause SEUL — c'est l'affordance première d'un lecteur, et "
                          + "aucun joueur au monde ne la met ailleurs qu'au centre")
        XCTAssertTrue(plat.contains("centerOpacity:"),
                      "« plus transparent au centre » est une directive, pas un goût")
        XCTAssertTrue(plat.contains("controls:[.playPause]"),
                      "rien d'autre ne se pose sur le média : tout le reste est descendu")

        guard let region = corps("var cadreRegion: some View {", dans: code),
              let couche = compact(region).range(of: "cadreCenterPlayPause"),
              let cadrage = compact(region).range(of: ".frame(width:currentStage.frame.width")
        else {
            return XCTFail("la couche centrale ne se lit pas dans la région du cadre")
        }
        XCTAssertLessThan(couche.lowerBound, cadrage.lowerBound,
                          "elle est un ENFANT du cadre — donc centrée sur le média, et rognée "
                              + "par les mêmes coins")
    }

    // MARK: - Fusible

    /// Une garde de source qui lit le vide passe au vert sur toutes ses
    /// assertions négatives sans qu'aucune ne puisse le dire.
    func test_theGuardActuallyReadsItsSources() throws {
        XCTAssertGreaterThan(try unit().count, 20_000)
    }
}
