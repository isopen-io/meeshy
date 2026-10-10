import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView header
//
// Extrait de `StoryViewerView+Sidebar.swift` (#4084, vue `2f`) : ce fichier
// portait DEUX vues entières — le rail d'actions et l'en-tête — pour
// 1 368 lignes, bien au-delà du budget de 800–1100. La loi 4 de `BOUCLE.md`
// est nette : « un fichier hors budget se découpe par responsabilité AVANT
// qu'une vue lui ajoute quoi que ce soit ». L'en-tête est une responsabilité
// entière : l'identité de l'auteur, l'heure de publication, l'attribution de
// republication, le crédit du son de fond et le menu d'options.
//
// Ce que la vue `2f` établit, et que cet en-tête porte :
//
// > « Le crédit du son est dans l'en-tête, le muet dans le rail. Le muet reste
// > local à la surface : le couper ici ne coupe rien dans le fil, et l'annonce
// > ne disparaît jamais parce qu'on a coupé le son. »

// MARK: - Le menu « … » de la story, en quelques entrées (#9953)

/// **Une story se quitte par le glissement vers le bas ; « Fermer » est la
/// DERNIÈRE entrée du menu « … »** (porteur, 2026-10-10). Le (X) de l'en-tête
/// a quitté l'écran : le geste ferme déjà, et le menu offre la sortie quand le
/// geste n'est pas disponible (VoiceOver, Switch Control).
///
/// Le même menu pour TOUT lecteur, sa story ou celle d'un autre : la lecture
/// (plein écran, transcription), « Composer », UN sous-menu « Partager »
/// (exporter en vidéo, partager à un ami), l'action sur la story (signaler, ou
/// supprimer la sienne), puis « Fermer ». Envoyer et republier restent au rail.
nonisolated enum StoryOptionsMenuEntry: Hashable {
    case fullscreen
    case transcript
    case compose
    case share
    case report
    case delete
    case close
}

/// Le sous-menu « Partager ».
/// - `exportVideo` : la feuille d'export au choix de la LANGUE
///   (`StoryExportShareSheet`), qu'offrait le bouton « Partager » du rail auteur.
/// - `shareWithFriend` : la feuille du système — le lien traçable, et le
///   fichier pour « Enregistrer la vidéo », AirDrop, Fichiers.
nonisolated enum StoryShareMenuEntry: Hashable {
    case exportVideo
    case shareWithFriend
}

nonisolated struct StoryOptionsMenuPlan: Equatable {
    let sections: [[StoryOptionsMenuEntry]]
    let shareEntries: [StoryShareMenuEntry]

    var entries: [StoryOptionsMenuEntry] { sections.flatMap { $0 } }

    /// `isPublicStory` ne garde que « Partager à un ami » : son lien
    /// `meeshy.me/l/…` s'ouvre sans compte et élargirait l'audience d'une story
    /// FRIENDS ou PRIVATE. L'export vidéo, lui, est offert sur toute story —
    /// comme l'était « Enregistrer » (#8823).
    static func resolve(
        hasStory: Bool,
        isOwnStory: Bool,
        isPublicStory: Bool,
        hasAudioTranscript: Bool,
        canCompose: Bool
    ) -> StoryOptionsMenuPlan {
        let reading: [StoryOptionsMenuEntry] = hasAudioTranscript ? [.fullscreen, .transcript] : [.fullscreen]
        guard hasStory else {
            return StoryOptionsMenuPlan(sections: [reading, [.close]], shareEntries: [])
        }
        let composing: [StoryOptionsMenuEntry] = canCompose ? [.compose] : []
        let sharing: [StoryShareMenuEntry] = isPublicStory ? [.exportVideo, .shareWithFriend] : [.exportVideo]
        let acting: StoryOptionsMenuEntry = isOwnStory ? .delete : .report
        return StoryOptionsMenuPlan(
            sections: [reading, composing, [.share], [acting], [.close]].filter { !$0.isEmpty },
            shareEntries: sharing
        )
    }
}

// MARK: - Story Header

