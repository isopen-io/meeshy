import Foundation
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// La réhydratation multi-appareil de la progression média (#7212) — quand le
/// magasin LOCAL (`AudioPlaybackPositionStore` / `VideoPlaybackPositionStore` /
/// `MediaConsumptionStore`) n'a rien pour cette pièce jointe, la valeur SERVIE
/// (`currentUserConsumption`) comble l'absence. Le local, quand il porte
/// quelque chose — même une valeur qui ne rend rien à l'affichage (hors zone de
/// reprise) — garde la main : c'est une PRÉCÉDENCE sur l'OPTIONAL, jamais un
/// maximum entre deux valeurs.
///
/// Un vocal écouté à 80 % sur l'iPhone (jamais ouvert sur l'iPad) doit donc
/// reprendre à 80 % sur l'iPad dès l'ouverture, sans attendre qu'un amorçage
/// app-side (`ConversationViewModel+MediaConsumptionSeed`) ait écrit dans
/// `UserDefaults` — c'est la moitié LECTURE de la reprise multi-appareil.
struct MediaResumeResolverTests {

    // MARK: - restingFraction — la teinte "au repos" (waveform / barre)

    @Test func restingFraction_localPresent_localWins() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 60_000, listenedComplete: true)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: 0.42, servedConsumption: consumption, medium: .audio, totalDuration: 60)
        #expect(fraction == 0.42)
    }

    @Test func restingFraction_localZero_stillWinsOverServer() {
        // 0 est une fraction locale LÉGITIME (jamais écouté sur CET appareil
        // après un `clear`), pas une absence — elle doit gagner sur un serveur
        // qui, lui, a quelque chose.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: 0, servedConsumption: consumption, medium: .audio, totalDuration: 60)
        #expect(fraction == 0)
    }

    @Test func restingFraction_localAbsent_serverComplete_isOne() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: nil, listenedComplete: true)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .audio, totalDuration: 60)
        #expect(fraction == 1)
    }

    @Test func restingFraction_localAbsent_serverPartial_computesFractionFromDuration() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .audio, totalDuration: 60)
        #expect(fraction == 0.5)
    }

    @Test func restingFraction_localAbsent_serverPartial_clampsToOne() {
        // Position servie au-delà de la durée connue localement (métadonnées
        // divergentes entre appareils) : ne jamais dépasser 1.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 90_000, listenedComplete: false)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .audio, totalDuration: 60)
        #expect(fraction == 1)
    }

    @Test func restingFraction_localAbsent_serverAbsent_isZero() {
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: nil, medium: .audio, totalDuration: 60)
        #expect(fraction == 0)
    }

    @Test func restingFraction_localAbsent_serverPartialButNoDuration_isZero() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 30_000, listenedComplete: false)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .audio, totalDuration: 0)
        #expect(fraction == 0)
    }

    // MARK: - resumePosition — le point de reprise (secondes), filtré par éligibilité

    @Test func resumePosition_localPresent_localWinsEvenWhenNotEligible() {
        // Position locale existe mais tombe dans la zone morte (fin de piste) :
        // le local reste LA source — pas de repli serveur derrière lui.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 20_000, listenedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: 68.5, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localPresent_eligible_returnsLocal() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 5_000, listenedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: 30, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == 30)
    }

    @Test func resumePosition_localAbsent_serverEligible_returnsServerSeconds() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 45_000, listenedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == 45)
    }

    @Test func resumePosition_localAbsent_serverPositionNotEligible_returnsNil() {
        // 68.5s sur une piste de 69s : dans la zone morte de fin.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 68_500, listenedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverListenedComplete_returnsNil() {
        // Terminé ailleurs : rien à reprendre, cohérent avec restingFraction == 1.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 68_000, listenedComplete: true)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverAbsent_returnsNil() {
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: nil, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    @Test func resumePosition_localAbsent_serverPositionMissing_returnsNil() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: nil, listenedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .audio,
            totalDuration: 69, isEligible: AudioPlaybackManager.isResumable)
        #expect(position == nil)
    }

    // MARK: - Le MÉDIUM choisit la paire de champs
    //
    // Une consommation porte QUATRE champs : la paire audio
    // (`lastPlayPositionMs` / `listenedComplete`) et la paire vidéo
    // (`lastWatchPositionMs` / `watchedComplete`). Un résolveur qui ne lirait
    // que la première rendrait 0 sur TOUTE vidéo — et le témoin ne peut pas le
    // voir tant que les deux paires portent la même valeur : chaque cas
    // ci-dessous remplit donc la paire de l'AUTRE médium avec une valeur
    // CONTRADICTOIRE.

    @Test func servedPositionMs_readsThePairOfTheMedium() {
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: 10_000, listenedComplete: false,
            lastWatchPositionMs: 40_000, watchedComplete: false)
        #expect(MediaResumeResolver.servedPositionMs(consumption, medium: .audio) == 10_000)
        #expect(MediaResumeResolver.servedPositionMs(consumption, medium: .video) == 40_000)
        #expect(MediaResumeResolver.servedPositionMs(nil, medium: .video) == nil)
    }

    @Test func servedComplete_readsThePairOfTheMedium() {
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: nil, listenedComplete: true,
            lastWatchPositionMs: nil, watchedComplete: false)
        #expect(MediaResumeResolver.servedComplete(consumption, medium: .audio) == true)
        #expect(MediaResumeResolver.servedComplete(consumption, medium: .video) == false)
        #expect(MediaResumeResolver.servedComplete(nil, medium: .audio) == false)
    }

    @Test func restingFraction_video_readsTheWatchPair() {
        // La paire AUDIO dit « rien », la paire VIDÉO dit 30s sur 60 : une
        // vidéo regardée à moitié ailleurs teinte sa barre à moitié ici.
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: nil, listenedComplete: false,
            lastWatchPositionMs: 30_000, watchedComplete: false)
        let fraction = MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .video, totalDuration: 60)
        #expect(fraction == 0.5)
        // Le même objet lu comme de l'AUDIO ne porte rien.
        #expect(MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .audio,
            totalDuration: 60) == 0)
    }

    @Test func restingFraction_video_watchedCompleteIsOne() {
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: nil, listenedComplete: false,
            lastWatchPositionMs: nil, watchedComplete: true)
        #expect(MediaResumeResolver.restingFraction(
            localFraction: nil, servedConsumption: consumption, medium: .video,
            totalDuration: 60) == 1)
    }

    @Test func resumePosition_video_localAbsent_returnsServedWatchPosition() {
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: 5_000, listenedComplete: false,
            lastWatchPositionMs: 45_000, watchedComplete: false)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .video,
            totalDuration: 69, isEligible: SharedAVPlayerManager.isResumable)
        #expect(position == 45)
    }

    @Test func resumePosition_video_watchedComplete_returnsNil() {
        let consumption = MeeshyMediaConsumption(
            lastPlayPositionMs: nil, listenedComplete: false,
            lastWatchPositionMs: 40_000, watchedComplete: true)
        let position = MediaResumeResolver.resumePosition(
            localPositionSeconds: nil, servedConsumption: consumption, medium: .video,
            totalDuration: 69, isEligible: SharedAVPlayerManager.isResumable)
        #expect(position == nil)
    }

    // MARK: - La consommation servie voyage AVEC l'identifiant qu'elle qualifie
    // Site UNIQUE, partagé par les DEUX moteurs (audio et vidéo) depuis #7212 :
    // la vidéo gardait un champ NU, que le premier `attachmentId` posé de
    // l'extérieur aurait orphelinisé.

    @Test func servedConsumption_matchingId_isReturned() {
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 45_000, listenedComplete: false)
        let held: (attachmentId: String, value: MeeshyMediaConsumption?)? = ("att-1", consumption)
        #expect(MediaResumeResolver.heldConsumption(held, matching: "att-1") == consumption)
    }

    @Test func servedConsumption_otherId_isIgnored() {
        // Le moteur PARTAGÉ a changé de piste depuis que la bulle l'a nourri :
        // servir cette consommation ferait reprendre un vocal à la position
        // d'un AUTRE.
        let consumption = MeeshyMediaConsumption(lastPlayPositionMs: 45_000, listenedComplete: false)
        let held: (attachmentId: String, value: MeeshyMediaConsumption?)? = ("att-1", consumption)
        #expect(MediaResumeResolver.heldConsumption(held, matching: "att-2") == nil)
        #expect(MediaResumeResolver.heldConsumption(nil, matching: "att-1") == nil)
    }
}
