import Testing
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// Des mesures d'espion, hors de la suite. `StickerTemplateMetrics` vit dans
/// MeeshyUI, isolé au MainActor par défaut : son init l'est aussi, donc la
/// constante de fichier doit l'être (mesuré en CI : « main actor-isolated
/// default value in a nonisolated context ») — la suite est `@MainActor`, elle
/// la lit sans saut.
@MainActor private let mesuresEspion = StickerTemplateMetrics(fontSize: 40, horizontalPadding: 20,
                                                   verticalPadding: 12, gap: 9)

/// #4947 — **le même gabarit ne se redessine pas** (D-MEM-01).
///
/// Une bulle de conversation rejoue sa rasterisation à chaque réapparition de
/// cellule (`MessageStickerArtwork` monte un `.task(id: renderKey)`), et la
/// palette redessine sa vignette à chaque passage : scroller loin puis revenir
/// refaisait tourner CoreGraphics pour un dessin identique, sur le fil
/// principal, au moment précis où il faut des images.
///
/// Les témoins mesurent le nombre de dessins RÉELS avec un dessinateur espion —
/// c'est ce que `memoizedImage(drawer:…)` permet en prenant un
/// `StickerTemplateDrawer` plutôt qu'un id : le registre, lui, n'est pas
/// injectable.
///
/// Chaque témoin fabrique son propre id (le cache est global et les suites
/// Swift Testing s'exécutent en parallèle) : deux témoins ne peuvent pas se
/// voler une entrée.
@MainActor
@Suite("StickerTemplateRenderer — mémoïsation du rendu")
struct StickerTemplateRendererCacheTests {

    /// Compte les dessins d'un dessinateur espion. Une classe : la fermeture
    /// `Draw` capture la même instance que le témoin relit ensuite.
    private final class DrawCounter {
        var count = 0
    }

