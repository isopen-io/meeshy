import SwiftUI

/// Les formes d'un squelette : celles du composant attendu, jamais un texte ni une icône.
public nonisolated enum MeeshySkeletonShape: Sendable, Equatable {
    case line(widthRatio: Double)
    case pill(width: Double)
    case ticket(cut: Double)
    case circle(diameter: Double)
    case card(aspect: Double, radius: Double)
}

/// **La loi du squelette** : seulement si le cache est vide. Un cache, même périmé,
/// se peint tout de suite ; le squelette n'existe qu'au tout premier chargement et
/// n'est jamais posé par-dessus un contenu.
public nonisolated enum MeeshySkeletonLaw {
    public static func shows(isLoading: Bool, hasCachedData: Bool) -> Bool {
        isLoading && !hasCachedData
    }
}

/// **La recette de K38 (l'atome squelette) en VALEURS** : la silhouette de chaque forme
/// et le reflet. Une seule horloge pour tout l'écran ; le reflet n'apparaît qu'après
/// 150 ms (une réponse rapide ne clignote pas) et s'arrête sous mouvement réduit.
public nonisolated enum MeeshySkeletonRecipe {

    public struct Size: Sendable, Equatable {
        public let width: Double
        public let height: Double
        public let cornerRadius: Double
    }

    public static let sheenDuration: Double = 1.6
    public static let sheenDelayMilliseconds = 150
    public static let sheenBandFraction: Double = 0.4
    public static let sheenAngleDegrees: Double = 100
    static let lineHeight: Double = 14
    static let lineRadius: Double = 6
    static let pillHeight: Double = 34
    static let ticketHeight: Double = 96

    /// La silhouette d'une forme dans la largeur offerte ; un ratio hors bornes est ramené.
    public static func size(of shape: MeeshySkeletonShape, availableWidth: Double) -> Size {
        let width = availableWidth.isFinite ? max(availableWidth, 0) : 0
        switch shape {
        case .line(let ratio):
            let clamped = ratio.isFinite ? min(max(ratio, 0), 1) : 1
            return Size(width: width * clamped, height: lineHeight, cornerRadius: lineRadius)
        case .pill(let pillWidth):
            return Size(width: max(pillWidth, 0), height: pillHeight, cornerRadius: pillHeight / 2)
        case .ticket(let cut):
            return Size(width: width, height: ticketHeight, cornerRadius: max(cut, 0))
        case .circle(let diameter):
            let side = max(diameter, 0)
            return Size(width: side, height: side, cornerRadius: side / 2)
        case .card(let aspect, let radius):
            let ratio = aspect.isFinite && aspect > 0 ? aspect : 1
            return Size(width: width, height: width / ratio, cornerRadius: max(radius, 0))
        }
    }

    /// Une liste au premier chargement : la même silhouette répétée, trois par défaut, espacées de 8.
    public static let defaultColumnCount = 3
    public static let columnSpacing: Double = 8
    static let maxColumnCount = 6

    /// Combien de silhouettes une colonne pose : bornée de 1 à 6, une demande absurde ne remplit pas l'écran.
    public static func columnCount(_ requested: Int) -> Int {
        min(max(requested, 1), maxColumnCount)
    }

    /// Le reflet balaie après le délai, jamais sous mouvement réduit : l'aplat reste fixe.
    public static func sheenAnimates(reduceMotion: Bool, hasWaitedDelay: Bool) -> Bool {
        hasWaitedDelay && !reduceMotion
    }
}
