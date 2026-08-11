import CoreGraphics

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
}
