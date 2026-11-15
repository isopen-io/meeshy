import XCTest
import QuartzCore
@testable import MeeshyUI

/// **#9865, tranche 3 — un arbre de calques identique d'une image à l'autre ne
/// se touche pas.**
///
/// `rebuildLayers` détachait tous les calques d'objet puis les ré-attachait, à
/// chaque image de lecture. Un calque resté en place ne doit jamais quitter son
/// parent : ses `CAKeyframeAnimation` et son horloge y restent, et Core
/// Animation n'a rien à recomposer.
@MainActor
final class StoryLayerTreeTests: XCTestCase {

    private final class CountingLayer: CALayer {
        var removals = 0
        override func removeFromSuperlayer() {
            removals += 1
            super.removeFromSuperlayer()
        }
    }

    private func layers(_ count: Int) -> [CountingLayer] {
        (0..<count).map { index in
            let layer = CountingLayer()
            layer.name = "l\(index)"
            return layer
        }
    }

    private func names(_ container: CALayer) -> [String] {
        (container.sublayers ?? []).compactMap(\.name)
    }

    func test_attach_anIdenticalTree_touchesNothing() {
        let container = CALayer()
        let tree = layers(3)
        StoryLayerTree.attach(tree, to: container)

        StoryLayerTree.attach(tree, to: container)
        StoryLayerTree.attach(tree, to: container)

        XCTAssertEqual(tree.map(\.removals), [0, 0, 0], "un calque resté en place ne quitte jamais son parent")
        XCTAssertEqual(names(container), ["l0", "l1", "l2"])
    }

    func test_attach_anEmptyContainer_attachesInOrder() {
        let container = CALayer()

        StoryLayerTree.attach(layers(3), to: container)

        XCTAssertEqual(names(container), ["l0", "l1", "l2"])
    }

    func test_attach_aNewLayer_isInsertedAtItsRank_withoutMovingTheOthers() {
        let container = CALayer()
        let tree = layers(3)
        StoryLayerTree.attach(tree, to: container)
        let newcomer = CountingLayer()
        newcomer.name = "new"

        StoryLayerTree.attach([tree[0], newcomer, tree[1], tree[2]], to: container)

        XCTAssertEqual(names(container), ["l0", "new", "l1", "l2"])
        XCTAssertEqual(tree.map(\.removals), [0, 0, 0])
    }

    func test_attach_aLayerThatLeft_isRemoved_andOnlyIt() {
        let container = CALayer()
        let tree = layers(3)
        StoryLayerTree.attach(tree, to: container)

        StoryLayerTree.attach([tree[0], tree[2]], to: container)

        XCTAssertEqual(names(container), ["l0", "l2"])
        XCTAssertNil(tree[1].superlayer)
        XCTAssertEqual(tree[0].removals + tree[2].removals, 0)
    }

    func test_attach_aReorderedTree_followsTheNewOrder() {
        let container = CALayer()
        let tree = layers(3)
        StoryLayerTree.attach(tree, to: container)

        StoryLayerTree.attach([tree[2], tree[0], tree[1]], to: container)
        XCTAssertEqual(names(container), ["l2", "l0", "l1"])

        StoryLayerTree.attach([tree[0], tree[1], tree[2]], to: container)
        XCTAssertEqual(names(container), ["l0", "l1", "l2"])
    }

    func test_attach_aLayerOwnedByAnotherContainer_movesHere() {
        let other = CALayer()
        let container = CALayer()
        let tree = layers(2)
        StoryLayerTree.attach(tree, to: other)

        StoryLayerTree.attach(tree, to: container)

        XCTAssertEqual(names(container), ["l0", "l1"])
        XCTAssertTrue(other.sublayers?.isEmpty ?? true)
    }

    /// Deux objets de même `id` et de même signature reçoivent du cache le MÊME
    /// calque (en `.edit`, `reconfigure` en adopte un aussi). Une suite
    /// d'`addSublayer` le laissait à sa dernière place ; la réconciliation doit
    /// faire de même, sans viser un rang au-delà de la fin du conteneur.
    func test_attach_aLayerListedTwice_takesItsLastRank_once() {
        let container = CALayer()
        let tree = layers(3)
        let listed = [tree[0], tree[1], tree[0], tree[2]]

        StoryLayerTree.attach(listed, to: container)
        StoryLayerTree.attach(listed, to: container)

        XCTAssertEqual(names(container), ["l1", "l0", "l2"])
        XCTAssertEqual(tree.map(\.removals), [0, 0, 0], "la seconde passe ne déplace rien")
    }

    func test_attach_anEmptyTree_emptiesTheContainer() {
        let container = CALayer()
        StoryLayerTree.attach(layers(2), to: container)

        StoryLayerTree.attach([], to: container)

        XCTAssertTrue(container.sublayers?.isEmpty ?? true)
    }
}
