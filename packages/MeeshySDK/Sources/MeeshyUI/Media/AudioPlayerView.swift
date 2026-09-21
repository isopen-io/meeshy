import SwiftUI
import AVFoundation
import Combine
import os
import UIKit
import MeeshySDK

// MARK: - Audio Player View

extension AudioPlayerView {
    /// Pure helper testable : retourne la taille formatée (« 850 KB ») ou ""
    /// quand `fileSize` est 0 (inconnu).
    nonisolated public static func formattedNeedsDownloadLabel(fileSize: Int) -> String {
        guard fileSize > 0 else { return "" }
        return AudioPlayerView.formatBytes(Int64(fileSize))
    }

    /// Pure helper testable : retourne « 398 KB / 850 KB » ou un fallback
    /// quand un des deux côtés est inconnu.
    nonisolated public static func formattedDownloadingLabel(
        downloadedBytes: Int64,
        totalBytes: Int64,
        fallbackFileSize: Int
    ) -> String {
        let total: Int64 = totalBytes > 0 ? totalBytes : Int64(fallbackFileSize)
        if total <= 0 && downloadedBytes <= 0 { return "" }
        let left = AudioPlayerView.formatBytes(downloadedBytes)
        let right = total > 0 ? AudioPlayerView.formatBytes(total) : "?"
        return "\(left) / \(right)"
    }

    /// Delegates to the single SDK-wide `formatMediaFileSize` helper so the
    /// audio play-button label, the download badges (image/video) and the
    /// upload progress bar always render the exact same string for the same
    /// byte count. Previously this used its own binary (1024-based)
    /// `ByteCountFormatter` while the app's `AttachmentDownloader.fmt` used a
    /// decimal (1000-based) one — despite a comment claiming they matched.
    nonisolated public static func formatBytes(_ bytes: Int64) -> String {
        formatMediaFileSize(bytes)
    }
}

/// The progress an audio bubble renders, resolved once and shared by the
/// waveform tint, the percentage chip and the elapsed timecode.
/// `isLive` distinguishes a playing engine (full accent) from a persisted
/// at-rest position (attenuated accent).
nonisolated public struct AudioProgressDisplay: Sendable, Equatable {
    public let fraction: Double
    public let elapsed: TimeInterval
    public let isLive: Bool

    public init(fraction: Double, elapsed: TimeInterval, isLive: Bool) {
        self.fraction = fraction
        self.elapsed = elapsed
        self.isLive = isLive
    }
}

