import XCTest
import SwiftUI
import UIKit
import UniformTypeIdentifiers
@testable import MeeshyUI

/// C5b — la capsule « Coller » de la page blanche, côté SDK.
///
/// Trois familles d'assertions, séparées comme dans `StoryComposerBlankCanvasTests` :
///
/// 1. **Règle pure** — l'offre est décidée par une fonction, pas par une
///    condition retapée dans une vue.
/// 2. **Rendu** — l'absence d'injection ne rend RIEN (une amorce qui ouvre le
///    vide est pire que pas d'amorce) ; l'injection rend une cible de 44 pt.
/// 3. **Garde de source** — ce qu'aucun rendu ne montre : que la capsule est
///    MONTÉE, et que le SDK n'a pas écrit un second lecteur de presse-papier.
@MainActor
final class StoryComposerPasteStarterTests: XCTestCase {

    private func measured(_ view: some View, width: CGFloat = 320) -> CGSize {
        let host = UIHostingController(rootView: view)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(
            in: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
    }

    private var resolver: StoryPasteProvider {
        StoryPasteProvider { _ in [] }
    }

    // MARK: - Règle pure

    func test_pasteStarter_isOffered_whenTheAppInjectedAResolverAndMediaFits() {
        XCTAssertTrue(StoryComposerView.offersPasteStarter(hasResolver: true, canAddMedia: true))
    }

    /// Sans injection, personne ne sait lire le presse-papier : la capsule
    /// ouvrirait le vide. Même doctrine que le chip « Lieu » et que l'amorce
    /// « Caméra ».
    func test_pasteStarter_isWithheld_withoutAnInjectedResolver() {
        XCTAssertFalse(StoryComposerView.offersPasteStarter(hasResolver: false, canAddMedia: true))
    }

    /// Le plafond média est le droit de poser un objet de plus. L'offrir malgré
    /// lui donnerait un collage qui n'insère rien, sans le dire.
    func test_pasteStarter_isWithheld_onceTheMediaCeilingIsReached() {
        XCTAssertFalse(StoryComposerView.offersPasteStarter(hasResolver: true, canAddMedia: false))
    }

    // MARK: - Les types acceptés SONT la directive produit

    /// *« On doit pouvoir coller des images, des documents dont les stickers,
    /// et ça doit être pris en compte et propagé. »* Réduire cette liste aux
    /// images ne rendrait pas le collage d'un document impossible : elle
    /// rendrait la capsule INERTE devant lui — `PasteButton` se désactive quand
    /// le presse-papier ne porte rien d'acceptable — et le presse-papier ne dit
    /// jamais pourquoi rien ne s'est passé.
    func test_pasteStarterContentTypes_goFarBeyondImages() {
        let types = StoryComposerView.pasteStarterContentTypes

        for expected in [UTType.image, .movie, .audio, .pdf, .item] {
            XCTAssertTrue(
                types.contains(expected),
                "« \(expected.identifier) » a quitté la liste : la capsule « Coller » "
                    + "deviendrait inerte devant ce presse-papier, sans un mot."
            )
        }
        XCTAssertGreaterThan(
            types.count, 1,
            "Une liste réduite aux images est exactement le défaut que la directive du "
                + "2026-08-23 corrige."
        )
    }

    // MARK: - Rendu

    /// Sans fournisseur, la capsule n'existe pas — elle n'est pas seulement
    /// désactivée. Un bouton grisé aurait promis une capacité absente.
    func test_theStarterRendersNothing_whenNoResolverIsInjected() {
        let size = measured(BlankCanvasPasteStarter(canAddMedia: true, onItems: { _ in }))

        XCTAssertLessThan(
            size.height, 44,
            "Sans injection, la capsule doit disparaître, pas se griser : un bouton grisé "
                + "promet une capacité absente."
        )
    }

    func test_theStarter_meetsTheFortyFourPointTouchTarget() {
        let size = measured(
            BlankCanvasPasteStarter(canAddMedia: true, onItems: { _ in })
                .environment(\.storyPaste, resolver))

        XCTAssertGreaterThanOrEqual(
            size.height, 44,
            "D1 : 44 pt de zone de contact dès l'écriture, comme les capsules voisines."
        )
    }

    /// Le plafond média passe par une entrée PRIMITIVE : la feuille ne s'abonne
    /// à aucun graphe global (« Zero Unnecessary Re-render »). Si elle cessait
    /// de l'honorer, elle offrirait un collage qui n'insère rien.
    func test_theStarterRendersNothing_onceTheMediaCeilingIsReached() {
        let size = measured(
            BlankCanvasPasteStarter(canAddMedia: false, onItems: { _ in })
                .environment(\.storyPaste, resolver))

        XCTAssertLessThan(
            size.height, 44,
            "Au plafond, la capsule offrirait un collage qui n'insère rien."
        )
    }

    // MARK: - Gardes de source

    /// **La garde qui compte.** Ce dépôt répète un motif : du code juste,
    /// compilé, testé — et que rien ne monte. Une capsule écrite mais absente de
    /// la rangée passerait toutes les assertions ci-dessus.
    func test_thePasteStarter_isActuallyMountedInTheStarterRow() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let row = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var blankCanvasStarterRow:", in: code),
            "La rangée d'amorces a disparu."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "BlankCanvasPasteStarter(", in: row), 1,
            "La capsule « Coller » n'est pas dans la rangée : elle serait écrite et jamais rendue."
        )
    }

    /// Garde NÉGATIVE. Le composer ne doit JAMAIS relire le presse-papier
    /// lui-même : `ComposerDropResolver` / `ComposerIngestRouter` le font déjà
    /// pour six sites de production, et ils portent tous les cas limites
    /// (représentation fichier vs données, dossier, fichier de 0 octet,
    /// autorisation sandbox, nom d'origine plutôt que description localisée du
    /// type). Un second lecteur, c'est deux corrections à faire à chaque bug.
    ///
    /// Rougit à la RÉINTRODUCTION de l'interdit — un `UIPasteboard.general`
    /// écrit n'importe où sous `Sources/MeeshyUI/Story/`.
    func test_theComposerNeverReadsThePasteboardItself() throws {
        for (path, code) in try ComposerSourceGuard.allStorySources() {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "UIPasteboard", in: code), 0,
                "\(path) : un second lecteur de presse-papier dans le SDK. Le pipeline "
                    + "app-side existe et tourne — le doubler condamne à corriger deux fois "
                    + "chaque cas limite."
            )
        }
    }

    /// **Garde NÉGATIVE, et sa condition de levée est NOMMÉE.**
    ///
    /// La directive du 2026-08-23 veut tout ce qui est collé « pris en compte et
    /// propagé ». Un document collé sur la scène d'une story n'est pas propagé —
    /// il est ANNONCÉ (`ComposerPasteExclusion.documentBelongsToAPost`), avec son
    /// nom et sa destination. Cette exclusion est ASSUMÉE, et ce test dit
    /// pourquoi elle l'est : `StoryPastedItem` est le SEUL vocabulaire par lequel
    /// un collage entre dans le canvas, et ses trois familles se peignent toutes.
    /// Il n'existe, littéralement, aucune surface de story où poser un PDF.
    ///
    /// **Condition de levée** : le jour où `StoryPastedItem` gagne une famille de
    /// plus, la question se rouvre — et elle se rouvre de DEUX façons qui ne
    /// peuvent pas passer inaperçues. Le `switch` ci-dessous cesse de compiler
    /// (comme `posePastedItems` et `sceneItems` app-side), et le compte de cas
    /// ci-dessous rougit. C'est alors, et seulement alors, que l'annonce doit
    /// devenir une propagation.
    func test_noStorySurfaceCanHostAnAttachment_soTheExclusionStaysAnnounced() throws {
        let painted: [StoryPastedItem] = [
            .image(UIImage()),
            .video(URL(fileURLWithPath: "/tmp/a.mov")),
            .audio(URL(fileURLWithPath: "/tmp/a.m4a"))
        ]

        for item in painted {
            switch item {
            case .image, .video, .audio:
                continue
            }
        }

        let code = try ComposerSourceGuard.source("StoryCanvasStarterEnvironment.swift")
        let declaration = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "enum StoryPastedItem", in: code),
            "`StoryPastedItem` a disparu : le collage n'aurait plus de vocabulaire d'entrée."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "case ", in: declaration), painted.count,
            "Une famille de plus dans `StoryPastedItem` : la scène sait peut-être désormais "
                + "héberger ce qu'elle se contentait d'annoncer. L'exclusion assumée du document "
                + "doit être rejugée — annoncer ce qu'on saurait poser serait un rejet muet."
        )
    }

    /// Le collage ne fabrique aucun chemin d'insertion : il emprunte ceux de la
    /// caméra et de l'enregistrement, qui existent et sont éprouvés. Un
    /// `addMediaObject(` posé ici serait un troisième jumeau du même code.
    func test_pastedItems_reuseTheExistingInsertionPaths() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func posePastedItems(", in: code),
            "`posePastedItems` a disparu : le collage ne poserait plus rien."
        )
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "addCapturedMedia(", in: body), 2,
                       "L'image et la vidéo empruntent le chemin caméra, tel quel.")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "addRecordingToBackground(", in: body), 1,
                       "Le son emprunte le chemin de l'enregistrement.")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "addMediaObject(", in: body), 0,
                       "Un quatrième chemin d'insertion recommencerait ce que deux extractions ont réuni.")
    }
}
