import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportDressing
//
// **L'HABILLAGE d'une vidéo qui sort de Meeshy se décide ICI, et nulle part
// ailleurs** (#10536, demande porteur 2026-10-13 : « rétablir, lorsqu'on
// sauvegarde une story, la pose du prélude et de l'interlude ; l'export utilisé
// est celui des réels et postes ; préserver les deux types d'export »).
//
// Deux habillages coexistent :
//   - STORY : interlude d'identité + signature sonore en tête, la story, la
//     carte de fin ;
//   - ŒUVRE SEULE (réel, post, scène de post — #7052, #9681) : ni interlude,
//     ni carte.
//
// Avant, chaque appelant choisissait son `intro:` et son `appendsBrandOutro:`.
// La feuille de partage du système passait `intro: nil` sur une story, et la
// feuille d'export comparait un NOM d'affichage au pseudo du lecteur : une
// story sortait habillée comme un réel. Un appelant dit désormais CE QU'IL
// SORT ; l'interlude, la carte et le pseudo du filigrane en découlent.

/// L'auteur d'une story qu'un lecteur emporte, tel que le site d'appel le
/// connaît. `name` reçoit `StoryGroup.username`, qui porte en réalité
/// `APIAuthor.name` (nom d'affichage, sinon pseudo) : le vrai pseudo vient du
/// profil (`StoryExportAuthorIdentity`).
nonisolated struct StoryExportAuthor: Equatable, Sendable {
    let userId: String?
    let name: String
    var avatarURL: String? = nil

    init(userId: String?, name: String, avatarURL: String? = nil) {
        self.userId = userId
        self.name = name
        self.avatarURL = avatarURL
    }

    init(group: StoryGroup) {
        self.init(userId: group.id, name: group.username, avatarURL: group.avatarURL)
    }
}

/// Celui qui regarde, tel que la décision en a besoin.
nonisolated struct StoryExportViewer: Equatable, Sendable {
    let userId: String?
    let username: String?

    @MainActor
    static var current: StoryExportViewer {
        let user = AuthManager.shared.currentUser
        return StoryExportViewer(userId: user?.id, username: user?.username)
    }
}

/// QUI l'interlude d'une story présente. Jamais le lecteur devant la story
/// d'un autre (#9953) : il ne la signe pas de son visage — c'est l'AUTEUR
/// qu'on peint alors.
nonisolated enum StoryExportIdentity: Equatable, Sendable {
    /// L'utilisateur connecté est l'auteur ; `handle` signe le filigrane.
    case viewer(handle: String?)
    case author(StoryExportAuthor)
}

nonisolated enum StoryExportDressing: Equatable, Sendable {
    /// Interlude d'identité, la story, carte de fin.
    case story(identity: StoryExportIdentity)
    /// L'œuvre seule ; `author` signe le filigrane.
    case bareWork(author: String?)

    var appendsBrandOutro: Bool {
        switch self {
        case .story: return true
        case .bareWork: return false
        }
    }

    /// L'habillage d'une STORY. Sans auteur connu (« Mes stories », rail de
    /// l'auteur), l'utilisateur connecté est l'auteur. L'identifiant tranche
    /// quand les deux côtés en ont un ; le pseudo ne sert que de repli, parce
    /// que `author.name` est le plus souvent un nom d'affichage.
    static func forStory(of author: StoryExportAuthor?, viewer: StoryExportViewer) -> StoryExportDressing {
        guard let author else { return .story(identity: .viewer(handle: viewer.username)) }
        return isViewer(author, viewer)
            ? .story(identity: .viewer(handle: viewer.username))
            : .story(identity: .author(author))
    }

    private static func isViewer(_ author: StoryExportAuthor, _ viewer: StoryExportViewer) -> Bool {
        if let authorId = author.userId, let viewerId = viewer.userId { return authorId == viewerId }
        guard let handle = viewer.username else { return false }
        return author.name.caseInsensitiveCompare(handle) == .orderedSame
    }
}

/// Ce que le moteur reçoit, une fois l'habillage résolu.
struct StoryExportDressingPlan: Sendable {
    let intro: StoryExportIntroContent?
    let appendsBrandOutro: Bool
    let watermarkHandle: String?
}

/// Résout un habillage en ce que le moteur attend. La résolution d'identité est
/// BORNÉE (`BoundedAsyncResolution`) : ni l'anneau ni la feuille de partage
/// n'attendent un avatar qui ne revient pas.
@MainActor
struct StoryExportDressingResolver: Sendable {
    typealias ViewerIntro = @MainActor @Sendable () async -> StoryExportIntroContent?
    typealias AuthorIntro = @MainActor @Sendable (StoryExportAuthor) async -> StoryExportIntroContent?

