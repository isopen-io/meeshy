import CoreGraphics

/// **La scène est le plus grand 9:16 de la zone sûre** (#13839).
///
/// Plus de carte, plus de couloir : la scène prend toute la largeur (ou toute
/// la hauteur sur un écran large) et les contrôles se posent dessus. Quand le
/// clavier ou un panneau monte, elle ne se RE-MET PAS EN PAGE — elle se réduit
/// par une échelle ancrée en haut et, s'il le faut, un décalage : une seule
/// transaction, aucun calcul de mise en page du canvas, donc aucun objet qui
/// saute pendant le geste.
nonisolated enum ComposerSceneFit {

    struct Lift: Equatable, Sendable {
        var scale: CGFloat
        var offsetY: CGFloat

        static let identity = Lift(scale: 1, offsetY: 0)
    }

    static let minimumScale: CGFloat = 0.35

    static func frame(in zone: CGRect, aspectRatio ratio: CGFloat) -> CGRect {
        guard isUsable(zone), ratio.isFinite, ratio > 0 else { return .zero }
        let largeurParHauteur = zone.height * ratio
        let size = largeurParHauteur <= zone.width
            ? CGSize(width: largeurParHauteur, height: zone.height)
            : CGSize(width: zone.width, height: zone.width / ratio)
        return CGRect(x: zone.midX - size.width / 2, y: zone.midY - size.height / 2,
                      width: size.width, height: size.height)
    }

    static func lift(scene: CGRect, visibleBottom: CGFloat) -> Lift {
        guard isUsable(scene), visibleBottom.isFinite, scene.maxY > visibleBottom else { return .identity }
        let place = max(visibleBottom - scene.minY, 0)
        let scale = min(max(place / scene.height, minimumScale), 1)
        let depassement = scene.minY + scene.height * scale - visibleBottom
        let offsetY = depassement > 0 ? -min(depassement, max(scene.minY, 0)) : 0
        return Lift(scale: scale, offsetY: offsetY)
    }

    private static func isUsable(_ rect: CGRect) -> Bool {
        [rect.minX, rect.minY, rect.width, rect.height].allSatisfy(\.isFinite)
            && rect.width > 0 && rect.height > 0
    }
}
