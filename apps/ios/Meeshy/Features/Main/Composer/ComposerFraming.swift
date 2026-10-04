import CoreGraphics

/// **Le cadrage final d'une prise** (#9347, spec § 3.3 et § 4.1).
///
/// Il se lit comme une FENÊTRE dans la source : la plus grande fenêtre aux
/// proportions de la cible (le canevas 9:16 sans cadre, la découpe d'un cadre
/// sinon), divisée par l'échelle choisie, centrée sur le point choisi puis
/// ramenée dans la source. Une fenêtre ne sort jamais de la source : le canevas
/// reste toujours rempli, aucun bord vide.
nonisolated struct ComposerFraming: Hashable, Sendable {
    /// Le centre voulu, en fraction de la source (0…1, repère Core Image : y vers le haut).
    var center = CGPoint(x: 0.5, y: 0.5)
    /// 1 ⇒ remplissage exact ; au-delà, on rapproche.
    var scale: CGFloat = 1

    static let identity = ComposerFraming()
    static let scaleRange: ClosedRange<CGFloat> = 1...4

    var isIdentity: Bool { self == .identity }

    private var clampedScale: CGFloat {
        min(Self.scaleRange.upperBound, max(Self.scaleRange.lowerBound, scale))
    }

    func window(in source: CGRect, aspect: CGFloat) -> CGRect {
        guard source.width > 0, source.height > 0, aspect > 0 else { return source }
        let remplissage = source.width / source.height > aspect
            ? CGSize(width: source.height * aspect, height: source.height)
            : CGSize(width: source.width, height: source.width / aspect)
        let taille = CGSize(width: remplissage.width / clampedScale, height: remplissage.height / clampedScale)
        let voulu = CGPoint(x: source.minX + center.x * source.width, y: source.minY + center.y * source.height)
        let x = min(source.maxX - taille.width, max(source.minX, voulu.x - taille.width / 2))
        let y = min(source.maxY - taille.height, max(source.minY, voulu.y - taille.height / 2))
        return CGRect(x: x, y: y, width: taille.width, height: taille.height)
    }

    /// Le centre ramené à celui de la fenêtre RÉELLE : un glissé poussé contre un
    /// bord ne laisse aucune « dette » à rembourser au retour.
    func settled(source: CGRect, aspect: CGFloat) -> ComposerFraming {
        guard source.width > 0, source.height > 0 else { return self }
        let fenetre = window(in: source, aspect: aspect)
        return ComposerFraming(
            center: CGPoint(x: (fenetre.midX - source.minX) / source.width,
                            y: (fenetre.midY - source.minY) / source.height),
            scale: clampedScale)
    }

    /// Le doigt glisse de `translation` (points, y vers le bas) sur une case de
    /// `viewSize` : le média suit le doigt, la fenêtre part donc à l'opposé.
    func panned(by translation: CGSize, viewSize: CGSize, source: CGRect, aspect: CGFloat) -> ComposerFraming {
        guard viewSize.width > 0, viewSize.height > 0, source.width > 0, source.height > 0 else { return self }
        let fenetre = window(in: source, aspect: aspect)
        let dx = -translation.width / viewSize.width * fenetre.width / source.width
        let dy = translation.height / viewSize.height * fenetre.height / source.height
        return ComposerFraming(center: CGPoint(x: center.x + dx, y: center.y + dy), scale: scale)
            .settled(source: source, aspect: aspect)
    }

    func zoomed(by factor: CGFloat, source: CGRect, aspect: CGFloat) -> ComposerFraming {
        ComposerFraming(center: center, scale: scale * factor).settled(source: source, aspect: aspect)
    }
}
