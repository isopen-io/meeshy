import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// Plein écran NET (feature 3) — « l'image de base doit être nette ; pour une
/// vidéo, une image nette AVANT le play ; ouvrir en plein écran présuppose que
/// la donnée est chargée, sinon on charge et on affiche DIRECTEMENT la première
/// image nette — jamais la vignette comme image affichée ».
///
/// Deux décisions PURES portent la règle (`FullscreenImageSource`,
/// `VideoPosterPlan` / `VideoPosterGrade`), testées pour ce qu'elles décident ;
/// le reste — QUI monte QUOI dans la fenêtre de rendu — est un câblage SwiftUI
/// que ViewInspector ne lit pas, verrouillé en gardes de source (patron
/// `ConversationMediaGalleryScrollTests`). Le code est lu commentaires retirés.
@MainActor
final class ConversationMediaGalleryFullscreenSharpTests: XCTestCase {

    // MARK: - Image : source d'affichage du plein écran

    func test_imageSource_residentFull_isDisplayedImmediately_withoutBackdrop() throws {
        let mount = try XCTUnwrap(FullscreenImageSource.resolve(
            fullURL: "https://cdn.meeshy.me/x-1920.webp",
            thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            isFullResident: true
        ))
        XCTAssertTrue(mount.isResident)
        XCTAssertEqual(mount.fullURL, "https://cdn.meeshy.me/x-1920.webp")
        XCTAssertNil(mount.backdropThumbHash, "plein format résident : aucun fond, aucune transition")
    }

    func test_imageSource_absentFull_isForcedLoad_withThumbHashAsDecorativeBackdropOnly() throws {
        let mount = try XCTUnwrap(FullscreenImageSource.resolve(
            fullURL: "https://cdn.meeshy.me/x-1920.webp",
            thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
            isFullResident: false
        ))
        XCTAssertFalse(mount.isResident)
        XCTAssertEqual(mount.fullURL, "https://cdn.meeshy.me/x-1920.webp",
                       "c'est le plein format qui se charge — l'ouverture est un geste manuel, jamais gaté par la politique réseau")
        XCTAssertEqual(mount.backdropThumbHash, "1QcSHQRnh493V4dIh4eXh1h4kJUI", "le thumbHash n'est qu'un fond (flou assumé)")
    }

    /// LA règle : la vignette n'est jamais un étage d'affichage. Le point de
    /// montage ne connaît même pas son URL — la seule source servie est le plein
    /// format (ou rien).
    func test_imageSource_withoutFullURL_isNil_neverFallsBackToAThumbnail() {
        XCTAssertNil(FullscreenImageSource.resolve(fullURL: nil, thumbHash: "abc", isFullResident: false))
        XCTAssertNil(FullscreenImageSource.resolve(fullURL: "", thumbHash: "abc", isFullResident: true))
    }

    // MARK: - Image : probe de résidence (#3897)

    func test_isResident_withNothingCached_isFalse() {
        let url = "https://cdn.meeshy.me/x-\(UUID().uuidString).webp"
        XCTAssertFalse(FullscreenImageSource.isResident(url))
    }

