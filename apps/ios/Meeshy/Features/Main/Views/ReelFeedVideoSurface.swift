import SwiftUI
import MeeshySDK
import MeeshyUI

/// Joue un réel vidéo MUET en fond de carte tant qu'il est actif (le plus
/// centré dans le viewport du feed), via l'unique `SharedAVPlayerManager`.
///
/// Réutilise à l'identique le pattern de `ReelVideoView` (ReelsPlayerView.swift) :
/// même bridge `media.toMessageAttachment()` (le type `MeeshyMessageAttachment`
/// EST `MessageAttachment` — typealias), même `VideoAvailabilityResolver`, mêmes
/// atomes de rendu `ReelPoster` (poster sous-jacent) + `ReelVideoSurface`
/// (surface chrome-free). Aucun contrôleur exposé : la carte n'a ni play/pause
/// ni scrub (ils vivent dans le viewer plein écran). Affiché aspect-fill.
///
/// Différence avec le viewer : le son est forcé MUET (`isMuted = true`) — le feed
/// ne joue jamais d'audio ; le son démarre dans le viewer au tap.
struct ReelFeedVideoSurface: View {
    let media: FeedMedia
    let isActive: Bool

    @ObservedObject private var manager = SharedAVPlayerManager.shared

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }
    private var isShowingThis: Bool {
        manager.player != nil && manager.activeURL == attachment.fileUrl
    }

    var body: some View {
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, _ in
            content(ready: availability == .ready)
        }
    }

    @ViewBuilder
    private func content(ready: Bool) -> some View {
        ZStack {
            // Poster (thumbHash → thumbnail) reste visible sous la vidéo jusqu'à
            // la première frame, et seul affichage pour les cartes inactives.
            ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor).equatable()

            // Surface vidéo seulement quand cette carte est active, prête, et que
            // le moteur partagé joue bien CETTE url (sinon on montrerait la frame
            // d'un autre réel pendant un scroll rapide).
            if isActive, ready, isShowingThis, let player = manager.player {
                ReelVideoSurface(player: player)
            }
        }
        .clipped()
        .onAppear { drive(ready: ready) }
        .adaptiveOnChange(of: isActive) { _, _ in drive(ready: ready) }
        .adaptiveOnChange(of: ready) { _, _ in drive(ready: ready) }
        .onDisappear {
            // Pause (pas stop) quand cette carte possède encore le moteur : le
            // coordinator élira la prochaine carte centrée et rechargera son url.
            // `pause()` (vs `stop()`) garde le player + activeURL → reprise instant
            // si la même carte redevient centrée.
            if isShowingThis { manager.pause() }
        }
    }

    private func drive(ready: Bool) {
        // Défense en profondeur (C1) : ne jamais (re)lancer la lecture pendant un
        // appel VoIP — la session audio appartient à l'appel. Même si l'élection
        // n'a pas été vidée à temps, on ne joue pas. Pause si on tenait le moteur.
        guard isActive, ready, !MediaSessionCoordinator.shared.isCallActive else {
            // Plus actif (ou plus prêt, ou appel actif) mais on possède encore le
            // moteur → pause.
            if isShowingThis { manager.pause() }
            return
        }
        if manager.activeURL != attachment.fileUrl {
            manager.attachmentId = media.id
            manager.load(urlString: attachment.fileUrl)
        }
        // Mute + loop DOIVENT être (ré)affirmés APRÈS `load()` : `load()` appelle
        // `cleanup()` en interne, qui remet `shouldLoop = false` ; les poser avant
        // serait silencieusement écrasé. `isMuted` est une préférence globale de
        // session non remise à zéro par `cleanup()`, mais on la force ici pour
        // garantir le silence du feed même si le viewer l'avait démutée.
        manager.isMuted = true
        manager.shouldLoop = true
        manager.play()
    }
}
