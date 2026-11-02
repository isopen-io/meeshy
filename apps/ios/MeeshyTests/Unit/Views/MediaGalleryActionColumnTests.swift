import XCTest
import SwiftUI
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Les actions quittent le bas du cadre pour un couloir latéral du plateau**
/// (#6161, directive porteur 2026-09-12 : « il faut placer les contrôleurs du
/// bas sur le côté en vertical sur la zone sombre du plateau »).
///
/// Réagir · répondre · composer deviennent une **colonne verticale à droite**,
/// au gabarit de la barre latérale du lecteur de story
/// (`StoryViewerView+Sidebar.swift`). Restent en bas, sous leur voile :
/// l'auteur, la date, la légende dépliable et la ligne format / dimensions /
/// poids — le porteur a validé cet effet (« le contenu qui disparaît en bas par
/// le voile des informations »), il ne se démonte pas au passage.
///
/// ## La colonne se POSE sur le cadre — elle ne lui prend pas de largeur
///
/// La lecture opposée avait été retenue une heure plus tôt : un vrai couloir
/// latéral réservé AVANT le cadre, comme les couloirs haut et bas. Elle coûtait
/// **356 × 633 → 322 × 572** sur une scène 9:16 — un cinquième de la surface.
/// Second arbitrage porteur du même jour : *« on va essayer de garder l'aspect
/// des story mais ce ne sont pas des story »* — le cadre garde sa taille, la
/// colonne se pose dessus.
///
/// C'est pourquoi les témoins de cote ci-dessous mesurent une **ABSENCE de
/// changement**. Ils sont verts des deux côtés du lot, et je le dis plutôt que
/// de le laisser croire : ce qu'ils attrapent n'est pas mon écriture
/// d'aujourd'hui, c'est la RÉÉCRITURE de demain — le lot qui, citant #4561 /
/// #4633, ré-introduirait la réserve latérale abandonnée. Ils sont donc écrits
/// contre des IDENTITÉS (`MediaGalleryStage.gutter`,
/// `MediaStageActionColumn.width`) et non contre des nombres : un couloir
/// d'actions ajouté aux `Corridors` les ferait rougir, un nombre recopié non.
///
/// ## #4561 / #4633 ne l'interdisent pas — et c'est le piège à désamorcer
///
/// Ces deux issues gouvernent le **COMPOSER** : un contrôle posé sur une scène
/// qu'on est en train d'AUTEURER entre en concurrence avec le geste d'édition.
/// En LECTURE il n'y a aucun geste d'édition à protéger, et le lecteur de story
/// a toujours posé sa colonne sur son canvas. La loi ne porte pas jusqu'ici.
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
@MainActor
final class MediaGalleryActionColumnTests: XCTestCase {

    // MARK: - Fabriques