/// Top header bar of the story viewer: author avatar + name + timestamp and
/// the kebab options menu — no close button: the swipe down closes, and
/// « Fermer » is the last entry of the menu (#9953). Extracted from
/// `StoryViewerView.storyHeader` (formerly an `AnyView`).
struct StoryHeaderView: View {
    let currentGroup: StoryGroup?
    let currentStory: StoryItem?
    let isOwnStory: Bool
    /// Annonce du fond (B3.3-5), résolue par le parent — primitive
    /// Equatable descendue en `let` (règle « Zero Unnecessary Re-render »).
    /// Remplace `hasBackgroundAudio` + `headerAudioDisplay` (E1) : un seul
    /// résolveur partagé avec la carte de post et le plein écran réel,
    /// `BackgroundSoundBadge.announcement(for:)`.
    let backgroundSoundAnnouncement: BackgroundAudioAnnouncement
    /// Le muet du lecteur — le MÊME état que le rail (#9677) : la note du crédit
    /// le bascule, le baffle du rail ne reste que pour un autre son.
    @Binding var isGlobalMuted: Bool
    /// La story porte-t-elle une transcription affichable ? Primitive, même
    /// règle : le header ne consulte pas les `StoryEffects` lui-même.
    let hasAudioTranscript: Bool
    /// Bascule d'affichage de la transcription, pilotée depuis le menu « … ».
    @Binding var showAudioTranscript: Bool

    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
    @Binding var showReportSheet: Bool

    /// Holds the freshly-minted `meeshy.me/l/<token>` URL for the current
    /// story share — the sheet at the end of `body` presents the system
    /// share UI as soon as it's non-nil and clears it on dismiss.
    @State private var shareableStoryLink: ShareableLink?

    /// Mints a TrackingLink for the given story (gateway route is shared
    /// with posts — a story IS a `PostType.STORY`), then surfaces the
    /// `meeshy.me/l/<token>` URL through `shareableStoryLink` so the
    /// system share sheet picks it up. Falls back to the raw URL when the
    /// mint fails so the user always has something to share.
    @MainActor
    private func mintAndShareStory(_ story: StoryItem) async {
        let storyId = story.id
        let fallback = makeStoryExternalShareURL(storyId)
        do {
            let result = try await PostService.shared.share(
                postId: storyId,
                platform: "system",
                generateLink: true
            )
            if let shortUrl = result.shortUrl, let url = URL(string: shortUrl) {
                shareableStoryLink = ShareableLink(url: url, fileSource: .story(story, authorUsername: currentGroup?.username))
                HapticFeedback.light()
                return
            }
        } catch {
            // intentional fall-through: try raw URL fallback
        }
        if let fallback {
            shareableStoryLink = ShareableLink(url: fallback, fileSource: .story(story, authorUsername: currentGroup?.username))
            HapticFeedback.light()
        } else {
            FeedbackToastManager.shared.showError(
                String(localized: "story.viewer.share.link.unavailable", defaultValue: "Lien indisponible", bundle: .main))
        }
    }

    /// Partage INTERNE, « Republier en post » et « Citer en post » ont quitté le
    /// menu (#9953) : « Envoyer » et « Republier » restent au rail. Leurs liens
    /// restent câblés jusqu'ici pour qu'un retour au menu ne coûte qu'une entrée.
    @Binding var sharedContentWrapper: SharedContentWrapper?

    /// « Partager ▸ Exporter en vidéo » (#9953) : la feuille d'export au choix
    /// de la langue, présentée par le lecteur.
    @Binding var showExportShareSheet: Bool

