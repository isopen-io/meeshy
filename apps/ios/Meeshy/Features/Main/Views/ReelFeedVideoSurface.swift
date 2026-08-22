import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// Pure decision: should this card relinquish the shared engine right now?
/// Extracted so the exact guard used by BOTH `onDisappear` and the inactive
/// branch of `drive()` is a single, unit-testable source of truth — the two
/// call sites previously duplicated this condition inline and drifted apart
/// (`onDisappear` never reset `ownsEngine` back to `false`, unlike `drive()`'s
/// branch), which could leave a stale `ownsEngine == true` on a card's
/// persisted `@State` after an abrupt teardown and reintroduce the repost/
/// active-card pause bug this flag exists to prevent.
nonisolated enum ReelEngineOwnershipPolicy {
    static func shouldRelease(ownsEngine: Bool, isShowingThis: Bool) -> Bool {
        ownsEngine && isShowingThis
    }
}

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
/// Différence avec le viewer : le son suit l'intention de SESSION du fil
/// (`ReelFeedSoundIntent`, S2 — bouton de son du fil, exigence produit
/// 2026-08-22), jamais `isMuted` (préférence globale, cf. commentaire dans
/// `drive`) — muet par défaut, activable par carte via le bouton de son.
struct ReelFeedVideoSurface: View {
    let media: FeedMedia
    let isActive: Bool

    /// Reporté au parent (D3, S2) : `true` quand CETTE instance possède
    /// RÉELLEMENT le moteur partagé et qu'il joue bien SA vidéo
    /// (`ownsEngine && isShowingThis`). Le parent (`ReelFeedCard`/
    /// `ReelRepostEmbedCell`) en a besoin pour décider de monter son bouton de
    /// son — `isActive` seul peut être vrai UNE frame avant que `drive()`
    /// n'ait chargé quoi que ce soit (média en téléchargement, appel en
    /// cours) : monter le bouton sur cette frame serait exactement le défaut
    /// « bouton monté, tap ne pilote rien » rejeté deux fois par la revue DoD
    /// du lot E (`MuteButtonExistenceGuardTests`).
    var isEngineOwned: Binding<Bool> = .constant(false)

    // Plain reference (NOT @ObservedObject): this card only needs `player`
    // identity and `activeURL` to decide what to render — the manager also
    // publishes `currentTime` at 5-10Hz (thermal-aware heartbeat), which used
    // to re-render EVERY feed card continuously since `@ObservedObject`
    // subscribes to `objectWillChange` regardless of which field the view
    // actually reads. Scoped via `onReceive($activeURL/$player)` instead.
    private let manager = SharedAVPlayerManager.shared
    @State private var activeURL: String = SharedAVPlayerManager.shared.activeURL
    @State private var player: AVPlayer?

