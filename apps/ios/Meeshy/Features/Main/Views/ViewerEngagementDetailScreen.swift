import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le détail d'une personne, en feuille plein écran (#16386)

/// Présente le détail d'une personne en plein écran depuis la liste des vues.
/// Le profil demandé depuis le détail s'ouvre une fois le plein écran REFERMÉ —
/// deux présentations ne se chevauchent pas.
struct ViewerEngagementDetailCover: ViewModifier {
    @Binding var openedViewer: StoryViewerItem?
    let accentColor: Color
    let moodEmoji: (String) -> String?
    let onOpenProfile: (StoryViewerItem) -> Void

    @State private var pendingProfile: StoryViewerItem?

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $openedViewer, onDismiss: {
            guard let viewer = pendingProfile else { return }
            pendingProfile = nil
            onOpenProfile(viewer)
        }) { viewer in
            ViewerEngagementDetailScreen(
                viewer: viewer,
                accentColor: accentColor,
                moodEmoji: moodEmoji(viewer.id),
                onBack: { openedViewer = nil },
                onOpenProfile: {
                    pendingProfile = viewer
                    openedViewer = nil
                }
            )
        }
    }
}

/// Ce qu'UNE personne a fait sur ce contenu, ouvert en feuille PLEIN ÉCRAN
/// depuis la liste des vues : un en-tête avec son chevron (<), la personne,
/// ce qu'elle a fait en toutes lettres, et le chemin vers son profil.
///
/// Le chevron (`onBack`) rend la liste ; « Voir le profil » (`onOpenProfile`)
/// laisse l'hôte refermer avant d'ouvrir le profil — deux présentations ne se
/// chevauchent pas.
struct ViewerEngagementDetailScreen: View {
    let viewer: StoryViewerItem
    let accentColor: Color
    let moodEmoji: String?
    let onBack: () -> Void
    let onOpenProfile: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section { identity }
                Section(header: Text(String(localized: "viewer.engagement.detail.title", defaultValue: "Sur ce contenu", bundle: .main))) {
                    engagementRows
                }
                Section { profileButton }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(viewer.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { backButton }
            }
        }
    }

    private var backButton: some View {
        Button {
            HapticFeedback.light()
            onBack()
        } label: {
            Image(systemName: "chevron.left")
                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                .foregroundColor(accentColor)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
        .accessibilityIdentifier("viewerDetail.back")
    }

    private var identity: some View {
        VStack(spacing: MeeshySpacing.xs) {
            LivePresence { MeeshyAvatar(
                name: viewer.displayName,
                context: .profileSheet,
                avatarURL: viewer.avatarUrl,
                moodEmoji: moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: viewer.id, isOnline: nil),
                onViewProfile: onOpenProfile
            ) }
            .padding(.top, MeeshySpacing.sm)

            Text(viewer.displayName)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundColor(.primary)
                .lineLimit(1)
            if !viewer.username.isEmpty, viewer.username != viewer.displayName {
                Text("@\(viewer.username)")
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Label {
                Text(String(
                    format: String(localized: "viewer.engagement.viewedAt", defaultValue: "Vu à %@", bundle: .main),
                    viewer.viewedAt.formatted(date: .abbreviated, time: .shortened)
                ))
            } icon: {
                Image(systemName: "eye")
            }
            .font(MeeshyFont.relative(MeeshyFont.smallSize))
            .foregroundColor(.secondary)
            .padding(.bottom, MeeshySpacing.xs)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var engagementRows: some View {
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

    private var profileButton: some View {
        Button {
            HapticFeedback.light()
            onOpenProfile()
        } label: {
            Label(String(localized: "viewer.engagement.openProfile", defaultValue: "Voir le profil", bundle: .main),
                  systemImage: "person.crop.circle")
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                .foregroundColor(accentColor)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .accessibilityIdentifier("viewerDetail.openProfile")
    }
}
