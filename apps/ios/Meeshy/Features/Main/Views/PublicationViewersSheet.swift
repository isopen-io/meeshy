import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Qui a vu — et ce que chacun a fait (#9727)

/// Une ligne de la liste des vues : l'identité de la personne et ce qu'elle a
/// fait sur CE contenu (story, post ou réel).
struct StoryViewerItem: Identifiable, Equatable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let viewedAt: Date
    let reactionEmoji: String?
    let engagement: PostViewerEngagement
}

/// Ce que la feuille montre : une story (ses textes historiques) ou une
/// publication du fil — post ou réel.
enum PublicationViewersSubject: Equatable {
    case story
    case publication
}

/// La feuille « Vues » d'une STORY — l'enveloppe historique, qui résout
/// l'humeur depuis le `StatusViewModel` du lecteur. Le corps est
/// `PublicationViewersSheet`, partagé avec les posts et les réels.
struct StoryViewersSheet: View {
    let story: StoryItem
    let accentColor: Color
    /// Mood resolution (local-first). Passed explicitly rather than via
    /// `@EnvironmentObject` so it survives the sheet boundary.
    @ObservedObject var statusViewModel: StatusViewModel
    /// Opens the tapped viewer's profile. Owned by the presenter so the sheet
    /// never reaches a `Router` `@EnvironmentObject` across its boundary.
    let onOpenProfile: (StoryViewerItem) -> Void

    var body: some View {
        PublicationViewersSheet(
            postId: story.id,
            viewCount: story.viewCount,
            impressionCount: story.impressionCount,
            subject: .story,
            accentColor: accentColor,
            moodEmoji: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
            moodTapHandler: { statusViewModel.moodTapHandler(for: $0) },
            onOpenProfile: onOpenProfile
        )
    }
}

