import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les RÈGLES PURES du plein écran
//
// Extraites de `ConversationMediaGalleryView.swift` (#4014) : le fichier
// dépassait le budget 800-1100 (1259 lignes), et la directive du 2026-08-28
// interdit d'ajouter à un fichier hors budget — on extrait d'abord.
//
// La découpe suit la RESPONSABILITÉ, pas une tranche : ces quatre types ne
// rendent rien. Ils décident — quoi préchauffer, quelles pages garder montées,
// quelle source d'image élire. Ils sont déjà testés comme des règles pures, et
// les sortir de la vue rend visible ce qui l'était déjà en fait.

// MARK: - Prewarm

/// Préchauffage du plein écran — au TAP dans la conversation
/// (`ConversationView.onMediaTap`) et pour la fenêtre de rendu
/// (`prefetchNeighbors`). Il chauffe ce que le plein écran AFFICHE, jamais
/// autre chose : image → la variante élue, décodée dans la NSCache (fast-path
/// synchrone de `ProgressiveCachedImage` → affichage instantané, sans
/// placeholder) ; vidéo → le poster NET, extrait SEULEMENT si le fichier est
/// déjà sur l'appareil. Un préchauffage ne touche jamais le réseau pour une
/// vidéo : le fichier lui-même est mis en cache par la page (auto-DL) ou par
/// `SharedAVPlayerManager` au tap lecture.
enum GalleryPrewarm {
    static func warm(_ attachment: MessageAttachment) {
        switch attachment.type {
        case .video:
            VideoPosterResolver.warmIfLocal(attachment)
        case .image:
            // 5.2 — préchauffer la MÊME variante que celle affichée, pas
            // l'original, sinon on téléchargerait les deux.
            let urlStr = GalleryImageSource.fullscreenURL(for: attachment)
            guard !urlStr.isEmpty,
                  let resolved = MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString
            else { return }
            Task { _ = await CacheCoordinator.shared.images.image(for: resolved) }
        case .audio, .file, .location:
            return
        }
    }
}

// MARK: - Render window

/// Combien de pages, de part et d'autre de la page courante, rendent le média
/// PLEIN FORMAT — et lesquelles se contentent d'un aperçu.
///
/// C'est LA règle qui borne le coût de la galerie. Sans elle, le `LazyHStack`
/// réalise une page de plus à chaque swipe et n'en libère jamais aucune : le
/// travail vivant croît avec la distance parcourue, ce qui est exactement le
/// symptôme « plus je défile, plus ça rame ». Isolée ici parce qu'une règle qui
/// borne un coût doit pouvoir être VÉRIFIÉE : le ralentissement qu'elle évite
/// ne se voit sur aucune capture d'écran.
enum GalleryRenderWindow {
    /// Rayon en pages. `1` — la page visible et ses deux voisines immédiates,
    /// soit exactement ce qu'un glissement en cours peut montrer.
    static let radius = 1

    static func rendersFullPixels(distance: Int) -> Bool {
        abs(distance) <= radius
    }

    /// Ce qu'on préchauffe : STRICTEMENT la fenêtre de rendu. Préchauffer
    /// au-delà décoderait des images que personne ne peut voir, donc de la
    /// pression mémoire pure — donc des évictions, donc un re-décodage au
    /// retour, l'inverse de l'intention.
    static func prefetchRange(around index: Int, count: Int) -> ClosedRange<Int>? {
        guard count > 0, index >= 0, index < count else { return nil }
        return max(0, index - radius)...min(count - 1, index + radius)
    }
}

// MARK: - Fullscreen image source

/// Sélection de la variante d'image servie en plein écran.
///
/// Vit ici — et non dans un fichier de pellicule séparé — parce que
/// `UIScreen.main.bounds` y est un budget de DÉCODAGE (la largeur maximale
/// qu'une image pourra jamais devoir couvrir), pas une mesure de mise en page :
/// `WindowMetricsSSOTTests` n'autorise cette lecture que dans les deux fichiers
/// qui la font pour cette raison.
enum GalleryImageSource {
    /// 5.2 — URL d'image à charger en plein écran : la plus petite variante
    /// `>=` la largeur écran (évite l'original multi-Mo quand une 1920 suffit).
    /// Sans variante (image chiffrée) → l'original. Utilisée pour l'affichage ET
    /// le préchauffage (cohérence : on warm ce qu'on affiche). Pas de `targetSize`
    /// downsample côté plein écran : le pinch-zoom a besoin des pixels de la
    /// variante. La sauvegarde Photos garde l'original (qualité maximale).
    @MainActor
    static func fullscreenURL(for attachment: MessageAttachment) -> String {
        let original = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
        guard !original.isEmpty else { return "" }
        let targetPx = Int((UIScreen.main.bounds.width * UIScreen.main.scale).rounded())
        return ImageVariantSelector.bestImageURL(
            variants: attachment.imageVariants ?? [],
            originalURL: original,
            originalWidth: attachment.width,
            targetWidthPx: targetPx
        )
    }
}

// MARK: - Fullscreen image display source

/// Ce que la page image de la fenêtre de rendu MONTE comme source d'affichage.
///
/// Feature 3 — « l'image de base doit être NETTE ; ouvrir en plein écran
/// présuppose que la donnée est chargée, sinon charger et afficher DIRECTEMENT
/// la première image nette — jamais la vignette ». D'où deux cas, et deux
/// seulement : le plein format est RÉSIDENT (affiché tel quel, sans transition)
/// ou il se CHARGE (forcé — l'ouverture est un geste manuel, §14.1 — avec le
/// thumbHash pour seul fond, flou assumé). La vignette `thumbnailUrl` n'est
/// jamais un étage d'affichage : le point de montage ne connaît même pas son
/// URL. Elle pouvait rester l'image affichée quand la politique réseau bloquait
/// le plein format — nette dans une bulle, floue au plein écran.
enum FullscreenImageSource {
    struct Mount: Equatable {
        let fullURL: String
        /// Fond décoratif pendant le chargement — `nil` quand le plein format
        /// est déjà résident (rien à couvrir, aucune transition).
        let backdropThumbHash: String?
        let isResident: Bool
    }

    /// `nil` sans plein format : la page rend alors son glyphe d'état vide.
    nonisolated static func resolve(fullURL: String?, thumbHash: String?, isFullResident: Bool) -> Mount? {
        guard let fullURL, !fullURL.isEmpty else { return nil }
        return Mount(
            fullURL: fullURL,
            backdropThumbHash: isFullResident ? nil : thumbHash,
            isResident: isFullResident
        )
    }

    /// Résidence = image DÉCODÉE en NSCache (lecture mémoire pure, aucun
    /// `stat` par évaluation du `body`). Un fichier sur disque mais évincé de
    /// la NSCache est de toute façon réchauffé de façon synchrone par
    /// `ProgressiveCachedImage.init` — il s'affiche immédiatement, et le fond
    /// passé n'est alors jamais décodé.
    ///
    /// #3897 — `hasAnyCachedImageVariant`, pas `cachedImage(for:)` seul :
    /// cette dernière ne sonde que le slot PLEIN FORMAT (bare), aveugle aux
    /// variantes dimensionnées (128–1024px) qu'une bulle ou un aperçu ont pu
    /// décoder pour la MÊME URL. Une variante bucketée résidente est un
    /// signal juste de résidence pour ce PROBE (backdrop oui/non) même si
    /// elle n'est pas ce que `ProgressiveCachedImage` servira en `fullUrl:`.
    nonisolated static func isResident(_ url: String) -> Bool {
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        return DiskCacheStore.hasAnyCachedImageVariant(for: resolved)
    }
}
