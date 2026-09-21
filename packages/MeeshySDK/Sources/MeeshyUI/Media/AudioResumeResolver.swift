import Foundation
import MeeshySDK

/// La réhydratation multi-appareil de la reprise média (#7212, lot I3).
///
/// Deux magasins existent déjà pour la lecture d'un attachment :
///   - un magasin LOCAL (`AudioPlaybackPositionStore` / `MediaConsumptionStore`,
///     `VideoPlaybackPositionStore` côté vidéo), persistant par APPAREIL ;
///   - une valeur SERVIE, `MeeshyMessageAttachment.currentUserConsumption`,
///     que la passerelle tient à jour depuis TOUS les appareils du compte
///     (`AttachmentStatusReporter` y écrit sur chacun).
///
/// Avant ce lot, `AudioPlayerView` ne lisait QUE le magasin local : un vocal
/// écouté à 80 % sur l'iPhone restait à 0 % sur un iPad qui ne l'avait jamais
/// ouvert, alors que le serveur portait déjà la bonne valeur.
///
/// La règle est une PRÉCÉDENCE, pas un maximum : le magasin local, quand il
/// porte une valeur — même une qui ne rend rien à l'affichage (ex. hors zone
/// de reprise) — garde la main ; le serveur ne comble que son ABSENCE. C'est
/// distinct du magasin d'AMORÇAGE (`ConversationViewModel+MediaConsumptionSeed`,
/// app-side, déjà sur `dev`), qui lui prend le MAXIMUM des deux à l'écriture :
/// au moment de la LECTURE on ne peut pas savoir si une valeur locale plus
/// petite que le serveur est en retard ou volontairement rembobinée par
/// l'utilisateur, donc on ne la compare pas.
///
/// Building block PUR — building block SDK par la table de placement
/// (`packages/MeeshySDK/CLAUDE.md`) : pas de singleton nommé Meeshy lu ici, pas
/// de décision "quand semer" (ça reste app-side). L'appelant fournit déjà les
/// primitives lues dans les magasins.
public enum AudioResumeResolver {
    /// La fraction "au repos" (0...1) qui teinte la waveform / la barre de
    /// progression AVANT que la lecture ne démarre.
    ///
    /// `localFraction` gagne dès qu'il est non-`nil` — y compris `0`, une
    /// valeur locale légitime (jamais écoutée sur CET appareil), distincte de
    /// l'ABSENCE que seul `nil` porte. Le serveur ne comble que l'absence :
    /// `listenedComplete` vaut alors `1`, sinon la fraction se calcule depuis
    /// `lastPlayPositionMs` / `totalDuration`, bornée à `0...1`.
    nonisolated public static func restingFraction(
        localFraction: Double?,
        serverConsumption: MeeshyMediaConsumption?,
        totalDuration: TimeInterval
    ) -> Double {
        if let local = localFraction { return max(0, min(1, local)) }
        guard let server = serverConsumption else { return 0 }
        if server.listenedComplete { return 1 }
        guard let ms = server.lastPlayPositionMs, totalDuration > 0 else { return 0 }
        return max(0, min(1, (Double(ms) / 1000.0) / totalDuration))
    }

    /// Le point de reprise (secondes), filtré par `isEligible` — la même
    /// zone-morte que le moteur de lecture applique déjà
    /// (`AudioPlaybackManager.isResumable` / `SharedAVPlayerManager.isResumable`),
    /// passée en paramètre pour que ce type reste agnostique du moteur.
    ///
    /// `localPositionSeconds` gagne dès qu'il est non-`nil` : même si sa
    /// propre position tombe hors zone de reprise (`isEligible` renvoie
    /// `false`), on rend `nil` plutôt que de se replier sur le serveur — le
    /// local reste LA source. Le serveur ne comble que l'absence locale, et
    /// jamais quand `listenedComplete` (un média terminé ailleurs n'offre pas
    /// de reprise, cohérent avec `restingFraction` qui vaut alors `1`).
    nonisolated public static func resumePosition(
        localPositionSeconds: TimeInterval?,
        serverConsumption: MeeshyMediaConsumption?,
        totalDuration: TimeInterval,
        isEligible: (TimeInterval, TimeInterval) -> Bool
    ) -> TimeInterval? {
        if let local = localPositionSeconds {
            return isEligible(local, totalDuration) ? local : nil
        }
        guard let server = serverConsumption, server.listenedComplete == false,
              let ms = server.lastPlayPositionMs
        else { return nil }
        let seconds = TimeInterval(ms) / 1000.0
        return isEligible(seconds, totalDuration) ? seconds : nil
    }
}
