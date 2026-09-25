// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Share Sheet

/// LE seul pont vers `UIActivityViewController` de l'app, toujours présenté
/// DANS une `.sheet` SwiftUI (jamais en popover nu — le crash iPad historique
/// du chemin audio venait d'un `UIActivityViewController` sans ancre popover,
/// et SwiftUI résout la scène présentatrice lui-même : pas de parcours de
/// `connectedScenes`, doctrine 215i/216i).
///
/// `onCompletion` est optionnel et n'installe un `completionWithItemsHandler`
/// que s'il est fourni : les appelants qui n'ont rien à faire de l'issue du
/// partage restent strictement inchangés.
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    /// `true` quand l'utilisateur a effectivement mené le partage à son terme.
    var onCompletion: ((Bool) -> Void)? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
        if let onCompletion {
            controller.completionWithItemsHandler = { _, completed, _, _ in
                onCompletion(completed)
            }
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Download Badge View (3 states: idle → downloading → cached)
struct DownloadBadgeView: View {
    let attachment: MessageAttachment
    let accentColor: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var onShareFile: ((URL) -> Void)? = nil

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    /// Local optimistic media (a `file://` URL) and messages still in their
    /// optimistic phase (`.sending` / `.slow` / `.invisible`) are already on
    /// disk — a download badge must never appear for them. `.slow` is a row
    /// that failed once and is retrying via the outbox: still optimistic, still
    /// local. See Sprint 3 RC3.2.
    /// **Une vidéo n'a qu'UN composant de téléchargement : le bouton de son
    /// lecteur** (#7492). `VideoAvailabilityResolver` + `MeeshyVideoPlayer`
    /// portent déjà « ↓ taille », l'anneau de progression et l'auto-DL selon la
    /// politique réseau. Ce badge se posait PAR-DESSUS la même tuile (rangée
    /// plate, carrousel) : deux boutons, deux anneaux, deux téléchargeurs dont
    /// aucun ne voyait l'autre. Il ne sert plus que l'image, dont la vue n'a pas
    /// d'autre affordance.
    var yieldsToThePlayer: Bool {
        attachment.type == .video
    }

    var hidesForLocalOrOptimisticMedia: Bool {
        attachment.fileUrl.hasPrefix("file://")
            || messageDeliveryStatus == .sending
            || messageDeliveryStatus == .slow
            || messageDeliveryStatus == .invisible
    }

    /// Synchronous probe of the in-memory UIImage cache. For an image whose
    /// bytes are already resident (our own confirmed upload — pre-seeded by
    /// RC3.3 — or a previously decoded remote image) this resolves "cached"
    /// within the first render, so the download affordance never flashes over
    /// media we already hold. The async `checkCache` still covers disk-only
    /// hits and the audio / video stores.
    private var isImageAlreadyResident: Bool {
        guard attachment.type == .image else { return false }
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        // Toutes variantes confondues : la bulle décode sous une clé
        // dimensionnée (targetSize → bucket), le slot nu peut donc être vide
        // alors que l'image est bel et bien affichée.
        return DiskCacheStore.hasAnyCachedImageVariant(for: resolved)
    }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if yieldsToThePlayer || hidesForLocalOrOptimisticMedia || isImageAlreadyResident {
                EmptyView()
            } else if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: downloader.isCached)
        .animation(.easeInOut(duration: 0.15), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, onShare: onShareFile)
        } label: {
            centredIdleBadge
        }
        .task {
            await downloader.checkCache(attachment)
        }
        .accessibilityLabel(String(localized: "a11y.media.download.action", defaultValue: "Télécharger", bundle: .main))
        .accessibilityValue(totalSizeText)
    }

    private var centredIdleBadge: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                Circle()
                    .fill(accent.opacity(0.85))
                    .frame(width: 48, height: 48)
                Image(systemName: "arrow.down.to.line")
                    .font(MeeshyFont.relative(22, weight: .bold))
                    .foregroundColor(.white)
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)

            if !totalSizeText.isEmpty {
                Text(totalSizeText)
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(.black.opacity(0.55)))
            }
        }
    }

    private var downloadingBadge: some View {
        Button { downloader.cancel() } label: {
            VStack(spacing: 2) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                    Circle()
                        .trim(from: 0, to: downloader.progress)
                        .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.2), value: downloader.progress)

                    if downloader.progress > 0 {
                        Text("\(Int(downloader.progress * 100))")
                            .font(MeeshyFont.relative(7, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.white)
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(width: 24, height: 24)

                Text("\(AttachmentDownloader.fmt(downloader.downloadedBytes))/\(totalSizeText)")
                    .font(MeeshyFont.relative(7, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(5)
            .background(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(0.6)))
        }
        .padding(4)
        .accessibilityLabel(String(localized: "a11y.media.download.cancel", defaultValue: "Annuler le téléchargement", bundle: .main))
        .accessibilityValue(downloader.progress.formatted(.percent))
    }
}

