import Foundation
import MeeshySDK

/// La réhydratation multi-appareil de la reprise média (#7212, lot I3) — pour
/// l'audio ET la vidéo, qui ne diffèrent que par la PAIRE de champs servis.
///
/// Deux magasins existent déjà pour la lecture d'une pièce jointe :
///   - un magasin LOCAL (`AudioPlaybackPositionStore` / `VideoPlaybackPositionStore`
///     pour la reprise, `MediaConsumptionStore` pour la teinte), par APPAREIL ;
///   - une valeur SERVIE, `MeeshyMessageAttachment.currentUserConsumption`,
///     que la passerelle tient à jour depuis TOUS les appareils du compte
///     (`services/gateway/src/routes/conversations/messages-list-query.ts:551`
///     sert `lastPlayPositionMs` / `listenedComplete` / `lastWatchPositionMs` /
///     `watchedComplete` ; `AttachmentStatusReporter` y écrit depuis chacun).
///
/// Avant ce lot, les deux chaînes ne lisaient QUE le magasin local : un vocal
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
/// **Un seul site sait quelle PAIRE de champs appartient à quel médium.** Le
/// laisser aux appelants ferait diverger l'audio et la vidéo au premier
/// correctif qui n'en touche qu'un — c'est la forme du défaut que ce lot
/// corrige, un cran plus haut.
///
/// Building block PUR — building block SDK par la table de placement
/// (`packages/MeeshySDK/CLAUDE.md`) : aucun singleton nommé Meeshy lu ici,
/// aucune décision « quand semer » (ça reste app-side). L'appelant fournit les
/// primitives lues dans les magasins.
public enum MediaResumeResolver {

    /// Quelle paire de champs de `MeeshyMediaConsumption` décrit ce média.
    public enum Medium: String, Sendable, Equatable, CaseIterable {
        case audio
        case video
    }

    /// La position SERVIE (millisecondes) pour ce médium, `nil` si le serveur
    /// n'en porte aucune.
    nonisolated public static func servedPositionMs(
        _ consumption: MeeshyMediaConsumption?, medium: Medium
    ) -> Int? {
        switch medium {
        case .audio: return consumption?.lastPlayPositionMs
        case .video: return consumption?.lastWatchPositionMs
        }
    }

    /// La complétion SERVIE pour ce médium — `false` quand le serveur ne porte
    /// rien, ce qui est la même chose qu'un média jamais consommé.
    nonisolated public static func servedComplete(
        _ consumption: MeeshyMediaConsumption?, medium: Medium
    ) -> Bool {
        switch medium {
        case .audio: return consumption?.listenedComplete ?? false
        case .video: return consumption?.watchedComplete ?? false
        }
    }

    /// La fraction "au repos" (0...1) qui teinte la waveform (audio) / la barre
    /// de progression de la vignette (vidéo) AVANT que la lecture ne démarre.
    ///
    /// `localFraction` gagne dès qu'il est non-`nil` — y compris `0`, une
    /// valeur locale légitime (jamais consommé sur CET appareil), distincte de
    /// l'ABSENCE que seul `nil` porte. Le serveur ne comble que l'absence : la
    /// complétion vaut alors `1`, sinon la fraction se calcule depuis la
    /// position servie et `totalDuration`, bornée à `0...1`.
    nonisolated public static func restingFraction(
        localFraction: Double?,
        servedConsumption: MeeshyMediaConsumption?,
        medium: Medium,
        totalDuration: TimeInterval
    ) -> Double {
        if let local = localFraction { return max(0, min(1, local)) }
        if servedComplete(servedConsumption, medium: medium) { return 1 }
        guard let ms = servedPositionMs(servedConsumption, medium: medium),
              totalDuration > 0
        else { return 0 }
        return max(0, min(1, (Double(ms) / 1000.0) / totalDuration))
    }

    /// Le point de reprise (secondes), filtré par `isEligible` — la même
    /// zone-morte que les moteurs appliquent déjà
    /// (`AudioPlaybackManager.isResumable` / `SharedAVPlayerManager.isResumable`),
    /// passée en paramètre pour que ce type reste agnostique du moteur.
    ///
    /// `localPositionSeconds` gagne dès qu'il est non-`nil` : même si sa
    /// propre position tombe hors zone de reprise (`isEligible` renvoie
    /// `false`), on rend `nil` plutôt que de se replier sur le serveur — le
    /// local reste LA source. Le serveur ne comble que l'absence locale, et
    /// jamais quand la complétion est servie (un média terminé ailleurs n'offre
    /// pas de reprise, cohérent avec `restingFraction` qui vaut alors `1`).
    nonisolated public static func resumePosition(
        localPositionSeconds: TimeInterval?,
        servedConsumption: MeeshyMediaConsumption?,
        medium: Medium,
        totalDuration: TimeInterval,
        isEligible: (TimeInterval, TimeInterval) -> Bool
    ) -> TimeInterval? {
        if let local = localPositionSeconds {
            return isEligible(local, totalDuration) ? local : nil
        }
        guard servedComplete(servedConsumption, medium: medium) == false,
              let ms = servedPositionMs(servedConsumption, medium: medium)
        else { return nil }
        let seconds = TimeInterval(ms) / 1000.0
        return isEligible(seconds, totalDuration) ? seconds : nil
    }
}