    let makeStoryExternalShareURL: (String) -> URL?
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let pauseTimer: () -> Void
    let dismissViewer: () -> Void
    let reportStory: @MainActor (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    /// Toggle mode plein écran (session-scoped) exposé dans le menu hamburger.
    /// Quand `true`, le chrome est caché par défaut pour la session entière
    /// jusqu'au prochain toggle. Reseté par le parent quand le viewer se
    /// ferme — pas de persistance cross-session voulue.
    @Binding var isFullscreenStorySession: Bool
    /// Visibilité courante du chrome — utilisée pour synchroniser
    /// instantanément le glissement à l'activation du mode plein écran
    /// (`isFullscreenStorySession = true` ⇒ `chromeVisible = false`).
    @Binding var chromeVisible: Bool

    /// **L'en-tête DEMANDE, il ne présente pas** (#6085).
    ///
    /// Il est reconstruit à chaque tick de la barre de progression : un `@State`
    /// de cible y meurt entre le tap du menu et la passe de rendu suivante —
    /// mesuré au simulateur, l'entrée s'affichait et rien ne s'ouvrait. La
    /// présentation vit donc chez `StoryViewerContainer`, la racine STABLE du
    /// cover, et cette fermeture est le seul lien.
    ///
    /// `nil` ⇒ aucune entrée (loi 4 : un contrôle existe s'il a un effet). C'est
    /// aussi ce qui tient l'aperçu du composer hors du menu : il monte le
    /// lecteur SANS conteneur, donc sans hôte de présentation.
    @Environment(\.meeshyComposeSeedRequest) private var demanderComposer: ((ComposerSeedTarget) -> Void)?
    /// Le menu « … » ouvert fait BOUCLER la story (#9821) : l'en-tête le dit au
    /// lecteur, qui seul survit aux ticks de la barre.
    @Environment(\.storyOptionsMenuPresenceChange) private var optionsMenuPresenceChange: ((Bool) -> Void)?

    /// La cible résolue pour la slide COURANTE. Cachée : l'en-tête est reconstruit à chaque
    /// tick de la barre de progression, et le contenu d'un `Menu` est construit
    /// avec lui — résoudre la règle d'offre en ligne la rejouerait des dizaines
    /// de fois par seconde, en re-bridant les médias à chaque passe.
    @State private var composableSlide: ComposerSeedTarget?

    @State private var avatarLongPressGlow = false
    /// Cache du label VoiceOver du bouton profil auteur — recalculé
    /// UNIQUEMENT au changement de slide (`.onChange(of: currentStory?.id)`),
    /// jamais inline dans `body`. `StoryHeaderView` est reconstruit à chaque
    /// tick de la barre de progression (jusqu'à 60 Hz, cf.
    /// `StoryViewerView.storyCard(geometry:)`) — sans ce cache, `String
    /// (format:)` + plusieurs `String(localized:)` s'exécutaient des
    /// dizaines de fois par seconde pour un contenu inchangé (post-revue
    /// 2026-07-13, angle optimisation).
    @State private var cachedProfileLabel: String = ""

    /// Label VoiceOver du bouton profil auteur — inclut l'attribution de
    /// republication (icône + @handle visuels que ce label unique remplace).
    private func computeProfileLabel(for group: StoryGroup) -> String {
        guard let story = currentStory, story.repostOfId != nil,
              let handle = story.repostAuthorUsername ?? story.repostAuthorName else {
            return String(localized: "story.viewer.a11y.profileOf", defaultValue: "Profil de \(group.username)", bundle: .main)
        }
        return String(
            format: String(localized: "story.viewer.a11y.profileOf.repost", defaultValue: "Profil de %@, republication de @%@", bundle: .main),
            group.username, handle
        )
    }

    var body: some View {
        HStack(spacing: FullscreenChromeMetrics.barSpacing) {
            if let group = currentGroup {
                Button {
                    HapticFeedback.light()
                    selectedProfileUser = .from(storyGroup: group)
                } label: {
                    // Vue `2f` — l'heure appartient à la ligne du NOM : elle qualifie
                    // l'AUTEUR, le crédit du son (sa propre ligne, dessous) qualifie le
                    // CONTENU. Nom borné à 16 caractères comme dans les bulles de
                    // conversation (directive user 2026-07-30). Republication : icône +
                    // "@handle", sans « via » (directive user 2026-07-13).
                    FullscreenIdentityRow(
                        name: DisplayName.truncated(group.username),
                        subtitle: currentStory?.timeAgo,
                        avatar: {
                            ZStack {
                                // Glow radial au long press
                                if avatarLongPressGlow {
                                    Circle()
                                        .fill(
                                            RadialGradient(
                                                colors: [
                                                    Color(hex: group.avatarColor).opacity(0.4),
                                                    MeeshyColors.indigo500.opacity(0.2),
                                                    .clear
                                                ],
                                                center: .center,
                                                startRadius: 15,
                                                endRadius: 35
                                            )
                                        )
                                        .frame(width: 70, height: 70)
                                        .blur(radius: 8)
                                        .transition(.scale(scale: 0.8).combined(with: .opacity))
                                        .allowsHitTesting(false)
                                }

                                // Pas de bordure gradient autour de l'avatar dans la
                                // slide : on est déjà dans la story de l'utilisateur,
                                // l'anneau « story dispo » serait redondant (cf. user
                                // request 2026-05-27). Le contexte `.storyViewer` suffit
                                // déjà à masquer l'anneau via `showsStoryRing == false`.
                                MeeshyAvatar(
                                    name: group.username,
                                    context: .storyViewer,
                                    accentColor: group.avatarColor,
                                    avatarURL: group.avatarURL,
                                    onViewProfile: { selectedProfileUser = .from(storyGroup: group) },
                                    contextMenuItems: [
                                        AvatarContextMenuItem(
                                            label: String(localized: "story.viewer.viewProfile", defaultValue: "Voir le profil", bundle: .main),
                                            icon: "person.fill"
                                        ) {
                                            selectedProfileUser = .from(storyGroup: group)
                                        }
                                    ]
                                )
                                .scaleEffect(avatarLongPressGlow ? 1.05 : 1.0)
                            }
                            .onLongPressGesture(minimumDuration: 0.4) {
                                HapticFeedback.medium()
                                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                    avatarLongPressGlow = false
                                }
                                selectedProfileUser = .from(storyGroup: group)
                            } onPressingChanged: { pressing in
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    avatarLongPressGlow = pressing
                                }
                            }
                        },
                        accessory: {
                            if let story = currentStory, story.repostOfId != nil {
                                HStack(spacing: MeeshySpacing.xsPlus) {
                                    Image(systemName: FullscreenChromeSymbol.repost)
                                        .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                                        .accessibilityHidden(true)
                                    if let handle = story.repostAuthorUsername ?? story.repostAuthorName {
                                        Text("@\(handle)")
                                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                                            .lineLimit(1)
                                    }
                                }
                                .foregroundStyle(MeeshyColors.mediaChromeTertiary)
                            }

                            // Vue `2f` — le crédit du son occupe sa PROPRE ligne, sous la
                            // ligne du nom : qui a republié et à qui appartient la musique
                            // sont deux attributions distinctes, une ligne chacune retire la
                            // concurrence au lieu d'arbitrer entre deux troncatures.
                            // `BackgroundSoundBadge` rend `EmptyView` sans piste (B3.5) ; elle
                            // ne dépend JAMAIS du muet. Accent FIXE (pas `group.avatarColor`) :
                            // l'en-tête se pose sur un média arbitraire.
                            //
                            // Directive porteur 2026-10-08 (#9677) : la NOTE coupe le son
                            // de fond et se barre — plus de baffle pour ce son. Le crédit
                            // vit dans le bouton du profil : le toucher passe par un geste
                            // PRIORITAIRE (comme le rail), VoiceOver par l'action nommée
                            // du bouton parent.
                            BackgroundSoundBadge(
                                announcement: backgroundSoundAnnouncement,
                                accentHex: BackgroundSoundBadge.overMediaAccentHex,
                                isMuted: isGlobalMuted
                            )
                            .equatable()
                            .padding(.vertical, MeeshySpacing.md)
                            .contentShape(Rectangle())
                            .padding(.vertical, -MeeshySpacing.md)
                            .highPriorityGesture(TapGesture().onEnded {
                                StoryGlobalMute.toggle($isGlobalMuted)
                            })
                        }
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                // Le bouton porte un SEUL accessibilityLabel qui remplace tout
                // le contenu de son label closure (icône repost + @handle
                // inclus) — VoiceOver ne lirait jamais la republication sans
                // l'inclure explicitement ici (post-revue 2026-07-13).
                .accessibilityLabel(cachedProfileLabel)
                .accessibilityAction(named: Text(BackgroundSoundMuteControl.accessibilityLabel(isMuted: isGlobalMuted))) {
                    guard BackgroundSoundBadge.showsMuteButton(for: backgroundSoundAnnouncement) else { return }
                    StoryGlobalMute.toggle($isGlobalMuted)
                }
                .accessibilityHint(String(localized: "story.viewer.a11y.profileOf.hint", defaultValue: "Ouvre le profil de \(group.username)", bundle: .main))
                .onAppear { cachedProfileLabel = computeProfileLabel(for: group) }
                .adaptiveOnChange(of: currentStory?.id) { _, _ in
                    cachedProfileLabel = computeProfileLabel(for: group)
                }
            }

            Spacer(minLength: 0)

            // Le menu « … » rend le plan, section par section (#9953) : sa
            // composition se décide dans `StoryOptionsMenuPlan`, jamais ici.
            FullscreenMoreMenu(onPresentationChange: optionsMenuPresenceChange) {
                let plan = optionsMenuPlan
                ForEach(plan.sections, id: \.self) { section in
                    Section {
                        ForEach(section, id: \.self) { entry in
                            optionsMenuItem(entry, shareEntries: plan.shareEntries)
                        }
                    }
                }
            }
            .accessibilityLabel(String(localized: "story.viewer.a11y.options", defaultValue: "Options de la story", bundle: .main))
        }
        .padding(.horizontal, FullscreenTopBarLayout.horizontalPadding)
        .adaptiveOnChange(of: currentStory?.id, initial: true) { _, _ in
            composableSlide = resolveComposableSlide()
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportMessageSheet(accentColor: currentGroup?.avatarColor ?? "FF2D55") { type, reason in
                guard let storyId = currentStory?.id else { return }
                Task {
                    do {
                        try await reportStory(storyId, type, reason)
                        DispatchQueue.main.async {
                            HapticFeedback.success()
                            showReportSheet = false
                        }
                    } catch {
                        DispatchQueue.main.async {
                            HapticFeedback.error()
                            showReportSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $shareableStoryLink) { link in
            // Trackable `meeshy.me/l/<token>` URL minted in
            // `mintAndShareStory` — the author owns the analytics.
            ShareSheet(activityItems: link.activityItems)
        }
    }

    private var optionsMenuPlan: StoryOptionsMenuPlan {
        StoryOptionsMenuPlan.resolve(
            hasStory: currentStory != nil && currentGroup != nil,
            isOwnStory: isOwnStory,
            isPublicStory: currentStory?.isPublic ?? false,
            hasAudioTranscript: hasAudioTranscript,
            canCompose: composableSlide != nil && demanderComposer != nil
        )
    }

    @ViewBuilder
    private func optionsMenuItem(_ entry: StoryOptionsMenuEntry, shareEntries: [StoryShareMenuEntry]) -> some View {
        switch entry {
        case .fullscreen:
            // Plein écran (session) : au repos, le chrome suit le mode — caché
            // s'il est actif, visible sinon ; le touch-and-hold l'inverse.
            Button {
                HapticFeedback.light()
                isFullscreenStorySession.toggle()
                withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                    chromeVisible = !isFullscreenStorySession
                }
            } label: {
                Label(
                    isFullscreenStorySession
                        ? String(localized: "story.viewer.fullscreen.exit", defaultValue: "Quitter le plein écran", bundle: .main)
                        : String(localized: "story.viewer.fullscreen.enter", defaultValue: "Plein écran", bundle: .main),
                    systemImage: isFullscreenStorySession
                        ? "arrow.down.right.and.arrow.up.left"
                        : "arrow.up.left.and.arrow.down.right"
                )
            }
        case .transcript:
            // Item 7a : la transcription vit dans les options, jamais en
            // bandeau permanent ; elle suit la langue choisie par « Traductions ».
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAudioTranscript.toggle()
                }
            } label: {
                Label(
                    showAudioTranscript
                        ? String(localized: "story.viewer.transcript.hide", defaultValue: "Masquer la transcription", bundle: .main)
                        : String(localized: "story.viewer.transcript.show", defaultValue: "Afficher la transcription", bundle: .main),
                    systemImage: showAudioTranscript ? "captions.bubble.fill" : "captions.bubble"
                )
            }
        case .compose:
            // « Composer » (#6085) : même libellé et même glyphe que dans la
            // conversation ; l'éventail du meuble offre story, réel ou post.
            // L'en-tête DEMANDE, le conteneur présente.
            if let cible = composableSlide, let demanderComposer {
                Button {
                    HapticFeedback.light()
                    pauseTimer()
                    demanderComposer(cible)
                } label: {
                    Label(String(localized: "message.compose.title", defaultValue: "Composer", bundle: .main),
                          systemImage: "wand.and.stars")
                }
            }
        case .share:
            Menu {
                ForEach(shareEntries, id: \.self) { shareMenuItem($0) }
                    .onAppear { optionsMenuPresenceChange?(true) }
            } label: {
                Label(String(localized: "story.viewer.action.share", defaultValue: "Partager", bundle: .main),
                      systemImage: "square.and.arrow.up")
            }
        case .report:
            Button(role: .destructive) {
                showReportSheet = true
            } label: {
                Label(String(localized: "story.viewer.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
            }
        case .delete:
            Button(role: .destructive) {
                deleteCurrentStory()
            } label: {
                Label(String(localized: "story.viewer.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
            }
        case .close:
            Button {
                dismissViewer()
            } label: {
                Label(String(localized: "common.close", defaultValue: "Fermer", bundle: .main),
                      systemImage: FullscreenChromeSymbol.close)
            }
        }
    }

    @ViewBuilder
    private func shareMenuItem(_ entry: StoryShareMenuEntry) -> some View {
        switch entry {
        case .exportVideo:
            // La feuille d'export EXISTANTE, au choix de la langue, présentée
            // par le lecteur. Posée SUR la story : elle boucle (#9821).
            Button {
                HapticFeedback.light()
                showExportShareSheet = true
            } label: {
                Label(String(localized: "story.export.share.title", defaultValue: "Exporter en vidéo", bundle: .main), systemImage: "film")
            }
        case .shareWithFriend:
            // La feuille du système : le lien traçable `meeshy.me/l/<token>`,
            // frappé au tap, et le fichier rendu à la demande.
            if let story = currentStory {
                Button {
                    Task { await mintAndShareStory(story) }
                } label: {
                    Label(String(localized: "story.viewer.share.friend", defaultValue: "Partager à un ami", bundle: .main), systemImage: "person.2")
                }
            }
        }
    }

    /// **La règle d'offre décide, pas le menu** (critère 2 de #6085). Une slide
    /// à deux médias, une slide sans média ni texte : aucune cible, donc aucune
    /// entrée. Le Prisme du lecteur descend sur le texte qui pré-remplira la
    /// description — la graine d'un composer est du CONTENU, et le Prisme
    /// s'applique à tout le contenu.
    private func resolveComposableSlide() -> ComposerSeedTarget? {
        guard demanderComposer != nil, let story = currentStory else { return nil }
        return ComposerSeedTarget(
            story: story,
            preferredLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        )
    }
}

/// **Le muet du lecteur de story, une seule bascule** (#9677) — le rail (baffle)
/// et la note du crédit l'appellent tous deux : basculer l'état ET prévenir le
/// canvas, jamais l'un sans l'autre.
enum StoryGlobalMute {
    static func toggle(_ isMuted: Binding<Bool>) {
        HapticFeedback.light()
        isMuted.wrappedValue.toggle()
        NotificationCenter.default.post(
            name: isMuted.wrappedValue ? .storyComposerMuteCanvas : .storyComposerUnmuteCanvas,
            object: nil
        )
    }
}