    private static let viewport = CGSize(width: 390, height: 844)
    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    private func resolve(ratio: CGFloat?, mediaCount: Int = 6) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: Self.viewport,
            mediaRatio: ratio,
            presentation: .carded,
            corridors: MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: MediaGalleryLot.imagesOnly(mediaCount))
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

    // MARK: - 1 · Les cotes de la colonne

    /// **Une cible ne descend jamais sous 44 pt** (dimension 5 de la roadmap),
    /// et le VERRE est le disque du chrome plein écran (#8878, charte § 5 : 36 pt,
    /// `MeeshyControlSize.regular`) — doctrine 82i, le glyphe est borné par un cadre
    /// fixe. Les deux nombres ne disent donc pas la même chose : l'un est ce
    /// qu'on VOIT, l'autre ce qu'on TOUCHE, et les confondre rend soit une
    /// pastille trop grosse, soit une cible trop petite.
    func test_laCible_dUneAction_nEstJamaisSousQuaranteQuatre() {
        XCTAssertGreaterThanOrEqual(MediaStageActionColumn.target, 44,
                                    "la cible tactile ne descend pas sous 44 pt")
        XCTAssertEqual(MediaStageActionColumn.glass, FullscreenChromeMetrics.discDiameter,
                       "le verre est le disque du chrome plein écran (doctrine 82i) — une seule cote")
        XCTAssertEqual(MediaStageActionColumn.target, FullscreenChromeMetrics.tapTarget,
                       "la cible est celle du chrome plein écran — une seule cote")
        XCTAssertEqual(MediaStageActionColumn.spacing, FullscreenChromeMetrics.railSpacing,
                       "l'intervalle est celui du rail plein écran — une seule cote")
        XCTAssertGreaterThan(MediaStageActionColumn.target, MediaStageActionColumn.glass,
                             "la cible DÉBORDE le verre : c'est ce débordement qui doit être "
                                 + "consommé, sinon il tombe sur le cadre et ouvre le plein écran")
    }

    /// **La colonne tient sur le PLUS PETIT cadre sans mordre sur le bloc
    /// d'informations.** Le plancher du cadre est 330 pt (trois fois l'overlay),
    /// et l'overlay en occupe 110 : il reste 220 pt à la colonne, qui en demande
    /// 148 au maximum de ses trois actions.
    ///
    /// Écrit contre les identités et non contre 148 : si l'overlay grandit ou si
    /// une quatrième action arrive, c'est ICI que ça doit rougir, pas à l'écran.
    func test_laColonne_tientSurLePlusPetitCadre_sansMordreSurLeBlocDInformations() {
        let colonne = MediaStageActionColumn.height(actions: 3)

        XCTAssertEqual(colonne,
                       3 * MediaStageActionColumn.target + 2 * MediaStageActionColumn.spacing,
                       accuracy: 0.001,
                       "trois cibles et deux intervalles — pas un nombre écrit à la main")
        XCTAssertLessThanOrEqual(
            colonne + MediaGalleryStage.overlayHeight,
            MediaGalleryStage.minimumFrameHeight,
            "sur un cadre à son plancher, la colonne et le bloc d'informations doivent "
                + "COHABITER : ils se partagent la même hauteur, et la colonne est celle "
                + "qui a été déplacée."
        )
        XCTAssertEqual(MediaStageActionColumn.height(actions: 0), 0,
                       "aucune action câblée ⇒ aucune hauteur prise (loi 4)")
        XCTAssertEqual(MediaStageActionColumn.height(actions: 1),
                       MediaStageActionColumn.target, accuracy: 0.001,
                       "une action seule ne paie aucun intervalle")
    }

    // MARK: - 2 · Le cadre ne change pas de taille

    /// **Aucune cote du solveur ne change dans cette issue.** La colonne se pose
    /// SUR le cadre : la gouttière reste la seule réserve latérale, et les cinq
    /// réserves verticales du plateau restent celles de #6141.
    func test_laColonne_nePrendAucuneLargeurAuCadre() {
        let carte = resolve(ratio: 0.8)
        XCTAssertEqual(carte.frame.width,
                       Self.viewport.width - 2 * MediaGalleryStage.gutter,
                       accuracy: 0.5,
                       "la gouttière est la SEULE réserve latérale — un couloir d'actions "
                           + "réservé avant le cadre rendrait 322 au lieu de 366")

        let scene = resolve(ratio: 0.5625)
        XCTAssertEqual(scene.frame.height, 603, accuracy: 0.5,
                       "844 − 59 − 56 − 80 − 34 − 12 : les réserves verticales de #6141")
        XCTAssertEqual(scene.frame.width, 339.19, accuracy: 0.5,
                       "603 × 0,5625 — la scène 9:16 garde exactement le cadre qu'elle avait")

        XCTAssertLessThan(MediaStageActionColumn.width, scene.frame.width,
                          "la colonne se POSE sur le cadre : elle y tient, elle ne le rogne pas")
    }

    // MARK: - 3 · La géographie

    /// **Les trois actions ont quitté la rangée du bas.** Elles y étaient à
    /// droite de l'auteur, en ligne, sous le voile ; elles sont maintenant une
    /// colonne verticale posée sur le cadre.
    func test_lesTroisActions_quittentLaRangeeDuBas_pourUneColonneVerticale() throws {
        let code = try unit()
        guard let colonne = corps("var cadreActionColumn: some View {", dans: code),
              let facadeAuteur = corps("private func bottomMetadataOverlay(", dans: code),
              let blocAuteur = corps("struct GalleryMediaMetadataBlock", dans: code) else {
            return XCTFail("`cadreActionColumn` ou `bottomMetadataOverlay` introuvable — "
                           + "la colonne n'existe pas, la garde ne mesurerait rien")
        }
        let ligneAuteur = facadeAuteur + blocAuteur

        XCTAssertFalse(
            compact(ligneAuteur).contains("mediaActions("),
            "les actions ne se montent plus dans la rangée de l'auteur : c'est tout l'objet "
                + "du #6161."
        )
        XCTAssertTrue(compact(colonne).contains("FullscreenActionRail{"),
                      "la colonne est VERTICALE — c'est la loi de l'issue, mot pour mot — et c'est "
                          + "le rail du SDK (#8878), une pile à intervalle `railSpacing`")
        XCTAssertTrue(compact(colonne).contains("mediaActions("),
                      "et c'est ELLE qui monte les trois actions")
        // #12420 — le rail se pose à DROITE du bloc d'informations, dans la même
        // rangée ancrée en bas (gabarit du rail de la story et du réel) : sept
        // disques ne tiennent plus AU-DESSUS de lui sur un iPhone SE.
        let region = compact(corps("var cadreRegion: some View {", dans: code) ?? "")
        guard let rangee = region.range(of: "HStack(alignment:.bottom"),
              let bloc = region.range(of: "cadreOverlay"),
              let rail = region.range(of: "cadreActionColumn") else {
            return XCTFail("la rangée bloc d'informations + rail est introuvable")
        }
        XCTAssertLessThan(rangee.lowerBound, bloc.lowerBound)
        XCTAssertLessThan(bloc.lowerBound, rail.lowerBound,
                          "le bloc d'abord, le rail ensuite — à DROITE")
        XCTAssertFalse(
            compact(colonne).contains("spacing:"),
            "l'espacement vient du rail partagé, pas d'un nombre recopié dans la vue"
        )
    }

    /// **La colonne se pose sur le PLATEAU, jamais sur le cadre du média**
    /// (#6760, directive porteur : « le plateau EST la scène — le chrome
    /// s'aligne sur lui, jamais sur le média qu'il porte »).
    ///
    /// Ce témoin a porté la doctrine INVERSE jusqu'au #6771 : il exigeait que
    /// `cadreActionColumn` précède le `.frame(currentStage.frame)`, c'est-à-dire
    /// qu'elle en soit un ENFANT. #6760 l'en a SORTIE, et pour une raison
    /// mesurée — sur une pièce 900 × 3 600, la colonne se posait à x ≈ 615, le
    /// bord du média, quand le plateau s'arrête à 690 : le repère que
    /// l'utilisateur apprend bougeait d'un média à l'autre. Le témoin est donc
    /// resté ROUGE sur `dev` en décrivant une loi que le produit avait
    /// abandonnée — et une garde qui décrit l'ancienne loi ne garde plus rien,
    /// elle réclame la régression.
    ///
    /// ## La loi d'aujourd'hui est un ORDRE à trois jalons
    ///
    /// ```
    /// .frame(width: currentStage.frame.width…)   ← le cadre du MÉDIA se referme
    ///     cadreActionColumn                      ← la colonne vient APRÈS
    /// .frame(width: stageChromeWidth)            ← et DANS la pile du plateau
    /// ```
    ///
    /// C'est cet encadrement qui rend le témoin sensible à la mutation : remettre
    /// la colonne dans le cadre du média la ferait repasser AVANT le premier
    /// jalon, et l'en sortir tout à fait la ferait passer APRÈS le troisième.
    /// Un seul `XCTAssertLessThan` n'attraperait qu'une moitié.
    ///
    /// **Ce témoin ne rouvre pas la réserve latérale abandonnée** (#4561,
    /// #4633) : il dit où la colonne est DÉCLARÉE, jamais qu'elle prend de la
    /// largeur au cadre. C'est
    /// `test_laColonne_nePrendAucuneLargeurAuCadre`, juste au-dessus, qui garde
    /// cette moitié-là — et il est resté vert tout du long.
    func test_laColonne_sePoseSurLePlateau_pasSurLeCadreDuMedia() throws {
        let code = try unit()
        guard let region = corps("var cadreRegion: some View {", dans: code) else {
            return XCTFail("`cadreRegion` introuvable")
        }
        let plat = compact(region)

        XCTAssertTrue(plat.contains("cadreActionColumn"),
                      "la colonne vit dans la région du cadre — c'est ce qui la fait se poser "
                          + "DESSUS plutôt qu'à côté")
        XCTAssertTrue(plat.contains("currentStage.frame.width")
                        && plat.contains("currentStage.frame.height"),
                      "et cette région reste dimensionnée par le solveur")

        guard let cadreDuMedia = plat.range(of: ".frame(width:currentStage.frame.width"),
              let colonne = plat.range(of: "cadreActionColumn"),
              let cadreDuPlateau = plat.range(of: ".frame(width:stageChromeWidth)") else {
            return XCTFail(
                "les trois jalons de la région ne se lisent pas — le cadre du média, la "
                    + "colonne, et le cadre du plateau qui la porte"
            )
        }

        XCTAssertLessThan(
            cadreDuMedia.lowerBound, colonne.lowerBound,
            "la colonne n'est PLUS un enfant du cadre du média : le cadre se referme AVANT "
                + "elle, sinon le chrome se déplacerait avec la forme du fichier (#6760)"
        )
        XCTAssertLessThan(
            colonne.lowerBound, cadreDuPlateau.lowerBound,
            "et elle est déclarée DANS la pile que `stageChromeWidth` dimensionne — c'est "
                + "le plateau qui lui donne son bord, pas le média"
        )
    }

    /// **La largeur du chrome est DÉRIVÉE, jamais recopiée.** `stageChromeWidth`
    /// projette `StageChromeAlignment.chromeBounds` ; un nombre écrit à la main
    /// aurait la même valeur aujourd'hui et cesserait de suivre la loi demain.
    func test_laLargeurDuChrome_vientDeLaLoi_pasDUnNombre() throws {
        let code = try unit()
        guard let largeur = corps("var stageChromeWidth: CGFloat {", dans: code) else {
            return XCTFail("`stageChromeWidth` introuvable — la colonne n'aurait plus de bord")
        }
        XCTAssertTrue(compact(largeur).contains("StageChromeAlignment.chromeBounds("),
                      "la largeur du chrome se DEMANDE à la loi partagée (#6760), elle ne se "
                          + "recalcule pas chez l'hôte")
    }

    /// **Ce qui RESTE en bas, sous son voile** — le porteur l'a explicitement
    /// validé, et un lot qui déplace les actions pourrait l'emporter au passage.
    ///
    /// **Le VOILE, lui, a changé de couche** (#6904 tour 5, directive porteur du
    /// 2026-09-18 : « il faut bien faire attention à l'ombre dégradé pour rendre
    /// le texte lisible qui doit être mis sur tous l'écran à partir du bas de
    /// l'écran »). Ce que le porteur a validé est l'EFFET — une légende lisible
    /// sur un bas d'écran fondu au noir —, jamais le site d'un `LinearGradient` :
    /// le dégradé posé sur le bloc du cadre ne produisait cet effet ni sur les
    /// gouttières (la carte est plus étroite que l'écran) ni jusqu'au bas de
    /// l'écran (il s'arrêtait au bord du bloc). Le témoin garde donc l'effet à
    /// son NOUVEAU site — `stageScrimsLayer`, le voile de la story —, et le
    /// mesure au pixel dans `MediaGalleryStageScrimsTests`.
    func test_lAuteurLaDateLaLegendeEtLeFormat_restentEnBasSousLeurVoile() throws {
        let code = try unit()
        guard let blocBas = corps("var bottomOverlay: some View {", dans: code),
              let ligneAuteur = corps("struct GalleryMediaMetadataBlock", dans: code) else {
            return XCTFail("le bloc bas ou la rangée d'auteur sont introuvables")
        }

        XCTAssertTrue(compact(blocBas).contains("bottomMetadataOverlay(att)"),
                      "l'auteur et sa date restent en bas du cadre")
        // #9075 : la légende porte ses adresses suivies (`/l/`) — l'appel a
        // gagné `links:`, la légende reste dans le bloc bas.
        XCTAssertTrue(compact(blocBas).contains("captionOverlay(caption,links:captionLinks[att.id]??[:])"),
                      "la légende dépliable aussi")
        XCTAssertTrue(compact(ligneAuteur).contains("att.fileSizeFormatted"),
                      "et la ligne format / dimensions / poids avec elle")
        XCTAssertTrue(compact(code).contains("StoryReaderScrims(") || compact(code).contains("FullscreenScrims("),
                      "et leur voile reste — celui de l'ÉCRAN désormais : c'est l'effet que le " +
                      "porteur a validé, au site où il le produit vraiment")
    }

    // MARK: - 4 · La collision avec les gestes du plein cadre

    /// **Toucher une action ne doit pas ouvrir le plein cadre au passage**
    /// (#6142 : tap, appui long, glissement).
    ///
    /// La cible fait 44 pt, le verre 40 : il reste un anneau de 2 pt tout autour
    /// du cercle. Sans forme de contenu PLEINE, un doigt posé dans cet anneau —
    /// ou dans les coins du carré, que le cercle ne couvre pas — traverse le
    /// bouton et atterrit sur le cadre, qui l'interprète comme un tap et entre
    /// en plein écran. **Le défaut ne se voit pas : l'action ne part pas, et
    /// l'écran fait quelque chose d'autre.** C'est l'EFFET que ce témoin garde,
    /// pas un état interne.
    func test_chaqueAction_consommeToutSaCible_etNeLaisseRienPasserAuCadre() throws {
        let code = try unit()
        guard let actions = corps("private func mediaActions(", dans: code) else {
            return XCTFail("`mediaActions` introuvable")
        }
        let plat = compact(actions)

        XCTAssertEqual(
            plat.components(separatedBy: "style:.disc(.adaptive)").count - 1,
            3,
            "les TROIS actions passent par le même disque du chrome plein écran — réagir, "
                + "répondre, composer. Son cadre de `FullscreenChromeMetrics.tapTarget` et sa forme "
                + "de contenu PLEINE sont ceux du SDK : sans eux l'anneau entre le verre et la "
                + "cible laisse passer le doigt vers le cadre, qui ouvre le plein écran."
        )
        XCTAssertFalse(
            plat.contains("adaptiveGlass("),
            "aucune action ne repeint son propre verre : c'est le disque partagé qui le pose"
        )
    }

    /// **La colonne ne monte AUCUN geste du plein cadre.** Les trois portes de
    /// #6142 vivent sur la page, dans le pager — une couche SOUS celle des
    /// contrôles. Un geste recopié sur la colonne les ferait cohabiter sur la
    /// même surface, et l'arbitrage entre eux ne serait plus décidable.
    func test_laColonne_neMonteAucunGesteDuPleinCadre() throws {
        let code = try unit()
        guard let colonne = corps("var cadreActionColumn: some View {", dans: code),
              let actions = corps("private func mediaActions(", dans: code) else {
            return XCTFail("`cadreActionColumn` ou `mediaActions` introuvable")
        }

        for site in [compact(colonne), compact(actions)] {
            XCTAssertFalse(site.contains("onEnterStage("),
                           "une action n'entre pas en plein cadre : elle FAIT quelque chose")
            XCTAssertFalse(site.contains(".onTapGesture"),
                           "les actions sont des `Button` — un tap geste en plus doublerait le déclenchement")
            XCTAssertFalse(site.contains("LongPressGesture"))
            XCTAssertFalse(site.contains("DragGesture"))
        }
    }
}

