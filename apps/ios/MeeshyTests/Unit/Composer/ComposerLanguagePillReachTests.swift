import SwiftUI
import UIKit
import XCTest
@testable import Meeshy

/// #9254 — **la langue d'écriture se lit ENTIÈRE dans la barre du composeur**,
/// sur un iPhone de 402 pt comme sur un iPhone SE (375 pt).
///
/// Le web a mesuré, à 390 px, une pastille de langue dont on ne voyait que
/// 30 px sur 72 : dernière de la bande d'outils DÉFILANTE, elle passait sous
/// les portes de droite sans que rien ne signale le défilement (#9251, D-164).
/// iOS posait la même pastille au même rang — en dernier dans
/// `ComposerToolbarStrip`.
///
/// Le témoin monte la VRAIE barre, câblée comme la conversation (photothèque,
/// caméra, sticker), dans une fenêtre réelle, et lit ce que VoiceOver lit : le
/// cadre de la pastille et celui de la première porte de droite. Deux mesures
/// font la propriété :
/// - la pastille est AVANT les portes et dans l'écran — rien ne la recouvre ;
/// - elle a la MÊME largeur qu'à 1 024 pt, où tout tient — rien ne la rogne.
///
/// Les protections ACTIVES (flou, vue unique) allongent leurs capsules d'un
/// libellé : c'est l'état où la rangée déborde le plus, et le cas d'usage
/// nominal d'un message protégé.
@MainActor
final class ComposerLanguagePillReachTests: XCTestCase {

    private var screens: [RenderedScreen] = []

    override func tearDown() {
        screens.forEach { $0.dismount() }
        screens = []
        super.tearDown()
    }

    private static var pillLabel: String {
        String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main)
    }

    private static var photosLabel: String {
        String(localized: "composer.attach.photo", defaultValue: "Photos", bundle: .main)
    }

    private struct Harness: View {
        let width: CGFloat
        let protectionsActive: Bool

        var body: some View {
            VStack {
                Spacer()
                UniversalComposerBar(
                    style: .light,
                    mode: .message,
                    selectedLanguage: "fr",
                    onStartRecording: {},
                    onStopRecordingToAttachment: {},
                    onSendRecording: {},
                    onCancelRecording: {},
                    externalIsRecording: false,
                    externalRecordingDuration: 0,
                    onPhotoLibrary: {},
                    onCamera: {},
                    onRequestStickerPicker: {},
                    isBlurEnabled: .constant(protectionsActive),
                    isViewOnceEnabled: .constant(protectionsActive)
                )
            }
            .frame(width: width, height: 874)
        }
    }

    private struct Reach {
        let pill: CGRect
        let firstDoor: CGRect
    }

    private func measure(width: CGFloat, protectionsActive: Bool) throws -> Reach {
        let screen = RenderedScreen(Harness(width: width, protectionsActive: protectionsActive),
                                    size: CGSize(width: width, height: 874))
        screens.append(screen)
        let pill = try XCTUnwrap(posed(Self.pillLabel, in: screen),
                                 "Pastille de langue introuvable à \(width) pt — libellés : \(screen.labels)")
        let door = try XCTUnwrap(posed(Self.photosLabel, in: screen),
                                 "Porte photothèque introuvable à \(width) pt — libellés : \(screen.labels)")
        return Reach(pill: pill, firstDoor: door)
    }

    /// Le cadre ANNONCÉ du premier nœud posé sous ce libellé, attendu jusqu'à
    /// ce que SwiftUI l'ait posé — une barre fraîchement montée s'anime.
    private func posed(_ label: String, in screen: RenderedScreen, borne: TimeInterval = 10) -> CGRect? {
        let deadline = Date().addingTimeInterval(borne)
        while Date() < deadline {
            if let frame = screen.frame(labeledPrefix: label) { return frame }
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        }
        return screen.frame(labeledPrefix: label)
    }

    private func assertPillReadsWhole(width: CGFloat, protectionsActive: Bool,
                                      file: StaticString = #filePath, line: UInt = #line) throws {
        let wide = try measure(width: 1024, protectionsActive: protectionsActive)
        let reach = try measure(width: width, protectionsActive: protectionsActive)
        let state = protectionsActive ? "flou + vue unique actifs" : "aucune protection"
        let figures = """
        \(Int(width)) pt (\(state)) : pastille x \(reach.pill.minX)→\(reach.pill.maxX) \
        (largeur \(reach.pill.width), entière \(wide.pill.width)), première porte à x \(reach.firstDoor.minX)
        """
        print("MESURE #9254 — \(figures)")

        XCTAssertGreaterThanOrEqual(reach.pill.minX, 0, "La pastille sort de l'écran — \(figures)",
                                    file: file, line: line)
        XCTAssertLessThanOrEqual(reach.pill.maxX, reach.firstDoor.minX + 0.5,
                                 "La pastille passe sous les portes de droite — \(figures)",
                                 file: file, line: line)
        XCTAssertEqual(reach.pill.width, wide.pill.width, accuracy: 0.5,
                       "La pastille est rognée — \(figures)", file: file, line: line)
    }

    func test_pill_readsWhole_at402() throws {
        try assertPillReadsWhole(width: 402, protectionsActive: false)
    }

    func test_pill_readsWhole_at375() throws {
        try assertPillReadsWhole(width: 375, protectionsActive: false)
    }

    func test_pill_readsWhole_at402_withProtectionsActive() throws {
        try assertPillReadsWhole(width: 402, protectionsActive: true)
    }

    func test_pill_readsWhole_at375_withProtectionsActive() throws {
        try assertPillReadsWhole(width: 375, protectionsActive: true)
    }
}