    func test_isResident_withTheBareFullFormatSlotCached_isTrue() {
        let url = "https://cdn.meeshy.me/x-\(UUID().uuidString).webp"
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40), format: format).image { ctx in
            UIColor.blue.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }
        DiskCacheStore.cacheImageForPreview(image, key: url)

        XCTAssertTrue(FullscreenImageSource.isResident(url))
    }

    /// #3897 — LE défaut : `isResident` sondait `cachedImage(for:)`, le slot
    /// PLEIN FORMAT (bare) seul, aveugle aux variantes dimensionnées
    /// (128–1024px) qu'une bulle ou un aperçu ont pu décoder pour la MÊME
    /// URL. `hasAnyCachedImageVariant` est la sonde JUSTE — un revert vers
    /// `cachedImage(for: resolved)` (bare, sans bucket) fait rougir ce test.
    func test_isResident_readsThroughHasAnyCachedImageVariant_notTheBareSlotAlone() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let fn = try block(from: "nonisolated static func isResident(_ url: String) -> Bool {", upTo: "}\n}", in: code)
        XCTAssertTrue(fn.contains("DiskCacheStore.hasAnyCachedImageVariant(for: resolved)"))
        XCTAssertFalse(fn.contains("DiskCacheStore.cachedImage(for: resolved) != nil"),
                       "aveugle au bucket de variante — une bulle ayant décodé 512px ne comptait pas comme résidente")
    }

    // MARK: - Vidéo : plan du poster net

    private let remote = URL(string: "https://cdn.meeshy.me/clip.mp4")!
    private let local = URL(fileURLWithPath: "/tmp/clip.mp4")

    func test_posterPlan_localFile_decodesTheFileAndNothingElse() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: local, remoteURL: remote, policyAllowsDownload: true,
                                  allowsNetwork: true, intent: .userOpened),
            [.decodeLocalFile(local)],
            "le fichier est là : la première image nette vient de lui — aucun réseau"
        )
    }

    func test_posterPlan_remote_policyAllows_awaitsTheDownloadThenFallsBackToRange() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: true,
                                  allowsNetwork: true, intent: .userOpened),
            [.downloadThenDecode(remote), .rangeExtract(remote)]
        )
    }

    /// La politique autorise le téléchargement : le préchauffage passif suit la
    /// MÊME cascade — c'est la politique, pas l'intention, qui décide ici.
    func test_posterPlan_remote_policyAllows_ambientPrewarmFollowsTheSameCascade() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: true,
                                  allowsNetwork: true, intent: .ambientPrewarm),
            [.downloadThenDecode(remote), .rangeExtract(remote)]
        )
    }

    func test_posterPlan_remote_policyDenies_userGesture_extractsByRangeOnly() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: false,
                                  allowsNetwork: true, intent: .userOpened),
            [.rangeExtract(remote)],
            "data-saver : pas de téléchargement complet, mais le geste manuel autorise l'extraction d'un Mo"
        )
    }

    /// LE défaut du plein écran net : `policyAllowsDownload` ne choisissait que
    /// le TYPE de réseau, jamais SI un réseau a lieu. Ouvrir la galerie sur une
    /// image dont la VOISINE est une vidéo tirait le premier Mo de cette vidéo
    /// — en « Jamais télécharger », sur cellulaire, sans que personne ne l'ait
    /// touchée. Un octet ne se paie que sur un geste porté sur CE média.
    func test_posterPlan_remote_policyDenies_ambientPrewarm_touchesNothing() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: false,
                                  allowsNetwork: true, intent: .ambientPrewarm),
            [],
            "politique restrictive + aucun geste sur CETTE vidéo : pas un octet, le repli thumbHash suffit"
        )
    }

    func test_posterPlan_withoutNetwork_isEmpty() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: true,
                                  allowsNetwork: false, intent: .userOpened),
            [],
            "hors ligne / préchauffage : rien à extraire — le repli vignette/thumbHash s'affiche sans attendre"
        )
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: remote, policyAllowsDownload: false,
                                  allowsNetwork: false, intent: .ambientPrewarm),
            []
        )
    }

    func test_posterPlan_withoutAnySource_isEmpty() {
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: nil, policyAllowsDownload: true,
                                  allowsNetwork: true, intent: .userOpened),
            []
        )
        XCTAssertEqual(
            VideoPosterPlan.steps(localFileURL: nil, remoteURL: local, policyAllowsDownload: true,
                                  allowsNetwork: true, intent: .userOpened),
            [],
            "un `file://` absent ne se télécharge ni ne s'extrait par Range"
        )
    }

    // MARK: - Vidéo : grade du poster persisté

    /// La clé `thumb:<url>` est PARTAGÉE avec les écrivains de grade bulle
    /// (300/400 px). Un poster de ce grade n'est pas net en plein écran : il
    /// est refusé et ré-extrait — mais un poster borné par sa SOURCE l'est.
    func test_posterGrade_rejectsBubbleGradePosters_forAFullHDSource() {
        XCTAssertFalse(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 300, sourceMaxDimension: 1920))
        XCTAssertFalse(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 400, sourceMaxDimension: 1920))
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 1920, sourceMaxDimension: 1920))
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 1920, sourceMaxDimension: 3840),
                      "4K rabattu à l'extraction max : c'est le grade plein écran")
    }

    func test_posterGrade_acceptsAPosterBoundedByASmallSource() {
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 854, sourceMaxDimension: 854),
                      "une source 480p ne peut rien donner de plus net que 854 px")
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 320, sourceMaxDimension: 320))
    }

    /// Défaut INVERSÉ, corrigé. `sourceMaxDimension` est `nil` pour la plupart
    /// des VIDÉOS — Prisma range `width`/`height` sous « métadonnées spécifiques
    /// aux images » et le chemin chiffré ne les écrit jamais : c'est le cas
    /// NOMINAL, pas un cas limite. Le repli `?? fullscreenMinDimension` exigeait
    /// donc 1080 px d'une source dont on ne sait rien : une frame 854×480 — tout
    /// ce que la cascade pouvait produire — était rejetée, ré-extraite (1 Mo) à
    /// chaque entrée dans la fenêtre de rendu, indéfiniment. La question juste
    /// n'est pas « fait-elle 1080 ? » mais « une ré-extraction ferait-elle
    /// MIEUX ? » : sur une source inconnue, non.
    func test_posterGrade_unknownSource_acceptsWhatOurOwnExtractionCanProduce() {
        // #3897 (tautologie retirée) : une seconde assertion réinjectait
        // `VideoPosterGrade.fullscreenMinDimension` (1080, le SEUIL de
        // l'ANCIEN défaut) comme `posterMaxDimension` — mais ce code path
        // (source inconnue) ne compare plus JAMAIS à `fullscreenMinDimension`,
        // seulement à `bubbleGradeMaxDimension` (400). N'importe quelle valeur
        // > 400 aurait rendu `true` de façon identique : l'assertion ne
        // vérifiait rien de spécifique à cette constante, sur ce chemin.
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 854, sourceMaxDimension: nil),
                      "480p extrait par la cascade : rien de plus net n'existe — l'exiger boucle sans fin")
    }

    /// … sans pour autant tout accepter : la clé `thumb:<url>` est PARTAGÉE
    /// avec les écrivains de grade BULLE (`MeeshyVideoThumbnail` 300 px,
    /// `StoryMediaLoader` 400 px), et une bulle rend TOUJOURS avant le plein
    /// écran. Accepter n'importe quoi ferait servir leur vignette en plein
    /// écran — le défaut même que la feature corrige. Le plancher, source
    /// inconnue, est donc ce plafond-là : au-dessus, le poster ne peut venir
    /// que de la cascade plein écran.
    func test_posterGrade_unknownSource_stillRejectsABubbleGradeThumbnail() {
        XCTAssertFalse(VideoPosterGrade.isFullscreenSharp(posterMaxDimension: 300, sourceMaxDimension: nil))
        XCTAssertFalse(VideoPosterGrade.isFullscreenSharp(
            posterMaxDimension: VideoPosterGrade.bubbleGradeMaxDimension, sourceMaxDimension: nil))
        XCTAssertTrue(VideoPosterGrade.isFullscreenSharp(
            posterMaxDimension: VideoPosterGrade.bubbleGradeMaxDimension + 1, sourceMaxDimension: nil))
    }

    // MARK: - Gardes de source

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func block(from startMarker: String, upTo endMarker: String, in code: String) throws -> String {
        guard let start = code.range(of: startMarker) else {
            XCTFail("marqueur introuvable : \(startMarker)"); return ""
        }
        let end = code.range(of: endMarker, range: start.upperBound..<code.endIndex)?.lowerBound ?? code.endIndex
        return String(code[start.lowerBound..<end])
    }

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"
    private static let conversation = "Meeshy/Features/Main/Views/ConversationView.swift"
    private static let legacyPlayer = "Meeshy/Features/Main/Views/VideoLegacySupport.swift"
    private static let resolver = "Meeshy/Features/Main/Views/VideoPosterResolver.swift"

    /// Dans la fenêtre de rendu, la page image monte le plein format FORCÉ.
    /// Corrigé (#3895) : `mount == nil` doit rendre le glyphe d'état vide —
    /// jamais un `ProgressiveCachedImage(fullUrl: nil)` qui tourne pour
    /// toujours — et la vignette serveur redevient un ÉTAGE DE CHARGEMENT
    /// (jamais l'étage final : `fullUrl` reste le plein format forcé) tant
    /// que le plein format n'est pas résident, pour ne pas régresser vers un
    /// thumbHash ~32px étiré plein écran sur lien lent.
    func test_imagePage_inWindow_mountsTheFullFormatForced_withAThumbnailLoadingStage() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let page = try block(from: "struct GalleryImagePage: View, Equatable", upTo: "struct GalleryVideoPage", in: code)
        // `upTo: "targetSize: Self.previewSize"` — pas `"} else {"` : la
        // structure interne `if let mount { … } else { emptyStateGlyph }`
        // contient SON PROPRE `} else {`, atteint par `block()` avant celui
        // qui ferme réellement `if rendersFullPixels` — un marqueur unique à
        // la branche hors-fenêtre (thumbnail preview) fixe la borne juste.
        let inWindow = try block(from: "if rendersFullPixels {", upTo: "targetSize: Self.previewSize", in: page)
        XCTAssertTrue(inWindow.contains("FullscreenImageSource.resolve("),
                      "la source d'affichage passe par la décision pure")
        XCTAssertTrue(inWindow.contains("if let mount {"),
                      "mount == nil doit être géré explicitement — jamais monter ProgressiveCachedImage(fullUrl: nil)")
        XCTAssertTrue(inWindow.contains("emptyStateGlyph"),
                      "sans plein format à charger, la page rend le glyphe d'état vide, jamais un spinner infini")
        XCTAssertTrue(inWindow.contains("thumbnailUrl: mount.isResident ? nil : thumbnailURL"),
                      "vignette serveur en étage de CHARGEMENT (pas la vignette blur ~32px) tant que non résident")
        XCTAssertTrue(inWindow.contains("autoLoad: true"),
                      "l'ouverture plein écran est un geste manuel : le plein format se charge toujours (§14.1)")
    }

    /// `FullscreenImageSource.resolve` rend `nil` (aucune URL plein format
    /// exploitable) : la page ne doit JAMAIS monter `ProgressiveCachedImage`
    /// avec `fullUrl: nil` — ce qui produit un spinner qui tourne pour
    /// toujours puisque `fullUrl` ne se peuplera jamais. Le doc-comment de
    /// `FullscreenImageSource` promet un glyphe d'état vide ; ce test verrouille
    /// que le code ne jette plus le cas `nil` via l'optional-chaining qui
    /// produisait le défaut (`mount?.fullURL` toujours atteignable même quand
    /// `mount == nil`, au lieu d'un branchement explicite).
    func test_imagePage_withoutMount_neverOptionalChainsIntoAnInfiniteSpinner() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let page = try block(from: "struct GalleryImagePage: View, Equatable", upTo: "struct GalleryVideoPage", in: code)
        let inWindow = try block(from: "if rendersFullPixels {", upTo: "targetSize: Self.previewSize", in: page)
        XCTAssertFalse(inWindow.contains("fullUrl: mount?.fullURL"),
                      "l'optional-chaining sur mount jette le cas nil au lieu de le traiter explicitement")
        XCTAssertFalse(inWindow.contains("thumbHash: mount?.backdropThumbHash"),
                      "idem pour le thumbHash — jeté silencieusement quand mount == nil")
    }

    /// Le poster net reste monté tant que la couche vidéo n'a pas COMPOSÉ sa
    /// première frame — `isPlaying` bascule avant, et retirer le poster sur ce
    /// seul signal laissait un écran noir.
    func test_videoPage_keepsThePoster_untilTheSurfaceComposedItsFirstFrame() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let page = try block(from: "struct GalleryVideoPage: View, Equatable", upTo: "private var dismissGesture", in: code)
        XCTAssertTrue(page.contains("if !isPlayerActive || !surfaceReady {"),
                      "le poster ne se retire que sur la première frame composée")
        XCTAssertTrue(page.contains("onReadyForDisplay: { surfaceReady = true }"))
    }

    /// L'extraction vit DANS la tâche gardée par `isWindowed` : hors fenêtre,
    /// une page vidéo n'extrait rien (leçon 292 — vingt vidéos, vingt extractions).
    func test_videoPage_resolvesItsPoster_insideTheWindowedTask() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let task = try block(from: ".task(id: \"\\(attachment.id)#\\(isWindowed)\")", upTo: ".onReceive(", in: code)
        XCTAssertTrue(task.contains("guard isWindowed else { return }"))
        XCTAssertTrue(task.contains("resolvePosterIfNeeded()"),
                      "le poster net se résout après la disponibilité, dans la même tâche fenêtrée")
    }

    /// #3896 — cette garde ciblait `"thumbnailUrl: thumbUrl"` : cet identifiant
    /// (`thumbUrl`) n'existe nulle part dans `ConversationMediaGalleryView.swift`
    /// — la liaison vivante est `serverThumbnailURL` (déclarée juste après ce
    /// bloc). La garde ne pouvait donc JAMAIS rougir, quel que soit le
    /// contenu réel de `thumbnailLayer`. Corrigée pour cibler l'identifiant
    /// vivant : `serverThumbnailURL` ne doit jamais être passé comme
    /// `thumbnailUrl:` (étage intermédiaire) — seulement comme `fullUrl:`
    /// (dernier recours forcé), sinon la vignette pourrait rester affichée
    /// indéfiniment au lieu d'un plein format net.
    func test_videoPage_thumbnailLayer_servesThePoster_thenTheServerThumbnailForced_neverAsAStage() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let layer = try block(from: "private var thumbnailLayer: some View {", upTo: "private var playOrDownloadButton", in: code)
        XCTAssertTrue(layer.contains("if let poster {"))
        XCTAssertTrue(layer.contains("thumbnailUrl: nil"), "la vignette serveur n'est montée qu'en DERNIER recours, comme source plein format forcée")
        XCTAssertTrue(layer.contains("fullUrl: serverThumbnailURL"),
                      "la vignette serveur — l'identifiant VIVANT — est la source plein format forcée")
        XCTAssertTrue(layer.contains("autoLoad: true"))
        XCTAssertFalse(layer.contains("thumbnailUrl: serverThumbnailURL"),
                       "jamais comme étage intermédiaire — elle pourrait alors rester affichée indéfiniment")
    }

    /// Préchauffage : image → la variante AFFICHÉE ; vidéo → le poster net
    /// extrait SEULEMENT si le fichier est déjà sur l'appareil (jamais de réseau).
    func test_prewarm_video_extractsThePosterOnlyFromALocalFile() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let warm = try block(from: "enum GalleryPrewarm {", upTo: "enum GalleryRenderWindow {", in: code)
        XCTAssertTrue(warm.contains("VideoPosterResolver.warmIfLocal("))
        XCTAssertTrue(warm.contains("GalleryImageSource.fullscreenURL(for:"))
    }

    /// Le préchauffage de la fenêtre ne demande JAMAIS le réseau — et il le dit
    /// deux fois : `allowsNetwork: false` (aucun octet) et l'intention ambiante
    /// (aucun geste sur ce média).
    func test_prewarm_video_neverAsksForTheNetwork() throws {
        let code = AppSourceGuard.stripComments(try source(Self.resolver))
        let warm = try block(from: "static func warmIfLocal(", upTo: "static func poster(", in: code)
        XCTAssertTrue(warm.contains("allowsNetwork: false"))
        XCTAssertTrue(warm.contains("intent: .ambientPrewarm"))
    }

    /// Le plein écran ouvert depuis une bulle EST un geste sur ce média : sa
    /// cascade a le droit du Mo, même en politique restrictive (§14.1).
    func test_bubbleFullscreenPoster_isResolvedAsAUserGesture() throws {
        let code = AppSourceGuard.stripComments(try source(Self.resolver))
        let poster = try block(from: "static func poster(for attachment:", upTo: "// MARK: Faits", in: code)
        XCTAssertTrue(poster.contains("intent: .userOpened"))
    }

    /// Dans la galerie, la page VOISINE (±1) est rendue mais personne ne l'a
    /// ouverte : elle résout son poster en intention AMBIANTE. Seule la page
    /// courante — celle que l'utilisateur regarde — porte le geste.
    func test_videoPage_onlyTheActivePageCarriesTheUserGesture() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let resolve = try block(from: "private func resolvePosterIfNeeded() async {",
                                upTo: "private var playOrDownloadButton", in: code)
        XCTAssertTrue(resolve.contains("intent: isActive ? .userOpened : .ambientPrewarm"),
                      "la voisine ne paie pas le Mo d'une vidéo que personne n'a touchée")
        let host = try block(from: "GalleryVideoPage(", upTo: ".equatable()", in: code)
        XCTAssertTrue(host.contains("isActive: distance == 0"),
                      "la page active est celle dont la distance à l'index courant est nulle")
    }

    /// Une page voisine qui DEVIENT courante rejoue sa résolution : le geste
    /// arrive après coup, et sans ce relais le poster resterait absent jusqu'au
    /// démontage de la page.
    func test_videoPage_becomingActive_replaysTheResolutionWithTheGesture() throws {
        let code = AppSourceGuard.stripComments(try source(Self.gallery))
        let task = try block(from: ".task(id: isActive) {", upTo: ".task(id: isPlayerActive)", in: code)
        XCTAssertTrue(task.contains("guard isWindowed, isActive, poster == nil else { return }"))
        XCTAssertTrue(task.contains("resolvePosterIfNeeded()"))
    }

    /// Au tap dans la conversation, on préchauffe ce que le plein écran AFFICHE
    /// — pas l'original (`fileUrl`), sinon les deux se téléchargeaient.
    func test_conversationTap_prewarmsTheDisplayedVariant_notTheOriginal() throws {
        let code = AppSourceGuard.stripComments(try source(Self.conversation))
        let tap = try block(from: "onMediaTap: { attachment in", upTo: "onConsumeViewOnce:", in: code)
        XCTAssertTrue(tap.contains("GalleryPrewarm.warm(attachment)"))
        XCTAssertFalse(tap.contains("images.data(for:"), "plus de préchauffage de l'original dans le store images")
    }

    /// Le plein écran vidéo ouvert depuis une BULLE (`MeeshyVideoPlayer`
    /// `.fullscreen`, SDK) reçoit son poster résolu côté app — sinon le renderer
    /// n'a que le thumbHash à montrer avant la première frame.
    func test_bubbleFullscreenVideo_passesTheAppResolvedPoster() throws {
        let code = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        )
        XCTAssertTrue(code.contains("poster: VideoPosterResolver.poster(for: attachment)"))
    }

    func test_fullscreenLayerView_reportsItsFirstFrame_viaIsReadyForDisplayKVO() throws {
        let code = AppSourceGuard.stripComments(try source(Self.legacyPlayer))
        XCTAssertTrue(code.contains("observe(\\.isReadyForDisplay"))
        XCTAssertTrue(code.contains("var onReadyForDisplay: (() -> Void)? = nil"))
    }
}
