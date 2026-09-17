import Combine
import SwiftUI
import UIKit
import XCTest
@testable import Meeshy

/// #6759 — **la pellicule montre la vignette courante sous la tête de lecture,
/// quel que soit le média sur lequel la galerie s'ouvre.**
///
/// `ConversationMediaGalleryScrollTests` tient la GRILLE : ses décalages sont
/// justes. Elle ne dit rien de ce que SwiftUI en fait une fois la bande montée,
/// et c'est là que le défaut vivait : ouverte sur un des derniers médias, la
/// bande était posée hors de sa grille, sans rien sous la tête de lecture.
/// Seul un hébergement RÉEL le voit.
///
/// Les trois usages de la position sont mesurés, parce qu'ils ne passent pas
/// par le même chemin de SwiftUI : la position INITIALE (le défaut), les
/// changements de page, et la lecture au défilement de la bande — celle qui
/// pilote le plein écran.
///
/// Le témoin lit ce que VoiceOver lit — `Média n sur N` et son cadre — dans une
/// fenêtre de 402 pt, la largeur où la recette l'a mesuré.
@MainActor
final class ConversationMediaFilmstripHostingTests: XCTestCase {

    // MARK: - Fabriques

    private static let window = CGSize(width: 402, height: 874)

    private static func attachments(count: Int) -> [MessageAttachment] {
        (0..<count).map { rank in
            MessageAttachment(
                id: "pellicule-\(rank)",
                mimeType: "image/jpeg",
                fileSize: 1_000 + rank,
                width: 900,
                height: 900
            )
        }
    }

    /// Premier, milieu, avant-dernier, dernier — sans doublon pour les petites
    /// galeries.
    private static func openingIndices(count: Int) -> [Int] {
        Array(Set([0, count / 2, max(0, count - 2), count - 1])).sorted()
    }

    /// Le pager du plein écran, réduit à ce que la bande en voit : l'identifiant
    /// de la page affichée.
    private final class PagerStandIn: ObservableObject {
        @Published var pageID: String?
        init(pageID: String?) { self.pageID = pageID }
    }

    private struct Harness: View {
        let attachments: [MessageAttachment]
        @ObservedObject var pager: PagerStandIn

