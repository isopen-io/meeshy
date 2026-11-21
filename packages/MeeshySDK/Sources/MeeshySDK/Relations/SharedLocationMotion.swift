import Foundation

/// `SHARED_LOCATION_MOTIONS` (#19887) : ce que fait la personne quand sa position part — immobile, à pied, en courant, à
/// vélo, en voiture. ADDITIF : il voyage dans la position envoyée et n'est servi qu'au lecteur à la précision exacte.
public enum SharedLocationMotion: String, Sendable, Equatable, CaseIterable {
    case stationary
    case walking
    case running
    case cycling
    case automotive

    /// Au-delà, le mouvement d'une position ne dit plus ce que fait la personne : la liste seule rejoue le dernier point
    /// avec son heure, et le dernier mouvement avec lui.
    public static let freshFor: TimeInterval = 5 * 60

    /// Le mouvement à montrer pour une position servie à `updatedAt` : `nil` dès qu'elle a cinq minutes.
    public static func shown(_ motion: SharedLocationMotion?, updatedAt: Date, now: Date) -> SharedLocationMotion? {
        guard let motion, now.timeIntervalSince(updatedAt) < freshFor else { return nil }
        return motion
    }
}
