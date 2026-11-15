import CoreGraphics
import Foundation

/// Loi 17.2 · 17.10 (#18207) — le mouvement du verre de la pilule, miroir d'Android
/// `CallPillMotion` (#18411) et du web `morphKeyframes`, mêmes vecteurs. La mise en page prend
/// d'un coup sa forme finale ; le verre en repart de la taille qu'il montrait, vue comme une
/// échelle de la nouvelle ancrée à son bord du bas, et la rejoint. Ce que la mise en page a
/// déplacé dedans repart de là où on le voyait, par une translation. « Réduire les animations » :
/// ni échelle ni glissement, l'ancien verre se fond dans le nouveau.
nonisolated enum CallPillMotion {
    static let unfoldDuration: TimeInterval = 0.25
    static let reducedDuration: TimeInterval = 0.2

    /// En deçà, l'écart est un arrondi de mesure, pas un mouvement (web `EPSILON_PX`).
    static let epsilon: CGFloat = 0.5

    static func duration(reduceMotion: Bool) -> TimeInterval {
        reduceMotion ? reducedDuration : unfoldDuration
    }

    static func morph(from: CGSize, to: CGSize, reduceMotion: Bool) -> CallGlassMorph? {
        guard from.width > 0, from.height > 0, to.width > 0, to.height > 0 else { return nil }
        guard abs(from.width - to.width) >= epsilon || abs(from.height - to.height) >= epsilon else { return nil }
        return CallGlassMorph(fromScaleX: from.width / to.width, fromScaleY: from.height / to.height, crossFades: reduceMotion)
    }

    /// Ce qui était en `from` et que la mise en page a posé en `to` se dessine décalé de l'écart,
    /// puis rejoint sa place. « Réduire les animations » : rien ne glisse.
    static func followShift(from: CGPoint, to: CGPoint, reduceMotion: Bool) -> CGSize? {
        guard !reduceMotion else { return nil }
        guard abs(from.x - to.x) >= epsilon || abs(from.y - to.y) >= epsilon else { return nil }
        return CGSize(width: from.x - to.x, height: from.y - to.y)
    }

    /// La courbe du morphisme : `cubic-bezier(0.4, 0, 0.2, 1)`, celle d'Android (`FastOutSlowInEasing`).
    static func eased(_ linear: Double) -> Double {
        let x = min(max(linear, 0), 1)
        guard x > 0, x < 1 else { return x }
        var low = 0.0
        var high = 1.0
        for _ in 0 ..< 40 {
            let middle = (low + high) / 2
            if bezier(middle, 0.4, 0.2) < x { low = middle } else { high = middle }
        }
        return bezier((low + high) / 2, 0, 1)
    }

    private static func bezier(_ t: Double, _ first: Double, _ second: Double) -> Double {
        let inverse = 1 - t
        return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t
    }
}

/// Une image du verre qui morphe : le verre dessiné à `scaleX` × `scaleY` de sa taille posée,
/// ancré au centre de son bord du bas, à `alpha` ; sous « Réduire les animations », la forme qu'il
/// quitte, à son ancienne taille, qui s'efface (`ghostAlpha`).
nonisolated struct CallGlassMorphFrame: Equatable, Sendable {
    let scaleX: CGFloat
    let scaleY: CGFloat
    let alpha: Double
    let ghostScaleX: CGFloat
    let ghostScaleY: CGFloat
    let ghostAlpha: Double

    static let rest = CallGlassMorphFrame(scaleX: 1, scaleY: 1, alpha: 1, ghostScaleX: 1, ghostScaleY: 1, ghostAlpha: 0)

    /// La taille que montre le verre posé à `laidOut` : d'où repart un morphisme interrompu.
    func seen(_ laidOut: CGSize) -> CGSize {
        CGSize(width: laidOut.width * scaleX, height: laidOut.height * scaleY)
    }
}

/// Le morphisme d'un verre dont la mise en page a déjà pris sa nouvelle taille.
nonisolated struct CallGlassMorph: Equatable, Sendable {
    let fromScaleX: CGFloat
    let fromScaleY: CGFloat
    let crossFades: Bool

    func frame(progress: Double) -> CallGlassMorphFrame {
        let p = min(max(progress, 0), 1)
        guard p < 1 else { return .rest }
        if crossFades {
            return CallGlassMorphFrame(scaleX: 1, scaleY: 1, alpha: p, ghostScaleX: fromScaleX, ghostScaleY: fromScaleY, ghostAlpha: 1 - p)
        }
        let x = fromScaleX + (1 - fromScaleX) * CGFloat(p)
        let y = fromScaleY + (1 - fromScaleY) * CGFloat(p)
        return CallGlassMorphFrame(scaleX: x, scaleY: y, alpha: 1, ghostScaleX: x, ghostScaleY: y, ghostAlpha: 0)
    }
}

