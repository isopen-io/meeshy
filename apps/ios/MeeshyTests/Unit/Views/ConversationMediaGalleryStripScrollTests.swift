import SwiftUI
import UIKit
import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #12422 — **faire défiler le rail des miniatures ne fige plus la galerie.**
///
/// Trace du plantage (iPhone, build 1949, 2026-10-23 11:34) : le fil principal
/// tourne 83 s dans la mise à jour du graphe, `ConversationMediaGalleryView.body`
/// réévalué en boucle, puis le chien de garde tue l'application. Au simulateur,
/// `AG_TRAP_CYCLES` désigne l'entrée du cycle : `stageCorridors` lisait
/// `UIWindow.safeAreaInsets` PENDANT le `body` (le `fullScreenCover` ne reçoit pas
/// les marges publiées par la racine), UIKit demandait alors au contrôleur
/// d'hébergement sa préférence `statusBarHidden`, ce qui réentrait la mise à
/// jour en cours. Chaque page atteinte au défilement du rail réévalue ce `body`.
///
/// Les témoins montent la galerie SANS marges publiées, comme dans un cover.
@MainActor
final class ConversationMediaGalleryStripScrollTests: XCTestCase {

    private static let window = CGSize(width: 402, height: 874)
    private static let count = 30

    private static func lot() -> [MessageAttachment] {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let flat = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 48), format: format).image { context in
            UIColor(red: 0.31, green: 0.27, blue: 0.9, alpha: 1).setFill()
            context.cgContext.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        }
        let hash = flat.toThumbHash()
        return (0..<count).map { index in
            MessageAttachment(
                id: "strip-piece-\(index)",
                mimeType: "image/jpeg",
                fileSize: 204_800,
                fileUrl: "",
                width: 1_600,
                height: 1_200,
                thumbHash: hash,
                uploadedBy: "u-fixture"
            )
        }
    }

    private static func mount(_ lot: [MessageAttachment]) -> RenderedScreen {
        RenderedScreen(
            ConversationMediaGalleryView(
                allAttachments: lot,
                startAttachmentId: lot[lot.count - 1].id,
                accentColor: "6366F1",
                entryPresentation: .carded
            ),
            size: window
        )
    }

    private static func thumbnailCount(in screen: RenderedScreen) -> Int {
        let suffix = "sur \(count)"
        return screen.nodes.compactMap(\.label).filter { $0.hasSuffix(suffix) }.count
    }

    private static func scrollViews(in view: UIView) -> [UIScrollView] {
        let own = (view as? UIScrollView).map { [$0] } ?? []
        return own + view.subviews.flatMap { scrollViews(in: $0) }
    }

    private static func strip(in screen: RenderedScreen) -> UIScrollView? {
        scrollViews(in: screen.root).first { $0.bounds.height > 0 && $0.bounds.height <= FilmstripMetrics.reservedHeight }
    }

    private static func pager(in screen: RenderedScreen, besides strip: UIScrollView) -> UIScrollView? {
        scrollViews(in: screen.root).first { $0 !== strip && $0.bounds.height > FilmstripMetrics.reservedHeight }
    }

    private static func settle(bound: TimeInterval = 2, until condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(bound)
        while Date() < deadline, !condition() {
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
    }

    // MARK: - Le rail naît dans un cover

    func test_mountedWithoutPublishedInsets_rendersTheThumbnailRail() {
        let screen = Self.mount(Self.lot())
        defer { screen.dismount() }

        Self.settle { Self.thumbnailCount(in: screen) > 0 }

        XCTAssertGreaterThan(
            Self.thumbnailCount(in: screen), 0,
            "le rail des miniatures n'est jamais monté : la galerie a cessé de se mettre à jour après sa première passe"
        )
        let safeTop = screen.root.window?.safeAreaInsets.top ?? 0
        let close = screen.nodes.first { $0.label == String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }
        XCTAssertGreaterThanOrEqual(
            close?.frame.minY ?? -1, safeTop,
            "la croix n'est pas sous la marge haute mesurée (\(safeTop)) : \(String(describing: close?.frame))"
        )
    }

    // MARK: - Les marges ne viennent jamais de la fenêtre

    func test_safeArea_prefersPublished_thenMeasured_thenZero() {
        let published = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)
        let measured = EdgeInsets(top: 47, leading: 0, bottom: 21, trailing: 0)

        XCTAssertEqual(GallerySafeArea.resolve(published: published, measured: measured), published)
        XCTAssertEqual(GallerySafeArea.resolve(published: nil, measured: measured), measured)
        XCTAssertEqual(GallerySafeArea.resolve(published: nil, measured: nil), EdgeInsets())
    }

    // MARK: - Le défilement rapide se pose

    func test_fastScrollingTheRail_keepsTheMainThreadFree_andSettles() throws {
        guard #available(iOS 17.0, *) else {
            throw XCTSkip("iOS 16 : la bande suit le plein écran, elle ne le pilote pas")
        }
        let screen = Self.mount(Self.lot())
        defer { screen.dismount() }
        Self.settle { Self.strip(in: screen) != nil }
        let strip = try XCTUnwrap(Self.strip(in: screen), "aucun rail des miniatures rendu")
        RailFinger.install(on: strip)

        var slowestTurn: TimeInterval = 0
        for target in [20, 5, 25, 2, 28, 10, 17] {
            let start = Date()
            RailFinger.drag(strip, toIndex: target, frames: 5)
            slowestTurn = max(slowestTurn, Date().timeIntervalSince(start))
        }

        var stripOffsets: [CGFloat] = []
        var pagerOffsets: [CGFloat] = []
        for _ in 0..<40 {
            let start = Date()
            RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            slowestTurn = max(slowestTurn, Date().timeIntervalSince(start))
            stripOffsets.append(strip.contentOffset.x)
            pagerOffsets.append(Self.pager(in: screen, besides: strip)?.contentOffset.x ?? -1)
        }

        XCTAssertLessThan(slowestTurn, 1.5, "le fil principal est resté bloqué \(slowestTurn) s pendant le défilement du rail")
        XCTAssertEqual(Set(stripOffsets.suffix(20)).count, 1, "le rail ne se pose pas : \(stripOffsets)")
        XCTAssertEqual(Set(pagerOffsets.suffix(20)).count, 1, "le plein écran ne se pose pas : \(pagerOffsets)")
    }
}

