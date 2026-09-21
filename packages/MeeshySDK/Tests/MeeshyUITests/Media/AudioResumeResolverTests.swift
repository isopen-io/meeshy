import Foundation
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// La réhydratation multi-appareil de la progression média (#7212) — quand le
/// magasin LOCAL (`AudioPlaybackPositionStore` / `MediaConsumptionStore`) n'a
/// rien pour cette pièce jointe, la valeur SERVIE
/// (`currentUserConsumption.lastPlayPositionMs` / `.listenedComplete`) comble
/// l'absence. Le local, quand il porte quelque chose — même une valeur qui ne
/// rend rien à l'affichage (hors zone de reprise) — garde la main : c'est une
/// PRÉCÉDENCE sur l'OPTIONAL, jamais un maximum entre deux valeurs.
///
/// Un vocal écouté à 80 % sur l'iPhone (jamais ouvert sur l'iPad) doit donc
/// reprendre à 80 % sur l'iPad dès l'ouverture, sans attendre qu'un amorçage
/// app-side (`ConversationViewModel+MediaConsumptionSeed`) ait écrit dans
/// `UserDefaults` — c'est la moitié LECTURE de la reprise multi-appareil.
struct AudioResumeResolverTests {

    // MARK: - restingFraction — la teinte "au repos" (waveform / barre)

    @Test func restingFraction_localPresent_localWins() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 60_000, listenedComplete: true)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: 0.42, serverConsumption: consumption, totalDuration: 60)
        #expect(fraction == 0.42)
    }

    @Test func restingFraction_localZero_stillWinsOverServer() {
        // 0 est une fraction locale LÉGITIME (jamais écouté sur CET appareil
        // après un `clear`), pas une absence — elle doit gagner sur un serveur
        // qui, lui, a quelque chose.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: 0, serverConsumption: consumption, totalDuration: 60)
        #expect(fraction == 0)
    }

    @Test func restingFraction_localAbsent_serverComplete_isOne() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: nil, listenedComplete: true)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: nil, serverConsumption: consumption, totalDuration: 60)
        #expect(fraction == 1)
    }

    @Test func restingFraction_localAbsent_serverPartial_computesFractionFromDuration() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: nil, serverConsumption: consumption, totalDuration: 60)
        #expect(fraction == 0.5)
    }

    @Test func restingFraction_localAbsent_serverPartial_clampsToOne() {
        // Position servie au-delà de la durée connue localement (métadonnées
        // divergentes entre appareils) : ne jamais dépasser 1.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 90_000, listenedComplete: false)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: nil, serverConsumption: consumption, totalDuration: 60)
        #expect(fraction == 1)
    }

    @Test func restingFraction_localAbsent_serverAbsent_isZero() {
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: nil, serverConsumption: nil, totalDuration: 60)
        #expect(fraction == 0)
    }

    @Test func restingFraction_localAbsent_serverPartialButNoDuration_isZero() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = AudioResumeResolver.restingFraction(
            localFraction: nil, serverConsumption: consumption, totalDuration: 0)
        #expect(fraction == 0)
    }

    // MARK: - resumePosition — le point de reprise (secondes), filtré par éligibilité

    @Test func resumePosition_localPresent_localWinsEvenWhenNotEligible() {
        // Position locale existe mais tombe dans la zone morte (fin de piste) :
        // le local reste LA source — pas de repli serveur derrière lui.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 20_000, listenedComplete: false)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: 68.5, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localPresent_eligible_returnsLocal() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 5_000, listenedComplete: false)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: 30, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == 30)
    }

    @Test func resumePosition_localAbsent_serverEligible_returnsServerSeconds() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 45_000, listenedComplete: false)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: nil, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == 45)
    }

    @Test func resumePosition_localAbsent_serverPositionNotEligible_returnsNil() {
        // 68.5s sur une piste de 69s : dans la zone morte de fin.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 68_500, listenedComplete: false)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: nil, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverListenedComplete_returnsNil() {
        // Terminé ailleurs : rien à reprendre, cohérent avec restingFraction == 1.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 68_000, listenedComplete: true)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: nil, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverAbsent_returnsNil() {
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: nil, serverConsumption: nil, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverPositionMissing_returnsNil() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: nil, listenedComplete: false)
        let position = AudioResumeResolver.resumePosition(
            localPositionSeconds: nil, serverConsumption: consumption, totalDuration: 69,
            isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }
}
