import Foundation

/// LES DATES DU FIL — la source unique de ce que le SDK envoie à la passerelle
/// et relit de ce qu'elle sert (#6609).
///
/// La passerelle sérialise par `toISOString` (`2026-09-15T09:34:23.563Z`) et
/// valide ses entrées par `z.string().datetime({ offset: true })`. Le SDK écrit
/// donc une date-heure ISO 8601 COMPLÈTE, en UTC, à millisecondes, et relit
/// avec ET sans fractions de seconde.
///
/// `ce94a0f71d` avait remplacé ces formats par `.iso8601.time(…)`, qui ne porte
/// que l'HEURE : `GET /sync?since=03:53:29.563` rendait 400 et chaque delta
/// retombait sur le rechargement complet.
public enum WireDate {

    // `ISO8601DateFormatter` est thread-safe une fois configuré (même motif
    // que `APIClient` et `MessageSocketManager`).
    nonisolated(unsafe) private static let avecFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) private static let sansFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// `2026-09-15T09:34:23.563Z`. Les millisecondes sont calculées ICI plutôt
    /// que confiées au formateur, pour que l'arrondi soit une règle écrite : une
    /// milliseconde exacte (au bruit binaire près) s'écrit telle quelle, une date
    /// sous la milliseconde s'arrondit vers le BAS — un watermark écrit plus tard
    /// que lui-même ferait sauter une ligne du delta.
    public static func string(from date: Date) -> String {
        let exactes = date.timeIntervalSince1970 * 1_000
        let voisine = exactes.rounded()
        let millisecondes = abs(exactes - voisine) < 0.001 ? voisine : exactes.rounded(.down)
        let secondes = (millisecondes / 1_000).rounded(.down)
        let fraction = Int(millisecondes - secondes * 1_000)
        let ronde = sansFractions.string(from: Date(timeIntervalSince1970: secondes))
        return String(ronde.dropLast()) + String(format: ".%03dZ", fraction)
    }

    /// Une date-heure ISO 8601 avec ou sans fractions de seconde, en `Z` ou
    /// avec décalage. `nil` pour tout le reste — une heure seule n'est pas une date.
    public static func date(from string: String) -> Date? {
        avecFractions.date(from: string) ?? sansFractions.date(from: string)
    }
}
