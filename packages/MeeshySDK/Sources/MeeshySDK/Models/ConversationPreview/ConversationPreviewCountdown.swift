import Foundation

/// **Quand la ligne d'un éphémère doit-elle se recomposer ?** (#7614)
///
/// Le libellé que rend `ConversationPreviewStrings.remaining` ne dépend, au-delà
/// de la dernière minute, que du nombre de minutes ENTAMÉES : il ne change qu'aux
/// frontières de minute avant l'échéance. Dans la dernière minute, le compte à la
/// seconde est rendu par le système (`Text(timerInterval:)`), et seule
/// l'échéance — la bascule en « Message expiré » — demande encore un réveil.
///
/// La ligne se réveille donc au plus une fois par minute, puis une dernière fois
/// à l'échéance — jamais chaque seconde.
public enum ConversationPreviewCountdown {

    /// En deçà, le décompte se lit à la seconde — le seuil du fil
    /// (`EphemeralDeadline.countdownThreshold`).
    public static let secondsThreshold = EphemeralDeadline.countdownThreshold

    /// Le prochain instant où la ligne change, ou `nil` quand l'échéance est
    /// passée : une ligne expirée ne se recompose plus.
    public static func nextChange(after now: Date, deadline: Date) -> Date? {
        let remaining = deadline.timeIntervalSince(now)
        guard remaining > 0 else { return nil }
        guard remaining > secondsThreshold else { return deadline }
        // La tolérance absorbe l'arithmétique flottante des `Date` : relu PILE à
        // une frontière, le reste peut valoir 240,000 000 03 s, et la frontière
        // suivante serait l'instant même — un réveil qui ne progresse plus.
        let startedMinutes = ((remaining - 0.001) / 60).rounded(.up)
        return deadline.addingTimeInterval(-(startedMinutes - 1) * 60)
    }

    /// Le décompte se lit-il à la seconde à cet instant ?
    public static func showsSeconds(at now: Date, deadline: Date) -> Bool {
        let remaining = deadline.timeIntervalSince(now)
        return remaining > 0 && remaining <= secondsThreshold
    }
}