    /// Un dessinateur qui rend un carré plein d'une couleur donnée, et compte
    /// ses passages.
    private func spy(id: String, counter: DrawCounter, side: CGFloat = 24) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: id,
            name: { "espion" },
            measure: { _, _ in CGSize(width: side, height: side) },
            draw: { _, _, échelle in
                counter.count += 1
                return StickerTemplateDrawing.rasterize(size: CGSize(width: side, height: side),
                                                        screenScale: échelle) {
                    UIColor.red.setFill()
                    UIBezierPath(rect: CGRect(x: 0, y: 0, width: side, height: side)).fill()
                }
            })
    }

    private func render(_ dessinateur: StickerTemplateDrawer,
                        slots: [String: String] = [:],
                        metrics: StickerTemplateMetrics = mesuresEspion,
                        scale: CGFloat = 2) -> (UIImage?, CGSize)? {
        StickerTemplateRenderer.memoizedImage(drawer: dessinateur, slots: slots,
                                              metrics: metrics, screenScale: scale)
    }

    // MARK: - Le dessin ne se rejoue pas

    @Test("deux demandes identiques ⇒ un seul dessin")
    func test_memoizedImage_twiceWithTheSameKey_drawsOnce() throws {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur)

        let premier = try #require(render(dessinateur))
        let second = try #require(render(dessinateur))

        // Les deux images se comparent DÉBALLÉES : deux `nil` seraient
        // identiques, et le témoin passerait sur un dessinateur qui ne rend
        // plus rien.
        let imagePremière = try #require(premier.0)
        let imageSeconde = try #require(second.0)

        #expect(compteur.count == 1)
        #expect(imagePremière === imageSeconde)
        #expect(premier.1 == second.1)
    }

    /// La taille SERVIE est celle que le dessinateur a annoncée — la relire
    /// depuis `image.size` supposerait que tout dessinateur rasterise à la
    /// taille qu'il annonce, ce que le contrat `Draw` n'impose pas.
    @Test("le rendu mémoïsé rend l'image ET sa taille")
    func test_memoizedImage_servesTheDrawnSize() throws {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur, side: 37)

        _ = render(dessinateur)
        let servi = try #require(render(dessinateur))

        #expect(servi.1 == CGSize(width: 37, height: 37))
        #expect(servi.0 != nil)
    }

    // MARK: - Ce qui doit ROUVRIR le dessin

    @Test("des emplacements différents redessinent")
    func test_memoizedImage_withDifferentSlots_drawsAgain() {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur)

        _ = render(dessinateur, slots: ["texte": "Coucou"])
        _ = render(dessinateur, slots: ["texte": "Bonsoir"])

        #expect(compteur.count == 2)
    }

    /// Un dictionnaire n'a pas d'ordre : deux écritures des mêmes emplacements
    /// doivent tomber sur la MÊME clé, sinon la mémoïsation ne servirait qu'un
    /// appel sur deux.
    @Test("les mêmes emplacements écrits dans un autre ordre partagent le dessin")
    func test_memoizedImage_slotOrderDoesNotChangeTheKey() {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur)

        _ = render(dessinateur, slots: ["a": "1", "b": "2"])
        _ = render(dessinateur, slots: ["b": "2", "a": "1"])

        #expect(compteur.count == 1)
    }

    /// La vignette de palette et la scène demandent le MÊME gabarit avec des
    /// mesures dix fois différentes : servir l'une à l'autre poserait une
    /// décoration minuscule sur une story.
    @Test("des mesures différentes redessinent")
    func test_memoizedImage_withDifferentMetrics_drawsAgain() {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur)

        _ = render(dessinateur)
        _ = render(dessinateur, metrics: StickerTemplateMetrics(fontSize: 120, horizontalPadding: 60,
                                                                verticalPadding: 36, gap: 27))

        #expect(compteur.count == 2)
    }

    /// L'échelle de rasterisation voyage dans la clé : un PNG d'envoi (2×) et
    /// l'affichage d'un écran 3× n'ont pas la même densité.
    @Test("une autre échelle d'écran redessine")
    func test_memoizedImage_withDifferentScale_drawsAgain() {
        let compteur = DrawCounter()
        let dessinateur = spy(id: "test.memo.\(UUID().uuidString)", counter: compteur)

        _ = render(dessinateur, scale: 2)
        _ = render(dessinateur, scale: 3)

        #expect(compteur.count == 2)
    }

    @Test("deux gabarits distincts ne partagent jamais un dessin")
    func test_memoizedImage_twoDrawers_doNotShareOneEntry() {
        let premier = DrawCounter()
        let second = DrawCounter()
        let a = spy(id: "test.memo.\(UUID().uuidString)", counter: premier)
        let b = spy(id: "test.memo.\(UUID().uuidString)", counter: second)

        _ = render(a)
        _ = render(b)

        #expect(premier.count == 1)
        #expect(second.count == 1)
    }

    // MARK: - Ce qu'on ne mémoïse pas

    /// Un dessinateur qui ne rend RIEN (taille dégénérée) ne pose aucune
    /// entrée : mémoïser une absence empêcherait le dessin de revenir quand
    /// les mesures redeviennent valides.
    @Test("un dessin absent n'occupe pas le cache")
    func test_memoizedImage_whenTheDrawerRendersNothing_isNotMemoized() throws {
        let compteur = DrawCounter()
        let vide = StickerTemplateDrawer(
            id: "test.memo.\(UUID().uuidString)",
            name: { "espion vide" },
            measure: { _, _ in .zero },
            draw: { _, _, échelle in
                compteur.count += 1
                return StickerTemplateDrawing.rasterize(size: .zero, screenScale: échelle) {}
            })

        let premier = try #require(render(vide))
        let second = try #require(render(vide))

        #expect(premier.0 == nil)
        #expect(second.0 == nil)
        #expect(compteur.count == 2)
    }

    // MARK: - L'entrée publique passe bien par la mémoïsation

    /// `image(templateID:…)` doit être une PROJECTION de `memoizedImage` —
    /// sinon la mémoïsation ne servirait que les témoins.
    @Test("l'entrée publique sert le même objet deux fois de suite")
    func test_publicImage_servesTheSameInstanceTwice() throws {
        let emplacements = [StickerSlotFiller.textSlot: "Coucou"]
        let mesures = StickerTemplateMetrics.preview(side: 96)

        let premier = try #require(StickerTemplateRenderer.image(templateID: StickerTemplateCatalog.ID.textBadge,
                                                                 slots: emplacements,
                                                                 metrics: mesures, screenScale: 2))
        let second = try #require(StickerTemplateRenderer.image(templateID: StickerTemplateCatalog.ID.textBadge,
                                                                slots: emplacements,
                                                                metrics: mesures, screenScale: 2))
        // Déballés jusqu'à l'image : `#require` sur `…?.0` ne retire qu'UN
        // niveau d'optionnel et laisserait passer deux dessins absents.
        let a = try #require(premier.0)
        let b = try #require(second.0)

        #expect(a === b)
    }

    @Test("un gabarit inconnu ne rend toujours rien")
    func test_publicImage_unknownTemplate_stillDrawsNothing() {
        let rendu = StickerTemplateRenderer.image(templateID: "venu.du.futur", slots: [:],
                                                  metrics: mesuresEspion, screenScale: 2)

        #expect(rendu == nil)
    }
}
