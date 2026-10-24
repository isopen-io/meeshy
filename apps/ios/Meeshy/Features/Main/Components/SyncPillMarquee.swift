import CoreGraphics
import Foundation

/// Décision pure de défilement (marquee) du texte trop long dans `SyncPill`.
///
/// La mesure porte TOUJOURS sur le `label` seul, jamais sur le texte composé
/// avec les points de suspension animés (`animatedDots`, qui changent 2×/s) —
/// les mesurer ensemble ferait osciller `shouldScroll` et redémarrer
/// l'animation en boucle, un défilement épileptique. C'est à l'appelant
/// (`SyncPill`) de ne mesurer que `label`.
enum SyncPillMarquee {
    /// Vitesse constante du défilement, en points par seconde.
    nonisolated static let pointsPerSecond: Double = 40

    /// `true` quand le texte déborde strictement de la largeur disponible.
    /// Égalité exacte → pas de défilement (évite un déclenchement sur un
    /// arrondi flottant d'un pixel).
    nonisolated static func shouldScroll(textWidth: CGFloat, availableWidth: CGFloat) -> Bool {
        textWidth > availableWidth
    }

    /// Durée d'un cycle complet de défilement, proportionnelle à la largeur
    /// du texte à parcourir. Plancher à 1 s pour qu'un texte à peine trop
    /// long reste perceptible plutôt que de clignoter.
    nonisolated static func scrollDuration(textWidth: CGFloat) -> Double {
        max(1.0, Double(textWidth) / pointsPerSecond)
    }

    /// Espace (pt) laissé derrière la fin du texte avant qu'il ne reparte du
    /// bord droit.
    nonisolated static let gap: CGFloat = 24

    /// **Le décalage horizontal du texte à l'instant `elapsed`, loi pure du
    /// TEMPS ÉCOULÉ** (#9883).
    ///
    /// Le défilement n'est plus un état incrémenté par un `Timer` à chaque tic :
    /// c'est une fonction du temps. La première passe va de la position de repos
    /// (0) jusqu'à la sortie complète du texte ; les suivantes repartent du bord
    /// droit du viewport. Une horloge qui saute des images ne change donc pas la
    /// vitesse, et la PAUSE (WCAG 2.2.2) se réduit à figer `elapsed` : l'état
    /// visuel courant est conservé, jamais remis à zéro.
    nonisolated static func offset(elapsed: TimeInterval, textWidth: CGFloat, availableWidth: CGFloat) -> CGFloat {
        guard elapsed > 0 else { return 0 }
        let travelled = CGFloat(pointsPerSecond * elapsed)
        let firstPass = textWidth + gap
        guard travelled > firstPass else { return -travelled }
        let lap = availableWidth + firstPass
        let intoLap = (travelled - firstPass).truncatingRemainder(dividingBy: lap)
        return availableWidth - intoLap
    }
}
