import XCTest
import SwiftUI
@testable import MeeshyUI

/// S5 — la page blanche d'auteur, côté VUE.
///
/// Deux familles d'assertions, délibérément séparées :
///
/// 1. **Rendu** — tout ce qui est une propriété de la vue est prouvé par le
///    rendu, jamais par un `contains` : une garde de source qui cherche
///    `minHeight: 44` dans un fichier de 1 400 lignes ne peut pas dire SUR QUOI
///    il porte, et un refactor d'extraction la rend verte pour de mauvaises
///    raisons (cf. mémoire projet, `feedback_extract_refactor_breaks_source_
///    guard_tests`).
/// 2. **Garde de source** — restreinte à ce qu'elle SEULE peut prouver : la
///    disparition d'un symbole, l'absence d'un appel, une parité de comptes.
@MainActor
final class StoryComposerBlankCanvasTests: XCTestCase {

    private func measured(_ view: some View, width: CGFloat = 320) -> CGSize {
        let host = UIHostingController(rootView: view)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(
            in: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
    }

    // MARK: - Rendu

    func test_blankCanvasStarterLabel_meetsTheFortyFourPointTouchTarget() {
        let size = measured(BlankCanvasStarterLabel(icon: "camera.fill", title: "Caméra"))
        XCTAssertGreaterThanOrEqual(
            size.height, 44,
            "D1 : 44 pt de zone de contact dès l'écriture — contrairement aux pastilles 36 pt du header."
        )
    }

    func test_blankCanvasStarterLabel_growsWithLargerDynamicType() {
        let base = measured(BlankCanvasStarterLabel(icon: "photo", title: "Galerie"))
        let scaled = measured(
            BlankCanvasStarterLabel(icon: "photo", title: "Galerie")
                .environment(\.sizeCategory, .accessibilityExtraExtraExtraLarge))
        XCTAssertGreaterThan(
            scaled.height, base.height,
            """
            D3 : typographie RELATIVE (`MeeshyFont.relative`). Une taille figée \
            (`.font(.system(size:))`, seul style présent dans ce fichier jusqu'ici) \
            rendrait ces deux mesures identiques.
            """
        )
    }

    /// Le swipe-down de la directive user (2026-07-31) part de la surface
    /// d'état vide. Un `VStack` ne s'étire QUE sur son axe majeur : sans
    /// contrainte explicite, sa largeur vaut celle de son plus large enfant
    /// (~200 pt sur les 393 d'un iPhone 16 Pro), et le geste ne répondait que
    /// dans une colonne centrale — le même geste, sur des pixels d'apparence
    /// identique, marchait ou non selon 80 pt d'écart.
    func test_blankCanvasStarterSurface_fillsEveryPixelOfTheOfferedArea() {
        let proposed = CGSize(width: 393, height: 640)
        let host = UIHostingController(
            rootView: BlankCanvasStarterSurface {
                Text("Touchez pour écrire")
                BlankCanvasStarterLabel(icon: "camera.fill", title: "Caméra")
            })
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()

        let size = host.sizeThatFits(in: proposed)

        XCTAssertEqual(size.width, proposed.width, accuracy: 0.5,
                       "La page blanche capte le geste sur TOUTE sa largeur, pas sur une colonne centrale.")
        XCTAssertEqual(size.height, proposed.height, accuracy: 0.5,
                       "…et sur toute sa hauteur : le swipe peut partir de n'importe où.")
    }

    // MARK: - Gardes de source

    func test_theComposerNoLongerShipsAnEmptyStateToolMenu() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        for symbol in ["emptyStateLargePicker", "largeToolTile",
                       "shouldShowEmptyStateLargePicker", "emptyStateTileCopy",
                       "story.composer.empty."] {
            XCTAssertFalse(
                code.contains(symbol),
                "« \(symbol) » survit : l'état vide est redevenu un menu bloquant (A3)."
            )
        }
    }