// `AttachmentDownloader` vit dans `AttachmentDownloadCenter.swift` depuis #7492 :
// une façade par vue sur le registre UNIQUE des téléchargements.

// `CachedPlayIcon` a vécu ici jusqu'au 2026-08-26 : ZÉRO site d'appel, et sa
// `.task` bouclait `FileManager.fileExists` toutes les 1,5 s SANS TERMINAISON
// pour un média jamais mis en cache (auto-DL refusé par la policy) — une mine
// d'E/S disque périodique qu'un futur montage aurait réarmée sans bruit.
// Supprimé plutôt que laissé en piège (audit chauffe 2026-08-26).

// MARK: - Audio Media View (shows placeholder until cached, then full player)
struct AudioMediaView: View, Equatable {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    let visualAttachments: [MessageAttachment]
    let isDark: Bool
    let accentColor: String
    /// Tenue de rendu du player (voir `AudioPlayerChrome`) — `.card` par
    /// défaut, aucun site d'appel historique ne change. Le mode Focal
    /// passe les tenues plates via `FocalAudioBlock`.
    var chrome: AudioPlayerChrome = .card
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var textTranslations: [MessageTranslation] = []
    var allAudioItems: [ConversationViewModel.AudioItem] = []
    var mentionDisplayNames: [String: String] = [:]
    var onScrollToMessage: ((String) -> Void)?
    var onShareFile: ((URL) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var activeAudioLanguageOverride: String? = nil
    /// Remonte un tap de drapeau de la bande interne au CANAL DU MESSAGE
    /// (`activeDisplayLangCode` → VM) au lieu du @State local : la piste
    /// jouée, le texte et le drapeau de rangée suivent d'un même mouvement.
    /// Le code tapé est transmis TEL QUEL (langue d'origine = V.O.
    /// explicite — le résolveur la traduit en « piste originale »). `nil` =
    /// surfaces sans VM (previews, onboarding) : le @State local reste le
    /// repli, comportement historique.
    var onSelectAudioLanguage: ((String) -> Void)? = nil
    /// Footer descriptor injected by `BubbleStandardLayout` for audio-only
    /// messages — rendered inside the audio widget. `AudioMediaView` folds the
    /// audio-language flags into it (see `audioFooter`), so the footer is a
    /// single unified `BubbleFooter` and is never duplicated below the bubble.
    var footerModel: BubbleFooterModel? = nil
    var footerActions: BubbleFooterActions = .none

    /// Quand non-nil, la citation est rendue dans le topSlot d'AudioPlayerView
    /// (au-dessus de la ligne lecteur, à l'intérieur du même playerBackground).
    /// Activé par `BubbleStandardLayout.audioHostsReply` — voir spec §4.3.
    var replyReference: ReplyReference? = nil
    var replyIsStory: Bool = false
    var parentIsMe: Bool = false
    /// Peau de la citation hébergée — `.focal` sous la rangée plate : nom seul, sans avatar (#7491).
    var replySkin: QuotedReplyPresentation.Skin = .bubble
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
    /// LOI DES ZONES (2026-08-24) — ZONES 1 et 2 de la citation hebergee par
    /// le widget audio : l'avatar de l'auteur cite ouvre son profil, la
    /// miniature ou l'icone de lecture ouvre le media cite. Transmis tels
    /// quels a `BubbleQuotedReply`, qui decide seul de les armer.
    /// **Exclus d'Equatable** pour la meme raison que les autres rappels :
    /// une fermeture change d'identite a chaque rendu sans jamais changer le
    /// rendu.
    var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil
    var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil
    /// Phase 5: a tap on the play button of this bubble routes here.
    /// Wired by `BubbleStandardLayout` -> `ThemedMessageBubble` ->
    /// `MessageListViewController.onPlayAudio` ->
    /// `ConversationViewModel.playAudio(attachmentId:)`. When nil, the
    /// router falls back to a no-op + local engine (legacy behavior).
    /// **Excluded from Equatable** for the same reason as the other
    /// callbacks: closures change identity per re-render but never affect
    /// the bubble's visual output, so comparing them would force
    /// re-evaluation on every refresh.
    var onPlayAudio: ((String) -> Void)? = nil

    /// Nom de la conversation — cold-open (F1) : porté par le cover plein
    /// écran comme `AudioFullscreenSource.nowPlayingContextName` pour que la
    /// carte Now Playing affiche la CONVERSATION, pas l'auteur seul. `nil`
    /// pour les surfaces sans conversation (feed/commentaire/post/réel), qui
    /// gardent le repli existant sur le nom de l'auteur. Wired par
    /// `BubbleStandardLayout` -> `ThemedMessageBubble` ->
    /// `MessageListViewController` depuis `ConversationViewModel.currentConversationName`.
    /// **Excluded from Equatable** : n'affecte jamais le rendu de la bulle,
    /// seulement une valeur consommée par une feuille présentée plus tard
    /// (même traitement que `allAudioItems`).
    var conversationName: String? = nil
    /// Fournit, pour un `attachmentId` donné, les vocaux non écoutés qui le
    /// suivent dans la conversation — cold-open (F1) : porté par le cover
    /// plein écran comme `AudioFullscreenSource.queueTailProvider` pour que
    /// l'avance auto fonctionne dès l'ouverture directe (sans lecture déjà
    /// active). `nil` pour les surfaces sans conversation. Reçoit
    /// `ConversationViewModel.audioQueueTail(after:)` verbatim (jamais
    /// redéfini ici). **Excluded from Equatable** pour la même raison que
    /// `onPlayAudio`.
    var audioQueueTailProvider: ((String) -> [QueuedAudio])? = nil

    /// Caption pattern (MIMI-compatible, SOTA WhatsApp/Telegram) : quand le
    /// message contient à la fois un audio attachment et du texte content,
    /// le texte est rendu DANS le playerBackground d'AudioBubbleRouter
    /// (au-dessus du footer, en dessous du player) — pas comme une bulle
    /// texte séparée. `BubbleStandardLayout` set ce flag à true quand il
    /// détecte audio + content, et SKIP son rendu textBubbleContent externe.
    /// Référence : draft-ietf-mimi-content-08 §MultiPart processAll +
    /// disposition inline (user feedback 2026-05-29).
    var embedsCaptionInWidget: Bool = false
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil

    nonisolated static func shouldShowConsentNotice(isMe: Bool, voiceConsentMissing: Bool) -> Bool {
        isMe && voiceConsentMissing
    }

    /// #4956 — mes propres messages restent toujours révélés (c'est ma voix) ;
    /// pour un message REÇU, la règle suit la préférence
    /// `audio.autoTranscribeIncoming`. Lu directement (pas d'`@ObservedObject`
    /// — leaf view, Zero Unnecessary Re-render), même patron que
    /// `BubbleContentBuilder` pour `privacy.showReadReceipts`.
    private var autoRevealTranscription: Bool {
        message.isMe || UserPreferencesManager.shared.audio.autoTranscribeIncoming
    }

    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.message.content == rhs.message.content
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
            // La citation ENTIÈRE, jamais une projection : ce `==` est le seul
            // filtre d'invalidation de la cellule, et la projection qu'il
            // portait (id, aperçu, vignette, avatar) ignorait la PROTECTION et
            // les sept faits du média cité. Sur un vocal qui héberge une
            // citation, la vignette d'un média à vue unique restait donc
            // affichée si la protection arrivait après le premier rendu, et le
            // flou ThumbHash comme la ligne « 1024×768 · 0:42 · 1,2 Mo »
            // n'apparaissaient jamais. `ReplyReference` est `Equatable` pour
            // que cette liste ne puisse plus se périmer.
            && lhs.replyReference == rhs.replyReference
            && lhs.replyIsStory == rhs.replyIsStory
            && lhs.parentIsMe == rhs.parentIsMe
            && lhs.replySkin == rhs.replySkin
            && lhs.embedsCaptionInWidget == rhs.embedsCaptionInWidget
            && lhs.transcription?.text == rhs.transcription?.text
            && lhs.transcription?.segments.count == rhs.transcription?.segments.count
            && lhs.translatedAudios.count == rhs.translatedAudios.count
            && lhs.translatedAudios.map(\.url) == rhs.translatedAudios.map(\.url)
            && lhs.voiceConsentMissing == rhs.voiceConsentMissing
            && lhs.chrome == rhs.chrome
    }

