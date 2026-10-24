import CoreGraphics
import Foundation

/// #11223 — décision porteur 2026-10-24 : **seul le DERNIER message arrivé s'anime**
/// à son entrée dans le fil. Loi pure, sans UIKit, jumelle du web
/// (`apps/web/src/lib/view/arrival-motion.ts`) : même énoncé, même fenêtre,
/// mêmes quatre causes.
///
/// Parmi les messages NOUVEAUX d'une pose de snapshot, seul le plus récent
/// reçoit l'animation d'arrivée, et seulement s'il arrive EN TEMPS RÉEL. Un lot
/// chargé d'un coup apparaît sans animation :
///
/// - `firstRender` — aucun message en commun avec la pose précédente : c'est
///   l'ouverture du fil, ou une fenêtre entièrement neuve, jamais une arrivée ;
/// - `pagination` — le plus récent des nouveaux n'est pas en tête du fil : une
///   page plus ancienne s'est ajoutée ;
/// - `catchUp` — le plus récent des nouveaux date de plus de `freshnessWindow`
///   (ou n'a pas de date) : la reconnexion rattrape ce qui a été dit pendant la
///   coupure ;
/// - `realtime` — tout le reste : un message du pair, ou mon propre envoi.
///
/// La cause se lit sur la POSE elle-même — le store ne dit pas d'où vient une
/// ligne, et le socket, la synchro de reprise et l'envoi local écrivent tous
/// dans la même fenêtre. Une horloge d'appareil en retard sur le serveur (date
/// future) reste du temps réel.
nonisolated enum MessageArrivalMotion {

    enum Cause: Equatable {
        case firstRender
        case realtime
        case pagination
        case catchUp
    }

    /// Au-delà, un message neuf est un rattrapage, pas une arrivée. Même valeur que le web.
    static let freshnessWindow: TimeInterval = 30

    /// Durée de l'entrée animée de la cellule.
    static let duration: TimeInterval = 0.32

    /// Distance (points) dont la cellule monte en entrant.
    static let rise: CGFloat = 12

    /// Échelle de départ de la cellule.
    static let startScale: CGFloat = 0.97

    /// Une arrivée armée ne se joue qu'à une cellule réalisée dans cette fenêtre :
    /// une cellule qui n'apparaît que plus tard (le lecteur était remonté dans
    /// l'historique, puis redescend) montre un message déjà arrivé, pas une arrivée.
    static let displayWindow: TimeInterval = 1

    /// `newestFirst` : l'ordre du fil renversé, comme `MessageListSnapshotPrep.messageItems`.
    static func cause<Key: Hashable>(
        previous: Set<Key>,
        newestFirst keys: [Key],
        createdAt: (Key) -> Date?,
        now: Date
    ) -> Cause? {
        guard let newestNew = keys.first(where: { !previous.contains($0) }) else { return nil }
        guard keys.contains(where: { previous.contains($0) }) else { return .firstRender }
        guard newestNew == keys.first else { return .pagination }
        guard let created = createdAt(newestNew),
              now.timeIntervalSince(created) <= freshnessWindow else { return .catchUp }
        return .realtime
    }

    /// La clé du SEUL message à animer, ou `nil`. Réduire les animations ⇒ toujours `nil`.
    static func animated<Key: Hashable>(
        previous: Set<Key>,
        newestFirst keys: [Key],
        createdAt: (Key) -> Date?,
        now: Date,
        reduceMotion: Bool
    ) -> Key? {
        guard !reduceMotion,
              let newest = keys.first,
              !previous.contains(newest),
              cause(previous: previous, newestFirst: keys, createdAt: createdAt, now: now) == .realtime
        else { return nil }
        return newest
    }

    static func playsOnDisplay(armedAt: Date, now: Date) -> Bool {
        now.timeIntervalSince(armedAt) <= displayWindow
    }
}