    func test_theBlankCanvasMountsTheStandardToolRailUnconditionally() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "ComposerControlsLayer(", in: code), 1,
            "Un seul montage, sans branche : la page blanche montre le MÊME rail que le reste du temps."
        )
    }

    func test_theBackgroundTapNeverTogglesAFlagDirectly() throws {
        for (path, code) in try ComposerSourceGuard.allStorySources() {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "areFabsVisible", in: code), 0,
                "\(path) : le tap sur le fond passe par la politique, jamais par un drapeau basculé à la main."
            )
        }
    }

    /// Les amorces couvrent TOUT le canvas : dès qu'elles ne sont plus offertes,
    /// leur surface doit cesser d'exister, pas seulement cesser de répondre.
    ///
    /// Elles portaient leurs deux gestes APRÈS `.allowsHitTesting(…)`, à rebours
    /// du patron du fichier (top bar, bottom region : rien après le drapeau). Un
    /// modificateur ne s'applique qu'à ce qui le PRÉCÈDE — l'ordre laissait donc
    /// un tap et un swipe attachés au-dessus du garde-fou, sur une surface qui
    /// recouvre le canvas entier. La visibilité est désormais STRUCTURELLE : hors
    /// page blanche, il n'y a plus de vue du tout à qui parler.
    func test_theBlankCanvasStartersCarryNoGestureOutsideTheirGate() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var blankCanvasStarters:", in: code),
            "Les amorces de page blanche ont disparu.")
        let gated = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "if offersContentStarters", in: body),
            "Le gate n'est plus structurel : `allowsHitTesting` ne démonte rien, il neutralise.")

        for gesture in ["onTapGesture", "simultaneousGesture", ".gesture("] {
            let total = ComposerSourceGuard.occurrences(of: gesture, in: body)
            XCTAssertEqual(
                total, ComposerSourceGuard.occurrences(of: gesture, in: gated),
                "« \(gesture) » vit hors du gate : il répondrait sur une page qui n'est plus blanche."
            )
        }
        XCTAssertGreaterThan(
            ComposerSourceGuard.occurrences(of: "onTapGesture", in: gated), 0,
            "L'assertion de parité ci-dessus ne vaut que si les gestes existent encore."
        )
        XCTAssertGreaterThan(
            ComposerSourceGuard.occurrences(of: "simultaneousGesture", in: gated), 0,
            "…swipe-down compris (directive user 2026-07-31)."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "allowsHitTesting", in: body), 0,
            "Un drapeau de hit-testing rouvrirait la question de l'ordre des modificateurs."
        )
    }

    /// Le letterbox (≈18 % de la hauteur sur iPhone 16 Pro, dont la bande basse,
    /// la plus proche du pouce) a exactement l'apparence du canvas. Le laisser
    /// inerte contredisait « toute la surface du canvas est le bouton texte ».
    func test_theLetterboxRoutesTheBackgroundTapThroughTheSamePolicy() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        XCTAssertGreaterThanOrEqual(
            ComposerSourceGuard.occurrences(of: "handleCanvasBackgroundTap()", in: code), 2,
            """
            Le canvas 9:16 ET le letterbox doivent appeler la MÊME closure : \
            deux routages distincts finiraient par diverger.
            """
        )
    }

    func test_theComposerPresentsTheInjectedCameraCapture() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Media.swift")
        for symbol in ["showCameraCapture", "storyCameraCapture", "addCapturedMedia("] {
            XCTAssertTrue(code.contains(symbol), "« \(symbol) » manque : la capsule Caméra n'ouvrirait rien.")
        }
    }

    /// `fullScreenCover(isPresented:)` présente le cover DÈS que le drapeau passe
    /// à `true`, fournisseur injecté ou non. Le corps étant un `if let provider`,
    /// l'absence d'injection donnait un plein écran opaque au corps VIDE : aucun
    /// bouton de fermeture, et pas de swipe-down (le composer est lui-même en
    /// `fullScreenCover`) — une impasse dont on ne sort qu'en tuant l'app.
    ///
    /// L'état est inatteignable par les call sites d'aujourd'hui (la capsule est
    /// gatée `storyCameraCapture != nil`, `resetLocalState()` remet le drapeau à
    /// plat), mais c'est une garantie de CALL SITE. `fullScreenCover(item:)` sur
    /// cette résolution en fait une garantie de TYPE : la classe entière de
    /// défauts disparaît, pas seulement le cas connu.
    func test_theCameraCoverIsNotPresentableWithoutAnInjectedProvider() {
        let provider = StoryCameraCaptureProvider { _ in AnyView(EmptyView()) }

        XCTAssertNil(
            StoryComposerView.presentedCameraCapture(isRequested: true, provider: nil),
            "Sans fournisseur il n'y a rien à présenter — surtout pas un plein écran vide."
        )
        XCTAssertNil(
            StoryComposerView.presentedCameraCapture(isRequested: false, provider: provider),
            "Le drapeau reste la condition d'ouverture : un fournisseur injecté n'ouvre rien seul."
        )
        XCTAssertNotNil(
            StoryComposerView.presentedCameraCapture(isRequested: true, provider: provider)
        )
    }

    /// L'identité de l'item DOIT être stable : `fullScreenCover(item:)` re-présente
    /// le cover dès qu'elle change, et le binding est recalculé à chaque passe de
    /// rendu du composer. Un `UUID()` par construction rouvrirait la caméra en
    /// boucle — le défaut que le correctif introduirait s'il était naïf.
    func test_thePresentedCameraCaptureKeepsAStableIdentityAcrossRebuilds() {
        let provider = StoryCameraCaptureProvider { _ in AnyView(EmptyView()) }
        let first = StoryComposerView.presentedCameraCapture(isRequested: true, provider: provider)
        let second = StoryComposerView.presentedCameraCapture(isRequested: true, provider: provider)

        XCTAssertEqual(first?.id, second?.id)
    }

    /// La capture ne nous appartient pas — et la course était gagnable.
    ///
    /// `CameraView` lance `PhotoLibraryManager.saveVideo(at:)` sur le fichier
    /// fraîchement enregistré EN MÊME TEMPS qu'il le remet au composer. Ce save
    /// peut s'interrompre sur l'alerte d'autorisation « Ajouter aux photos »,
    /// et ne LIT le fichier qu'APRÈS la réponse de l'utilisateur. Le composer,
    /// lui, avait déjà copié la source vers son fichier temporaire et la
    /// supprimait dans la foulée : la vidéo partait dans le composer mais
    /// n'arrivait jamais dans Photos, sans un mot.
    ///
    /// Une garde de source, et pas un test de comportement : la course vit
    /// entre deux acteurs (app + SDK) que rien n'orchestre ensemble, et
    /// l'absence d'un `removeItem` est justement ce qu'aucun rendu ne montre.
    ///
    /// Ancrée sur un COMPTE dans le corps de la fonction, jamais sur le nom de
    /// la liaison : une garde qui cherchait `removeItem(at: sourceURL)`
    /// redevenait verte au premier `case .video(let url)` — un refactor anodin
    /// rouvrait la course sans le moindre signal.
    func test_addCapturedMedia_doesNotDeleteTheSourceFile() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Media.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func addCapturedMedia(", in: code),
            "`addCapturedMedia` a disparu : la capsule Caméra n'insérerait plus rien."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "removeItem(", in: body), 1,
            """
            Un SEUL effacement dans `addCapturedMedia` : celui qui écarte un \
            fichier temporaire homonyme AVANT la copie. Tout second appel vise \
            la source, qui ne nous appartient pas — `CameraView` l'enregistre en \
            photothèque en parallèle et ne la LIT qu'après l'alerte « Ajouter aux \
            photos ». Le cycle de vie du répertoire temporaire s'en charge.
            """
        )
    }
}
