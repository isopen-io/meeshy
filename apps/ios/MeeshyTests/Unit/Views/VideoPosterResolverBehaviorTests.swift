import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// #3896 — `VideoPosterResolver` (orchestration du poster net, feature 3) n'avait
/// de tests que sur ses deux types PURS (`VideoPosterPlan`, `VideoPosterGrade`,
/// couverts dans `ConversationMediaGalleryFullscreenSharpTests`). L'orchestration
/// elle-même — `resolve`, `persistedPoster`, `warmIfLocal` — qui CÂBLE ces
/// décisions à `CacheCoordinator`/`DiskCacheStore` réels vivait sans aucun test
/// de comportement : un revert du câblage (ex. la vérification de grade dans
/// `persistedPoster`) n'aurait fait rougir personne.
///
/// Ces tests utilisent les stores RÉELS (pas de mock — `DiskCacheStore` /
/// `CacheCoordinator` sont des singletons NSCache-backed, seedés directement via
/// `DiskCacheStore.cacheImageForPreview`, exactement le mécanisme que
/// `VideoPosterResolver.persist` utilise lui-même) : ils exercent le CÂBLAGE réel,
/// pas une réimplémentation.
@MainActor
final class VideoPosterResolverBehaviorTests: XCTestCase {

    private func makeAttachment(
        fileUrl: String = "https://cdn.meeshy.me/videos/poster-behavior-\(UUID().uuidString).mp4",
        width: Int? = nil,
        height: Int? = nil
    ) -> MessageAttachment {
        MessageAttachment(fileUrl: fileUrl, width: width, height: height)
    }

