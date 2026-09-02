import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #4718 — **les neuf décorations livrées avec l'application.**
///
/// Les témoins ne comparent aucun pixel à une image d'or : un dessin figé en
/// fixture rougirait à la première mise à jour de police système sans qu'aucune
/// décoration n'ait empiré. Ils vérifient ce qui doit RESTER vrai — que chaque
/// gabarit du catalogue se dessine, que l'heure servie est celle qu'on a posée,
/// et qu'un même contenu rend un même dessin.
@MainActor
final class StickerTemplateRendererTests: XCTestCase {

    private let géométrie = CanvasGeometry(renderSize: CGSize(width: 402, height: 715))

    private var mesuresLieu: StickerTemplateMetrics {
        StickerTemplateMetrics.location(geometry: géométrie, scale: 1)
    }

    private var mesuresSticker: StickerTemplateMetrics {
        StickerTemplateMetrics.sticker(geometry: géométrie, baseSize: 140, scale: 1)
    }

    private func mesures(for famille: StickerTemplateFamily) -> StickerTemplateMetrics {
        famille == .location ? mesuresLieu : mesuresSticker
    }

    /// Des emplacements plausibles pour chaque famille — le remplisseur est
    /// testé ailleurs (#4716), ici on ne teste que le DESSIN.
    private func emplacements(for famille: StickerTemplateFamily) -> [String: String] {
        switch famille {
        case .location:
            return StickerSlotFiller.placeSlots(
                for: SharedPlace(latitude: 48.86, longitude: 2.35,
                                 name: "Le Marais", address: "Paris"))
        case .time:
            return [StickerSlotFiller.timeSlot: "14:32",
                    StickerSlotFiller.hourSlot: "14",
                    StickerSlotFiller.minuteSlot: "32",
                    StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .love:
            return [StickerSlotFiller.dateSlot: "1 septembre 2026"]
        case .weather:
            return [:]
        case .text:
            return [StickerSlotFiller.textSlot: "Bon anniversaire"]
        case .joy, .surprise, .mood, .greeting, .reaction, .party, .availability,
             .nature, .cheer, .answer, .food, .sport:
            return [:]
        }
    }

    // MARK: - La garde qui relie le CATALOGUE au DESSIN

    /// **Le registre et le catalogue sont deux listes du MÊME ensemble**
    /// (#4820). Un gabarit catalogué sans dessinateur rendrait son repli ; un
    /// dessinateur sans gabarit serait du code mort que rien n'atteint.
    func test_everyDrawer_hasItsTemplate_andEveryTemplate_itsDrawer() {
        let catalogués = Set(StickerTemplateCatalog.all.map(\.id))
        let dessinables = StickerTemplateRenderer.drawableTemplateIDs
        XCTAssertEqual(catalogués.subtracting(dessinables), [],
                       "gabarits catalogués sans dessinateur")
        XCTAssertEqual(dessinables.subtracting(catalogués), [],
                       "dessinateurs sans gabarit au catalogue")
    }

    /// Chaque dessinateur porte le NOM que la palette et VoiceOver disent —
    /// et il n'est jamais le libellé générique réservé à l'inconnu.
    func test_everyDrawer_namesItself() {
        for gabarit in StickerTemplateCatalog.all {
            let nom = StickerTemplateRenderer.drawer(for: gabarit.id)?.name() ?? ""
            XCTAssertFalse(nom.isEmpty, "\(gabarit.id) — dessinateur sans nom")
        }
    }

    /// **Un gabarit CATALOGUÉ doit être DESSINÉ.**
    ///
    /// Le catalogue (#4716) et le dessin (#4718) sont arrivés par deux lots :
    /// entre les deux, un gabarit pouvait exister dans la palette et ne rien
    /// rendre. C'est une garde d'INVENTAIRE — elle balaie le catalogue, donc
    /// un dixième gabarit ajouté sans son dessin la fait rougir toute seule.
    func test_everyCatalogTemplate_actuallyDraws() {
        for gabarit in StickerTemplateCatalog.all {
            let m = mesures(for: gabarit.family)
            let s = emplacements(for: gabarit.family)

            let taille = StickerTemplateRenderer.measuredSize(
                templateID: gabarit.id, slots: s, metrics: m)
            XCTAssertNotNil(taille, "\(gabarit.id) — catalogué mais sans mesure")
            XCTAssertGreaterThan(taille?.width ?? 0, 0, "\(gabarit.id) — largeur nulle")
            XCTAssertGreaterThan(taille?.height ?? 0, 0, "\(gabarit.id) — hauteur nulle")

            let rendu = StickerTemplateRenderer.image(
                templateID: gabarit.id, slots: s, metrics: m, screenScale: 2)
            XCTAssertNotNil(rendu?.0, "\(gabarit.id) — catalogué mais sans dessin")
        }
    }

    /// Mesurer et dessiner doivent tomber d'accord sur TOUS les gabarits : le
    /// reader pose ses cibles de tap sur la mesure, le canvas ses `bounds` sur
    /// le dessin.
    func test_everyTemplate_measuresWhatItDraws() {
        for gabarit in StickerTemplateCatalog.all {
            let m = mesures(for: gabarit.family)
            let s = emplacements(for: gabarit.family)
            let mesurée = StickerTemplateRenderer.measuredSize(
                templateID: gabarit.id, slots: s, metrics: m)
            let dessinée = StickerTemplateRenderer.image(
                templateID: gabarit.id, slots: s, metrics: m, screenScale: 2)?.1
            XCTAssertEqual(mesurée?.width ?? -1, dessinée?.width ?? -2,
                           accuracy: 0.01, "\(gabarit.id)")
            XCTAssertEqual(mesurée?.height ?? -1, dessinée?.height ?? -2,
                           accuracy: 0.01, "\(gabarit.id)")
        }
    }

    /// #4745 — **« bien distinctes » rendu vérifiable.**
    ///
    /// Le porteur voulait des pastilles de lieu qu'on distingue au premier coup
    /// d'œil. Une revue à l'œil ne se rejoue pas ; deux dessins IDENTIQUES, si.
    /// Le témoin compare les six deux à deux, sur le MÊME lieu — ce qui varie
    /// est alors la seule forme.
    func test_theSixLocationTemplates_allLookDifferent() throws {
        let m = mesuresLieu
        let s = emplacements(for: .location)
        var rendus: [String: Data] = [:]
        for gabarit in StickerTemplateCatalog.templates(family: .location) {
            let png = try XCTUnwrap(
                StickerTemplateRenderer.image(templateID: gabarit.id, slots: s,
                                              metrics: m, screenScale: 2)?.0?.pngData(),
                "\(gabarit.id) ne se dessine pas")
            for (autre, déjà) in rendus {
                XCTAssertNotEqual(png, déjà,
                                  "\(gabarit.id) et \(autre) rendent le MÊME dessin.")
            }
            rendus[gabarit.id] = png
        }
        XCTAssertEqual(rendus.count, StickerTemplateCatalog.templates(family: .location).count,
                       "chaque pastille de lieu cataloguée doit se dessiner")
    }

    /// Et elles ne se distinguent pas seulement par leur contenu : leurs
    /// SILHOUETTES diffèrent. Un timbre est plus haut que large, une enseigne
    /// plus large que haute — deux cartouches de mêmes proportions se
    /// ressembleraient dans la palette quel que soit leur décor.
    func test_theLocationTemplates_doNotAllShareOneSilhouette() {
        let m = mesuresLieu
        let s = emplacements(for: .location)
        let rapports = StickerTemplateCatalog.templates(family: .location).compactMap { gabarit -> CGFloat? in
            guard let taille = StickerTemplateRenderer.measuredSize(
                templateID: gabarit.id, slots: s, metrics: m), taille.height > 0
            else { return nil }
            return (taille.width / taille.height * 100).rounded() / 100
        }
        XCTAssertGreaterThanOrEqual(Set(rapports).count, 4,
                                    "Six pastilles pour moins de quatre silhouettes : elles se confondent.")
    }

    func test_unknownTemplate_drawsNothing_ratherThanGuessing() {
        XCTAssertNil(StickerTemplateRenderer.measuredSize(
            templateID: "venu.du.futur", slots: [:], metrics: mesuresSticker))
        XCTAssertNil(StickerTemplateRenderer.image(
            templateID: "venu.du.futur", slots: [:], metrics: mesuresSticker, screenScale: 2))
    }

    // MARK: - Les MOTS (#4822)

    /// Deux textes ⇒ deux dessins ; un texte VIDE dessine encore quelque chose
    /// (l'exemple), jamais une boîte nulle.
    func test_textTemplates_drawTheAuthorsWords() throws {
        for gabarit in StickerTemplateCatalog.templates(family: .text) {
            let a = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: gabarit.id, slots: [StickerSlotFiller.textSlot: "Coucou"],
                metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            let b = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: gabarit.id, slots: [StickerSlotFiller.textSlot: "Bon anniversaire à toi"],
                metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            XCTAssertNotEqual(a, b, "\(gabarit.id) — deux textes rendent le même dessin")
            let vide = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
                templateID: gabarit.id, slots: [:], metrics: mesuresSticker))
            XCTAssertGreaterThan(vide.width, 0, gabarit.id)
            XCTAssertGreaterThan(vide.height, 0, gabarit.id)
        }
    }

    /// Une phrase LONGUE se plie : la largeur est bornée, la hauteur monte.
    func test_textTemplates_wrapLongText() throws {
        let court = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
            templateID: StickerTemplateCatalog.ID.textBadge,
            slots: [StickerSlotFiller.textSlot: "Coucou"], metrics: mesuresSticker))
        let long = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
            templateID: StickerTemplateCatalog.ID.textBadge,
            slots: [StickerSlotFiller.textSlot: String(repeating: "des mots ", count: 12)],
            metrics: mesuresSticker))
        XCTAssertLessThan(long.width, mesuresSticker.fontSize * 9 + mesuresSticker.horizontalPadding * 2 + mesuresSticker.fontSize)
        XCTAssertGreaterThan(long.height, court.height)
    }

    // MARK: - Le gel, vu depuis le DESSIN

    /// **Rien dans le dessin ne lit l'horloge.** Le gabarit rend ce que les
    /// emplacements portent — donc deux appels au même contenu rendent le même
    /// dessin, à n'importe quel moment de la journée.
    func test_timeTemplates_drawTheFrozenSlots_notTheClock() throws {
        for id in [StickerTemplateCatalog.ID.timeDigital,
                   StickerTemplateCatalog.ID.timeAnalog,
                   StickerTemplateCatalog.ID.timeRibbon] {
            let s = emplacements(for: .time)
            let a = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: id, slots: s, metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            let b = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: id, slots: s, metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            XCTAssertEqual(a, b, "\(id) — deux rendus du même contenu doivent coïncider")
        }
    }

    /// Et le dessin CHANGE quand l'heure posée change — sans quoi le témoin
    /// ci-dessus passerait aussi sur un gabarit qui n'affiche rien.
    func test_timeTemplates_drawADifferentHour_differently() throws {
        let matin = [StickerSlotFiller.timeSlot: "09:05",
                     StickerSlotFiller.hourSlot: "09", StickerSlotFiller.minuteSlot: "05"]
        let soir = [StickerSlotFiller.timeSlot: "21:47",
                    StickerSlotFiller.hourSlot: "21", StickerSlotFiller.minuteSlot: "47"]
        for id in [StickerTemplateCatalog.ID.timeDigital,
                   StickerTemplateCatalog.ID.timeAnalog,
                   StickerTemplateCatalog.ID.timeRibbon] {
            let a = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: id, slots: matin, metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            let b = try XCTUnwrap(StickerTemplateRenderer.image(
                templateID: id, slots: soir, metrics: mesuresSticker, screenScale: 2)?.0?.pngData())
            XCTAssertNotEqual(a, b, "\(id) — deux heures différentes rendent le même dessin")
        }
    }

    /// Le cadran ne change pas de TAILLE d'une minute à l'autre — une
    /// décoration qui grandit toute seule saute sur la scène.
    func test_analogClock_keepsAConstantSize_whateverTheHour() {
        let onze = [StickerSlotFiller.hourSlot: "11", StickerSlotFiller.minuteSlot: "11"]
        let vingt = [StickerSlotFiller.hourSlot: "20", StickerSlotFiller.minuteSlot: "48"]
        XCTAssertEqual(
            StickerTemplateRenderer.measuredSize(templateID: StickerTemplateCatalog.ID.timeAnalog,
                                                 slots: onze, metrics: mesuresSticker),
            StickerTemplateRenderer.measuredSize(templateID: StickerTemplateCatalog.ID.timeAnalog,
                                                 slots: vingt, metrics: mesuresSticker))
    }

    /// Les aiguilles sont lues en NOMBRES. Une chaîne d'affichage anglaise
    /// (« 2:32 PM ») ne doit jamais servir de source — d'où deux emplacements
    /// numériques à côté de la chaîne.
    func test_clockHands_readTheNumericSlots_notTheDisplayString() {
        let aiguilles = StickerTemplateRenderer.clockHands([
            StickerSlotFiller.timeSlot: "2:32 PM",
            StickerSlotFiller.hourSlot: "14",
            StickerSlotFiller.minuteSlot: "32",
        ])
        XCTAssertEqual(aiguilles.heure, 14)
        XCTAssertEqual(aiguilles.minute, 32)
    }

    /// Des emplacements absents ne plantent pas : le cadran retombe sur minuit.
    func test_clockHands_missingSlots_fallBackToMidnight() {
        let aiguilles = StickerTemplateRenderer.clockHands([:])
        XCTAssertEqual(aiguilles.heure, 0)
        XCTAssertEqual(aiguilles.minute, 0)
    }

    // MARK: - Le lieu sans détail

    /// Un lieu sans nom prend son adresse comme titre et laisse le détail vide.
    /// Le cartouche à DEUX lignes doit alors se dessiner quand même — c'est le
    /// cas que le gabarit à une seule ligne ne rencontre jamais.
    func test_postcard_drawsWithoutADetailLine() {
        let sansDétail = [StickerSlotFiller.placeNameSlot: "12 rue de Rivoli",
                          StickerSlotFiller.placeDetailSlot: ""]
        let rendu = StickerTemplateRenderer.image(
            templateID: StickerTemplateCatalog.ID.locationPostcard,
            slots: sansDétail, metrics: mesuresLieu, screenScale: 2)
        XCTAssertNotNil(rendu?.0)
        XCTAssertGreaterThan(rendu?.1.height ?? 0, 0)
    }

    // MARK: - Les proportions

    /// Les mesures d'un sticker gabarit viennent de `CanvasGeometry
    /// .stickerFontSize` — **source unique des trois pipelines** (canvas,
    /// composite de miniature, export). S'en écarter ferait sortir la
    /// décoration à une taille dans la story et à une autre dans la vignette.
    func test_stickerMetrics_derive_fromTheCanonicalStickerSize() {
        let m = StickerTemplateMetrics.sticker(geometry: géométrie, baseSize: 140, scale: 2)
        let attendu = CanvasGeometry.stickerFontSize(baseSize: 140, scale: 2,
                                                     canvasWidth: géométrie.renderSize.width)
        XCTAssertEqual(m.fontSize, attendu, accuracy: 0.001)
    }

    /// Le `scale` de l'auteur agrandit la décoration — sur toutes les familles.
    func test_everyTemplate_growsWithTheAuthorScale() {
        for gabarit in StickerTemplateCatalog.all where gabarit.family != .location {
            let petit = StickerTemplateMetrics.sticker(geometry: géométrie, baseSize: 140, scale: 1)
            let grand = StickerTemplateMetrics.sticker(geometry: géométrie, baseSize: 140, scale: 2)
            let s = emplacements(for: gabarit.family)
            let a = StickerTemplateRenderer.measuredSize(templateID: gabarit.id, slots: s, metrics: petit)
            let b = StickerTemplateRenderer.measuredSize(templateID: gabarit.id, slots: s, metrics: grand)
            XCTAssertGreaterThan(b?.width ?? 0, a?.width ?? 0, "\(gabarit.id)")
            XCTAssertGreaterThan(b?.height ?? 0, a?.height ?? 0, "\(gabarit.id)")
        }
    }
}
