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

// MARK: - Où trouver la place quand la légende se déplie

/// **Déplier une légende demande de la place, et chaque surface la prend
/// ailleurs** (directive porteur 2026-09-02).
///
/// > « Le contenu doit pouvoir s'afficher en dessous de l'auteur et quand on
/// > affiche / déplie pour tout voir, les détails d'auteur se cachent pour
/// > afficher le contenu. […] Pour les story pas besoin de cacher quoi que ce
/// > soit, quand on déplie, on floute juste la story. »
///
/// Deux réponses à UNE question, et la différence n'est pas un goût : elle
/// vient du VOISINAGE. Le plein écran média porte, sous la légende, une carte
/// d'auteur et une pellicule — la place se prend donc en les retirant. La story
/// n'a rien sous sa légende : sa scène occupe tout, elle recule au lieu de
/// céder.
///
/// La règle vit ici pour être interrogeable : un troisième hôte qui monterait
/// la couche partagée devra DIRE lequel des deux comportements il adopte, au
/// lieu de recopier l'un des deux au jugé.
enum CaptionExpansionSpace {

    /// Les détails d'auteur restent-ils visibles ? Non dès que la légende est
    /// dépliée — c'est la place qu'elle occupe.
    nonisolated static func showsAuthorDetails(captionExpanded: Bool) -> Bool {
        !captionExpanded
    }

    /// Opacité de la scène d'une story pendant que sa légende est dépliée.
    ///
    /// **Ce n'est PAS un flou qu'on ajoute** (correction porteur 2026-09-02) :
    ///
    /// > « le flou c'est pas un voile qui apparaît mais le contenu qui disparaît
    /// > un peu pour laisser le thumbnail naturel du background si on a un média
    /// > sur la scène, sinon on laisse la couleur de fond simplement »
    ///
    /// Le lecteur monte DÉJÀ, sous la scène, un fond dérivé du ThumbHash de la
    /// slide — flou, à la bonne couleur, et gratuit puisqu'il est là pour le
    /// démarrage à froid (« Layer 1.5 »). Effacer la scène le révèle. Sans média,
    /// c'est la couleur de fond de la story qui remonte, sans rien de plus.
    ///
    /// > Un voile AJOUTE une couche que personne n'a demandée ; effacer en
    /// > RÉVÈLE une qui était déjà juste. La seconde coûte moins cher à la
    /// > machine et ment moins à l'œil — le fond qu'on découvre est vraiment
    /// > celui de cette story, pas un gris générique.
    ///
    /// Se COMPOSE avec l'opacité de transition du canvas (`contentOpacity`) par
    /// multiplication : les deux disent la même chose — « combien de cette scène
    /// voit-on ? » — et se cumulent au lieu de se remplacer.
    nonisolated static func storySceneOpacity(captionExpanded: Bool) -> Double {
        captionExpanded ? 0.28 : 1
    }

    /// **La bande que le rail d'actions occupe à droite de la scène.**
    ///
    /// Repliée, la légende tient dans le bas et ne rencontre personne ; dépliée,
    /// elle monte et traverse le rail (Envoyer, Vues, Partager, Enregistrer,
    /// Traductions), qui court sur presque toute la hauteur. Le corpus lui laisse
    /// donc cette bande — et la zone tactile du retour en tête aussi, sans quoi
    /// un tap destiné au rail remonterait le texte à la place.
    ///
    /// > Deux vues qui doivent éviter le MÊME voisin doivent l'éviter avec le
    /// > MÊME nombre. Deux littéraux identiques ne sont pas une règle partagée :
    /// > ils sont deux règles qui se ressemblent, jusqu'au jour où le rail bouge.
    ///
    /// C'est la bande BRUTE, en points d'ÉCRAN. Les vues qui vivent dans la
    /// colonne du canvas ne l'emploient jamais telle quelle : elles passent par
    /// `railClearanceInset(columnWidth:viewportWidth:)`, qui la traduit dans leur
    /// repère.
    nonisolated static var storyActionRailInset: CGFloat { 68 }

    /// **Ce que le chrome haut du lecteur ne cède JAMAIS** — barres de
    /// progression, ligne d'auteur, fermeture.
    ///
    /// La zone qui ramène le corpus en tête couvre le vide au-dessus du texte :
    /// c'est ce qui la rend atteignable sans viser. Mais elle est montée en
    /// `zIndex(60)`, donc AU-DESSUS du chrome — sans cette réserve, elle
    /// avalerait le bouton de fermeture de la story, et l'utilisateur qui veut
    /// sortir remonterait un texte à la place.
    ///
    /// Le nombre est celui que le lecteur réserve déjà à son chrome pour borner
    /// le rail (`topReserved`, `StoryViewerView+Canvas`) : la même bande, dite
    /// une seule fois.
    nonisolated static func storyTopChromeReserve(topInset: CGFloat) -> CGFloat {
        topInset + 100
    }

    /// **Le dégagement du rail, EN COORDONNÉES DE COLONNE** — qui n'est pas la
    /// même chose qu'en coordonnées d'écran.
    ///
    /// Sert aux DEUX voisins du rail : le corpus déplié (que le texte ne doit
    /// pas chevaucher) et la zone qui le ramène en tête (qui ne doit pas
    /// avaler ses touchers).
    ///
    /// La légende vit dans la colonne du CANVAS, qui déborde volontairement le
    /// viewport pour la pagination (mesuré : 491,3 pt pour un écran de 402, donc
    /// 44,7 pt de débordement de chaque côté). C'est ce cadrage qui a sauvé le
    /// texte en #4762 — sans lui il sortait par la gauche.
    ///
    /// > Le même cadrage qui a réparé le TEXTE trahit la zone TACTILE. Un
    /// > retrait de 68 pt exprimé dans une colonne de 491 laisse son bord droit
    /// > à 378 pt d'écran, pas à 334 : le rail d'actions se retrouve recouvert
    /// > aux trois quarts. Un nombre juste dans un repère est faux dans l'autre,
    /// > et rien ne le signale — les deux valent « 68 ».
    ///
    /// On rend donc au retrait ce que le débordement lui a pris. À gauche, rien
    /// à faire : déborder hors de l'écran n'y prend aucun toucher.
    nonisolated static func railClearanceInset(columnWidth: CGFloat,
                                               viewportWidth: CGFloat) -> CGFloat {
        max(0, (columnWidth - viewportWidth) / 2) + storyActionRailInset
    }
}