    /// Miroir local de l'intention de son du fil (même discipline que
    /// `activeURL`/`player` ci-dessus : @State scopé + `.onReceive`, jamais
    /// `@ObservedObject` sur un singleton global dans une feuille de liste).
    @State private var soundOn: Bool = ReelFeedSoundIntent.shared.isSoundOn

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
        .onReceive(ReelFeedSoundIntent.shared.$isSoundOn) { soundOn = $0 }
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
        // Le tap sur le bouton de son (S2) flippe `ReelFeedSoundIntent.shared
        // .isSoundOn` — sans cette bascule, la prochaine passe de `drive()`
        // (carte suivante, ou simple re-render sur CETTE carte) réaffirmerait
        // l'ancienne valeur et le son mourrait dans la seconde (D4).
        .adaptiveOnChange(of: soundOn) { _, _ in drive(ready: ready) }
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
            //
            // Reset `ownsEngine = false` ici aussi (comme la branche guard de
            // `drive()` ci-dessous) : sans ça, une disparition abrupte (fling
            // rapide, avant que `isActive` ne retombe via `.adaptiveOnChange`)
            // laissait `ownsEngine == true` figé sur le `@State` persisté de la
            // carte — un remount ultérieur inactif redéclenchait alors ce même
            // garde par erreur dès qu'une AUTRE carte active partage l'URL.
            if ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: ownsEngine, isShowingThis: isShowingThis) {
                manager.pause()
                releaseForceMute()
                updateEngineOwnership(false)
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
            if ReelEngineOwnershipPolicy.shouldRelease(ownsEngine: ownsEngine, isShowingThis: isShowingThis) {
                manager.pause()
                releaseForceMute()
                updateEngineOwnership(false)
            }
            return
        }
        if manager.activeURL != attachment.fileUrl {
            manager.load(urlString: attachment.fileUrl, attachmentId: media.id)
        }
        updateEngineOwnership(true)
        // Loop DOIT être (ré)affirmé APRÈS `load()` : `load()` appelle `cleanup()`
        // en interne, qui remet `shouldLoop = false` ; le poser avant serait
        // silencieusement écrasé. `isForceMuted` (idem transitoire, reset par
        // `cleanup()`) est réaffirmé pour la même raison.
        //
        // Résolu via le prédicat pur (S2, D4) — jamais un littéral figé :
        // `isForceMuted` exprime l'intention de SESSION du fil
        // (`ReelFeedSoundIntent`), PAS `isMuted` (préférence utilisateur
        // GLOBALE du bouton mute fullscreen, persistée entre vidéos). Y écrire
        // directement depuis le feed fuiterait cette préférence vers la
        // surface suivante (la galerie de conversation hériterait d'un
        // `isMuted = true` jamais remis à zéro et jouerait en silence sans que
        // l'utilisateur n'ait rien demandé) — exactement la fuite documentée
        // que `isForceMuted` a été créé pour fermer.
        let forceMuted = ReelFeedSoundButtonPolicy.isForceMuted(soundOn: soundOn)
        if !forceMuted {
            // D5 : `play()` saute délibérément l'armement de la session
            // `.duckOthers` pour l'autoplay muet (`shouldDuckOthersOnPlay`) —
            // sans ce rappel explicite au passage au son, la catégorie reste
            // `.soloAmbient` et le son est inaudible interrupteur Silence
            // enclenché (précédent documenté : RecentMediaStrip.swift).
            MediaSessionCoordinator.shared.activatePlaybackSync(options: [.duckOthers])
        }
        manager.isForceMuted = forceMuted
        manager.shouldLoop = true
        manager.play()
        probeAudioTrackIfNeeded()
    }

    /// Relâche l'intention de mute forcé du feed. Appelé chaque fois que cette
    /// carte cesse de posséder le moteur (perte d'activité ou disparition) —
    /// jamais laissé traîner au-delà de la durée de vie de la carte active.
    private func releaseForceMute() {
        manager.isForceMuted = false
    }

    /// Écrit `ownsEngine` ET répercute la combinaison `ownsEngine &&
    /// isShowingThis` vers le parent (`isEngineOwned`, S2/D3) en UN seul
    /// point — les deux valeurs ne doivent jamais diverger. Appelé APRÈS
    /// `manager.load()` : à ce stade `self.player`/`self.activeURL` (les
    /// miroirs @State) reflètent déjà la nouvelle vidéo, `@Published` livrant
    /// ses abonnés `.onReceive` de façon synchrone pendant l'affectation —
    /// `isShowingThis`, calculé ici, est donc exact.
    private func updateEngineOwnership(_ owns: Bool) {
        ownsEngine = owns
        isEngineOwned.wrappedValue = owns && isShowingThis
    }

    /// Sonde la présence d'une piste audio sur LE MOTEUR RÉELLEMENT chargé
    /// (`manager.player?.currentItem?.asset`, pas une réémission d'URL) —
    /// c'est exactement l'asset en train de jouer, aucune ambiguïté possible.
    /// Ne sonde qu'une fois par média (`ReelFeedSoundIntent.isProbed`) : un
    /// résultat déjà résolu n'est jamais réécrit (même contrat que le viewer
    /// story, `StoryAudioAvailability.merging`). Sonde SEULEMENT quand cette
    /// carte possède réellement le moteur (appelé depuis la branche active de
    /// `drive()`) — jamais sur une carte inactive.
    private func probeAudioTrackIfNeeded() {
        let mediaId = media.id
        guard !ReelFeedSoundIntent.shared.isProbed(mediaId: mediaId) else { return }
        guard let asset = manager.player?.currentItem?.asset else { return }
        Task {
            let count: Int?
            do {
                count = try await asset.loadTracks(withMediaType: .audio).count
            } catch {
                count = nil
            }
            await MainActor.run {
                ReelFeedSoundIntent.shared.recordAudioProbe(mediaId: mediaId, probedTrackCount: count)
            }
        }
    }
}
