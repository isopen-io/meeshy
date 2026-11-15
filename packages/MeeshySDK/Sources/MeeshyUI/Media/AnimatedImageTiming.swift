import Foundation

/// **Le rééchantillonnage des délais d'une image animée** (#4925).
///
/// ## Le problème que ce type résout, et pourquoi il n'est pas cosmétique
///
/// Un GIF porte un délai PAR IMAGE : 40 ms, 40 ms, 200 ms, 40 ms… `UIImageView`
/// anime une `UIImage.animatedImage(with:duration:)`, qui n'accepte qu'une durée
/// GLOBALE et répartit ses images UNIFORMÉMENT. Servir directement les N images
/// avec la somme des délais joue donc le GIF à cadence CONSTANTE.
///
/// > C'est un défaut plus difficile à voir qu'une absence d'animation, donc
/// > pire : ça bouge, ça a l'air de marcher, et la pose qui devait durer une
/// > seconde passe en un dixième. Personne n'ouvre de ticket pour « le sticker
/// > s'anime un peu trop vite ».
///
/// La solution éprouvée est de rééchantillonner sur le **PGCD des délais** et de
/// RÉPÉTER les images lentes : trois images à 40/40/200 ms deviennent
/// 1 + 1 + 5 = 7 images à 40 ms. La cadence uniforme d'`UIImage` redevient alors
/// exacte.
///
/// ## Ce qui rend le calcul délicat, et se teste ici
///
/// - **Les délais sont des flottants** issus d'un dictionnaire ImageIO. Un PGCD
///   sur des flottants ne converge pas ; on travaille en CENTISECONDES entières,
///   qui sont d'ailleurs l'unité du format GIF lui-même.
/// - **Un délai nul ou minuscule est une convention, pas une valeur.** Les GIF
///   écrits par de vieux encodeurs portent 0 ou 1 cs en voulant dire « aussi
///   vite que possible » ; tous les navigateurs et Apple les remontent à 10 cs.
///   Sans cette règle, le PGCD tombe à 1 cs et une animation de 3 images en
///   produit 300.
/// - **L'explosion combinatoire est réelle.** Des délais premiers entre eux
///   (7 cs et 11 cs) donnent un PGCD de 1 et un tableau de centaines d'images
///   partageant le même `CGImage`. Le plafond ci-dessous relâche l'unité plutôt
///   que de tronquer l'animation : mieux vaut une cadence légèrement approchée
///   qu'un cycle amputé.
nonisolated public enum AnimatedImageTiming {

    /// Le plan de lecture : combien de fois répéter chaque image, et la durée
    /// totale d'un cycle.
    public struct Plan: Equatable, Sendable {
        /// `repeats[i]` = nombre de fois que l'image `i` apparaît dans le
        /// tableau servi à `UIImage.animatedImage`. Toujours ≥ 1 : une image
        /// d'un GIF ne disparaît jamais du cycle, même si son délai est
        /// négligeable devant l'unité retenue.
        public let repeats: [Int]
        /// Durée d'UN cycle complet, en secondes.
        public let duration: TimeInterval
        /// L'unité de temps retenue, en secondes — la durée d'une image du
        /// tableau servi.
        public let unit: TimeInterval

        public var totalFrames: Int { repeats.reduce(0, +) }
    }

    /// Sous ce délai, la valeur est traitée comme la convention « aussi vite que
    /// possible » plutôt que comme une mesure. Seuil d'Apple et des navigateurs.
    public static let negligibleDelay: TimeInterval = 0.011

    /// Ce que vaut un délai négligeable. 10 cs — la valeur que le monde entier
    /// applique, ce qui compte plus que sa justification théorique : un GIF joue
    /// à la vitesse à laquelle son auteur l'a VU jouer.
    public static let defaultDelay: TimeInterval = 0.1

    /// Au-delà, on relâche l'unité. 600 images ≈ 10 s à 60 Hz : très au-delà de
    /// tout sticker, et très en deçà d'un tableau qui coûterait de la mémoire
    /// (les images sont PARTAGÉES — un `CGImage` répété N fois n'est pas N
    /// bitmaps).
    public static let maximumFrames = 600

    /// Rend `nil` pour ce qui n'est pas une animation : zéro ou une seule image.
    ///
    /// **`nil` plutôt qu'un plan à une image**, et c'est la décision de
    /// conception du lot : un chemin animé qui accepte le cas fixe ferait payer
    /// à chaque avatar et chaque vignette un `UIImageView` et un tableau de
    /// frames. La distinction est la valeur de retour, jamais un drapeau posé à
    /// côté.
    public static func plan(delays: [TimeInterval]) -> Plan? {
        guard delays.count > 1 else { return nil }

        let normalized = delays.map { $0 < negligibleDelay ? defaultDelay : $0 }
        // Centisecondes entières — l'unité native du GIF, et la seule sur
        // laquelle un PGCD converge.
        let centis = normalized.map { max(1, Int(($0 * 100).rounded())) }

        var unit = centis.reduce(centis[0], greatestCommonDivisor)
        var repeats = centis.map { $0 / unit }

        // Relâchement : tant que le cycle dépasse le plafond, on double l'unité.
        // Chaque image garde au moins une occurrence — une image ne sort jamais
        // du cycle, sa durée est seulement arrondie.
        while repeats.reduce(0, +) > maximumFrames {
            unit *= 2
            repeats = centis.map { max(1, Int((Double($0) / Double(unit)).rounded())) }
        }

        let unitSeconds = TimeInterval(unit) / 100
        return Plan(
            repeats: repeats,
            duration: TimeInterval(repeats.reduce(0, +)) * unitSeconds,
            unit: unitSeconds
        )
    }

    /// **L'image d'un cycle décodé à l'instant `elapsed`** (#8610) — la même
    /// que montrerait la `CAKeyframeAnimation` discrète de la scène.
    ///
    /// Les images de `AnimatedImageDecoder.Decoded.frames` sont déjà
    /// rééchantillonnées sur une unité commune (`plan`) : une image lente y
    /// figure plusieurs fois, donc l'index se lit en divisant le temps par
    /// `duration / frameCount` — les durées du fichier sont respectées par
    /// construction. Une boucle FINIE épuisée tient sa dernière image, comme
    /// `fillMode = .forwards` ; un temps négatif ou une durée dégénérée tient
    /// la première.
    public static func frameIndex(elapsed: TimeInterval,
                                  frameCount: Int,
                                  duration: TimeInterval,
                                  loopCount: Int) -> Int {
        guard frameCount > 1, duration > 0, elapsed.isFinite, elapsed > 0 else { return 0 }
        if loopCount > 0, elapsed >= duration * Double(loopCount) { return frameCount - 1 }
        let withinCycle = elapsed.truncatingRemainder(dividingBy: duration)
        // La tolérance absorbe l'arrondi binaire d'un reste exact (0,5 mod 0,4
        // rend 0,0999…) : une frontière d'image ne recule jamais d'une image.
        let index = Int((withinCycle / duration * Double(frameCount) + 1e-9).rounded(.down))
        return min(max(index, 0), frameCount - 1)
    }

    private static func greatestCommonDivisor(_ a: Int, _ b: Int) -> Int {
        var x = abs(a), y = abs(b)
        while y != 0 { (x, y) = (y, x % y) }
        return max(x, 1)
    }
}
