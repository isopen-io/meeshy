import SwiftUI
import AVFoundation
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
/// Différence avec le viewer : le son est forcé MUET (`isForceMuted = true`,
/// PAS `isMuted` — cf. commentaire dans `drive`) — le feed ne joue jamais
/// d'audio ; le son démarre dans le viewer au tap.
struct ReelFeedVideoSurface: View {
    let media: FeedMedia
    let isActive: Bool

    // Plain reference (NOT @ObservedObject): this card only needs `player`
    // identity and `activeURL` to decide what to render — the manager also
    // publishes `currentTime` at 5-10Hz (thermal-aware heartbeat), which used
    // to re-render EVERY feed card continuously since `@ObservedObject`
    // subscribes to `objectWillChange` regardless of which field the view
    // actually reads. Scoped via `onReceive($activeURL/$player)` instead.
    private let manager = SharedAVPlayerManager.shared
    @State private var activeURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var player: AVPlayer?

    /// `true` once THIS card instance has actually driven the shared engine
    /// (called `load()`/`play()` while active) and not yet relinquished it.
    /// Distinct from `isShowingThis` (a bare URL match): a REPOST shows the
    /// same underlying video as its original, so a second, INACTIVE card
    /// rendering that repost also matches `isShowingThis` whenever the
    /// original's card is the one actually playing — without this flag, that
    /// inactive card's own `onDisappear` (or a re-render pass) would pause the
    /// genuinely active card purely because the URLs happen to coincide.
    @State private var ownsEngine = false

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }
    private var isShowingThis: Bool {
        player != nil && activeURL == attachment.fileUrl
    }

    var body: some View {
        VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, _ in
            content(ready: availability == .ready)
        }
        .onReceive(manager.$activeURL) { activeURL = $0 }
        .onReceive(manager.$player) { player = $0 }
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
            if isActive, ready, isShowingThis, let player {
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
            //
            // Gated on `ownsEngine`, PAS seulement `isShowingThis` : un simple match
            // d'URL matche aussi une carte de REPOST inactive pointant vers la même
            // vidéo que l'original actuellement actif — sans ce garde, la carte
            // repost inactive qui disparaît (recyclage de liste) mettait en pause
            // la carte active, figeant sa lecture.
            if ownsEngine, isShowingThis {
                manager.pause()
                releaseForceMute()
            }
        }
    }

    private func drive(ready: Bool) {
        // Défense en profondeur (C1) : ne jamais (re)lancer la lecture pendant un
        // appel VoIP — la session audio appartient à l'appel. Même si l'élection
        // n'a pas été vidée à temps, on ne joue pas. Pause si on tenait le moteur.
        guard isActive, ready, !MediaSessionCoordinator.shared.isCallActive else {
            // Plus actif (ou plus prêt, ou appel actif) mais on possède encore le
            // moteur → pause + relâche l'intention de mute (la prochaine surface à
            // prendre le moteur — viewer, galerie — doit repartir de la préférence
            // utilisateur réelle, pas hériter du silence forcé du feed). Gated on
            // `ownsEngine` pour la même raison que `onDisappear` ci-dessus.
            if ownsEngine, isShowingThis {
                manager.pause()
                releaseForceMute()
                ownsEngine = false
            }
            return
        }
        if manager.activeURL != attachment.fileUrl {
            manager.load(urlString: attachment.fileUrl, attachmentId: media.id)
        }
        ownsEngine = true
        // Loop DOIT être (ré)affirmé APRÈS `load()` : `load()` appelle `cleanup()`
        // en interne, qui remet `shouldLoop = false` ; le poser avant serait
        // silencieusement écrasé. `isForceMuted` (idem transitoire, reset par
        // `cleanup()`) est réaffirmé pour la même raison.
        //
        // Intentionnellement `isForceMuted`, PAS `isMuted` : `isMuted` est la
        // préférence utilisateur GLOBALE (bouton mute du fullscreen overlay),
        // persistée entre vidéos. Y écrire directement depuis l'autoplay muet
        // du feed fuitait cette préférence vers la surface suivante (la galerie
        // de conversation héritait d'un `isMuted = true` jamais remis à zéro et
        // jouait en silence sans que l'utilisateur n'ait rien demandé).
        // `isForceMuted` exprime la même intention sans polluer la préférence.
        manager.isForceMuted = true
        manager.shouldLoop = true
        manager.play()
    }

    /// Relâche l'intention de mute forcé du feed. Appelé chaque fois que cette
    /// carte cesse de posséder le moteur (perte d'activité ou disparition) —
    /// jamais laissé traîner au-delà de la durée de vie de la carte active.
    private func releaseForceMute() {
        manager.isForceMuted = false
    }
}