    /// `nil` tant que la résolution du `.task` n'a pas rendu : la disponibilité
    /// se lit alors sur le disque, sans attendre (`availableOnDeviceAtFirstRender`).
    @State private var resolvedAvailability: AudioAvailability?
    @State private var isAudioPlaying = false
    @State private var showAudioFullscreen = false
    @State private var selectedAudioLangCode: String? = nil
    @StateObject private var downloader = AttachmentDownloader()

    /// Disponibilité effective : un téléchargement actif prime, puis un
    /// téléchargement terminé, sinon la résolution « au repos » du `.task`.
    /// Propage `downloadedBytes` / `totalBytes` au case `.downloading` pour
    /// que `AudioPlayerView.playButtonLabel` puisse rendre « 410 KB / 850 KB ».
    private var availability: AudioAvailability {
        AttachmentDownloader.resolvedAvailability(
            isDownloading: downloader.isDownloading,
            downloadingURL: downloader.downloadingURL,
            currentURL: currentAudioUrl,
            isCached: downloader.isCached,
            progress: downloader.progress,
            downloadedBytes: downloader.downloadedBytes,
            totalBytes: downloader.totalBytes,
            resting: resolvedAvailability ?? Self.availableOnDeviceAtFirstRender(urlString: currentAudioUrl)
        )
    }