    let viewerIntro: ViewerIntro
    let authorIntro: AuthorIntro
    let timeout: Duration

    init(viewerIntro: ViewerIntro? = nil,
         authorIntro: AuthorIntro? = nil,
         timeout: Duration = BoundedAsyncResolution.defaultTimeout) {
        self.viewerIntro = viewerIntro ?? StoryExportIntroFactory.currentUser
        self.authorIntro = authorIntro ?? StoryExportAuthorIdentity.resolve
        self.timeout = timeout
    }

    func plan(for dressing: StoryExportDressing) async -> StoryExportDressingPlan {
        switch dressing {
        case .bareWork(let author):
            // Aucun interlude n'est dû : rien à résoudre, et surtout pas la
            // borne de temps avant un bake qu'on sait déjà sans prélude.
            return StoryExportDressingPlan(intro: nil, appendsBrandOutro: false, watermarkHandle: author)
        case .story(.viewer(let handle)):
            let intro = await BoundedAsyncResolution.resolve(viewerIntro, timeout: timeout)
            return StoryExportDressingPlan(intro: intro, appendsBrandOutro: true, watermarkHandle: handle)
        case .story(.author(let author)):
            let authorIntro = self.authorIntro
            let resolved = await BoundedAsyncResolution.resolve(
                { @MainActor @Sendable in await authorIntro(author) }, timeout: timeout)
            // Passé la borne, l'interlude reste dû : nom, pseudo, teinte de repli.
            let intro = resolved ?? StoryExportAuthorIdentity.unresolved(author)
            return StoryExportDressingPlan(intro: intro, appendsBrandOutro: true, watermarkHandle: intro.username)
        }
    }
}

// MARK: - StoryExportAuthorIdentity

/// L'identité de l'AUTEUR d'une story, pour l'interlude d'un export que lance
/// un lecteur. Orchestration app-side : le profil vient du cache nommé
/// `CacheCoordinator.profiles` — celui que l'interstitiel de la visionneuse
/// remplit (`StoryViewModel.resolveGroupIntro`) —, du réseau s'il est vide ;
/// la peinture reste au SDK (`StoryExportIntroFactory.content(for:)`).
enum StoryExportAuthorIdentity {

    @MainActor
    static func resolve(_ author: StoryExportAuthor) async -> StoryExportIntroContent? {
        let profile = await profile(of: author)
        return await StoryExportIntroFactory.content(for: source(for: author, profile: profile))
    }

    @MainActor
    static func unresolved(_ author: StoryExportAuthor) -> StoryExportIntroContent {
        StoryExportIntroFactory.unresolvedContent(for: source(for: author, profile: nil))
    }

    /// Profil → identité à peindre. Sans profil, le nom que le site d'appel
    /// tenait sert de nom ET de pseudo.
    nonisolated static func source(for author: StoryExportAuthor, profile: MeeshyUser?) -> StoryExportIntroSource {
        guard let profile else {
            return StoryExportIntroSource(userId: author.userId, displayName: author.name,
                                          username: author.name, avatarURL: author.avatarURL)
        }
        return StoryExportIntroSource(
            userId: author.userId ?? profile.id,
            displayName: StoryExportIntroFactory.resolveDisplayName(displayName: profile.displayName,
                                                                    firstName: profile.firstName,
                                                                    lastName: profile.lastName,
                                                                    username: profile.username),
            username: profile.username,
            avatarURL: profile.avatar ?? author.avatarURL,
            bannerURL: profile.banner,
            backgroundThumbHash: profile.bannerThumbHash ?? profile.avatarThumbHash)
    }

    @MainActor
    private static func profile(of author: StoryExportAuthor) async -> MeeshyUser? {
        guard let userId = author.userId else { return nil }
        switch await CacheCoordinator.shared.profiles.load(for: userId) {
        case .fresh(let users, _), .stale(let users, _):
            if let user = users.first { return user }
        case .expired, .empty:
            break
        }
        guard let fetched = try? await UserService.shared.getProfile(idOrUsername: userId) else { return nil }
        await bestEffort("storyExportDressing.profiles.save", category: .cache) { try await CacheCoordinator.shared.profiles.save([fetched], for: userId) }
        return fetched
    }
}