        var body: some View {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                ConversationMediaFilmstrip(
                    attachments: attachments,
                    currentPageID: $pager.pageID,
                    accentColor: "6366F1"
                )
            }
        }
    }

    // MARK: - Ouverture

    func test_opening_onAnyMedia_showsTheCurrentThumbnailUnderThePlayheadAtFirstLayout() {
        for count in [1, 5, 40] {
            for current in Self.openingIndices(count: count) {
                let attachments = Self.attachments(count: count)
                let pager = PagerStandIn(pageID: attachments[current].id)
                let screen = RenderedScreen(Harness(attachments: attachments, pager: pager), size: Self.window)
                defer { screen.dismount() }

                assertPlayhead(on: current, count: count, in: screen, context: "ouverture sur \(current + 1)/\(count)")
            }
        }
    }

    // MARK: - Pagination du plein écran

    func test_pagingTheFullscreen_bothWays_keepsTheCurrentThumbnailUnderThePlayhead() {
        let journeys: [(count: Int, steps: [Int])] = [
            (5, [3, 2, 1, 0, 1, 2, 3, 4]),
            (40, [38, 20, 0, 1, 39, 37]),
        ]
        for journey in journeys {
            let attachments = Self.attachments(count: journey.count)
            let pager = PagerStandIn(pageID: attachments[journey.count - 1].id)
            let screen = RenderedScreen(Harness(attachments: attachments, pager: pager), size: Self.window)
            defer { screen.dismount() }

            for step in journey.steps {
                pager.pageID = attachments[step].id
                Self.settle { Self.playheadIsOn(step, count: journey.count, in: screen) }
                assertPlayhead(on: step, count: journey.count, in: screen, context: "page \(step + 1)/\(journey.count)")
            }
        }
    }

    // MARK: - La bande pilote le plein écran (iOS 17+)

    func test_scrollingTheStrip_drivesTheFullscreen_withoutBouncingBack() throws {
        guard #available(iOS 17.0, *) else {
            throw XCTSkip("iOS 16 : la bande suit le plein écran, elle ne le pilote pas")
        }
        let journeys: [(count: Int, targets: [Int])] = [
            (5, [3, 1, 2]),
            (40, [38, 36, 37]),
        ]
        for journey in journeys {
            let attachments = Self.attachments(count: journey.count)
            let pager = PagerStandIn(pageID: attachments[journey.count - 1].id)
            let screen = RenderedScreen(Harness(attachments: attachments, pager: pager), size: Self.window)
            defer { screen.dismount() }
            let strip = try XCTUnwrap(Self.scrollViews(in: screen.root).first, "aucune bande défilante rendue")
            FingerOnStrip.install(on: strip)

            for target in journey.targets {
                let expected = attachments[target].id
                let visits = PageVisits()
                let subscription = pager.$pageID.dropFirst().sink { visits.record($0) }
                FingerOnStrip.drag(strip, toIndex: target)
                Self.settle { pager.pageID == expected }
                Self.settle(bound: 0.4) { false }
                subscription.cancel()

                let context = "défilement de la bande jusqu'à \(target + 1)/\(journey.count)"
                XCTAssertEqual(pager.pageID, expected, "\(context) : le plein écran n'a pas suivi — visites \(visits.ids)")
                XCTAssertFalse(
                    visits.ids.drop { $0 != expected }.contains { $0 != expected },
                    "\(context) : le pager est reparti après la page visée, boucle pager ↔ bande — visites \(visits.ids)"
                )
                assertPlayhead(on: target, count: journey.count, in: screen, context: context)
            }
        }
    }

    private final class PageVisits {
        private(set) var ids: [String?] = []
        func record(_ id: String?) { ids.append(id) }
    }

    // MARK: - Lecture de l'écran rendu

    private static func label(index: Int, count: Int) -> String {
        String(
            format: String(localized: "gallery.position", defaultValue: "Média %1$d sur %2$d", bundle: .main),
            index + 1,
            count
        )
    }

    /// Cadres annoncés des vignettes rendues, par index. Une vignette que la pile
    /// paresseuse n'a pas matérialisée n'y figure pas.
    private static func thumbnailFrames(count: Int, in screen: RenderedScreen) -> [Int: CGRect] {
        let labels = Dictionary(uniqueKeysWithValues: (0..<count).map { (label(index: $0, count: count), $0) })
        return screen.nodes.reduce(into: [Int: CGRect]()) { frames, node in
            guard let text = node.label, let index = labels[text], frames[index] == nil, node.frame.width > 0 else { return }
            frames[index] = node.frame
        }
    }

    /// Centre attendu de la vignette `index` quand `current` est sous la tête
    /// de lecture — le bord DROIT de la bande, moins sa marge de queue.
    private static func expectedMidX(of index: Int, current: Int) -> CGFloat {
        window.width
            - FilmstripMetrics.trailingInset
            - FilmstripMetrics.itemSide / 2
            - CGFloat(current - index) * FilmstripMetrics.stride
    }

    private static let tolerance: CGFloat = 1

    private static func playheadIsOn(_ current: Int, count: Int, in screen: RenderedScreen) -> Bool {
        guard let frame = thumbnailFrames(count: count, in: screen)[current] else { return false }
        return abs(frame.midX - expectedMidX(of: current, current: current)) <= tolerance
    }

    private func assertPlayhead(
        on current: Int,
        count: Int,
        in screen: RenderedScreen,
        context: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let frames = Self.thumbnailFrames(count: count, in: screen)
        let diagnostic = Self.describe(frames, in: screen)

        guard let currentFrame = frames[current] else {
            XCTFail("\(context) : la vignette courante n'est pas rendue — \(diagnostic)", file: file, line: line)
            return
        }
        XCTAssertTrue(
            currentFrame.minX >= 0 && currentFrame.maxX <= Self.window.width,
            "\(context) : la vignette courante est hors de la fenêtre — \(diagnostic)",
            file: file, line: line
        )
        XCTAssertEqual(
            currentFrame.midX, Self.expectedMidX(of: current, current: current), accuracy: Self.tolerance,
            "\(context) : la vignette courante n'est pas sous la tête de lecture — \(diagnostic)",
            file: file, line: line
        )
        guard current > 0 else { return }
        guard let previousFrame = frames[current - 1] else {
            XCTFail("\(context) : la vignette précédente n'est pas rendue à gauche — \(diagnostic)", file: file, line: line)
            return
        }
        XCTAssertEqual(
            previousFrame.midX, Self.expectedMidX(of: current - 1, current: current), accuracy: Self.tolerance,
            "\(context) : la vignette précédente n'est pas posée juste à gauche de la courante — \(diagnostic)",
            file: file, line: line
        )
    }

    private static func describe(_ frames: [Int: CGRect], in screen: RenderedScreen) -> String {
        let seen = frames.sorted { $0.key < $1.key }
            .map { "\($0.key + 1)@x=\(Int($0.value.minX.rounded()))" }
            .joined(separator: " ")
        let strips = scrollViews(in: screen.root)
            .map { "offset \($0.contentOffset.x) · inset \($0.adjustedContentInset.left) · contenu \($0.contentSize.width)" }
            .joined(separator: " | ")
        return "vignettes vues [\(seen)] · bande [\(strips)]"
    }

    private static func scrollViews(in view: UIView) -> [UIScrollView] {
        let own = (view as? UIScrollView).map { [$0] } ?? []
        return own + view.subviews.flatMap { scrollViews(in: $0) }
    }

    private static func settle(bound: TimeInterval = 1.5, until condition: () -> Bool) {
        let deadline = Date().addingTimeInterval(bound)
        while Date() < deadline, !condition() {
            RunLoop.current.run(until: Date().addingTimeInterval(0.02))
        }
    }
}

/// **Un doigt posé sur la bande, pour SwiftUI.**
///
/// `scrollPosition(id:)` n'écrit son binding que pendant un défilement de
/// l'UTILISATEUR. Mesuré sur iOS 18.2 et 26.1 : ni `setContentOffset`, animé
/// ou non, ni les appels du délégué seuls ne le font bouger. SwiftUI reconnaît
/// le geste à `isDragging` / `isTracking`, que seul un vrai doigt pose. La sonde
/// les pose sur CETTE instance, par une sous-classe dynamique, puis rejoue un
/// glisser image par image entre `scrollViewWillBeginDragging` et
/// `scrollViewDidEndDragging`.
private enum FingerOnStrip {
    nonisolated(unsafe) private static var isTouching = false

    static func install(on strip: UIScrollView) {
        guard let base = object_getClass(strip) else { return }
        let name = "FingerOnStrip_" + NSStringFromClass(base).replacingOccurrences(of: ".", with: "_")
        if let existing = NSClassFromString(name) {
            object_setClass(strip, existing)
            return
        }
        guard let probe = objc_allocateClassPair(base, name, 0) else { return }
        let touching: @convention(block) (AnyObject) -> Bool = { _ in FingerOnStrip.isTouching }
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
    static func drag(_ strip: UIScrollView, toIndex index: Int, frames: Int = 12) {
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
