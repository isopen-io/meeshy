import SwiftUI

/// **Une image du cache, ANIMÉE si elle l'est — et rigoureusement rien de
/// changé si elle ne l'est pas** (#4925).
///
/// ## La forme : envelopper, jamais remplacer
///
/// Le repli est fourni par l'appelant en `@ViewBuilder`, et c'est ce qui rend
/// ce lot sûr : `ProgressiveCachedImage` garde son thumbHash, son chargement
/// progressif, son placeholder et sa politique de téléchargement. Une image
/// fixe — la quasi-totalité du fil — suit exactement le chemin qu'elle suivait
/// hier, et le paie au prix d'hier.
///
/// L'alternative aurait été d'ouvrir `ProgressiveCachedImage` (616 lignes, six
/// sites d'appel) pour y ajouter un mode. Chaque site aurait alors porté la
/// question « celui-ci anime-t-il ? », y compris les avatars et les bannières,
/// pour qui la réponse est non par construction.
///
/// ## Ce que la vue ne décide PAS
///
/// Quand tenter, et le mouvement réduit : `AnimatedImageResolution`. La vue ne
/// porte que le montage — c'est la règle qui se mesure, pas elle.
public struct AnimatedCachedImage<Fallback: View>: View {

    private let urlString: String?
    private let animates: Bool
    private let contentMode: UIView.ContentMode
    private let pointSize: CGFloat
    private let fallback: () -> Fallback

    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    /// Décodé, donc animé. `nil` ⇒ le repli, qui est aussi l'état de départ :
    /// l'image fixe s'affiche immédiatement et la version animée la remplace
    /// dès qu'elle est prête, sur la MÊME première image — la bascule ne se
    /// voit pas.
    @State private var decoded: AnimatedImageDecoder.Decoded?

    public init(
        urlString: String?,
        animates: Bool = true,
        pointSize: CGFloat,
        contentMode: UIView.ContentMode = .scaleAspectFit,
        @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        self.urlString = urlString
        self.animates = animates
        self.pointSize = pointSize
        self.contentMode = contentMode
        self.fallback = fallback
    }

    private var reduceMotion: Bool { systemReduce || userForced }

    /// Le plafond de décodage en PIXELS, dérivé de la taille RENDUE : décoder
    /// trente images en pleine résolution pour les peindre dans 120 pt coûterait
    /// trente bitmaps pour rien. Plancher à 64 px — une taille encore à zéro
    /// rendrait un plafond nul, et ImageIO refuserait toute vignette : un
    /// sticker qui n'apparaît jamais, sans erreur nulle part.
    private var pixelBudget: Int { max(64, Int((pointSize * displayScale).rounded())) }

    public var body: some View {
        Group {
            if let decoded {
                // Vue UIKit hébergée : elle avalerait l'appui long de la bulle
                // qui la porte. Transparente aux touchers ; la case reste
                // touchable par `contentShape`.
                AnimatedImageView(decoded: decoded, contentMode: contentMode)
                    .allowsHitTesting(false)
            } else {
                fallback()
            }
        }
        .contentShape(Rectangle())
        .task(id: taskKey) { await resolve() }
    }

    /// `reduceMotion` fait partie de la clé : la préférence peut changer pendant
    /// la session, et l'animation doit alors partir — ou revenir — sans qu'on
    /// ait à quitter l'écran.
    private var taskKey: String { "\(urlString ?? "")|\(animates)|\(reduceMotion)|\(pixelBudget)" }

    /// **Le décodage quitte le fil principal** (#9210) : la tâche d'une vue
    /// est isolée au fil principal, et N images s'y décodaient pour chaque case
    /// qui entre pendant un défilement — une grille de stickers animés y perdait
    /// des images. Seule la pose de l'état revient au fil principal.
    private func resolve() async {
        let rendu = await AnimatedCachedImageDecoding.resolve(
            urlString: urlString,
            animates: animates,
            reduceMotion: reduceMotion,
            maxPixelSize: pixelBudget
        )
        guard !Task.isCancelled else { return }
        decoded = rendu?.decoded
    }
}

/// Une animation décodée, traversant du décodage concurrent vers la vue —
/// des `CGImage` immuables, lues et jamais mutées.
nonisolated struct AnimatedDecodedFrames: @unchecked Sendable {
    let decoded: AnimatedImageDecoder.Decoded
}

/// **Le décodage d'`AnimatedCachedImage`, HORS du fil principal** (#9210) —
/// la règle d'`AnimatedImageResolution`, exécutée sur l'exécuteur concurrent.
nonisolated enum AnimatedCachedImageDecoding {

    /// Les octets par la pile de cache des images, puis le décodage.
    @concurrent
    static func resolve(urlString: String?, animates: Bool, reduceMotion: Bool,
                        maxPixelSize: Int) async -> AnimatedDecodedFrames? {
        let loader = DiskCacheImageLoader()
        return await resolve(urlString: urlString, animates: animates, reduceMotion: reduceMotion,
                             maxPixelSize: maxPixelSize) { await loader.data(for: $0) }
    }

    @concurrent
    static func resolve(urlString: String?, animates: Bool, reduceMotion: Bool, maxPixelSize: Int,
                        loader: @Sendable (String) async -> Data?) async -> AnimatedDecodedFrames? {
        let decoded = await AnimatedImageResolution.resolve(
            urlString: urlString,
            animates: animates,
            reduceMotion: reduceMotion,
            maxPixelSize: maxPixelSize,
            loader: loader
        )
        return decoded.map(AnimatedDecodedFrames.init(decoded:))
    }
}
