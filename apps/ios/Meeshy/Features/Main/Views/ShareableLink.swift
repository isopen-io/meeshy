import SwiftUI
import UIKit
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// MARK: - ShareableLink

/// Identifiable wrapper around the freshly-minted post/story share URL so
/// SwiftUI's `.sheet(item:)` can drive presentation directly. `URL` doesn't
/// conform to `Identifiable`; wrapping is the lightest fix without leaking
/// state booleans across the view tree.
struct ShareableLink: Identifiable {
    let id = UUID()
    let url: URL
    /// Ce que la feuille peut AUSSI emporter en fichier, rendu à la demande (#9682).
    var fileSource: ShareFileSource? = nil

    /// Public web origin posts/stories live on. Hardcoded to the production
    /// host because an external share must always resolve from a third-party
    /// network — a staging URL would dead-end for the recipient.
    static let webBaseURL = "https://meeshy.me"

    /// Raw post detail URL used as a graceful fallback when the gateway can't
    /// mint a TrackingLink (offline, rate-limited, etc.). The recipient still
    /// lands on the post; only the attribution analytics are skipped.
    /// Mirrors the `originalUrl` the gateway uses when minting the link.
    static func fallback(forPostId postId: String, fileSource: ShareFileSource? = nil) -> ShareableLink? {
        URL(string: "\(webBaseURL)/feeds/post/\(postId)").map { ShareableLink(url: $0, fileSource: fileSource) }
    }

    /// UN seul élément quand il y a un fichier à emporter : la source paresseuse,
    /// qui rend le FICHIER aux activités de fichier et le LIEN à toutes les autres
    /// (recette #9682 : un lien http À CÔTÉ du fichier — « 1 Link and 1 Document » —
    /// faisait disparaître « Enregistrer dans Fichiers », qui ne sait enregistrer
    /// que des fichiers). Sans fichier, le lien seul.
    var activityItems: [Any] {
        guard let provider = fileSource?.makeProvider(link: url) else { return [url] }
        return [provider]
    }
}

/// **Ce qu'une feuille de partage peut emporter en FICHIER** (#9682).
enum ShareFileSource {
    case post(FeedPost)
    case story(StoryItem, author: StoryExportAuthor?)

    /// `nil` quand rien ne s'emporte : la règle de « Sauvegarder » (`PostSaveRoute`)
    /// décide pour un post — une publication est ouverte à la sortie, comme ses
    /// hôtes le déclarent (`MediaSaveCoordinator(exitGate: .open)`).
    func makeProvider(link: URL) -> LazyShareFileProvider? {
        switch self {
        case .story(let story, let author):
            return ShareFilePlaceholder.video(named: "Meeshy-\(story.id).mp4").map { placeholder in
                LazyShareFileProvider(placeholder: placeholder, typeIdentifier: UTType.mpeg4Movie.identifier, link: link) {
                    await StoryPhotoSaveService.shared.renderStoryFile(of: story, author: author)
                }
            }
        case .post(let post):
            switch PostSaveRoute.resolve(for: post, mayLeave: ContentExitGate.open.mayLeave()) {
            case .unavailable:
                return nil
            case .renderScene:
                return ShareFilePlaceholder.video(named: "Meeshy-\(post.id).mp4").map { placeholder in
                    LazyShareFileProvider(placeholder: placeholder, typeIdentifier: UTType.mpeg4Movie.identifier, link: link) {
                        await StoryPhotoSaveService.shared.renderSceneFile(of: post)
                    }
                }
            case .rawFile(let media):
                return Self.rawFileProvider(media, link: link)
            }
        }
    }

    private static func rawFileProvider(_ media: PostSaveMedia, link: URL) -> LazyShareFileProvider? {
        guard media.kind == .image || media.kind == .video else { return nil }
        let request = media.request
        let name = MediaSaveCoordinator.exportFileName(for: request)
        let fallbackType: UTType = media.kind == .video ? .movie : .image
        let type = UTType(filenameExtension: (name as NSString).pathExtension) ?? fallbackType
        let placeholder = media.kind == .video ? ShareFilePlaceholder.video(named: name) : ShareFilePlaceholder.image(named: name)
        guard let placeholder else { return nil }
        return LazyShareFileProvider(placeholder: placeholder, typeIdentifier: type.identifier, link: link) {
            guard let local = try? await AttachmentMediaSaveResolver().resolveLocalFile(for: request) else { return nil }
            let branded = await MeeshyMediaSaveBranding().stamp(local, kind: request.kind, origin: request.origin,
                                                                author: request.authorUsername)
            defer { if branded.isStamped { MediaSaveCoordinator.discardStagingDirectory(of: branded.url) } }
            return try? MediaSaveCoordinator.stageForExport(branded.url, request: request)
        }
    }
}