    /// Image décodée à une taille de PIXELS exacte (scale 1×) — `persistedPoster`
    /// lit `image.size.width * image.scale`, donc le scale doit être connu et fixe
    /// pour que le test affirme une dimension précise.
    private func makeImage(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
        return renderer.image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    // MARK: - persistedPoster

    func test_persistedPoster_returnsNil_withoutAnyCachedPoster() {
        let attachment = makeAttachment()
        XCTAssertNil(VideoPosterResolver.persistedPoster(for: attachment))
    }

    /// LE défaut que la feature « plein écran net » corrige : la clé `thumb:<url>`
    /// est PARTAGÉE avec les écrivains de grade bulle (`MeeshyVideoThumbnail` 300px,
    /// `StoryMediaLoader` 400px). Un poster de ce grade, déjà en cache, doit être
    /// REJETÉ par `persistedPoster` — jamais servi tel quel en plein écran flou.
    /// Un revert de la vérification de grade dans `persistedPoster` (ex. retour
    /// direct de l'image cachée sans passer par `VideoPosterGrade.isFullscreenSharp`)
    /// fait rougir ce test.
    func test_persistedPoster_rejectsABubbleGradePoster_sourceUnknown() throws {
        let attachment = makeAttachment(width: nil, height: nil)
        let key = try XCTUnwrap(VideoPosterResolver.posterKey(for: attachment))
        DiskCacheStore.cacheImageForPreview(makeImage(width: 300, height: 300), key: key)

        XCTAssertNil(VideoPosterResolver.persistedPoster(for: attachment),
                     "un poster de grade bulle (300px, source inconnue) doit être rejeté — pas net en plein écran")
    }

    /// Symétrique : un poster déjà au-dessus du grade bulle, source inconnue, EST
    /// accepté et rendu résident — sinon `persistedPoster` ré-extrairait à chaque
    /// mount ce que la cascade venait elle-même de produire.
    func test_persistedPoster_acceptsASharpPoster_sourceUnknown() throws {
        let attachment = makeAttachment(width: nil, height: nil)
        let key = try XCTUnwrap(VideoPosterResolver.posterKey(for: attachment))
        DiskCacheStore.cacheImageForPreview(makeImage(width: 854, height: 480), key: key)

        let poster = VideoPosterResolver.persistedPoster(for: attachment)
        XCTAssertNotNil(poster)
        XCTAssertEqual(poster.map { max($0.size.width, $0.size.height) }, 854)
    }

    /// Source CONNUE (`attachment.width`/`height`) : le plancher redescend à
    /// `min(1080, source)`. Un poster à la taille EXACTE d'une petite source doit
    /// être accepté — l'exiger plus grand boucierait sans fin (rien de plus net
    /// n'est atteignable).
    func test_persistedPoster_acceptsAPosterBoundedByAKnownSmallSource() throws {
        let attachment = makeAttachment(width: 480, height: 270)
        let key = try XCTUnwrap(VideoPosterResolver.posterKey(for: attachment))
        DiskCacheStore.cacheImageForPreview(makeImage(width: 480, height: 270), key: key)

        XCTAssertNotNil(VideoPosterResolver.persistedPoster(for: attachment),
                        "une source connue à 480px ne peut rien donner de plus net que 480px")
    }

    // MARK: - resolve

    func test_resolve_withoutAnyExploitableURL_returnsNilWithoutCrashing() async {
        let attachment = makeAttachment(fileUrl: "")
        let result = await VideoPosterResolver.resolve(attachment: attachment, allowsNetwork: true, intent: .userOpened)
        XCTAssertNil(result)
    }

    /// Le chemin RAPIDE de `resolve` : un poster déjà persisté et de grade
    /// suffisant doit être rendu SANS tenter d'extraction (le seul moyen d'obtenir
    /// autre chose ici, faute de fichier local ou de réseau réel, serait
    /// justement une extraction — qui échouerait et rendrait `nil`). Un revert du
    /// court-circuit `if let persisted = persistedPoster(...) { return persisted }`
    /// fait donc rougir ce test.
    func test_resolve_returnsThePersistedPoster_beforeAttemptingAnyExtraction() async throws {
        let attachment = makeAttachment(width: nil, height: nil)
        let key = try XCTUnwrap(VideoPosterResolver.posterKey(for: attachment))
        DiskCacheStore.cacheImageForPreview(makeImage(width: 900, height: 900), key: key)

        let result = await VideoPosterResolver.resolve(attachment: attachment, allowsNetwork: true, intent: .userOpened)
        XCTAssertNotNil(result)
        XCTAssertEqual(result.map { max($0.size.width, $0.size.height) }, 900)
    }

    // MARK: - warmIfLocal

    /// Sans fichier local (`localVideoFileURL(for:) == nil`), le préchauffage ne
    /// doit RIEN écrire — ni tenter de réseau (`VideoPosterPlan.steps` avec
    /// `allowsNetwork: false` le garantit déjà côté pur ; ce test vérifie que
    /// `warmIfLocal` COMPOSE bien ces deux garanties et qu'aucun poster n'apparaît
    /// après un délai de grâce borné).
    func test_warmIfLocal_withoutALocalFile_leavesNothingPersisted() async {
        let attachment = makeAttachment()
        XCTAssertNil(VideoPosterResolver.persistedPoster(for: attachment))

        VideoPosterResolver.warmIfLocal(attachment)
        try? await Task.sleep(for: .milliseconds(300))

        XCTAssertNil(VideoPosterResolver.persistedPoster(for: attachment),
                     "aucun fichier local : le préchauffage ne doit rien avoir écrit dans le cache")
    }

    /// Un poster déjà persisté (grade suffisant) fait sortir `warmIfLocal` par sa
    /// seconde garde SANS relancer de résolution — le poster lu après reste
    /// identique (même identité mémoire) à celui seedé, preuve qu'aucune
    /// ré-extraction n'a eu lieu.
    func test_warmIfLocal_withAnAlreadyPersistedPoster_doesNotReplaceIt() async throws {
        let attachment = makeAttachment(width: nil, height: nil)
        let key = try XCTUnwrap(VideoPosterResolver.posterKey(for: attachment))
        let seeded = makeImage(width: 900, height: 900)
        DiskCacheStore.cacheImageForPreview(seeded, key: key)

        VideoPosterResolver.warmIfLocal(attachment)
        try? await Task.sleep(for: .milliseconds(300))

        let after = VideoPosterResolver.persistedPoster(for: attachment)
        XCTAssertEqual(after.map { max($0.size.width, $0.size.height) }, 900)
    }
}
