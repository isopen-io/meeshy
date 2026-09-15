import XCTest
import CoreGraphics
import MeeshySDK
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
    /// et le VERRE reste à 40 — doctrine 82i, le glyphe est borné par un cadre
    /// fixe. Les deux nombres ne disent donc pas la même chose : l'un est ce
    /// qu'on VOIT, l'autre ce qu'on TOUCHE, et les confondre rend soit une
    /// pastille trop grosse, soit une cible trop petite.
    func test_laCible_dUneAction_nEstJamaisSousQuaranteQuatre() {
        XCTAssertGreaterThanOrEqual(MediaStageActionColumn.target, 44,
                                    "la cible tactile ne descend pas sous 44 pt")
        XCTAssertEqual(MediaStageActionColumn.glass, 40,
                       "le verre reste au gabarit 40 pt du chrome (doctrine 82i)")
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
              let ligneAuteur = corps("private func bottomMetadataOverlay(", dans: code) else {
            return XCTFail("`cadreActionColumn` ou `bottomMetadataOverlay` introuvable — "
                           + "la colonne n'existe pas, la garde ne mesurerait rien")
        }

        XCTAssertFalse(
            compact(ligneAuteur).contains("mediaActions("),
            "les actions ne se montent plus dans la rangée de l'auteur : c'est tout l'objet "
                + "du #6161."
        )
        XCTAssertTrue(compact(colonne).contains("VStack("),
                      "la colonne est VERTICALE — c'est la loi de l'issue, mot pour mot")
        XCTAssertTrue(compact(colonne).contains("mediaActions("),
                      "et c'est ELLE qui monte les trois actions")
        XCTAssertTrue(
            compact(colonne).contains("alignment:.trailing"),
            "à DROITE du cadre — gabarit de `StoryViewerView+Sidebar.swift`"
        )
        XCTAssertTrue(
            compact(colonne).contains("spacing:MediaStageActionColumn.spacing"),
            "l'espacement vient de la règle, pas d'un nombre recopié dans la vue"
        )
    }

    /// **La colonne est dimensionnée par le cadre COURANT**, jamais par une cote
    /// recopiée : elle est montée DANS `cadreRegion`, à l'intérieur du cadrage
    /// et du clip que le solveur a rendus.
    func test_laColonne_sePoseSurLeCadre_dansSonCadrageEtSonClip() throws {
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

        guard let colonne = plat.range(of: "cadreActionColumn"),
              let cadrage = plat.range(of: ".frame(width:currentStage.frame.width") else {
            return XCTFail("l'ordre de la région ne se lit pas")
        }
        XCTAssertLessThan(colonne.lowerBound, cadrage.lowerBound,
                          "la colonne est un ENFANT du cadre, donc déclarée avant le `.frame` "
                              + "qui le dimensionne — sinon elle déborderait le clip")
    }

    /// **Ce qui RESTE en bas, sous son voile** — le porteur l'a explicitement
    /// validé, et un lot qui déplace les actions pourrait l'emporter au passage.
    func test_lAuteurLaDateLaLegendeEtLeFormat_restentEnBasSousLeurVoile() throws {
        let code = try unit()
        guard let blocBas = corps("var bottomOverlay: some View {", dans: code),
              let overlay = corps("var cadreOverlay: some View {", dans: code),
              let ligneAuteur = corps("private func bottomMetadataOverlay(", dans: code) else {
            return XCTFail("le bloc bas, l'overlay du cadre ou la rangée d'auteur sont introuvables")
        }

        XCTAssertTrue(compact(blocBas).contains("bottomMetadataOverlay(att)"),
                      "l'auteur et sa date restent en bas du cadre")
        XCTAssertTrue(compact(blocBas).contains("captionOverlay(caption)"),
                      "la légende dépliable aussi")
        XCTAssertTrue(compact(ligneAuteur).contains("att.fileSizeFormatted"),
                      "et la ligne format / dimensions / poids avec elle")
        XCTAssertTrue(compact(overlay).contains("LinearGradient("),
                      "le voile reste : c'est l'effet que le porteur a validé")
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
        guard let cible = corps("func mediaStageActionTarget()", dans: code),
              let actions = corps("private func mediaActions(", dans: code) else {
            return XCTFail("`mediaStageActionTarget` ou `mediaActions` introuvable")
        }
        let platCible = compact(cible)

        XCTAssertTrue(
            platCible.contains("frame(width:MediaStageActionColumn.target,height:MediaStageActionColumn.target)"),
            "la cible mesure `MediaStageActionColumn.target` — l'identité, jamais 44 recopié"
        )
        XCTAssertTrue(
            platCible.contains(".contentShape(Rectangle())"),
            "et elle est PLEINE : sans cela l'anneau entre le verre et la cible laisse "
                + "passer le doigt vers le cadre, qui ouvre le plein écran."
        )
        XCTAssertEqual(
            AppSourceGuard.occurrences(ofIdentifier: "mediaStageActionTarget",
                                       in: compact(actions)),
            3,
            "les TROIS actions passent par la même cible — réagir, répondre, composer. "
                + "Une seule oubliée et c'est elle qui ouvrira le plein écran."
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
