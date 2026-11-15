import SwiftUI
import MeeshySDK

// MARK: - Horodatage relatif (ticker 60 s) partagé par les deux rangs

/// Enveloppe le libellé relatif dans une `TimelineView(.periodic)` : il se
/// redessine une fois par minute selon son propre calendrier, hors du portillon
/// `.equatable()` de la rangée (qui n'a délibérément AUCUNE composante
/// temporelle — sinon chaque rangée s'invaliderait à chaque tick). Sans lui,
/// l'horodatage gèlerait au libellé du montage (« 5 min »).
struct LiveRelativeTimestamp: View {
    let date: Date

    /// Le tick minute n'a de sens que tant que le libellé change à la minute
    /// (« 3 min », « 47 min ») : au-delà d'une heure, une rangée rend un texte
    /// STATIQUE, rafraîchi par le prochain passage de body de la liste.
    static let liveTickWindow: TimeInterval = 3600

    var body: some View {
        if Date().timeIntervalSince(date) > Self.liveTickWindow {
            Text(RelativeTimeFormatter.shortString(for: date))
        } else {
            TimelineView(.periodic(from: date, by: 60)) { _ in
                Text(RelativeTimeFormatter.shortString(for: date))
            }
        }
    }
}