public struct AudioPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext

    /// Tenue de rendu — voir `AudioPlayerChrome`. `.card` = rendu historique,
    /// aucun site d'appel existant ne change.
    public var chrome: AudioPlayerChrome = .card

    public var accentColor: String = MeeshyColors.brandPrimaryHex
    public var transcription: MessageTranscription? = nil
    public var translatedAudios: [MessageTranslatedAudio] = []
    /// Prisme Linguistique: the language code the transcription STRIP should
    /// default to, resolved by the caller (app) the same way
    /// `preferredTranslation` resolves text — `nil` (default, unchanged for
    /// every existing call site) means "show the original". The SDK stays
    /// agnostic of the resolution rule itself (systemLanguage > regional >
    /// custom > deviceLocale); it only renders whichever code it is handed.
    /// Prisme audio-follow (2026-08-09) — this now ALSO seeds playback: a
    /// non-nil/non-"orig" value marks `hasExplicitAudioLanguage = true` in
    /// `init`, so the matching translated audio track (if one exists) plays
    /// automatically, exactly like the transcription strip. See
    /// `hasExplicitAudioLanguage`'s doc for the full contract.
    public var initialTranscriptionLanguage: String? = nil

    /// D-AUDIO-03 — réserve la hauteur du bloc de transcription (shimmer)
    /// même quand `isTranscribing` (l'état "Transcrire" tapé localement)
    /// est `false`, pour couvrir la fenêtre PASSIVE entre la réception d'un
    /// audio et l'arrivée de sa transcription serveur. Calculée par
    /// l'appelant (`AudioTranscriptionPending.shouldReserveHeight`, app-side
    /// via `AudioBubbleRouter`) à partir de ce qu'il connaît déjà — la date
    /// de la pièce jointe et la présence d'une transcription — jamais lue
    /// depuis `Date()` ici (Zero Unnecessary Re-render). Défaut `false` :
    /// tout site d'appel existant qui ne le passe pas garde le comportement
    /// d'avant (aucune réservation hors `isTranscribing`).
    public var reserveTranscriptionHeight: Bool = false

    /// Opt-out d'AFFICHAGE (#4956) : quand `false`, une transcription déjà
    /// disponible n'est pas montrée automatiquement — la bulle rend le même
    /// CTA « Transcrire » que l'absence de transcription, et un tap RÉVÈLE le
    /// texte déjà là (aucun appel réseau, `onRequestTranscription` n'est pas
    /// invoqué). Paramètre OPAQUE : le SDK ne sait pas que ce booléen vient
    /// d'une préférence nommée `autoTranscribeIncoming` ni de la règle
    /// "toujours vrai pour mes propres messages" — c'est `AudioBubbleRouter`
    /// (app) qui la résout et transmet le résultat (SDK Purity). Défaut
    /// `true` : tout site d'appel existant garde le comportement d'avant
    /// (affichage dès que `displaySegments` n'est pas vide).
    public var autoRevealTranscription: Bool = true

    public var onFullscreen: (() -> Void)? = nil
    public var onRequestTranscription: (() -> Void)? = nil
    public var onRetranscribe: (() -> Void)? = nil
    public var onDelete: (() -> Void)? = nil
    public var onEdit: (() -> Void)? = nil
    public var onPlayingChange: ((Bool) -> Void)? = nil
    /// Optional play-tap router for callers that own the playback engine and
    /// the audio queue (e.g. a `ConversationAudioCoordinator`). When provided,
    /// taps on the play button delegate to this closure as long as the
    /// underlying engine isn't already loaded with THIS attachment — i.e. as
    /// long as starting playback for this bubble requires the parent to set
    /// up the queue / active-context first. Once the engine is loaded
    /// (`player.attachmentId == attachment.id`), play/pause routes through
    /// the engine directly so subsequent toggles are instantaneous and don't
    /// rebuild the queue. Backward-compat: when nil, behavior is unchanged.
    private var onPlayRequest: (() -> Void)? = nil
    private var externalLanguage: Binding<String?>?
    private var topSlot: AnyView?
    private var bottomSlot: AnyView?
    private var availability: AudioAvailability
    private var onDownload: (() -> Void)?

    // Owned-by-default engine. Created once per view lifetime via
    // `@StateObject`. When the caller injects an `externalPlayer`, this
    // owned instance stays inert (no audio session, never asked to play).
    // We opt it out of `PlaybackCoordinator` registration in that case
    // to keep the registry clean — see `AudioPlaybackManager.init(registerWithCoordinator:)`.
    @StateObject private var ownedPlayer: AudioPlaybackManager
    @StateObject private var waveformAnalyzer = AudioWaveformAnalyzer()
    // External engine, when provided by a parent coordinator. Wrapping it
    // in `@ObservedObject` is required so SwiftUI re-renders the body on
    // `@Published` changes coming from the externally-owned engine.
    // When `externalPlayer == nil`, this wraps a shared no-op singleton
    // (`AudioPlayerView.sharedNoopExternal`) — its mutations are never
    // observed because the computed `player` falls back to `ownedPlayer`,
    // and the static identity avoids per-init churn.
    @ObservedObject private var observedExternalPlayer: AudioPlaybackManager
    // Internal (not `private`) so `@testable import` can observe the
    // resolution decision from MeeshyUITests without exposing it publicly.
    internal let usesExternalPlayer: Bool

    /// Engine actually driving playback / observed by the body. Resolves to
    /// `observedExternalPlayer` when an external engine was injected, else
    /// to `ownedPlayer`. Both are observed via property wrappers, so any
    /// `@Published` mutation on the resolved engine re-renders the view.
    /// Internal (not `private`) — read from `AudioPlayerView+Transcription.swift`
    /// (karaoké seek / active-segment resolution), a sibling extension file.
    var player: AudioPlaybackManager {
        usesExternalPlayer ? observedExternalPlayer : ownedPlayer
    }

    /// Shared no-op engine used as the `observedExternalPlayer` placeholder
    /// whenever the caller did not inject an external engine. It is never
    /// asked to play and is intentionally NOT registered with
    /// `PlaybackCoordinator`. Using a single shared identity avoids
    /// allocating one throwaway `AudioPlaybackManager` per view init.
    @MainActor
    private static let sharedNoopExternal = AudioPlaybackManager(registerWithCoordinator: false)

    // Leaf view rendered once per audio bubble — observing the ThemeManager
    // singleton via @ObservedObject here would invalidate EVERY audio bubble
    // on screen on every theme publish (Zero Unnecessary Re-render,
    // CLAUDE.md). `colorScheme` is the blessed leaf-view alternative for a
    // simple dark/light read; ThemeManager.mode itself is kept in sync with
    // it (see `ThemeManager.syncWithSystem`).
    @Environment(\.colorScheme) private var colorScheme
    // Internal (not `private`) — `transcriptionShimmer` (moved to
    // AudioPlayerView+Transcription.swift) reads both for Reduce Motion.
    @Environment(\.accessibilityReduceMotion) internal var systemReduce
    @Environment(\.meeshyForceReduceMotion) internal var userForced
    /// Seeded from `initialTranscriptionLanguage` in `init` (Prisme default),
    /// then owned by user interaction (language pill taps, `externalLanguage`)
    /// exactly like before. Internal (not `private`) so `@testable import`
    /// can observe the seeding decision from MeeshyUITests without exposing
    /// it publicly — same pattern as `usesExternalPlayer` above.
    @State internal var selectedAudioLanguage: String
    /// Prisme audio-follow (2026-08-09) — `selectedAudioLanguage` doubles as
    /// the Prisme-seeded transcription-STRIP default AND the playback
    /// language: this flag says whether `selectedAudioLanguage` should steer
    /// which audio track plays. Seeded in `init` to `true` when Prisme
    /// already resolved a real translation (`initialTranscriptionLanguage !=
    /// nil`/`!= "orig"`) — reversing the prior "B9 fix" policy that kept
    /// transcription-strip language and playback language independent by
    /// design. Also flips to `true` inside `switchToLanguage` on an explicit
    /// language-pill tap or `externalLanguage` binding change (idempotent —
    /// already `true` in that case). Consulted by `resolvePlaybackUrl` so
    /// `currentAudioUrl` only ever falls back to the original when NEITHER
    /// Prisme nor the user resolved a translated language. Internal for the
    /// same testability reason as `selectedAudioLanguage`.
    @State internal var hasExplicitAudioLanguage: Bool
    /// Internal (not `private`) — `retranscribeButton`, moved to
    /// AudioPlayerView+Transcription.swift, reads/writes it.
    @State internal var isRetranscribing = false
    /// `true` between the moment the user taps "Transcrire" / "Re-transcrire"
    /// and the moment the server-pushed transcription lands in `transcription`.
    /// Drives the shimmer skeleton in `transcriptionBlock` — internal (not
    /// `private`) because that computed property now lives in the sibling
    /// extension file AudioPlayerView+Transcription.swift.
    @State internal var isTranscribing = false
    /// Tenue CARTE seule : la transcription longue est-elle dépliée ? Le
    /// chevron la bascule sur place, la bulle ayant la place de s'étendre.
    /// Internal — read by `body` (`.animation(value:)`) here AND by
    /// `transcriptionBlock`/`expandToggleButton` in the extension file.
    @State internal var isTranscriptionExpanded = false
    /// Opt-out d'affichage (#4956) : posé par un tap sur le CTA « Transcrire »
    /// rendu quand `autoRevealTranscription == false` alors qu'une
    /// transcription existe déjà. Ne déclenche aucune requête réseau — la
    /// transcription est déjà là, ce tap ne fait que la révéler pour le
    /// reste de la vie de cette vue. Internal — lu et posé par
    /// `transcriptionBlock` (AudioPlayerView+Transcription.swift).
    @State internal var hasManuallyRevealedTranscription = false
    /// Toggled in `onAppear` of the skeleton view to drive the pulse.
    /// Internal — `transcriptionShimmer` (extension file) owns it.
    @State internal var transcriptionPulsePhase = false
    /// `true` pendant le drag de scrub sur la waveform. Publié via
    /// `MediaScrubbingPreferenceKey` pour que l'hôte (conteneur de swipe de
    /// bulle côté app) désengage ses gestes horizontaux le temps du scrub.
    /// `@GestureState` (pas `@State`) : SwiftUI le remet à `false`
    /// automatiquement si le drag est interrompu (appel entrant, arbitrage
    /// perdu face au parent) même quand `.onEnded` ne se déclenche jamais —
    /// un `@State` manuel resterait bloqué à `true` et désengagerait le swipe
    /// reply/forward de la bulle indéfiniment.
    @GestureState private var isUserScrubbing = false

    // isDark/accent/chromePlan: internal (not `private`) — read from both
    // this file's own player/waveform/chips sections AND from
    // AudioPlayerView+Transcription.swift, a sibling extension file.
    var isDark: Bool { colorScheme == .dark || context.isImmersive }
    var accent: Color { Color(hex: accentColor) }
    var chromePlan: AudioPlayerChromePlan { .plan(for: chrome) }

    /// Transmet au moteur la version linguistique que l'utilisateur a sous les
    /// yeux, pour qu'elle accompagne le rapport d'écoute.
    ///
    /// `"orig"` n'est pas un code de langue mais un sentinelle d'affichage : il
    /// se traduit par la langue de rédaction de l'audio, celle qui a réellement
    /// été entendue. Le moteur ne lit rien lui-même — pureté SDK.
    private func publishConsumedLanguage() {
        let displayed = selectedAudioLanguage == "orig"
            ? transcription?.language
            : selectedAudioLanguage
        player.consumedLanguageProvider = { displayed }
    }

    /// Remet au moteur la consommation SERVIE pour CETTE pièce jointe, afin que
    /// la reprise qu'il APPLIQUE soit celle que la bulle ANNONCE (#7212).
    ///
    /// Sans ce relais, `eligibleResumePosition` rendrait la position servie
    /// dans le timecode pendant que `applyResumePositionIfAvailable`, aveugle
    /// au serveur, démarrerait à 0:00 — la vue afficherait une reprise qui
    /// n'arrive jamais. La valeur voyage avec l'identifiant qu'elle qualifie :
    /// un moteur partagé chargé sur une AUTRE piste l'ignore.
    private func publishServedConsumption() {
        player.setServedConsumption(attachment.currentUserConsumption, for: attachment.id)
    }

    /// Pure resolution of the transcription strip's STARTING language: the
    /// caller-resolved Prisme preference (`initialTranscriptionLanguage`)
    /// wins when provided, else `"orig"` — the unchanged default for every
    /// existing call site. Extracted as a `nonisolated static` helper (same
    /// pattern as `shouldDelegateToParent` / `shouldStopOwnedEngineOnDisappear`
    /// elsewhere in this file) so the seeding decision is unit-testable
    /// without a SwiftUI render lifecycle.
    nonisolated public static func resolveInitialTranscriptionLanguage(_ initialTranscriptionLanguage: String?) -> String {
        initialTranscriptionLanguage ?? "orig"
    }

    private var estimatedDuration: TimeInterval {
        let metadata = Double(attachment.duration ?? 0) / 1000.0
        if metadata > 0 { return metadata }
        return player.duration
    }

    public init<TopContent: View, BottomContent: View>(
        attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
        chrome: AudioPlayerChrome = .card,
        accentColor: String = MeeshyColors.brandPrimaryHex, transcription: MessageTranscription? = nil,
        translatedAudios: [MessageTranslatedAudio] = [],
        initialTranscriptionLanguage: String? = nil,
        reserveTranscriptionHeight: Bool = false,
        autoRevealTranscription: Bool = true,
        onFullscreen: (() -> Void)? = nil,
        onRequestTranscription: (() -> Void)? = nil,
        onRetranscribe: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil, onEdit: (() -> Void)? = nil,
        onPlayingChange: ((Bool) -> Void)? = nil,
        externalLanguage: Binding<String?>? = nil,
        availability: AudioAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        externalPlayer: AudioPlaybackManager? = nil,
        onPlayRequest: (() -> Void)? = nil,
        @ViewBuilder topContent: () -> TopContent = { EmptyView() },
        @ViewBuilder bottomContent: () -> BottomContent = { EmptyView() }
    ) {
        self.attachment = attachment; self.context = context; self.chrome = chrome
        self.accentColor = accentColor
        self.transcription = transcription; self.translatedAudios = translatedAudios
        self.initialTranscriptionLanguage = initialTranscriptionLanguage
        self.reserveTranscriptionHeight = reserveTranscriptionHeight
        self.autoRevealTranscription = autoRevealTranscription
        self._selectedAudioLanguage = State(
            initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage)
        )
        self._hasExplicitAudioLanguage = State(
            initialValue: AudioPlayerView.resolveInitialTranscriptionLanguage(initialTranscriptionLanguage) != "orig"
        )
        self.onFullscreen = onFullscreen; self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onDelete = onDelete; self.onEdit = onEdit
        self.onPlayingChange = onPlayingChange
        self.onPlayRequest = onPlayRequest
        self.externalLanguage = externalLanguage
        self.availability = availability
        self.onDownload = onDownload
        // External engine wiring. When the caller passes an externally-owned
        // `AudioPlaybackManager` (e.g. a ConversationAudioCoordinator that
        // survives view hierarchy churn), the view observes THAT engine
        // and never touches its owned dummy. The dummy `ownedPlayer` is
        // still created (SwiftUI demands a non-optional `@StateObject`
        // initial value) but we opt it out of `PlaybackCoordinator` to
        // avoid polluting the registry with an unused weak reference.
        let usesExternal = externalPlayer != nil
        self.usesExternalPlayer = usesExternal
        self._ownedPlayer = StateObject(
            wrappedValue: AudioPlaybackManager(registerWithCoordinator: !usesExternal)
        )
        self._observedExternalPlayer = ObservedObject(
            wrappedValue: externalPlayer ?? AudioPlayerView.sharedNoopExternal
        )
        let top = topContent()
        self.topSlot = top is EmptyView ? nil : AnyView(top)
        let bottom = bottomContent()
        self.bottomSlot = bottom is EmptyView ? nil : AnyView(bottom)
    }

    // MARK: - Body
    public var body: some View {
        VStack(spacing: 0) {
            mainPlayer

            if chromePlan.showsLanguageStrip && !translatedAudios.isEmpty && !context.isCompact {
                languageSelector
                    .padding(.top, 6)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTranscriptionExpanded)
        .onAppear {
            // CRITICAL: when an external engine is injected, the parent owns
            // `attachmentId` (it tracks which audio the shared engine is
            // currently loaded with). Overwriting it here would clobber that
            // tracking the moment a second audio bubble appears on-screen
            // while another is playing — breaking the `handlePlayTap`
            // gate that relies on `player.attachmentId == attachment.id` to
            // decide between "route to parent" vs "toggle play/pause".
            if !usesExternalPlayer {
                player.attachmentId = attachment.id
            }
            publishConsumedLanguage()
            publishServedConsumption()
            // BUG A fix — the legacy static autoplay registry is the
            // auto-advance mechanism ONLY for the owned-engine path. When an
            // external coordinator engine drives this view, the coordinator
            // queue is the single source of auto-advance (`advanceQueue`).
            // Registering here would make the registry stomp the coordinator's
            // next head after a track finishes (double auto-advance → wrong
            // track plays). Gate registration on `!usesExternalPlayer` so the
            // two mechanisms never co-drive the same engine. Unregistration in
            // `onDisappear` is gated symmetrically.
            if !usesExternalPlayer {
                let autoplayUrl = attachment.fileUrl
                // Capture weak en défense : la closure vit dans un registre
                // STATIQUE — une entrée orpheline ne doit pas retenir le moteur.
                AudioPlaybackManager.registerAutoplay(id: attachment.id, url: autoplayUrl) { [weak player] in
                    guard let player else { return }
                    // Optimistic local audio can never load through the cache
                    // (DiskCacheStore.data(for:) rejects file://) — autoplay it
                    // straight from disk. See Sprint 3 RC3.2.
                    if autoplayUrl.hasPrefix("file://"), let localURL = URL(string: autoplayUrl) {
                        player.playLocal(url: localURL)
                    } else {
                        player.play(urlString: autoplayUrl)
                    }
                }
            }
            loadWaveformSamples()
        }
        .onDisappear {
            // Owned-engine teardown. The external-engine path (conversation
            // bubbles) is owned by a parent coordinator that survives view
            // hierarchy churn and intentionally keeps playing via the
            // mini-player + background continuation, so it must be left
            // untouched here.
            guard Self.shouldStopOwnedEngineOnDisappear(usesExternalPlayer: usesExternalPlayer) else { return }
            // Symmetrical to onAppear (BUG A fix): the legacy autoplay closure
            // is registered only in the owned-engine path. Désenregistré par
            // id : `attachment.fileUrl` peut avoir changé entre appear et
            // disappear (swap URL optimiste → serveur), l'id est stable.
            AudioPlaybackManager.unregisterAutoplay(id: attachment.id)
            // Leak fix — stop owned playback deterministically. Relying on ARC
            // to dealloc the `@StateObject` is non-deterministic, and once the
            // engine is unregistered from `PlaybackCoordinator` (next line) it
            // can no longer be silenced when a story or conversation claims
            // audio next — so post / feed-card audio would keep playing on top
            // of the next screen (e.g. bleed over a story). Stop BEFORE
            // unregistering so the audio is actually halted.
            player.stop()
            player.unregisterFromCoordinator()
        }
        // La langue affichée change → le moteur doit rapporter la NOUVELLE :
        // le fournisseur capture une valeur, pas une référence, donc il faut le
        // reposer à chaque bascule.
        .adaptiveOnChange(of: selectedAudioLanguage) { _, _ in
            publishConsumedLanguage()
        }
        .adaptiveOnChange(of: player.isPlaying) { _, playing in
            onPlayingChange?(playing)
            if playing { loadWaveformSamples() }
        }
        .adaptiveOnChange(of: externalLanguage?.wrappedValue) { _, newLang in
            let code = newLang ?? "orig"
            guard code != selectedAudioLanguage else { return }
            switchToLanguage(code)
        }
        // Reset the in-flight flags as soon as a fresh transcription lands.
        // Drives the fluid skeleton → text transition: the shimmer fades out
        // and the transcribed segments fade in within the same animation
        // window thanks to the `.transition(.opacity)` on each branch of
        // `transcriptionBlock`. Uses the SDK-wide `adaptiveOnChange` compat
        // shim so the iOS 17 two-param closure shape works back to iOS 16.
        .adaptiveOnChange(of: transcription) { _, newValue in
            if newValue != nil {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    isTranscribing = false
                    isRetranscribing = false
                }
            }
        }
    }

    private func switchToLanguage(_ code: String) {
        // Bug §1.1 fix: stop playback immediately instead of calling
        // player.play(urlString:) directly on the new language URL.
        // The previous behavior bypassed the availability gate, silently
        // streaming the translated audio when it wasn't cached. The parent
        // (AudioMediaView via the externalLanguage binding) re-resolves
        // availability for the new URL and triggers auto-DL (if policy
        // permits) or shows the download button. The user re-taps play,
        // which goes through handlePlayTap() — gated by availability.
        //
        // OWNED player only. With an EXTERNAL player (conversation), the
        // engine belongs to the parent coordinator, which follows the
        // language switch itself (playVariant keeps playing on the new
        // track) — stopping it here would kill the playback the parent
        // just re-launched in the new language (user 2026-08-18: switching
        // the flag must SWITCH the audio, not silence it).
        if !usesExternalPlayer { player.stop() }

        // Explicit user intent (pill tap / externalLanguage binding) always
        // marks the language explicit — idempotent if Prisme had already
        // seeded it true in `init`.
        hasExplicitAudioLanguage = true
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLanguage = code
        }
    }

    // MARK: - Main Player
    /// Empile, dans cet ordre strict :
    /// 1. `topSlot` (reply) + son séparateur quand il existe
    /// 2. Les contrôles du player (play / waveform / time)
    /// 3. Le bloc de transcription (texte ou bouton "Transcrire") sans footer
    /// 4. `bottomSlot` (footer) ancré tout en bas, séparé par un unique
    ///    `Divider` quand quelque chose précède
    ///
    /// Cette structure garantit que `BubbleFooter` (timestamp + read receipts)
    /// reste toujours sous le player, jamais incrusté entre la transcription
    /// et le bouton "Re-transcrire" comme c'était le cas avant ce refactor.
    private var mainPlayer: some View {
        VStack(spacing: 0) {
            if let slot = topSlot {
                slot
                slotDivider
            }

            HStack(alignment: .center, spacing: context.isCompact ? 8 : 10) {
                playButton
                VStack(alignment: .leading, spacing: context.isCompact ? 3 : 4) {
                    waveformProgress
                    timeRow
                }
                if chromePlan.showsRightChips {
                    rightChipsColumn
                }
                contextActions
            }
            .padding(.horizontal, chromePlan.showsCardBackground ? (context.isCompact ? 10 : 14) : 0)
            .padding(.vertical, chromePlan.showsCardBackground ? (context.isCompact ? 8 : 12) : 6)

            if chromePlan.rendersFlatTranscription {
                flatTranscriptionBlock
            } else {
                transcriptionBlock
            }

            if let slot = bottomSlot {
                slotDivider
                slot
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
            }
        }
        .background {
            if chromePlan.showsCardBackground {
                playerBackground
            }
        }
    }

    /// Trait subtil utilisé entre les sections du player. Un seul style,
    /// instancié là où il sépare effectivement deux contenus, jamais en
    /// cascade. Internal (not `private`) — used both here (`mainPlayer`) and
    /// from `transcriptionBlock`/`flatTranscriptionBlock`, moved to the
    /// sibling extension file AudioPlayerView+Transcription.swift.
    var slotDivider: some View {
        Divider()
            .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))
    }

    private var currentAudioUrl: String {
        AudioPlayerView.resolvePlaybackUrl(
            selectedLanguage: selectedAudioLanguage,
            hasExplicitLanguage: hasExplicitAudioLanguage,
            translatedAudios: translatedAudios,
            originalUrl: attachment.fileUrl
        )
    }

    /// Pure resolution of the actual URL `handlePlayTap` hands the playback
    /// engine. Prisme audio-follow (2026-08-09) — `selectedLanguage` is
    /// steered to playback whenever `hasExplicitLanguage` is `true`, whether
    /// that came from the automatic Prisme seed in `init` or from an
    /// explicit `switchToLanguage` call. When `false` (no Prisme translation
    /// resolved and no user action yet), this always resolves to
    /// `originalUrl`. Extracted as a `nonisolated static` helper — same
    /// pattern as `resolveInitialTranscriptionLanguage` / `shouldDelegateToParent`
    /// elsewhere in this file — so it is unit-testable without a SwiftUI
    /// render lifecycle.
    nonisolated internal static func resolvePlaybackUrl(
        selectedLanguage: String,
        hasExplicitLanguage: Bool,
        translatedAudios: [MessageTranslatedAudio],
        originalUrl: String
    ) -> String {
        guard hasExplicitLanguage, selectedLanguage != "orig",
              let translated = translatedAudios.first(where: {
                  $0.targetLanguage.lowercased() == selectedLanguage.lowercased()
              })
        else { return originalUrl }
        return translated.url
    }

    // MARK: - Play Button
    private var playButton: some View {
        Button {
            switch availability {
            case .ready:
                handlePlayTap()
            case .needsDownload:
                onDownload?()
                HapticFeedback.light()
            case .downloading:
                break
            }
        } label: {
            playButtonLabel
        }
        .disabled(isDownloading)
        .accessibilityLabel(String(localized: "media.audio.play", defaultValue: "Lire l'audio", bundle: .module))
    }

    private var isDownloading: Bool {
        if case .downloading = availability { return true }
        return false
    }

    /// Pure routing decision used by `handlePlayTap`. Extracted as a
    /// `nonisolated static` helper so it can be unit-tested without a
    /// SwiftUI render lifecycle. Returns `true` iff the play tap should be
    /// delegated to `onPlayRequest` instead of touching the locally
    /// resolved `player`.
    nonisolated internal static func shouldDelegateToParent(
        usesExternalPlayer: Bool,
        playerAttachmentId: String?,
        bubbleAttachmentId: String
    ) -> Bool {
        if !usesExternalPlayer { return true }
        return playerAttachmentId != bubbleAttachmentId
    }

    /// Pure decision: should the owned playback engine be stopped when this
    /// view leaves the hierarchy? `true` only for the owned-engine path (post
    /// detail, feed post cards, composer preview, standalone players). An
    /// externally-injected engine (e.g. `ConversationAudioCoordinator`) is
    /// owned by a parent that survives view churn and intentionally keeps
    /// playing (mini-player + background continuation), so it must NOT be
    /// stopped here. Extracted as a `nonisolated static` so the lifecycle
    /// contract is unit-testable without a SwiftUI render lifecycle.
    nonisolated internal static func shouldStopOwnedEngineOnDisappear(usesExternalPlayer: Bool) -> Bool {
        !usesExternalPlayer
    }

    private func handlePlayTap() {
        // La consommation servie est reposée JUSTE avant la lecture : un moteur
        // partagé a pu changer de piste depuis l'`onAppear` de cette bulle.
        publishServedConsumption()
        // External-engine interception: when the parent injected an
        // `onPlayRequest` handler, defer to it so the parent can set up the
        // queue / active-context BEFORE asking the engine to play. Two
        // cases short-circuit to the parent:
        //  1. The bubble is INACTIVE (`!usesExternalPlayer`) — its
        //     `ownedPlayer` is a dummy that must never produce sound. Even
        //     though `onAppear` writes `player.attachmentId = attachment.id`
        //     on the owned dummy (so other readers can introspect it), that
        //     local match must NOT be used to gate the routing — otherwise
        //     the first tap on every fresh bubble bypasses the coordinator
        //     and plays via the dummy local engine, leaving `activeContext`
        //     nil. That broke the mini-player + background continuation
        //     (cf. 2026-05-28 bug report).
        //  2. The bubble is ACTIVE but the shared engine is loaded with a
        //     DIFFERENT attachment (`player.attachmentId != attachment.id`)
        //     — the parent must rebuild the queue around this audio.
        // Once the external engine IS loaded with this attachment, fall
        // through to `togglePlayPause()` so subsequent play/pause taps are
        // instantaneous and never rebuild the queue.
        if let onPlayRequest, Self.shouldDelegateToParent(
            usesExternalPlayer: usesExternalPlayer,
            playerAttachmentId: player.attachmentId,
            bubbleAttachmentId: attachment.id
        ) {
            onPlayRequest()
            HapticFeedback.light()
            return
        }
        if player.isPlaying || player.progress > 0 {
            player.togglePlayPause()
        } else if attachment.fileUrl.hasPrefix("file://"),
                  let localURL = URL(string: attachment.fileUrl) {
            // Optimistic local audio: AudioPlaybackManager.play(urlString:)
            // routes through DiskCacheStore.data(for:), which rejects
            // file:// schemes. Read the on-device file directly instead.
            player.playLocal(url: localURL)
        } else {
            player.play(urlString: currentAudioUrl)
        }
        HapticFeedback.light()
    }

    @ViewBuilder
    private var playButtonLabel: some View {
        let size: CGFloat = context.isCompact ? 34 : 40
        VStack(spacing: 3) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [accent, accent.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(color: accent.opacity(0.3), radius: 6, y: 2)

                switch availability {
                case .ready:
                    if player.isLoading {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: player.isPlaying ? 0 : 1)
                    }
                case .needsDownload:
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: context.isCompact ? 13 : 15, weight: .bold))
                        .foregroundColor(.white)
                case .downloading(let progress, _, _):
                    if progress > 0 {
                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(Color.white, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .frame(width: size * 0.5, height: size * 0.5)
                            .animation(.linear(duration: 0.2), value: progress)
                    } else {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.6)
                    }
                }
            }

            // Label de taille — affiché uniquement dans les états transfert.
            // .ready ne montre rien (le bubble a déjà sa durée à droite du
            // scrubber). Parité visuelle avec DownloadBadgeView pour les
            // bubbles vidéo/image.
            switch availability {
            case .ready:
                EmptyView()
            case .needsDownload:
                let label = AudioPlayerView.formattedNeedsDownloadLabel(fileSize: attachment.fileSize)
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            case .downloading(_, let downloaded, let total):
                let label = AudioPlayerView.formattedDownloadingLabel(
                    downloadedBytes: downloaded,
                    totalBytes: total,
                    fallbackFileSize: attachment.fileSize
                )
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(isDark ? .white.opacity(0.65) : .black.opacity(0.55))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
    }

    // MARK: - Waveform Progress

    /// Number of waveform bars. Higher density reads as a finer, more faithful
    /// envelope (thin capsules) rather than a row of chunky squares. Single
    /// source of truth: the render loop AND `loadWaveformSamples` must request
    /// the same count so cache keys and indices line up.
    private var waveformBarCount: Int { context.isCompact ? 48 : 72 }

    /// Persisted "at-rest" consumption fraction (0...1) — drives the waveform
    /// tint BEFORE playback starts. Local wins; server fills the gap only
    /// when local has nothing (#7212 multi-device rehydration) — see
    /// `MediaResumeResolver`.
    private var restingProgress: Double {
        MediaResumeResolver.restingFraction(
            localFraction: MediaConsumptionStore.shared.fraction(for: attachment.id),
            servedConsumption: attachment.currentUserConsumption,
            medium: .audio,
            totalDuration: estimatedDuration)
    }

    /// The resume point, filtered so the timecode never advertises a position
    /// playback would ignore. Local wins; server fills the gap only when local
    /// has nothing (#7212) — see `MediaResumeResolver`.
    ///
    /// Le moteur résout la MÊME chose depuis la MÊME fonction
    /// (`AudioPlaybackManager.applyResumePositionIfAvailable`), nourri par
    /// `publishServedConsumption()` : sans cela, la bulle afficherait 0:45
    /// pendant que la lecture démarrerait à 0:00.
    private var eligibleResumePosition: TimeInterval? {
        MediaResumeResolver.resumePosition(
            localPositionSeconds: AudioPlaybackPositionStore.shared.position(for: attachment.id),
            servedConsumption: attachment.currentUserConsumption,
            medium: .audio,
            totalDuration: estimatedDuration,
            isEligible: AudioPlaybackManager.isResumable)
    }

    private var displayedProgress: AudioProgressDisplay {
        Self.progressDisplay(
            liveProgress: player.progress,
            liveCurrentTime: player.currentTime,
            restingProgress: restingProgress,
            resumePosition: eligibleResumePosition,
            totalDuration: estimatedDuration)
    }

    /// What the widget SHOWS for "how far along am I" — one resolution behind
    /// the waveform tint, the percentage chip AND the elapsed timecode, so the
    /// three can never contradict each other.
    ///
    /// While the engine plays, its own head wins: the timecode must track the
    /// audio coming out of the speaker even if the user scrubbed backwards past
    /// the monotonic consumption mark.
    ///
    /// At rest — a fresh launch, a bubble whose engine was never attached — the
    /// two persisted facts answer two different questions and are kept apart:
    /// `fraction` (waveform + chip) reports how much of the note has EVER been
    /// consumed, while `elapsed` reports where the play button will START. They
    /// coincide on a simple pause; they diverge when an already-finished note
    /// is re-listened and paused mid-way (100 % consumed, resumes at 0:22).
    nonisolated public static func progressDisplay(
        liveProgress: Double,
        liveCurrentTime: TimeInterval,
        restingProgress: Double,
        resumePosition: TimeInterval?,
        totalDuration: TimeInterval
    ) -> AudioProgressDisplay {
        guard liveProgress <= 0 else {
            return AudioProgressDisplay(
                fraction: liveProgress, elapsed: liveCurrentTime, isLive: true)
        }
        let fraction = max(0, min(1, restingProgress))
        guard totalDuration > 0 else {
            return AudioProgressDisplay(fraction: fraction, elapsed: 0, isLive: false)
        }
        // Consumption is monotonic and sticky-complete; the resume point is the
        // only value that predicts where the play button will start.
        let elapsed = resumePosition.map { max(0, min(totalDuration, $0)) }
            ?? fraction * totalDuration
        return AudioProgressDisplay(fraction: fraction, elapsed: elapsed, isLive: false)
    }

    /// Maps a touch / drag x-position within the waveform strip to a normalized
    /// seek fraction (0...1), clamped at both edges. Single source of truth for
    /// BOTH the tap-to-seek and the swipe-to-scrub gestures on `waveformProgress`
    /// so the two paths can never compute the position differently. Guards a
    /// zero / negative width (pre-layout `GeometryReader` tick) so it never
    /// divides by zero. Pure; unit-tested.
    nonisolated public static func scrubFraction(locationX: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(max(0, min(width, locationX)) / width)
    }

    private var waveformProgress: some View {
        GeometryReader { geo in
            let barCount = waveformBarCount
            // Thin bars with a tight gap. The bar width is derived from the
            // available width so the strip always fills edge-to-edge; the gap
            // is a fraction of the slot so dense layouts don't collapse.
            let slot = geo.size.width / CGFloat(barCount)
            let barWidth = max(1.5, slot * 0.62)

            // Live playback (incl. a resumed position) drives the bars with the
            // full accent. At rest we fall back to the persisted consumption
            // fraction with an attenuated accent — discreet, per the Prisme.
            let shownProgress = displayedProgress.fraction
            let playedColor = displayedProgress.isLive ? accent : accent.opacity(0.4)

            HStack(spacing: 0) {
                ForEach(0..<barCount, id: \.self) { i in
                    let fraction = (Double(i) + 0.5) / Double(barCount)
                    let isPlayed = fraction <= shownProgress
                    let h = waveformHeight(index: i, total: barCount)

                    Capsule(style: .continuous)
                        .fill(isPlayed ? playedColor : (isDark ? Color.white.opacity(0.20) : Color.black.opacity(0.12)))
                        .frame(width: barWidth, height: h)
                        .frame(width: slot, height: 24, alignment: .center)
                }
            }
            .frame(height: 24, alignment: .center)
        }
        .frame(height: 24)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    // Swipe-to-scrub. `DragGesture(minimumDistance: 0)` claims the
                    // touch the instant it lands on the strip, so dragging here
                    // scrubs the playback position INSTEAD of scrolling the
                    // enclosing conversation list / post detail or triggering the
                    // bubble's own tap/long-press. `.highPriorityGesture` makes the
                    // waveform win over those outer components — the user expects
                    // the waveform to own the swipe. A plain tap is the
                    // zero-distance case: it seeks to the tapped point on `.onEnded`.
                    .highPriorityGesture(
                        DragGesture(minimumDistance: 0)
                            .updating($isUserScrubbing) { _, state, _ in
                                state = true
                            }
                            .onChanged { value in
                                player.seek(to: Self.scrubFraction(
                                    locationX: value.location.x, width: geo.size.width))
                            }
                            .onEnded { value in
                                player.seek(to: Self.scrubFraction(
                                    locationX: value.location.x, width: geo.size.width))
                                HapticFeedback.light()
                            }
                    )
            }
            .allowsHitTesting(availability == .ready)
        )
        // Signale le scrub en cours à l'hôte (voir MediaScrubbingPreferenceKey) :
        // le conteneur de swipe de la bulle désengage reply/forward tant que le
        // doigt manipule la waveform.
        .preference(key: MediaScrubbingPreferenceKey.self, value: isUserScrubbing)
    }

    // MARK: - Time Row
    /// Timecodes seuls : `currentTime` à gauche, `estimatedDuration` à droite.
    /// La vitesse de lecture et l'affordance plein écran ont migré vers
    /// `rightChipsColumn` (capsules empilées à droite du widget).
    private var timeRow: some View {
        HStack(spacing: 0) {
            Text(formatMediaDuration(displayedProgress.elapsed))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.5) : .black.opacity(0.4))
            Spacer()
            Text(formatMediaDuration(estimatedDuration))
                .font(.system(size: context.isCompact ? 9 : 10, weight: .semibold, design: .monospaced))
                .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.25))
        }
    }

    // MARK: - Right Chips Column (speed + progress, stacked vertically)
    /// Colonne droite du widget : chip vitesse en haut (alignée avec la
    /// waveform), chip pourcentage juste en dessous (alignée avec timeRow).
    /// Le tap sur la chip pourcentage ouvre la vue plein écran — l'ancienne
    /// icône `arrow.up.left.and.arrow.down.right` a été supprimée du timeRow,
    /// le pourcentage qui n'était qu'un libellé devient l'affordance.
    private var rightChipsColumn: some View {
        VStack(alignment: .trailing, spacing: context.isCompact ? 3 : 4) {
            speedChip
            percentageChip
        }
    }

    private var speedChip: some View {
        let isDefault = player.speed == .x1_0
        let chipBg: Color = isDefault
            ? (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
            : accent.opacity(0.85)
        let chipFg: Color = isDefault
            ? (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
            : .white
        return Button {
            player.cycleSpeed()
            HapticFeedback.light()
        } label: {
            Text(player.speed.label)
                .font(.system(size: context.isCompact ? 9 : 10, weight: .bold, design: .monospaced))
                .foregroundColor(chipFg)
                .padding(.horizontal, context.isCompact ? 7 : 8)
                .padding(.vertical, context.isCompact ? 2 : 3)
                .background(Capsule().fill(chipBg))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.audio.speed.cycle",
                                   defaultValue: "Vitesse de lecture \(player.speed.label)",
                                   bundle: .module))
    }

    private var percentageChip: some View {
        let pct = Int(displayedProgress.fraction * 100)
        let isStarted = pct > 0
        let chipBg: Color = isStarted
            ? accent.opacity(0.85)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))
        let chipFg: Color = isStarted
            ? .white
            : (isDark ? .white.opacity(0.55) : .black.opacity(0.45))
        let label = Text("\(pct)%")
            .font(.system(size: context.isCompact ? 9 : 10, weight: .heavy, design: .monospaced))
            .foregroundColor(chipFg)
            .padding(.horizontal, context.isCompact ? 7 : 8)
            .padding(.vertical, context.isCompact ? 2 : 3)
            .background(Capsule().fill(chipBg))
            .contentTransition(.numericText())
            .animation(.easeInOut(duration: 0.15), value: pct)

        return Group {
            if let onFullscreen = onFullscreen {
                Button {
                    HapticFeedback.light()
                    onFullscreen()
                } label: { label }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.audio.open.fullscreen",
                                           defaultValue: "Ouvrir en plein écran, lecture \(pct)%",
                                           bundle: .module))
                .accessibilityHint(String(localized: "media.audio.open.fullscreen.hint",
                                          defaultValue: "Affiche la vue plein écran avec les options de sauvegarde",
                                          bundle: .module))
            } else {
                label
            }
        }
    }

    // MARK: - Context Actions
    @ViewBuilder
    private var contextActions: some View {
        if context == .composerAttachment {
            HStack(spacing: 4) {
                if let onEdit = onEdit {
                    Button { onEdit() } label: {
                        Image(systemName: "waveform.and.magnifyingglass")
                            .font(.system(size: 12))
                            .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                            .frame(width: 26, height: 26)
                    }
                }
                if let onDelete = onDelete {
                    Button { onDelete() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundColor(MeeshyColors.error)
                    }
                }
            }
        }
    }

    // MARK: - Language Selector
    private var languageSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                audioLanguagePill(flag: "\u{1F50A}", code: "orig", label: String(localized: "media.audio.original", defaultValue: "Original", bundle: .module),
                                  isSelected: selectedAudioLanguage == "orig")

                ForEach(translatedAudios, id: \.id) { audio in
                    let lang = DetectedLanguage.find(code: audio.targetLanguage)
                    audioLanguagePill(
                        flag: lang?.flag ?? "\u{1F310}",
                        code: audio.targetLanguage,
                        label: lang?.name ?? audio.targetLanguage,
                        isSelected: selectedAudioLanguage.lowercased() == audio.targetLanguage.lowercased()
                    )
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func audioLanguagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        Button {
            switchToLanguage(code)
            externalLanguage?.wrappedValue = code == "orig" ? nil : code
            HapticFeedback.light()
        } label: {
            HStack(spacing: 3) {
                Text(flag).font(.system(size: 12))
                Text(label).font(.system(size: 10, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .white : (isDark ? .white.opacity(0.55) : .black.opacity(0.45)))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(isSelected ? accent : (isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04))))
        }
    }

    // MARK: - Helpers
    private var playerBackground: some View {
        RoundedRectangle(cornerRadius: context.cornerRadius)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: context.cornerRadius)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
            )
    }

    /// Bar height in points. Maps the normalized amplitude (0–1) to the strip
    /// height with a mild perceptual curve (`pow 0.65`) so quiet passages stay
    /// visible instead of collapsing to the floor next to a few loud peaks —
    /// the envelope reads truer to the ear. Falls back to a smooth procedural
    /// shape until the real samples finish decoding.
    private func waveformHeight(index: Int, total: Int) -> CGFloat {
        let minHeight: CGFloat = 2
        let maxHeight: CGFloat = 22
        let samples = waveformAnalyzer.samples
        if !samples.isEmpty {
            // Map the bar index onto the sample array so the render density and
            // the sample count can differ without dropping or duplicating data.
            let sampleIndex = min(samples.count - 1, index * samples.count / max(1, total))
            let normalized = Double(max(0, min(1, samples[sampleIndex])))
            let curved = pow(normalized, 0.65)
            return max(minHeight, CGFloat(curved) * maxHeight)
        }
        let seed = Double(index * 7 + 3)
        let base = 5.0 + sin(seed) * 6 + cos(seed * 0.5) * 4.0
        return CGFloat(max(minHeight, min(maxHeight, base)))
    }

    private func loadWaveformSamples() {
        guard waveformAnalyzer.samples.isEmpty else { return }
        // Decode at a higher resolution than we render so the perceived detail
        // stays crisp; `waveformHeight` down-maps bar index → sample index.
        let barCount = max(96, waveformBarCount)
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        Task {
            if let data = try? await CacheCoordinator.shared.audio.data(for: resolved) {
                waveformAnalyzer.analyze(data: data, barCount: barCount)
            }
        }
    }
}
