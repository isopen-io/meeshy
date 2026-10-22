import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que le détail d'un post présente par-dessus lui** — traductions,
/// profil, partage système, édition, lieu, galerie, plein écran audio et
/// enregistrement local. Extrait du `body` de `PostDetailView.swift` (#10956).
extension PostDetailView {

    func detailPresentations(_ content: some View) -> some View {
        content
            .sheet(isPresented: $showTranslationSheet) {
                if let post = displayPost {
                    PostTranslationSheet(
                        post: post,
                        onSelectLanguage: { language in
                            let langLower = language.lowercased()
                            let isOriginal = langLower == post.originalLanguage?.lowercased()
                            let hasTranslation = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == langLower }) == true
                            if hasTranslation {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    activeDisplayLangCode = langLower
                                    secondaryLangCode = nil
                                }
                            }
                        }
                    )
                }
            }
            .sheet(item: $selectedProfileUser) { user in
                UserProfileSheet(
                    user: user,
                    moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                    onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                    presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                    postsContent: { uid in
                        AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                            selectedProfileUser = nil
                            router.push(.postDetail(post.id, post))
                        }, onOpenReel: { reel, reels in
                            ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil }
                        }))
                    }
                )
                .presentationDetents([.large, .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $shareableLink) { link in
                // Same `meeshy.me/l/<token>` URL that "Copier le lien" copies —
                // the gateway already recorded the share + minted the
                // TrackingLink owned by the current user.
                ShareSheet(activityItems: link.activityItems)
            }
            .postEditCover(post: displayPost, isPresented: $isEditing) {
                if let post = displayPost {
                    EditPostSheet(
                        originalContent: post.content,
                        originalLanguage: post.originalLanguage,
                        originalType: post.type,
                        media: post.media.map { EditablePostMedia($0) }, originalStoryEffects: post.storyEffects,
                        originalLocation: post.location,
                        originalVisibility: post.visibility,
                        originalVisibilityUserIds: post.visibilityUserIds ?? [],
                        isRepost: post.repost != nil,
                        onSave: { draft in
                            await viewModel.updatePost(content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known, storyEffects: draft.storyEffects)
                        },
                        onDismiss: { isEditing = false }
                    )
                }
            }
            .fullScreenCover(item: $detailFullscreenPlace) { item in
                // Même surface plein écran que la bulle et la card feed :
                // carte + « Ouvrir dans Plans » / « Itinéraire ».
                LocationFullscreenView(
                    latitude: item.place.latitude,
                    longitude: item.place.longitude,
                    placeName: item.place.name,
                    address: item.place.address,
                    accentColor: accentColor,
                    senderName: displayPost?.author
                ).closesForConversationOpening(.place)
            }
            // **Le plein écran du détail passe par son SITE UNIQUE** (#4927,
            // raccordé le 2026-09-06).
            //
            // Cette vingtaine de lignes était le dernier des trois exemplaires que
            // `socialMediaGallery` a été écrit pour remplacer — la carte du fil a
            // été raccordée la veille, le détail ne l'était pas. Le brancher n'est
            // pas qu'un nettoyage : c'est ce qui apporte au détail la branche
            // SCÈNE, qui rejoue le canvas au lieu d'ouvrir son fond, et le
            // transport de l'index de scène que la mosaïque vient de câbler.
            //
            // Aucune légende ne change au passage : `Self.captionServings` était
            // déjà `SocialMediaCaption.serving(for:carrier:)`, mot pour mot, et le
            // site unique appelle la même.
            .socialMediaGallery(
                post: displayPost,
                isPresented: $showFullscreenGallery,
                startMediaId: fullscreenMediaId,
                startSceneIndex: detailSceneIndex,
                accentColor: accentColor,
                preferredContentLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser)
            )
            .audioFullscreenCover($audioFullscreen, accentColor: accentColor)
            .mediaSaveFlow(mediaSaveCoordinator)
    }
}