// MARK: - 5 · Le rail porte les cinq actions (#12420)

/// **Réagir, Répondre, Créer, Enregistrer et Transférer vivent dans LE rail**
/// (demande porteur 2026-10-23). Le témoin lit ce que VoiceOver lit dans une
/// fenêtre réelle : les cinq actions annoncées, dans cet ordre, sur UNE seule
/// colonne — la même abscisse —, et à DROITE du bloc d'informations plutôt
/// qu'au-dessus de lui.
@MainActor
final class MediaGalleryRailActionsTests: XCTestCase {

    private static let window = CGSize(width: 402, height: 874)

    private static var react: String { String(localized: "media.react.title", defaultValue: "Réagir", bundle: .main) }
    private static var reply: String { String(localized: "media.reply.title", defaultValue: "Répondre", bundle: .main) }
    private static var compose: String {
        String(localized: "media.compose.title", defaultValue: "Créer avec ce média", bundle: .main)
    }
    private static var save: String { String(localized: "media.save.title", defaultValue: "Enregistrer", bundle: .main) }
    private static var forward: String { MessageActionVerb.forward.label }

    private static func gallery(forwarding: Bool, exitGate: ContentExitGate) -> some View {
        let lot = MediaGalleryLot.imagesOnly(3)
        return ConversationMediaGalleryView(
            allAttachments: lot,
            startAttachmentId: lot[0].id,
            accentColor: "6366F1",
            onComposeWithMedia: { _ in },
            onReplyToMedia: { _ in },
            onReactToMedia: { _, _ in },
            onForwardMedia: forwarding ? { _ in } : nil,
            entryPresentation: .carded
        )
        .contentExitGate(exitGate)
    }

