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
    nonisolated(unsafe) private static let wholeSecondsFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalStyle = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let wholeSecondsStyle = Date.ISO8601FormatStyle()

    /// `2026-09-15T09:34:23.563Z`. Les millisecondes sont calculées ICI plutôt
    /// que confiées au formateur, pour que l'arrondi soit une règle écrite : une
    /// milliseconde exacte (au bruit binaire près) s'écrit telle quelle, une date
    /// sous la milliseconde s'arrondit vers le BAS — un watermark écrit plus tard
    /// que lui-même ferait sauter une ligne du delta.
    public static func string(from date: Date) -> String {
        let exact = date.timeIntervalSince1970 * 1_000
        let nearest = exact.rounded()
        let milliseconds = abs(exact - nearest) < 0.001 ? nearest : exact.rounded(.down)
        let seconds = (milliseconds / 1_000).rounded(.down)
        let fraction = Int(milliseconds - seconds * 1_000)
        let whole = wholeSecondsFormatter.string(from: Date(timeIntervalSince1970: seconds))
        return String(whole.dropLast()) + String(format: ".%03dZ", fraction)
    }

    /// Une date-heure ISO 8601 avec ou sans fractions de seconde, en `Z` ou
    /// avec décalage. `nil` pour tout le reste — une heure seule n'est pas une date.
    public static func date(from string: String) -> Date? {
        (try? fractionalStyle.parse(string)) ?? (try? wholeSecondsStyle.parse(string))
    }
}
