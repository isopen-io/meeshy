import CoreGraphics

/// **La bande qu'un média AJUSTÉ laisse dans la scène est une SURFACE de
/// composition, pas un vide** (directive porteur 2026-08-31).
///
/// La scène est figée en 9:16 depuis `d75c471d78` — le fond ne lui impose plus
/// sa forme. Un média 16:9 posé en fond et affiché AJUSTÉ (double-tap auteur,
/// `videoFitMode == "fit"`) n'en occupe donc que la tranche centrale, et
/// l'auteur peut écrire, coller, dessiner dans les bandes qui restent. Ces
/// bandes ne sont pas un défaut de cadrage : ce sont des pixels que la
/// publication emporte.
///
/// > « S'il est possible de mettre du texte hors de la zone 16:9 parce que le
/// > canvas est figé 9:16, il faut le représenter dans ce cas avec le ThumbHash
/// > du média posé en fond, et inclure ceux des médias ajoutés en foreground si
/// > nécessaire. »
///
/// **Le ThumbHash EST le bon matériau, et pour une raison qui n'est pas
/// esthétique** : il fait quelques dizaines d'octets, se décode en moins d'une
/// milliseconde, et voyage déjà avec le média sur les trois plateformes. Étiré
/// à la taille du canvas, un bitmap de 32 px de côté rend un flou naturel — pas
/// d'`CIFilter`, pas de rendu hors écran, pas une image de plus à charger. La
/// bande coûte ce que coûte un `CALayer`.
///
/// Cette règle est PURE et rend des valeurs, jamais des vues : ce qu'une bande
/// mesure et ce qui la peint s'éprouvent sans monter le moindre canvas.
///
/// **Elle vit dans MeeshySDK, pas dans MeeshyUI, et ce n'est pas un rangement.**
/// `MeeshyUI` compile sous `defaultIsolation: MainActor` : la conformance
/// `Equatable` d'un type qui y naît est isolée au `MainActor`, et une suite
/// non-`@MainActor` ne peut plus comparer ses valeurs — « main actor-isolated
/// conformance … cannot be used in nonisolated context ». Le placement suit
/// d'ailleurs le tableau du `CLAUDE.md` du SDK : un moteur de règles sans état
/// est un atome, donc du SDK core.
public enum StoryLetterboxFill {

    /// Ce qu'un média AJUSTÉ laisse voir du canvas derrière lui.
    ///
    /// L'épaisseur est celle d'UNE bande — les deux sont symétriques, puisque
    /// `.resizeAspect` centre. La donner permet à un appelant de décider si le
    /// jeu en vaut la chandelle : une bande d'un demi-point n'est pas une
    /// surface de composition, c'est un artefact d'arrondi.
    public enum Bands: Equatable, Sendable {
        case none
        /// Au-dessus ET en dessous — le cas d'un média PAYSAGE dans une scène verticale.
        case horizontal(CGFloat)
        /// À gauche ET à droite — un média plus vertical encore que la scène.
        case vertical(CGFloat)
    }

    /// Sous ce seuil, la bande est un artefact d'arrondi : rien à habiller.
    public nonisolated static let minimumBandPoints: CGFloat = 1

    public nonisolated static func bands(media: CGSize, canvas: CGSize) -> Bands {
        guard media.width > 0, media.height > 0,
              canvas.width > 0, canvas.height > 0 else { return .none }
        let ratioMedia = media.width / media.height
        let ratioCanvas = canvas.width / canvas.height
        if ratioMedia > ratioCanvas {
            let hauteurRendue = canvas.width / ratioMedia
            let bande = (canvas.height - hauteurRendue) / 2
            return bande >= minimumBandPoints ? .horizontal(bande) : .none
        }
        if ratioMedia < ratioCanvas {
            let largeurRendue = canvas.height * ratioMedia
            let bande = (canvas.width - largeurRendue) / 2
            return bande >= minimumBandPoints ? .vertical(bande) : .none
        }
        return .none
    }