/// LA LISTE DES PERSONNES QUI ONT VU UN CONTENU — story, post ou réel — et,
/// sous chaque nom, ce que la personne y a fait : ses réactions, ses
/// commentaires, ses réponses, ses republications, ses partages, son favori.
/// Un compteur à zéro ne se dessine pas (`PostViewerEngagement.marks`) : la
/// ligne reste aérée. Servie par `GET /posts/:postId/interactions`, à l'AUTEUR
/// seul (et ADMIN/BIGBOSS).
///
/// **Toucher une ligne REBONDIT et pousse son DÉTAIL** dans la pile de la
/// feuille : ce que la personne a fait, en toutes lettres, et « Voir le
/// profil ». Le retour natif rend la liste.
///
/// Miroir web : `apps/web/src/components/publication-viewers-sheet.tsx`.
struct PublicationViewersSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    let postId: String
    let viewCount: Int?
    let impressionCount: Int?
    let subject: PublicationViewersSubject
    let accentColor: Color
    let moodEmoji: (String) -> String?
    let moodTapHandler: (String) -> ((CGPoint) -> Void)?
    let onOpenProfile: (StoryViewerItem) -> Void

    private var isDark: Bool { colorScheme == .dark }

    @State private var viewers: [StoryViewerItem] = []
    @State private var isLoading = true
    @State private var openedViewer: StoryViewerItem?
    // Coalescing anti-course pour le re-fetch temps réel : une rafale de
    // `story:viewed` ne doit pas lancer N fetches `/interactions` concurrents
    // (ils peuvent se terminer dans le désordre → liste momentanément périmée).
    // `isRefreshing` = un seul fetch en vol ; `refreshQueued` = un événement est
    // arrivé pendant le fetch → on relance EXACTEMENT une fois à la fin.
    @State private var isRefreshing = false
    @State private var refreshQueued = false

    var body: some View {
        NavigationStack {
            ZStack {
                isDark ? Color.black.ignoresSafeArea() : Color(UIColor.systemGroupedBackground).ignoresSafeArea()

                if isLoading {
                    ProgressView(String(localized: "story.viewer.loading", defaultValue: "Chargement…", bundle: .main))
                        .tint(accentColor)
                } else if viewers.isEmpty {
                    EmptyStateView(
                        icon: "eye.slash",
                        title: String(localized: "story.viewer.empty.title", defaultValue: "Aucune vue pour le moment", bundle: .main),
                        subtitle: subject == .story
                            ? String(localized: "story.viewer.empty.subtitle", defaultValue: "Les personnes qui regardent votre story apparaîtront ici.", bundle: .main)
                            : String(localized: "viewer.engagement.empty.subtitle", defaultValue: "Les personnes qui verront cette publication apparaîtront ici.", bundle: .main)
                    )
                } else {
                    List {
                        // C4 + C1 : en-tête = viewCount AUTORITATIF (dénormalisé, la même
                        // valeur que le bouton « Vues ») + les impressions (author-only).
                        Section(header: Text(String(localized: "story.viewer.viewsAndImpressions", defaultValue: "\(viewCount ?? viewers.count) Vues · \(impressionCount ?? 0) impressions", bundle: .main))
                            .font(.headline)
                            .foregroundColor(.primary)
                            .textCase(nil)
                        ) {
                            ForEach(viewers) { viewer in
                                viewerRow(viewer)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle(String(localized: "story.viewer.views.title", defaultValue: "Vues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        dismiss()
                    }
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                    .foregroundColor(accentColor)
                }
            }
            .navigationDestination(isPresented: Binding(
                get: { openedViewer != nil },
                set: { if !$0 { openedViewer = nil } }
            )) {
                if let viewer = openedViewer {
                    ViewerEngagementDetailView(
                        viewer: viewer,
                        accentColor: accentColor,
                        moodEmoji: moodEmoji(viewer.id),
                        onOpenProfile: { onOpenProfile(viewer) }
                    )
                }
            }
            .task {
                await loadViewers()
            }
            // Temps réel : chaque `story:viewed` de CE contenu re-fetch la liste
            // enrichie. Silencieux (pas de spinner : `loadViewers` ne repasse pas
            // `isLoading` à true). Un post ou un réel n'émet pas cet événement :
            // sa liste se relit à l'ouverture.
            .onReceive(SocialSocketManager.shared.storyViewed) { viewedData in
                guard viewedData.storyId == postId else { return }
                Task { await loadViewers() }
            }
        }
    }

    private func viewerRow(_ viewer: StoryViewerItem) -> some View {
        Button {
            HapticFeedback.light()
            openedViewer = viewer
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: viewer.displayName,
                    context: .storyViewerRow,
                    avatarURL: viewer.avatarUrl,
                    moodEmoji: moodEmoji(viewer.id),
                    presenceState: PresenceManager.shared.resolvedState(userId: viewer.id, isOnline: nil),
                    onViewProfile: { onOpenProfile(viewer) },
                    onMoodTap: moodTapHandler(viewer.id)
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    HStack {
                        Text(viewer.displayName)
                            .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Spacer()

                        Text(viewer.viewedAt, style: .time)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize))
                            .foregroundColor(.secondary)
                    }

                    let marks = viewer.engagement.marks
                    if !marks.isEmpty {
                        ViewerEngagementStrip(marks: marks, accentColor: accentColor)
                    }
                }
            }
            .padding(.vertical, MeeshySpacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(GameBounceButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(ViewerEngagementWording.accessibilityLabel(for: viewer))
        .accessibilityHint(String(localized: "viewer.engagement.openDetail.hint", defaultValue: "Ouvre ce que cette personne a fait", bundle: .main))
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(isDark ? Color(UIColor.secondarySystemGroupedBackground) : Color.white)
    }

    private func loadViewers() async {
        // Un seul fetch en vol : si un autre tourne déjà, on note qu'un refresh
        // est dû (`refreshQueued`) et on sort — le fetch courant le rejouera.
        let shouldStart = await MainActor.run { () -> Bool in
            if isRefreshing { refreshQueued = true; return false }
            isRefreshing = true
            return true
        }
        guard shouldStart else { return }

        repeat {
            await MainActor.run { refreshQueued = false }
            // nil ⇒ « chargement impossible » (journalisé par le service) : la
            // liste précédente reste en place.
            let snapshots = await StoryInteractionService().loadViewers(storyId: postId)
            await MainActor.run {
                if let snapshots {
                    self.viewers = snapshots.map { s in
                        StoryViewerItem(
                            id: s.id,
                            username: s.username,
                            displayName: s.displayName,
                            avatarUrl: s.avatarUrl,
                            viewedAt: s.viewedAt,
                            reactionEmoji: s.reactionEmoji,
                            engagement: s.engagement
                        )
                    }
                }
                self.isLoading = false
            }
        } while await MainActor.run(body: { refreshQueued })

        await MainActor.run { isRefreshing = false }
    }
}

// MARK: - La rangée compacte sous le nom

/// Les emojis, puis glyphe + nombre ; décorative pour VoiceOver — la ligne
/// porte la phrase complète (`ViewerEngagementWording`).
private struct ViewerEngagementStrip: View {
    let marks: [PostViewerEngagement.Mark]
    let accentColor: Color

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(marks, id: \.self) { mark in
                switch mark {
                case .reactions(let emojis):
                    Text(emojis.joined(separator: " "))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize))
                case .bookmarked:
                    Image(systemName: ViewerEngagementWording.symbol(for: mark))
                        .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                        .foregroundColor(accentColor)
                case .comments(let count), .replies(let count), .reposts(let count), .shares(let count):
                    HStack(spacing: MeeshySpacing.xxs) {
                        Image(systemName: ViewerEngagementWording.symbol(for: mark))
                            .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                        Text("\(count)")
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                    }
                    .foregroundColor(.secondary)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Le détail d'une personne

/// Ce qu'UNE personne a fait sur ce contenu, en toutes lettres, et le chemin
/// vers son profil.
struct ViewerEngagementDetailView: View {
    let viewer: StoryViewerItem
    let accentColor: Color
    let moodEmoji: String?
    let onOpenProfile: () -> Void

    var body: some View {
        List {
            Section {
                VStack(spacing: MeeshySpacing.sm) {
                    MeeshyAvatar(
                        name: viewer.displayName,
                        context: .profileSheet,
                        avatarURL: viewer.avatarUrl,
                        moodEmoji: moodEmoji
                    )
                    .padding(.vertical, MeeshySpacing.sm)
                    .accessibilityHidden(true)

                    Text(viewer.displayName)
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                    Text(String(
                        format: String(localized: "viewer.engagement.viewedAt", defaultValue: "Vu à %@", bundle: .main),
                        viewer.viewedAt.formatted(date: .omitted, time: .shortened)
                    ))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                    .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }

            Section(header: Text(String(localized: "viewer.engagement.detail.title", defaultValue: "Sur ce contenu", bundle: .main))) {
                let marks = viewer.engagement.marks
                if marks.isEmpty {
                    Text(String(localized: "viewer.engagement.onlyViewed", defaultValue: "A vu, sans autre interaction", bundle: .main))
                        .foregroundColor(.secondary)
                } else {
                    ForEach(marks, id: \.self) { mark in
                        Label {
                            Text(ViewerEngagementWording.sentence(for: mark))
                        } icon: {
                            Image(systemName: ViewerEngagementWording.symbol(for: mark))
                                .foregroundColor(accentColor)
                        }
                    }
                }
            }

            Section {
                Button {
                    HapticFeedback.light()
                    onOpenProfile()
                } label: {
                    Text(String(localized: "viewer.engagement.openProfile", defaultValue: "Voir le profil", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                        .foregroundColor(accentColor)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(viewer.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Les mots et les glyphes

/// UNE source pour la phrase et le glyphe de chaque marque — la ligne, le
/// détail et VoiceOver lisent les mêmes mots.
enum ViewerEngagementWording {
    static func symbol(for mark: PostViewerEngagement.Mark) -> String {
        switch mark {
        case .reactions: return "face.smiling"
        case .comments: return "bubble.left"
        case .replies: return "arrowshape.turn.up.left"
        case .reposts: return "arrow.2.squarepath"
        case .shares: return "square.and.arrow.up"
        case .bookmarked: return "bookmark.fill"
        }
    }

    static func sentence(for mark: PostViewerEngagement.Mark) -> String {
        switch mark {
        case .reactions(let emojis):
            return String(
                format: String(localized: "viewer.engagement.reactions", defaultValue: "Réactions : %@", bundle: .main),
                emojis.joined(separator: " ")
            )
        case .bookmarked:
            return String(localized: "viewer.engagement.bookmarked", defaultValue: "Enregistré dans ses favoris", bundle: .main)
        case .comments(let count):
            return counted(count,
                           one: String(localized: "viewer.engagement.comments.one", defaultValue: "%d commentaire", bundle: .main),
                           other: String(localized: "viewer.engagement.comments.other", defaultValue: "%d commentaires", bundle: .main))
        case .replies(let count):
            return counted(count,
                           one: String(localized: "viewer.engagement.replies.one", defaultValue: "%d réponse", bundle: .main),
                           other: String(localized: "viewer.engagement.replies.other", defaultValue: "%d réponses", bundle: .main))
        case .reposts(let count):
            return counted(count,
                           one: String(localized: "viewer.engagement.reposts.one", defaultValue: "%d republication", bundle: .main),
                           other: String(localized: "viewer.engagement.reposts.other", defaultValue: "%d republications", bundle: .main))
        case .shares(let count):
            return counted(count,
                           one: String(localized: "viewer.engagement.shares.one", defaultValue: "%d partage", bundle: .main),
                           other: String(localized: "viewer.engagement.shares.other", defaultValue: "%d partages", bundle: .main))
        }
    }

    /// Le nom, puis chaque marque en toutes lettres — ce que VoiceOver lit pour
    /// une ligne de la liste.
    static func accessibilityLabel(for viewer: StoryViewerItem) -> String {
        ([viewer.displayName] + viewer.engagement.marks.map(sentence(for:))).joined(separator: ", ")
    }

    private static func counted(_ count: Int, one: String, other: String) -> String {
        String(format: count == 1 ? one : other, count)
    }
}

// MARK: - La feuille d'un post ou d'un réel, ouverte par son auteur

extension View {
    /// La feuille « Vues » d'un POST ou d'un RÉEL (#9727) — branchée en une
    /// ligne par la carte du fil et la carte de réel. Le profil touché dans la
    /// feuille s'ouvre APRÈS sa fermeture : deux feuilles ne se superposent pas.
    func publicationViewersSheet(
        isPresented: Binding<Bool>,
        post: FeedPost,
        moodLookup: ((String) -> (emoji: String?, tapHandler: ((CGPoint) -> Void)?))? = nil,
        onOpenProfile: @escaping (StoryViewerItem) -> Void
    ) -> some View {
        modifier(PublicationViewersSheetModifier(
            isPresented: isPresented,
            post: post,
            moodLookup: moodLookup,
            onOpenProfile: onOpenProfile
        ))
    }
}

private struct PublicationViewersSheetModifier: ViewModifier {
    @Binding var isPresented: Bool
    let post: FeedPost
    let moodLookup: ((String) -> (emoji: String?, tapHandler: ((CGPoint) -> Void)?))?
    let onOpenProfile: (StoryViewerItem) -> Void

    @State private var pendingProfile: StoryViewerItem?

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented, onDismiss: {
            guard let viewer = pendingProfile else { return }
            pendingProfile = nil
            onOpenProfile(viewer)
        }) {
            PublicationViewersSheet(
                postId: post.id,
                viewCount: post.viewCount,
                impressionCount: post.impressionCount,
                subject: .publication,
                accentColor: Color(hex: post.authorColor),
                moodEmoji: { moodLookup?($0).emoji },
                moodTapHandler: { moodLookup?($0).tapHandler },
                onOpenProfile: { viewer in
                    pendingProfile = viewer
                    isPresented = false
                }
            )
        }
    }
}

/// L'entrée « Vues » des menus « ⋯ » d'un post et d'un réel — à leur auteur
/// seulement, la même dans les deux menus.
struct PublicationViewersMenuButton: View {
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Label(String(localized: "story.viewer.views.title", defaultValue: "Vues", bundle: .main), systemImage: "eye")
        }
    }
}