    /// **La disponibilité au PREMIER rendu se lit sur le disque** (#7660).
    ///
    /// Elle valait `.needsDownload` jusqu'à ce que le `.task` la résolve de
    /// façon asynchrone : un vocal déjà présent sur l'appareil se dessinait
    /// donc d'abord « à télécharger » — bouton ↓ ET libellé de taille sous le
    /// bouton, 10 pt de plus — puis rétrécissait quelques images plus tard.
    /// Dans le fil, chaque réalisation de la rangée jouait ce
    /// redimensionnement, animé, sous le doigt (89 → 79 pt, mesuré au
    /// simulateur sur « Meeshy Global »).
    ///
    /// Mêmes branches que `resolveAvailability`, en synchrone : un `stat`, sans
    /// saut d'acteur. Le `.task` garde le dernier mot — il consulte aussi le
    /// cache mémoire.
    nonisolated static func availableOnDeviceAtFirstRender(
        urlString: String,
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) },
        isOnDisk: (String) -> Bool = { CacheCoordinator.audioLocalFileURL(for: $0) != nil }
    ) -> AudioAvailability {
        if urlString.hasPrefix("file://") {
            return AudioAvailability.resolve(
                isLocalFile: true,
                localFileExists: fileExists(URL(string: urlString)?.path ?? ""),
                isServerCached: false
            )
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        return AudioAvailability.resolve(isLocalFile: false, localFileExists: false, isServerCached: isOnDisk(resolved))
    }

    /// URL de la langue actuellement sélectionnée (orig ou traduite).
    /// Drives `resolveAvailability` and the auto-DL trigger. Used as the
    /// `.task(id:)` identifier so switching language re-runs availability
    /// resolution and the policy check.
    private var currentAudioUrl: String {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: {
               $0.targetLanguage.lowercased() == lang.lowercased()
           }) {
            return translated.url
        }
        return attachment.fileUrl
    }

    /// MediaKind for the current URL: original = `.audio`, translated =
    /// `.audioTranslation`. Discrimination based on presence in
    /// `translatedAudios` rather than `message.originalLanguage`, which may
    /// differ from the `nil` sentinel used by `selectedAudioLangCode`.
    private var currentMediaKind: MediaKind {
        guard let lang = selectedAudioLangCode,
              translatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.lowercased() })
        else { return .audio }
        return .audioTranslation
    }

    /// Prisme Linguistique — resolves the STARTING transcription-display
    /// language the same way `ConversationViewModel.preferredTranslation`
    /// resolves text: walk the ordered preference chain (systemLanguage >
    /// regionalLanguage > customDestinationLanguage > deviceLocale) and stop
    /// at the first candidate that either matches the original language
    /// (→ show original, `nil`) or has a matching translated-audio transcript
    /// (→ that language code). `nil` when nothing matches — the strip then
    /// defaults to the original, per the Prisme rule (never falls back to
    /// `.first`). Prisme audio-follow (2026-08-09) — this value now ALSO
    /// seeds which audio track plays, not just which transcription TEXT is
    /// shown: it flows into `AudioPlayerView`'s `initialTranscriptionLanguage`
    /// parameter, whose doc comment (`Sources/MeeshyUI/Media/AudioPlayerView.swift`,
    /// search "Prisme audio-follow (2026-08-09)") carries the full playback
    /// contract — see that doc rather than assuming playback is unaffected.
    /// Internal (not `private`) so `@testable import` can observe the
    /// resolution from MeeshyTests without exposing it publicly.
    internal var resolvedPreferredTranscriptionLanguage: String? {
        // Loi UNIQUE partagée avec `ConversationViewModel.playAudio` — la
        // bascule manuelle du drapeau (activeAudioLanguageOverride) prime,
        // sinon le Prisme parcourt les langues du lecteur dans l'ordre.
        // Sans la même loi des deux côtés, le widget affichait une piste
        // pendant que le coordinateur en jouait une autre.
        AudioTrackLanguageResolver.resolve(
            manualOverride: activeAudioLanguageOverride,
            originalLanguage: message.originalLanguage,
            preferredLanguages: ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved,
            translatedAudios: translatedAudios
        )
    }

    /// Cold-open (F1) : mappe un `AudioItem` vers l'`AudioFullscreenSource`
    /// consommée par le `.fullScreenCover`, en portant `nowPlayingContextName`
    /// / `queueTailProvider` — sans quoi un tap direct sur un vocal (aucune
    /// lecture déjà active) perdrait le contexte conversation : la carte Now
    /// Playing retomberait sur l'auteur seul et l'avance auto vers les
    /// vocaux non écoutés suivants ne se déclencherait jamais.
    /// `conversationName` vide (VM pas encore hydraté) est traité comme
    /// absent — laisse `AudioFullscreenSource` retomber sur l'auteur plutôt
    /// que d'afficher un titre vide. `queueTailProvider` capture
    /// `item.attachment.id` PAR ITEM (pas l'attachment actif à l'ouverture) :
    /// chaque page du pager doit résoudre SA PROPRE file "à suivre".
    /// Internal (pas `private`) pour que `@testable import` teste le mapping
    /// sans exposer publiquement le point de câblage.
    internal func fullscreenSource(for item: ConversationViewModel.AudioItem) -> AudioFullscreenSource {
        let contextName = (conversationName?.isEmpty ?? true) ? nil : conversationName
        let attachmentId = item.attachment.id
        return AudioFullscreenSource(
            from: item,
            nowPlayingContextName: contextName,
            queueTailProvider: audioQueueTailProvider.map { provider in
                { provider(attachmentId) }
            }
        )
    }

    /// Résout `resolvedAvailability` depuis l'URL courante (langue active).
    /// Ré-exécuté par `.task(id: currentAudioUrl)` quand l'URL bascule
    /// (file:// -> https:// à la réconciliation, ou changement de langue
    /// via `selectedAudioLangCode`).
    private func resolveAvailability() async {
        let urlString = currentAudioUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = AudioAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        resolvedAvailability = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            audioPlayer

            // Legacy caption rendering OUTSIDE the playerBackground (faded,
            // visually disconnected from the audio widget). Conservée pour le
            // cas où le caller N'EST PAS BubbleStandardLayout (galeries,
            // previews) qui n'utilise pas le flag `embedsCaptionInWidget`.
            // Quand le flag est levé (caption pattern SOTA), le caption est
            // rendu DANS playerBottomContent à la place — pas ici, sinon
            // doublon visuel.
            if !embedsCaptionInWidget
                && !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && visualAttachments.isEmpty {
                MessageTextRenderer.render(
                    message.content,
                    fontSize: 13,
                    color: isDark ? MeeshyColors.indigo400.opacity(0.5) : MeeshyColors.indigo500.opacity(0.4),
                    mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                    accentColor: Color(hex: contactColor),
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 4)
                .padding(.top, 2)
                .tint(Color(hex: contactColor))
            }
            if Self.shouldShowConsentNotice(isMe: parentIsMe, voiceConsentMissing: voiceConsentMissing) {
                AudioConsentNotice(
                    message: NSLocalizedString("audio.consent.notice.message", bundle: .main, comment: ""),
                    actionTitle: NSLocalizedString("audio.consent.notice.action", bundle: .main, comment: ""),
                    accentHex: accentColor,
                    onTap: { onTapConsentNotice?() }
                )
                .padding(.top, 6)
            }
        }
        .fullScreenCover(isPresented: $showAudioFullscreen) {
            AudioFullscreenView(
                // Cold-open (F1) : `fullscreenSource(for:)` câble
                // conversationName / audioQueueTailProvider (nowPlayingContextName
                // / queueTailProvider) sur CHAQUE item — un simple
                // `AudioFullscreenSource(from:)` les laissait à leurs défauts
                // (auteur seul, pas d'avance auto) même quand cette conversation
                // les avait déjà résolus.
                allAudioItems: allAudioItems.map(fullscreenSource(for:)),
                startAttachmentId: attachment.id,
                contactColor: contactColor,
                mentionDisplayNames: mentionDisplayNames,
                onDismissToMessage: onScrollToMessage
            )
        }
        .adaptiveOnChange(of: activeAudioLanguageOverride) { _, newLang in
            // Le drapeau de la RANGÉE parle en « override de message »
            // (nil = résolution Prisme, code = bascule explicite, langue
            // d'origine = V.O.) ; le widget parle en « langue de piste »
            // (nil = original). Le résolveur traduit l'un en l'autre —
            // notamment le retour à nil, qui doit RESTAURER la piste
            // traduite du Prisme, pas retomber sur l'original.
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedAudioLangCode = AudioTrackLanguageResolver.resolve(
                    manualOverride: newLang,
                    originalLanguage: message.originalLanguage,
                    preferredLanguages: ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved,
                    translatedAudios: translatedAudios
                )
            }
        }
        .task(id: attachment.id) {
            /*
             LE SEMIS DE LA LANGUE, PORTÉ PAR L'IDENTITÉ DE L'ATTACHMENT
             (retour porteur 2026-09-13 : « le switch ne se produit pas
             systématiquement ; parfois le premier fonctionne, tu vas sur un
             autre message et ça ne fonctionne plus »).

             `selectedAudioLangCode` n'était semé NULLE PART : son seul écrivain
             est l'`adaptiveOnChange(of: activeAudioLanguageOverride)` ci-dessus,
             dont l'`initial` vaut `false` — il ne tire pas à la première
             apparition. Sa valeur de départ était donc le `nil` de la
             déclaration, pendant que le player recevait, dans le MÊME appel,
             `initialTranscriptionLanguage: resolvedPreferredTranscriptionLanguage`
             — la descente JUSTE. Le pied montrait le drapeau de la V.O. quand la
             piste suivait le Prisme.

             Ce qui en fait la panne DÉCRITE : les cellules du fil sont des
             `UIHostingConfiguration` mises à jour EN PLACE au recyclage (aucune
             classe de cellule, aucun `prepareForReuse`). L'identité SwiftUI du
             sous-arbre ne change pas, donc le `@State` SURVIT d'un message à
             l'autre. Le message suivant héritait de la langue du précédent, et le
             verrou d'entrée du player (`guard code != selectedAudioLanguage`)
             AVALAIT la bascule : le tap partait au modèle, redescendait par
             `activeAudioLanguageOverride`, et ne changeait rien. D'où « le premier
             marche, le suivant non » — une dépendance à l'ORDRE DE VISITE, jamais
             à la règle.

             > Un `@State` semé seulement par un `onChange` n'a pas de valeur
             > initiale : il a celle du DERNIER usage de la vue. Sur une liste
             > recyclée, ce n'est pas un défaut, c'est un héritage.

             Porté par `attachment.id`, le semis est rejoué à chaque recyclage —
             l'événement même qui produisait l'héritage — et il DÉRIVE de la loi
             partagée (`AudioTrackLanguageResolver`), jamais d'une constante.

             Pas de `.id(content.messageId)` sur `standardLayout` (le miroir de ce
             que fait `stickerLayout`) : cela corrigerait ce défaut et ses cousins
             d'un coup, mais recréerait le sous-arbre de CHAQUE bulle à chaque
             recyclage — l'inverse de la fluidité, et de ce que le gate Equatable
             obtient. Les autres `@State` qui fuient ainsi (`revealedAttachmentIds`,
             `showCarousel`, `carouselIndex`) sont un lot à part, avec leur mesure.
            */
            selectedAudioLangCode = resolvedPreferredTranscriptionLanguage
        }
        .task(id: currentAudioUrl) {
            // Reset stale "cached" flag from a previous URL (e.g. previous
            // language) so resolveAvailability drives the truth for the new URL.
            // We never reset mid-download — a running DL belongs to the URL
            // that initiated it and must complete or be cancelled.
            // La façade suit la clé de la langue AFFICHÉE : un téléchargement
            // de cette URL lancé ailleurs (autre bulle, langue revenue) s'y lit
            // aussitôt, et l'état « en cache » n'appartient qu'à elle (#7492).
            downloader.observe(url: currentAudioUrl)
            await resolveAvailability()

            // Auto-DL when policy permits, the new URL isn't cached and no
            // DL is already running. The network condition + preferences are
            // both `@MainActor` singletons, safe to read from this `.task`
            // which inherits the view's MainActor isolation.
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: currentMediaKind, condition: condition, prefs: prefs
                ) {
                    triggerCurrentLanguageDownload()
                }
            }
        }
    }

    /// Triggers the download for the currently selected language's URL.
    /// Routes to `startTranslatedAudio` when the URL points to a translated
    /// audio, otherwise the standard attachment download.
    private func triggerCurrentLanguageDownload() {
        if currentMediaKind == .audioTranslation {
            downloader.startTranslatedAudio(url: currentAudioUrl, fileSize: 0)
        } else {
            downloader.start(attachment: attachment, onShare: nil)
        }
    }

    /// The final footer for the audio widget: the injected base model with
    /// the audio-language flags folded in, and `onFlagTap` wired to the audio
    /// language switch. One unified `BubbleFooter` — no separate flag row.
    ///
    /// **Règle** : le contrôleur translate (🌐) est câblé dès qu'un
    /// `onShowTranslationDetail` callback existe — même si aucune traduction
    /// audio n'est encore chargée. L'utilisateur doit pouvoir DEMANDER une
    /// autre langue à tout moment. Les drapeaux affichés à droite reflètent
    /// les variantes effectivement disponibles : la langue originale est
    /// toujours montrée (info), les langues traduites sont ajoutées au fur et
    /// à mesure qu'elles arrivent. La position du 🌐 ne dépend PAS du nombre
    /// de drapeaux (cf. `BubbleFooter.metaLeading`).
    private var audioFooter: (BubbleFooterModel, BubbleFooterActions)? {
        guard var model = footerModel else { return nil }
        var actions = footerActions

        let origCode = message.originalLanguage.lowercased()
        var codes = [origCode]
        for audio in translatedAudios {
            let code = audio.targetLanguage.lowercased()
            if code != origCode, !codes.contains(code) { codes.append(code) }
        }
        let active = (selectedAudioLangCode ?? origCode).lowercased()
        model.flags = codes.map { FooterFlag(code: $0, isActive: $0 == active) }
        model.showsTranslate = !translatedAudios.isEmpty && onShowTranslationDetail != nil

        if !translatedAudios.isEmpty {
            actions.onFlagTap = { code in
                HapticFeedback.light()
                // Canal du MESSAGE d'abord (VM → piste + texte + drapeau de
                // rangée suivent, y compris la lecture en cours via
                // syncActiveTrack) ; la sélection redescend par
                // `activeAudioLanguageOverride` → onChange. L'écriture
                // LOCALE n'est que le repli des surfaces sans VM — la
                // garder en plus du canal VM créerait deux vérités (revue
                // adversariale 2026-08-18).
                if let onSelectAudioLanguage {
                    onSelectAudioLanguage(code)
                    return
                }
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    selectedAudioLangCode = (code == origCode) ? nil : code
                }
            }
        }
        if let detail = onShowTranslationDetail {
            let messageId = message.id
            actions.onTranslate = { detail(messageId) }
        }

        return (model, actions)
    }

    /// Citation rendue dans le topSlot d'`AudioPlayerView` quand le message
    /// est une réponse hébergée par l'audio (`audioHostsReply`).
    @ViewBuilder
    private var replyTopSlot: some View {
        if let ref = replyReference {
            BubbleQuotedReply(
                style: .inline,
                skin: replySkin,
                reply: ref,
                parentIsMe: false,
                accentHex: accentColor,
                isDark: isDark,
                mentionDisplayNames: mentionDisplayNames,
                onQuotedAuthorTap: onQuotedAuthorTap,
                onQuotedMediaTap: onQuotedMediaTap
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard ref.opensQuotedTarget else { return }
                HapticFeedback.light()
                if replyIsStory {
                    onStoryReplyTap?(ref.messageId)
                } else {
                    onReplyTap?(ref.messageId)
                }
            }
        }
    }

    /// The playable audio widget. Trois variantes pour préserver la détection
    /// EmptyView du SDK (qui n'opère que sur le défaut littéral, pas sur un
    /// `_ConditionalContent<..., EmptyView>` issu d'un @ViewBuilder interne) :
    /// - reply présent → top (citation) + bottom (footer toujours injecté pour
    ///   `audioHostsReply`, garanti par la matrice du spec §4.4) ;
    /// - reply absent, footer présent → bottom seul (variant A historique) ;
    /// - reply absent, footer absent → aucun slot (variant B historique).
    @ViewBuilder
    private var audioPlayer: some View {
        // All three variants route through `AudioBubbleRouter`, which decides
        // (per body re-eval) whether to give `AudioPlayerView` the shared
        // coordinator engine (when this attachment is the coordinator's
        // `activeContext`) or its owned local engine (otherwise). The play
        // tap is intercepted via `onPlayRequest` and bubbled up through
        // `onPlayAudio` -> `BubbleStandardLayout` -> `ThemedMessageBubble`
        // -> `MessageListViewController` -> `ConversationViewModel.playAudio`,
        // which builds the queue and asks the coordinator to start.
        if replyReference != nil {
            AudioBubbleRouter(
                attachmentId: attachment.id,
                attachment: attachment,
                accentColorHex: contactColor,
                chrome: chrome,
                transcription: transcription,
                translatedAudios: translatedAudios,
                initialTranscriptionLanguage: resolvedPreferredTranscriptionLanguage,
                autoRevealTranscription: autoRevealTranscription,
                onFullscreen: { showAudioFullscreen = true },
                onRequestTranscription: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: false
                        )
                    }
                },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() },
                topContent: AnyView(replyTopSlot),
                bottomContent: AnyView(playerBottomContent),
                onPlayRequest: { onPlayAudio?(attachment.id) }
            )
        } else if footerModel != nil {
            AudioBubbleRouter(
                attachmentId: attachment.id,
                attachment: attachment,
                accentColorHex: contactColor,
                chrome: chrome,
                transcription: transcription,
                translatedAudios: translatedAudios,
                initialTranscriptionLanguage: resolvedPreferredTranscriptionLanguage,
                autoRevealTranscription: autoRevealTranscription,
                onFullscreen: { showAudioFullscreen = true },
                onRequestTranscription: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: false
                        )
                    }
                },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() },
                bottomContent: AnyView(playerBottomContent),
                onPlayRequest: { onPlayAudio?(attachment.id) }
            )
        } else {
            AudioBubbleRouter(
                attachmentId: attachment.id,
                attachment: attachment,
                accentColorHex: contactColor,
                chrome: chrome,
                transcription: transcription,
                translatedAudios: translatedAudios,
                initialTranscriptionLanguage: resolvedPreferredTranscriptionLanguage,
                autoRevealTranscription: autoRevealTranscription,
                onFullscreen: { showAudioFullscreen = true },
                onRequestTranscription: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: false
                        )
                    }
                },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() },
                onPlayRequest: { onPlayAudio?(attachment.id) }
            )
        }
    }

    /// Caption text rendered INSIDE the playerBackground when
    /// `embedsCaptionInWidget == true` (caption pattern SOTA, MIMI-aligned).
    /// Even fontSize and tinted color as the legacy external caption, but
    /// rendered above the footer in the same RoundedRectangle background —
    /// audio + text become one visual unit instead of two adjacent bubbles.
    @ViewBuilder
    private var inlineCaption: some View {
        let trimmed = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        if embedsCaptionInWidget && !trimmed.isEmpty {
            MessageTextRenderer.render(
                message.content,
                fontSize: 14,
                color: isDark ? Color.white.opacity(0.92) : MeeshyColors.indigo950.opacity(0.92),
                mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                accentColor: Color(hex: contactColor),
                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
            )
            .fixedSize(horizontal: false, vertical: true)
            .tint(Color(hex: contactColor))
        }
    }

    /// Footer rendered inside the audio widget (`AudioPlayerView.bottomContent`):
    /// a single unified `BubbleFooter` — audio-language flags + translate on
    /// the leading edge, timestamp + delivery pinned trailing. Combined with
    /// `inlineCaption` when the caption pattern is active.
    @ViewBuilder
    private var playerBottomContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            inlineCaption
            if let (model, actions) = audioFooter {
                BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
                    .equatable()
            }
        }
    }

}