/// Un doigt posé sur le rail : `scrollPosition(id:)` n'écrit son binding que si
/// SwiftUI voit `isDragging` / `isTracking` (même sonde que
/// `ConversationMediaFilmstripHostingTests`).
private enum RailFinger {
    nonisolated(unsafe) private static var isTouching = false

    static func install(on strip: UIScrollView) {
        guard let base = object_getClass(strip) else { return }
        let name = "RailFinger_" + NSStringFromClass(base).replacingOccurrences(of: ".", with: "_")
        if let existing = NSClassFromString(name) {
            object_setClass(strip, existing)
            return
        }
        guard let probe = objc_allocateClassPair(base, name, 0) else { return }
        let touching: @convention(block) (AnyObject) -> Bool = { _ in RailFinger.isTouching }
        let implementation = imp_implementationWithBlock(touching)
        for selectorName in ["isDragging", "isTracking"] {
            let selector = NSSelectorFromString(selectorName)
            guard let method = class_getInstanceMethod(base, selector) else { continue }
            class_addMethod(probe, selector, implementation, method_getTypeEncoding(method))
        }
        objc_registerClassPair(probe)
        object_setClass(strip, probe)
    }

    @MainActor
    static func drag(_ strip: UIScrollView, toIndex index: Int, frames: Int) {
        let start = strip.contentOffset.x
        let end = CGFloat(index) * FilmstripMetrics.stride - strip.adjustedContentInset.left
        isTouching = true
        strip.delegate?.scrollViewWillBeginDragging?(strip)
        for frame in 1...frames {
            strip.contentOffset = CGPoint(x: start + (end - start) * CGFloat(frame) / CGFloat(frames), y: 0)
            RunLoop.current.run(until: Date().addingTimeInterval(0.016))
        }
        var target = CGPoint(x: end, y: 0)
        strip.delegate?.scrollViewWillEndDragging?(strip, withVelocity: .zero, targetContentOffset: &target)
        isTouching = false
        strip.delegate?.scrollViewDidEndDragging?(strip, willDecelerate: false)
    }
}