// MARK: - Fichier de partage rendu à la demande (#9682)

/// **Les activités qui emportent un FICHIER** — elles seules paient le rendu :
/// « Enregistrer la vidéo » (Photos), « Enregistrer dans Fichiers », AirDrop.
/// Messages, Mail, copier… reçoivent le LIEN seul, sans attendre aucun rendu.
nonisolated enum ShareFileActivity {
    static let fileActivityTypes: Set<String> = [
        "com.apple.UIKit.activity.SaveToCameraRoll",
        "com.apple.DocumentManagerUICore.SaveToFiles",
        "com.apple.UIKit.activity.AirDrop",
    ]

    static func wantsFile(_ activityType: String?) -> Bool {
        activityType.map(fileActivityTypes.contains) ?? false
    }
}

/// Source de fichier PARESSEUSE de la feuille de partage. Son placeholder est un
/// VRAI fichier minuscule sous le nom final (`ShareFilePlaceholder`, dont le
/// doc-comment cite la documentation Apple) : c'est sur lui que la feuille offre
/// « Enregistrer la vidéo » et « Enregistrer dans Fichiers ». Le fichier réel —
/// scène rendue, ou média résolu — n'est produit que lorsque l'utilisateur choisit
/// l'une de ces activités, sur le fil secondaire de l'opération
/// (`UIActivityItemProvider.item`). Placeholder et fichier produit sont jetés
/// avec la source.
nonisolated final class LazyShareFileProvider: UIActivityItemProvider, @unchecked Sendable {
    private let typeIdentifier: String
    /// Ce que reçoivent les activités qui ne prennent pas de fichier (Messages,
    /// copier, Mail…) : le lien. `UIActivityItemSource.activityViewController(_:itemForActivityType:)`
    /// est documenté pour rendre un objet DIFFÉRENT selon l'activité choisie.
    private let link: URL?
    private let produce: @MainActor @Sendable () async -> URL?
    private let lock = NSLock()
    private var produced: URL?

    init(placeholder: URL, typeIdentifier: String, link: URL? = nil,
         produce: @escaping @MainActor @Sendable () async -> URL?) {
        self.typeIdentifier = typeIdentifier
        self.link = link
        self.produce = produce
        super.init(placeholderItem: placeholder)
    }

    deinit {
        if let directory = (placeholderItem as? URL)?.deletingLastPathComponent(),
           directory.lastPathComponent.hasPrefix("share-placeholder-") {
            try? FileManager.default.removeItem(at: directory)
        }
        guard let produced else { return }
        let directory = produced.deletingLastPathComponent()
        let ownsDirectory = directory.lastPathComponent.hasPrefix("media-save-")
        try? FileManager.default.removeItem(at: ownsDirectory ? directory : produced)
    }

    override var item: Any {
        guard ShareFileActivity.wantsFile(activityType?.rawValue), !Thread.isMainThread else { return link ?? "" }
        let done = DispatchSemaphore(value: 0)
        let produce = self.produce
        Task { @concurrent [weak self] in
            let url = await produce()
            self?.store(url)
            done.signal()
        }
        done.wait()
        guard !isCancelled, let url = lock.withLock({ produced }) else { return "" }
        return url
    }

    override func activityViewController(_ activityViewController: UIActivityViewController,
                                         itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
        guard ShareFileActivity.wantsFile(activityType?.rawValue) else { return link }
        return super.activityViewController(activityViewController, itemForActivityType: activityType)
    }

    override func activityViewController(_ activityViewController: UIActivityViewController,
                                         dataTypeIdentifierForActivityType activityType: UIActivity.ActivityType?) -> String {
        typeIdentifier
    }

    private func store(_ url: URL?) {
        lock.withLock { produced = url }
    }
}