    private func frame(_ label: String, in screen: RenderedScreen) -> CGRect? {
        screen.nodes.first { $0.label == label && $0.frame.width > 0 }?.frame
    }

    func test_theRail_carriesTheFiveActions_inOneColumn_inTheirOrder() throws {
        let screen = RenderedScreen(Self.gallery(forwarding: true, exitGate: .open), size: Self.window)
        defer { screen.dismount() }

        let order = [Self.react, Self.reply, Self.compose, Self.save, Self.forward]
        let frames = order.map { frame($0, in: screen) }
        for (label, cadre) in zip(order, frames) {
            XCTAssertNotNil(cadre, "« \(label) » n'est pas dans le rail — annoncé : \(screen.labels)")
        }
        let posees = frames.compactMap { $0 }
        guard posees.count == order.count, let premier = posees.first else { return }
        for cadre in posees {
            XCTAssertEqual(cadre.midX, premier.midX, accuracy: 1,
                           "une seule colonne : chaque action a l'abscisse du rail")
            XCTAssertTrue(cadre.maxX <= Self.window.width && cadre.minX >= 0, "le rail reste dans l'écran")
        }
        XCTAssertEqual(posees.map(\.minY), posees.map(\.minY).sorted(),
                       "Réagir, Répondre, Créer, puis Enregistrer et Transférer, de haut en bas")
        XCTAssertGreaterThan(premier.midX, Self.window.width / 2, "le rail est au bord DROIT")

        if let data = screen.snapshotPNG() {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("gallery-rail-12420.png")
            try data.write(to: url)
            print("RECETTE-12420 capture : \(url.path)")
        }
    }