/// L'horloge du verre : la taille posée, le morphisme en cours et son départ. Pure : la vue la lit
/// à chaque image (`TimelineView`) et la remet à jour quand la mise en page change.
nonisolated struct CallGlassMorphClock: Equatable, Sendable {
    private(set) var laidOut: CGSize?
    private(set) var morph: CallGlassMorph?
    private(set) var startedAt: Date?
    private(set) var duration: TimeInterval = CallPillMotion.unfoldDuration

    var isRunning: Bool { startedAt != nil }

    func frame(at date: Date) -> CallGlassMorphFrame {
        guard let morph, let startedAt else { return .rest }
        return morph.frame(progress: CallPillMotion.eased(date.timeIntervalSince(startedAt) / duration))
    }

    /// Ce que montre le verre posé à `size` à cet instant, la nouvelle taille fût-elle encore à
    /// enregistrer : la première image d'un morphisme est juste, sans attendre la mise à jour.
    func frame(laidOut size: CGSize, at date: Date, reduceMotion: Bool) -> CallGlassMorphFrame {
        guard size != laidOut else { return frame(at: date) }
        return measured(size, at: date, reduceMotion: reduceMotion).frame(at: date)
    }

    /// La mise en page pose le verre à `size` : un morphisme part de la taille vue à cet instant.
    func measured(_ size: CGSize, at date: Date, reduceMotion: Bool) -> CallGlassMorphClock {
        guard size != laidOut else { return self }
        guard let before = laidOut else { return CallGlassMorphClock(laidOut: size) }
        let seen = frame(at: date).seen(before)
        guard let next = CallPillMotion.morph(from: seen, to: size, reduceMotion: reduceMotion) else {
            return CallGlassMorphClock(laidOut: size)
        }
        return CallGlassMorphClock(laidOut: size, morph: next, startedAt: date, duration: CallPillMotion.duration(reduceMotion: reduceMotion))
    }

    func settled(at date: Date) -> CallGlassMorphClock {
        guard let startedAt, date.timeIntervalSince(startedAt) >= duration else { return self }
        return CallGlassMorphClock(laidOut: laidOut)
    }
}

/// L'horloge de ce qui SUIT le verre (les boutons de la rangée, les sous-titres, ma vignette) :
/// la mise en page l'a déjà posé à sa place, il repart de là où on le voyait par une translation.
/// « Réduire les animations » : rien ne glisse, il paraît à sa place par un fondu court.
nonisolated struct CallGlassFollowClock: Equatable, Sendable {
    private(set) var at: CGPoint?
    private(set) var gap: CGSize = .zero
    private(set) var fades = false
    private(set) var startedAt: Date?
    private(set) var duration: TimeInterval = CallPillMotion.unfoldDuration

    var isRunning: Bool { startedAt != nil }

    func shift(at date: Date) -> CGSize {
        let left = 1 - CGFloat(eased(at: date))
        return CGSize(width: gap.width * left, height: gap.height * left)
    }

    func opacity(at date: Date) -> Double {
        fades ? linear(at: date) : 1
    }

    /// Posé en `point` : un écart réel lance le suivi, depuis l'endroit VU à cet instant.
    func placed(_ point: CGPoint, at date: Date, reduceMotion: Bool) -> CallGlassFollowClock {
        guard let before = at else { return CallGlassFollowClock(at: point) }
        return following(from: before, to: point, at: date, reduceMotion: reduceMotion)
    }

    /// La mise en page l'a déplacé de `from` à `to` : il repart de là où on le voyait (`from` et le
    /// glissement en cours), ou, sous « Réduire les animations », paraît à sa place en fondu.
    func following(from: CGPoint, to point: CGPoint, at date: Date, reduceMotion: Bool) -> CallGlassFollowClock {
        let moved = abs(from.x - point.x) >= CallPillMotion.epsilon || abs(from.y - point.y) >= CallPillMotion.epsilon
        if reduceMotion {
            guard moved else { return self }
            return CallGlassFollowClock(at: point, fades: true, startedAt: date, duration: CallPillMotion.reducedDuration)
        }
        let drawn = shift(at: date)
        let seen = CGPoint(x: from.x + drawn.width, y: from.y + drawn.height)
        guard let gap = CallPillMotion.followShift(from: seen, to: point, reduceMotion: false) else {
            return CallGlassFollowClock(at: point)
        }
        return CallGlassFollowClock(at: point, gap: gap, startedAt: date, duration: CallPillMotion.unfoldDuration)
    }

    func settled(at date: Date) -> CallGlassFollowClock {
        guard let startedAt, date.timeIntervalSince(startedAt) >= duration else { return self }
        return CallGlassFollowClock(at: at)
    }

    private func linear(at date: Date) -> Double {
        guard let startedAt else { return 1 }
        return min(max(date.timeIntervalSince(startedAt) / duration, 0), 1)
    }

    private func eased(at date: Date) -> Double {
        CallPillMotion.eased(linear(at: date))
    }
}

/// Loi 17.10 — le fondu court qui remplace un mouvement sous « Réduire les animations » : ce qui
/// change de taille ou de place s'y pose d'un coup et paraît, de 0 à 1, en 0,2 s.
nonisolated struct CallMotionFade: Equatable, Sendable {
    private(set) var startedAt: Date?

    var isRunning: Bool { startedAt != nil }

    func started(at date: Date) -> CallMotionFade {
        CallMotionFade(startedAt: date)
    }

    func opacity(at date: Date) -> Double {
        guard let startedAt else { return 1 }
        return min(max(date.timeIntervalSince(startedAt) / CallPillMotion.reducedDuration, 0), 1)
    }

    func settled(at date: Date) -> CallMotionFade {
        guard let startedAt, date.timeIntervalSince(startedAt) >= CallPillMotion.reducedDuration else { return self }
        return CallMotionFade()
    }
}