    /// **Le remplissage n'existe qu'en mode AJUSTÉ.** En mode rempli (le défaut)
    /// le média couvre le canvas : peindre dessous serait un layer de plus,
    /// jamais un pixel de plus. Loi 8 — le prisme n'affiche que ce dont on a
    /// besoin au moment où on en a besoin.
    ///
    /// `videoFitMode` porte trois valeurs et son nom n'en dit que deux :
    /// `nil` = mode libre (donc rempli), `"fill"` = rempli forcé, `"fit"` =
    /// ajusté. Seule la troisième laisse une bande.
    ///
    /// - Parameter hasSource: y a-t-il de quoi PEINDRE ? La question est posée
    ///   en booléen, et non « le hachage est-il non vide ? », parce que le
    ///   hachage n'est pas la seule source — voir `sourceKind(…)` ci-dessous.
    ///   Poser la question sur le hachage rendait la règle aveugle au cas
    ///   MAJORITAIRE : celui de l'atelier.
    public nonisolated static func isServed(fitMode: String?, hasSource: Bool) -> Bool {
        fitMode == "fit" && hasSource
    }

    /// Ce avec quoi on peint la bande, et **dans l'ordre qui compte**.
    ///
    /// > **Le ThumbHash seul ne suffisait pas, et c'est l'atelier qui le dit.**
    /// > `StoryThumbHashEnricher` ne s'exécute qu'à la PUBLICATION : un média
    /// > que l'auteur vient de choisir dans sa photothèque n'a **aucun**
    /// > hachage. Une règle qui n'accepte que le hachage est donc inerte
    /// > exactement là où le porteur l'a demandée — mesuré au simulateur, le
    /// > jour même de son écriture, sur la bande d'une photo paysage restée nue.
    ///
    /// Le BITMAP déjà stampé passe donc en premier quand il existe : il est en
    /// mémoire, il est exact, et réduit à trente-deux pixels il rend le même
    /// flou que le hachage — qu'il approxime, justement. Le hachage garde le
    /// cas où le bitmap n'est pas encore là : le démarrage à froid du lecteur,
    /// où il est le seul matériau disponible et où il coûte une milliseconde.
    public enum Source: Equatable, Sendable {
        /// Le bitmap de fond déjà posé sur le canvas — exact, sans coût de décodage.
        case stampedBitmap
        /// Le hachage, matériau du démarrage à froid.
        case thumbHash(String)
        case none
    }

    public nonisolated static func source(hasStampedBitmap: Bool,
                                          hashes: [String]) -> Source {
        if hasStampedBitmap { return .stampedBitmap }
        if let premier = hashes.first(where: { !$0.isEmpty }) { return .thumbHash(premier) }
        return .none
    }

    /// Ce que la bande LAISSE VOIR du fond peint dessous. Assez opaque pour que
    /// la bande appartienne visiblement au média, assez transparente pour que le
    /// noir cinéma continue de porter le texte que l'auteur y pose.
    public nonisolated static let fillOpacity: Float = 0.85

    /// **La cascade des sources, dans l'ordre où on les essaie.**
    ///
    /// Le FOND d'abord — c'est lui qu'on est en train d'encadrer, et ses pixels
    /// sont ceux qui touchent le bord de la bande. Puis les médias de premier
    /// plan, par z-index décroissant : quand aucun fond n'existe (une scène
    /// bâtie de collages posés sur une couleur), c'est le collage le plus haut
    /// qui donne le mieux la teinte de la scène. Le ThumbHash de la SLIDE en
    /// dernier : c'est un composite de la scène ENTIÈRE, donc la source la plus
    /// juste pour habiller l'extérieur du canvas et la moins juste pour habiller
    /// l'intérieur d'une bande collée à un média précis.
    ///
    /// > L'ordre est l'INVERSE de celui du backdrop du lecteur
    /// > (`storyBlurredBackdrop`, qui part du composite de slide) — et ce n'est
    /// > pas une divergence : les deux n'encadrent pas la même chose. Le lecteur
    /// > habille l'écran AUTOUR de la scène ; celle-ci habille la scène AUTOUR
    /// > du média.
    public nonisolated static func candidateHashes(effects: StoryEffects) -> [String] {
        let medias = effects.mediaObjects ?? []
        let fond = effects.resolvedBackgroundMedia
        let premierPlan = medias
            .filter { $0.id != fond?.id && !$0.isBackground }
            .sorted { $0.zIndex > $1.zIndex }
        let ordonnees: [String?] = [fond?.thumbHash]
            + premierPlan.map(\.thumbHash)
            + [effects.thumbHash]
        var vues = Set<String>()
        return ordonnees.compactMap { $0 }
            .filter { !$0.isEmpty }
            .filter { vues.insert($0).inserted }
    }
}
