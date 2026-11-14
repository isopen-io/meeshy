import CoreGraphics
import Foundation

/// **L'appel réduit est un disque rogné, aimanté au bord** (#18458, directive
/// porteur) : le disque de l'avatar se colle au bord gauche ou droit et y est
/// rogné ; la LIGNE se dit par des cercles concentriques autour de lui, le
/// réseau ne s'y voit que dégradé, la durée continue sur la partie visible.
/// Une loi pure : la vue ne décide de rien.
nonisolated enum CallEdgeDiskLaw {
    /// Le diamètre du disque — celui du palier cercle de la bulle.
    static let diameter: CGFloat = 56
    /// La part du disque qui sort de l'écran : assez pour dire « rangé au bord »,
    /// pas assez pour cacher le visage.
    static let hiddenFraction: CGFloat = 0.3
    /// Deux cercles autour du disque, espacés d'autant.
    static let ringCount = 2
    static let ringSpacing: CGFloat = 6
    static let ringLineWidth: CGFloat = 1.5

    /// Le côté de l'écran où le disque reste visible.
    enum VisibleSide: Equatable {
        case leading
        case trailing
    }

    /// La tenue des anneaux. Le réseau dégradé prime sur la parole : on ne
    /// confond pas une voix qui porte avec une ligne qui tient.
    enum RingTone: Equatable {
        case resting
        case speaking
        case degraded
        case poor
    }

    /// Le centre horizontal du disque : il déborde l'écran de `hiddenFraction`
    /// de son diamètre, du côté du bord d'ancrage.
    static func centerX(edge: BubbleHorizontalEdge, screenWidth: CGFloat, diameter: CGFloat = diameter) -> CGFloat {
        let overflow = diameter * hiddenFraction
        switch edge {
        case .trailing: return screenWidth - diameter / 2 + overflow
        case .leading: return diameter / 2 - overflow
        }
    }

    /// La largeur du disque qui reste à l'écran.
    static func visibleWidth(diameter: CGFloat = diameter) -> CGFloat {
        diameter * (1 - hiddenFraction)
    }

    /// Le côté où se posent la durée et l'indicateur réseau : celui qui se voit.
    static func visibleSide(edge: BubbleHorizontalEdge) -> VisibleSide {
        switch edge {
        case .trailing: return .leading
        case .leading: return .trailing
        }
    }

    /// Le rayon du cercle d'indice `index` (0 = le plus proche du disque).
    static func ringRadius(index: Int, diameter: CGFloat = diameter) -> CGFloat {
        diameter / 2 + ringSpacing * CGFloat(index + 1)
    }

    static func ringTone(isSpeaking: Bool, strength: CallSignalStrength) -> RingTone {
        switch strength {
        case .poor, .lost: return .poor
        case .fair: return .degraded
        case .excellent, .good, .connecting: return isSpeaking ? .speaking : .resting
        }
    }

    /// L'opacité d'un cercle : le plus proche est le plus franc, et au repos
    /// les deux restent discrets.
    static func ringOpacity(tone: RingTone, index: Int) -> Double {
        let base: Double
        switch tone {
        case .resting: base = 0.35
        case .speaking, .degraded, .poor: base = 0.9
        }
        return base * (index == 0 ? 1 : 0.6)
    }

    /// Le réseau ne se montre que dégradé (loi 1 de la planche).
    static func showsSignal(strength: CallSignalStrength) -> Bool {
        switch strength {
        case .fair, .poor, .lost: return true
        case .excellent, .good, .connecting: return false
        }
    }
}
