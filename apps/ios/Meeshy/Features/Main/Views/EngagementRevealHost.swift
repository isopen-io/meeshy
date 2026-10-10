import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'hôte de la célébration — le MÊME sur les deux racines.**
///
/// `RootView` (iPhone) et `iPadRootView` montent des arbres différents ; un
/// hôte écrit deux fois diverge, et la divergence ne rougit nulle part
/// (mesuré le 2026-09-08 sur « Publier un post », dont le drapeau n'avait de
/// lecteur que côté iPhone). Il est donc écrit UNE fois et posé en une ligne
/// de chaque côté.
///
/// ## Deux portes, et une seule règle
///
/// 1. **Le TAP** sur une notification de palier (`router.pendingEngagementReveal`).
///    La révélation COUVRE le tableau de bord plutôt que de le précéder dans la
///    pile : le tap pousse `.progression` comme avant, et la célébration se pose
///    par-dessus. En la refermant, l'utilisateur est déjà arrivé.
///
/// 2. **LE GESTE — sans que personne ne touche rien (#5847).** Directive porteur
///    (2026-09-09) : *« la vue d'achievement s'affiche lorsqu'on a réalisé une
///    opération qui déclenche un succès, le reste ce sont des notifications rien
///    de plus »*. Un succès annoncé par la passerelle arrive en direct par le
///    socket ; il se célèbre là, au moment où l'utilisateur vient d'agir.
///    Attendre un tap faisait arriver la récompense sous forme de devoir.
///
/// **Seul un SUCCÈS passe par la seconde porte** (`celebratesUnprompted`). Un
/// badge, une série, un niveau tombent au fil de l'usage : interrompre à chaque
/// fois ferait de la célébration un bruit — et le premier bruit qu'on apprend à
/// ignorer est celui qui devait faire plaisir. Ils gardent la première porte :
/// quelqu'un qui TOUCHE la notification d'une série a demandé à la voir.
private struct RevealItem: Identifiable {
    let reveal: EngagementReveal

    /// L'identité est le PALIER, pas un `UUID` neuf à chaque construction : la
    /// file reconstruit cet enveloppe à chaque rendu, et une identité instable
    /// ferait re-présenter la même célébration en boucle.
    var id: String { String(describing: reveal) }
}

struct EngagementRevealHost: ViewModifier {
    @ObservedObject var router: Router
    @State private var file = EngagementRevealQueue()
    /// La carte du succès qu'on vient de célébrer (#7742) : le déroulé photo, ouvert PAR-DESSUS la révélation.
    @State private var photo: GamePhotoSession?
    /// Le dernier bloc `game` connu — lu dans le cache de la progression, jamais au réseau : la célébration porte le
    /// liseré de la rareté mesurée du succès (#9390) si le cache la connaît, et reste celle d'avant sinon.
    @State private var cachedGame: GameBlock?

    /// Un seul chemin fait avancer la file — le `set` de ce lien. `onContinue`
    /// y passe aussi (il pose `nil`), ce qui interdit le double avancement qui
    /// aurait sauté une célébration en attente.
    private var lien: Binding<RevealItem?> {
        Binding(
            get: { file.enCours.map { RevealItem(reveal: $0) } },
            set: { nouveau in
                guard nouveau == nil else { return }
                file.termine()
            }
        )
    }

    func body(content: Content) -> some View {
        content
            // `initial: true` couvre le démarrage à FROID : un tap sur une
            // notification pose le palier AVANT que cet hôte n'existe. Sans
            // lui, la célébration serait perdue précisément au moment où
            // l'utilisateur vient de l'ouvrir depuis l'écran verrouillé.
            .adaptiveOnChange(of: router.pendingEngagementReveal, initial: true) { _, _ in
                guard let palier = router.consumePendingEngagementReveal() else { return }
                file.enfile(palier)
            }
            // La seconde porte. `newNotificationReceived` est le point où le
            // socket a déjà dédupliqué (APNs premier plan + `notification:new`
            // pour un même fait) et persisté — s'y brancher évite de refaire
            // l'un et l'autre, et garantit que la célébration et la cloche
            // parlent du même événement.
            .onReceive(NotificationToastManager.shared.newNotificationReceived) { event in
                guard let palier = EngagementReveal.from(type: event.notificationType,
                                                        metadata: event.metadata),
                      palier.celebratesUnprompted else { return }
                file.enfile(palier)
            }
            // #7914 — l'onboarding passe d'abord : les célébrations tombées
            // pendant le parcours attendent en file et se jouent une fois le
            // calque parti. `@Published` livre sa valeur courante à
            // l'abonnement : un calque déjà présenté suspend dès le montage.
            .onReceive(OnboardingPresenceSignal.shared.$isPresented.removeDuplicates()) { présent in
                file.suspends(présent)
            }
            // #9821 — la célébration à l'écran se DÉCLARE : un `fullScreenCover`
            // ne prévient pas l'écran qu'il recouvre (la story s'y fige).
            .adaptiveOnChange(of: file.enCours != nil, initial: true) { _, présent in
                GameMomentPresence.shared.update(isPresented: présent)
            }
            // La rareté se lit AVANT que la célébration ne se présente, dès qu'un palier est en tête de file.
            .task(id: file.enCours.map { RevealItem(reveal: $0).id }) { @MainActor in
                guard file.enCours != nil else { return }
                cachedGame = await CachedGameProfileSource().load()?.game
            }
            .fullScreenCover(item: lien) { courant in
                AchievementRevealView(
                    reveal: courant.reveal,
                    onContinue: { lien.wrappedValue = nil },
                    // **La sortie qui MÈNE, et qui mène vraiment** (#5903).
                    // Elle était confondue avec la fermeture : « Voir ma
                    // progression » ne faisait que refermer, et n'arrivait au
                    // tableau de bord que parce que le TAP d'une notification
                    // l'avait poussé derrière la vue. Par la seconde porte —
                    // le succès célébré tout seul, sans que personne n'ait rien
                    // touché — rien n'était poussé : le bouton promettait un
                    // écran et rendait celui qu'on regardait.
                    //
                    // `push` avant la fermeture : la destination est en place
                    // quand la vue se retire, donc on ARRIVE au lieu de voir la
                    // pile bouger.
                    onVoirProgression: {
                        router.push(.progression)
                        lien.wrappedValue = nil
                    },
                    // La carte du succès est une proposition de photo : « Jeu masqué » et « Célébrations » coupées
                    // la retirent, comme elles retirent celles de Progression.
                    onPhoto: GameDevicePrefsStore.current().prefs.offersPhotos ? { (moment: PhotoMoment) in
                        photo = GamePhotoSession(
                            moment: moment,
                            notebook: GamePhotoNotebook.standard(userId: AuthManager.shared.currentUser?.id ?? "")
                        )
                    } : nil,
                    rarity: RevealRim.entry(of: courant.reveal, in: cachedGame, hidden: GameDevicePrefsStore.current().prefs.hidden)
                )
                .fullScreenCover(item: $photo) { session in
                    GamePhotoFlowView(session: session) {
                        session.close()
                        photo = nil
                    }
                }
            }
    }
}

extension View {
    /// Pose la célébration de palier sur une racine. UNE ligne, des deux côtés.
    func engagementReveal(router: Router) -> some View {
        modifier(EngagementRevealHost(router: router))
    }
}
