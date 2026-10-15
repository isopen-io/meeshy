import SwiftUI
@preconcurrency import Lottie
import MeeshySDK

// MARK: - La couche Lottie, building block (#10638, spec D6)

/// **Une couche animée posée sur un design** — fond de conversation, bannière de profil,
/// contour d'avatar. Building block AGNOSTIQUE : il prend un fichier de pack (ou un film
/// déjà lu) et `animates`, jamais une décision « quel design, quand animer » — celle-là
/// est à l'app.
///
/// - boucle, moteur Core Animation ;
/// - Réduire les animations ⇒ première image fixe ;
/// - pause quand la couche quitte l'écran ou que l'app passe en arrière-plan, reprise au retour ;
/// - transparente aux touchers et muette pour VoiceOver : un décor ne change ni la cible
///   qu'il couvre ni ce que l'on lit.
public struct LottieLayerView: View {

    let film: LottieFilmSource
    let animates: Bool
    let contentMode: ContentMode

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var onScreen = false

    /// - Parameter contentMode: `.fill` pour un fond ou une bannière (le parent rogne), `.fit` pour un contour.
    public init(film: LottieFilmSource, animates: Bool = true, contentMode: ContentMode = .fit) {
        self.film = film
        self.animates = animates
        self.contentMode = contentMode
    }

    public var body: some View {
        LottieView(animation: film.animation)
            .configuration(LottieLayerPlayback.configuration)
            .playbackMode(LottieLayerPlayback.mode(animates: animates, reduceMotion: reduceMotion, sceneActive: scenePhase == .active, onScreen: onScreen))
            .resizable()
            .aspectRatio(contentMode: contentMode)
            .onAppear { onScreen = true }
            .onDisappear { onScreen = false }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// **La couche d'un fichier de pack** : lit le film (magasin vérifié, hors du fil principal),
/// puis le monte. Tant que le film n'est pas là — ou s'il est illisible — la vue est vide :
/// le design dessiné dessous porte seul le rendu.
public struct PackLottieLayer: View {

    let ref: PackAssetRef?
    let animates: Bool
    let contentMode: ContentMode
    let store: ContentAddressedStore

    @State private var film: LottieFilmSource?

    public init(ref: PackAssetRef?, animates: Bool = true, contentMode: ContentMode = .fit, store: ContentAddressedStore = .shared) {
        self.ref = ref
        self.animates = animates
        self.contentMode = contentMode
        self.store = store
    }

    public var body: some View {
        Group {
            if let film {
                LottieLayerView(film: film, animates: animates, contentMode: contentMode)
            } else {
                Color.clear
            }
        }
        .task(id: ref?.src) {
            film = nil
            guard let ref else { return }
            let loaded = await LottieLayerSource.film(for: ref, store: store)
            guard !Task.isCancelled else { return }
            film = loaded
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
