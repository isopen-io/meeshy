import Foundation

/// L'ANIMATION DE LA PLAQUE D'AUTEUR (#10816) — une animation Lottie GÉNÉRÉE depuis le fini de la plaque,
/// jamais un fichier dessiné par variante. Miroir de `apps/web/src/lib/game-photo/author-plate-motion.ts`
/// — les mêmes couches, les mêmes clés : une gravure s'anime de la même façon sur les deux plateformes.
///
/// Le moteur est l'unique de l'app (`LottieLayerView`), qui la joue une fois à la première apparition ; sous
/// « Réduire les animations » l'hôte ne la monte pas — la plaque fixe, dessinée dessous, est déjà l'état
/// final. Aucune animation ne cache le nom : elle passe DESSUS.
///
///  - gravure : le burin, un point de lumière qui suit la ligne de base du pseudo ;
///  - estampage : quatre éclats sur les lettres frappées ;
///  - grattage : la pièce qui gratte en zigzag et les paillettes d'argent qui tombent ;
///  - et pour tous, le lustre qui traverse la plaque en diagonale.
///
/// La boîte est celle de la plaque (360 × 100) : les mêmes coordonnées, la couche se pose exactement sur le
/// dessin.
nonisolated enum GamePhotoAuthorPlateMotion {

    static let box = CGSize(width: 360, height: 100)
    static let framesPerSecond = 60
    /// 1,2 s : l'animation explique la gravure, puis se tait.
    static let frames = 72

    private typealias Json = [String: Any]
    private typealias Key = (t: Int, s: [Double])

    private static var ease: Json { ["i": ["x": [0.4], "y": [1]], "o": ["x": [0.6], "y": [0]]] }

    private static func still(_ k: Any) -> Json { ["a": 0, "k": k] }

    private static func moving(_ keys: [Key]) -> Json {
        let frames: [Json] = keys.enumerated().map { index, key in
            let base: Json = ["t": key.t, "s": key.s]
            return index == keys.count - 1 ? base : base.merging(ease) { current, _ in current }
        }
        return ["a": 1, "k": frames]
    }

    /// Le blanc du reflet et l'argent des paillettes : des lumières, pas des couleurs de la charte.
    private static let glint: [Double] = [1, 1, 1, 1]
    private static let silver: [Double] = [0.86, 0.88, 0.92, 1]
    private static let gold: [Double] = [0.99, 0.85, 0.45, 1]

    private static func group(_ items: [Json]) -> Json {
        let transform: Json = [
            "ty": "tr", "p": still([0, 0]), "a": still([0, 0]), "s": still([100, 100]), "r": still(0),
            "o": still(100), "sk": still(0), "sa": still(0),
        ]
        return ["ty": "gr", "it": items + [transform]]
    }

    private static func fill(_ color: [Double]) -> Json { ["ty": "fl", "c": still(color), "o": still(100), "r": 1] }
    private static func ellipse(_ size: Double) -> Json { ["ty": "el", "d": 1, "s": still([size, size]), "p": still([0, 0])] }
    private static func rect(_ w: Double, _ h: Double) -> Json { ["ty": "rc", "d": 1, "s": still([w, h]), "p": still([0, 0]), "r": still(0)] }

    private static func layer(
        index: Int, name: String, shapes: [Json], position: Json, opacity: Json, rotation: Double = 0, scale: Json? = nil
    ) -> Json {
        [
            "ddd": 0, "ind": index, "ty": 4, "nm": name, "sr": 1,
            "ks": ["o": opacity, "r": still(rotation), "p": position, "a": still([0, 0, 0]), "s": scale ?? still([100, 100, 100])],
            "ao": 0, "shapes": [group(shapes)], "ip": 0, "op": frames, "st": 0, "bm": 0,
        ]
    }

    private static func sheen(_ index: Int) -> Json {
        layer(
            index: index, name: "lustre", shapes: [rect(34, 180), fill(glint)],
            position: moving([(30, [-40, 50, 0]), (70, [400, 50, 0])]),
            opacity: moving([(30, [0]), (44, [45]), (70, [0])]),
            rotation: 18
        )
    }

    private static func burin(_ index: Int) -> Json {
        layer(
            index: index, name: "burin", shapes: [ellipse(7), fill(glint)],
            position: moving([(0, [126, 74, 0]), (40, [302, 74, 0])]),
            opacity: moving([(0, [0]), (6, [95]), (36, [95]), (44, [0])])
        )
    }

    private static let sparkSpots: [(x: Double, y: Double, start: Int)] = [(140, 52, 4), (196, 80, 12), (248, 50, 20), (292, 78, 28)]

    private static func sparks(from: Int) -> [Json] {
        sparkSpots.enumerated().map { offset, spot in
            layer(
                index: from + offset, name: "éclat \(offset + 1)", shapes: [ellipse(6), fill(glint)],
                position: still([spot.x, spot.y, 0]),
                opacity: still(90),
                scale: moving([(spot.start, [0, 0, 100]), (spot.start + 8, [140, 140, 100]), (spot.start + 20, [0, 0, 100])])
            )
        }
    }

    private static let coinPath: [(Double, Double)] = [(118, 46), (308, 52), (122, 60), (310, 66), (120, 74)]

    private static func coin(_ index: Int) -> Json {
        layer(
            index: index, name: "pièce", shapes: [ellipse(16), fill(gold)],
            position: moving(coinPath.enumerated().map { step, point in (step * 10, [point.0, point.1, 0]) }),
            opacity: moving([(0, [100]), (40, [100]), (48, [0])])
        )
    }

    private static let fleckSpots: [(x: Double, start: Int)] = [(150, 6), (184, 12), (222, 18), (258, 24), (290, 30)]

    private static func flecks(from: Int) -> [Json] {
        fleckSpots.enumerated().map { offset, spot in
            layer(
                index: from + offset, name: "paillette \(offset + 1)", shapes: [ellipse(4), fill(silver)],
                position: moving([(spot.start, [spot.x, 62, 0]), (spot.start + 30, [spot.x + 6, 100, 0])]),
                opacity: moving([(spot.start, [0]), (spot.start + 4, [100]), (spot.start + 30, [0])])
            )
        }
    }

    private static func layers(_ finish: PlateFinish) -> [Json] {
        switch finish {
        case .engrave: [burin(1), sheen(2)]
        case .emboss: sparks(from: 1) + [sheen(1 + sparkSpots.count)]
        case .scratch: [coin(1)] + flecks(from: 2) + [sheen(2 + fleckSpots.count)]
        }
    }

    /// Le document Lottie du fini, prêt à sérialiser.
    static func document(_ finish: PlateFinish) -> [String: Any] {
        [
            "v": "5.7.4", "fr": framesPerSecond, "ip": 0, "op": frames,
            "w": Int(box.width), "h": Int(box.height),
            "nm": "plaque d'auteur · \(finish.rawValue)", "ddd": 0, "assets": [] as [Any],
            "layers": layers(finish),
        ]
    }

    /// Les octets que `LottieLayerSource.film(data:)` lit : l'animation générée, encodée une fois par fini.
    static func data(_ finish: PlateFinish) -> Data {
        (try? JSONSerialization.data(withJSONObject: document(finish), options: [.sortedKeys])) ?? Data()
    }
}