    func test_theRail_neverOffersWhatTheHostCannotServe() {
        let screen = RenderedScreen(Self.gallery(forwarding: false, exitGate: .sealed), size: Self.window)
        defer { screen.dismount() }

        XCTAssertNotNil(frame(Self.react, in: screen), "le rail est monté — sinon l'absence ne prouverait rien")
        XCTAssertNil(frame(Self.forward, in: screen), "un hôte qui ne transfère pas n'a pas de « Transférer » (loi 4)")
        XCTAssertNil(frame(Self.save, in: screen),
                     "une pièce que la loi de sortie retient ne s'enregistre pas depuis le rail (#9573)")
    }

    /// Le rail à sept disques — cinq actions, le son et (...) — tient à côté du bloc
    /// d'informations sur le plus petit écran servi, couloirs de série et de durée réservés.
    func test_theFullRail_fitsTheSmallestPlateau() {
        let video = MessageAttachment(id: "vid", mimeType: "video/mp4", fileSize: 4_204_800,
                                      fileUrl: "https://cdn.meeshy.me/v.mp4", width: 1_080, height: 1_920,
                                      duration: 12_000, uploadedBy: "u-1")
        let reserves = MediaGalleryStage.corridors(safeTop: 20, safeBottom: 0,
                                                   attachments: [video] + MediaGalleryLot.imagesOnly(1))
        XCTAssertGreaterThan(reserves.transport, 0, "la bande de durée est réservée : le cas le plus serré")
        let region = 667
            - MediaGalleryStage.topInset(presentation: .carded, corridors: reserves)
            - MediaGalleryStage.bottomInset(presentation: .carded, corridors: reserves)
        XCTAssertLessThanOrEqual(MediaStageActionColumn.height(actions: 7), region)
    }
}
