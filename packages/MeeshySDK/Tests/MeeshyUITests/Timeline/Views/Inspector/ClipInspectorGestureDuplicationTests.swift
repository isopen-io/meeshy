import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La fiche d'un clip ne redit plus ce qu'un geste fait déjà (directive user
/// 2026-07-29 : « la vue d'édition de piste est tellement chargée, il faut
/// enlever les éléments modifiables par la gestuelle »).
///
/// Deux blocs partaient : le TIMING — début, fin, durée se règlent en glissant
/// le clip sur sa piste et en tirant ses poignées — et le PLAN — position,
/// taille, rotation et rang de superposition se manipulent au doigt sur le
/// canvas. Les deux occupaient à eux seuls la moitié de la hauteur de la fiche
/// pour des réglages que la main atteint plus vite.
///
/// Reste ce qu'aucun geste ne produit : le nom, le volume et sa courbe, les
/// fondus, les interrupteurs, et les actions.
@MainActor
final class ClipInspectorGestureDuplicationTests: XCTestCase {

    private let everyKind: [ClipInspector.ClipSnapshot.Kind] =
        [.video, .image, .text, .audio, .sticker]

    func test_noKindOffersTheTimingBlockAnymore() {
        for kind in everyKind {
            for isBackground in [true, false] {
                XCTAssertFalse(
                    ClipInspector.visibleSections(kind: kind, isBackground: isBackground)
                        .contains(.timing),
                    "\(kind) (fond: \(isBackground)) : début/fin/durée se règlent sur la piste"
                )
            }
        }
    }

    func test_noKindOffersTheTransformBlockAnymore() {
        for kind in everyKind {
            for isBackground in [true, false] {
                XCTAssertFalse(
                    ClipInspector.visibleSections(kind: kind, isBackground: isBackground)
                        .contains(.transform),
                    "\(kind) (fond: \(isBackground)) : le plan se manipule au canvas"
                )
            }
        }
    }

    func test_foregroundVideo_keepsWhatNoGestureProduces() {
        XCTAssertEqual(ClipInspector.visibleSections(kind: .video, isBackground: false),
                       [.header, .volume, .animation, .toggles, .actions])
    }

    func test_text_keepsItsFadesAndActions() {
        XCTAssertEqual(ClipInspector.visibleSections(kind: .text, isBackground: false),
                       [.header, .animation, .actions])
    }

    func test_audio_keepsItsVolume() {
        let sections = ClipInspector.visibleSections(kind: .audio, isBackground: false)
        XCTAssertTrue(sections.contains(.volume))
        XCTAssertEqual(sections.first, .header)
        XCTAssertEqual(sections.last, .actions)
    }

    /// La fiche garde un en-tête et des actions quel que soit le clip : sans
    /// eux il ne resterait plus de quoi nommer ni supprimer.
    func test_everyKindKeepsAHeaderAndItsActions() {
        for kind in everyKind {
            let sections = ClipInspector.visibleSections(kind: kind, isBackground: false)
            XCTAssertEqual(sections.first, .header, "\(kind)")
            XCTAssertTrue(sections.contains(.actions), "\(kind)")
        }
    }
}
