import SwiftUI
import MeeshySDK

/// « Page du son » : son identité en tête, puis ce qui a été publié avec lui.
///
/// Elle ferme la boucle de découverte — entendre un son, voir ce qu'on en a
/// fait, s'en servir à son tour. Sans elle, la bibliothèque n'était qu'une
/// liste de titres.
@MainActor
public struct SoundDetailView: View {
    private let sound: APISound
    private let onUse: (APISound) -> Void
    private let onClose: () -> Void

    @StateObject private var model: SoundDetailModel
    @Environment(\.colorScheme) private var colorScheme

    public init(sound: APISound,
                service: SoundLibraryServiceProviding = SoundLibraryService.shared,
                onUse: @escaping (APISound) -> Void,
                onClose: @escaping () -> Void) {
        self.sound = sound
        self.onUse = onUse
        self.onClose = onClose
        _model = StateObject(wrappedValue: SoundDetailModel(soundId: sound.id, service: service))
    }

    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 3)]

    public var body: some View {
        NavigationStack {
            ScrollView {
                header
                Divider().padding(.vertical, MeeshySpacing.md)
                content
            }
            .navigationTitle(String(localized: "story.sound.detail.title",
                                    defaultValue: "Ce son", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(String(localized: "story.composer.cancel",
                                  defaultValue: "Annuler", bundle: .module), action: onClose)
                }
            }
        }
        .task { await model.loadIfNeeded() }
    }

    private var header: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            cover
            Text(SoundLibraryPickerModel.displayTitle(for: sound))
                .font(.system(size: MeeshyFont.headlineSize, weight: .semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
            if let author = sound.authorLabel {
                Text(author).font(.system(size: MeeshyFont.subheadSize)).foregroundStyle(.secondary)
            }
            counters
            Button {
                onUse(sound)
            } label: {
                Text(String(localized: "story.sound.library.use",
                            defaultValue: "Utiliser", bundle: .module))
                    .frame(maxWidth: 220)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, MeeshySpacing.md)
        .padding(.horizontal, MeeshySpacing.lg)
    }

    private var cover: some View {
        Group {
            if sound.coverUrl != nil || sound.coverThumbHash != nil {
                CachedAsyncImage(url: sound.coverUrl,
                                 targetSize: CGSize(width: 96, height: 96),
                                 thumbHash: sound.coverThumbHash)
            } else if let uploader = sound.uploader {
                MeeshyAvatar(name: uploader.displayName ?? uploader.username,
                             context: .userListItem,
                             avatarURL: uploader.avatar)
            } else {
                Circle().fill(colorScheme == .dark ? Color.white.opacity(MeeshyOpacity.light) : Color.black.opacity(MeeshyOpacity.subtle))
            }
        }
        .frame(width: 96, height: 96)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
    }

    /// Les deux mêmes compteurs que la ligne du sélecteur, et ils décrivent
    /// exactement la grille du dessous : qui doute peut recompter.
    private var counters: some View {
        HStack(spacing: MeeshySpacing.mdPlus) {
            if sound.postCount > 0 {
                Label(sound.postCount.formatted(.number.notation(.compactName)), systemImage: "rectangle.stack")
            }
            if sound.playCount > 0 {
                Label(sound.playCount.formatted(.number.notation(.compactName)), systemImage: "play.fill")
            }
        }
        .font(.system(size: 13))
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.posts.isEmpty {
            ProgressView().padding(.top, 40)
        } else if model.isEmpty {
            emptyState
        } else {
            LazyVGrid(columns: columns, spacing: MeeshySpacing.xxs) {
                ForEach(model.posts) { post in
                    SoundPostTile(post: post)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
            if model.canLoadMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.lg)
                    .task { await model.loadMore() }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "square.stack")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(.secondary)
            Text(model.didFail
                 ? String(localized: "story.sound.detail.failed",
                          defaultValue: "Impossible de charger les publications.", bundle: .module)
                 : String(localized: "story.sound.detail.empty",
                          defaultValue: "Personne n'a encore publié avec ce son.", bundle: .module))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, MeeshySpacing.xxxl)
        }
        .padding(.top, 40)
    }
}

/// Vignette d'une publication. Cascade `thumbnailUrl` → `thumbHash` → aplat :
/// jamais de trou dans la grille.
@MainActor
struct SoundPostTile: View {
    let post: APISoundPost
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            if let media = post.thumbnail, media.thumbnailUrl != nil || media.thumbHash != nil {
                CachedAsyncImage(url: media.thumbnailUrl,
                                 targetSize: CGSize(width: 220, height: 220),
                                 thumbHash: media.thumbHash)
            } else {
                Rectangle()
                    .fill(colorScheme == .dark ? Color.white.opacity(MeeshyOpacity.subtle) : Color.black.opacity(MeeshyOpacity.faint))
                    .overlay(
                        Image(systemName: "text.alignleft")
                            .foregroundStyle(.secondary)
                    )
            }

            if post.viewCount > 0 {
                Label(post.viewCount.formatted(.number.notation(.compactName)), systemImage: "play.fill")
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(MeeshySpacing.xsPlus)
            }
        }
        .aspectRatio(1, contentMode: .fill)
        .clipped()
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        var parts: [String] = []
        if let author = post.author {
            parts.append(author.displayName ?? "@\(author.username)")
        }
        if post.viewCount > 0 {
            parts.append(String(localized: "story.sound.library.playCount",
                                defaultValue: "\(post.viewCount) lectures", bundle: .module))
        }
        return parts.joined(separator: ", ")
    }
}
