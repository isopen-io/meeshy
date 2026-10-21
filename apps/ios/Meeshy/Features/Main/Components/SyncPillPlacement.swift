import SwiftUI

/// **Où la pastille de synchronisation se pose : juste au-dessus du chrome bas,
/// et elle suit le clavier avec lui** (#10840, retour porteur 2026-10-16).
///
/// > « Déplace la pastille plus bas au niveau de la universal composer bar
/// > (lorsque la universal composer bar remonte à cause du clavier, il faut
/// > remonter la pastille syncpill aussi et quand ça descend, redescendre). »
///
/// **Cette règle SUPPLANTE la pose haute de #10371** (2026-10-12, 34 pt sous la
/// zone sûre), qui supplantait elle-même la bande de la barre d'état de #9680.
/// La pastille quitte le haut de l'écran : elle se pose sur ce que l'utilisateur
/// regarde quand il écrit.
///
/// ## Comment elle suit le clavier sans image de retard
///
/// La pastille ne calcule PAS la hauteur du clavier. Son point de montage se
/// pose contre le bord bas de la zone sûre de son hôte, que SwiftUI soulève
/// lui-même avec le clavier, dans la transaction du clavier — celle qui soulève
/// aussi la barre de composition (`ConversationView` s'en remet à l'évitement
/// natif). Le montage n'ajoute que deux choses : la hauteur du chrome bas
/// au-dessus de ce bord (`SyncPillDock`, déclarée par l'écran qui le porte) et
/// `gapAboveChrome`. Le clavier qui monte ne change pas cette hauteur : aucune
/// valeur ne se republie pendant le geste, la pastille et la barre bougent du
/// même mouvement.
///
/// **Écrans sans barre de composition** (confirmé par le porteur le
/// 2026-10-16) : la pastille se pose en bas, au-dessus de la barre du bas, et
/// suit toujours le clavier. Une barre du bas se DÉCLARE (`docksSyncPill`) :
/// la barre de recherche de la liste des conversations (iPhone et iPad), la
/// plaque du lecteur de story. Sans barre déclarée, la pastille se pose au ras
/// de la zone sûre — et sur le clavier s'il s'ouvre.
///
/// Fonctions PURES : c'est la DÉCISION qui se teste (`SyncPillPlacementTests`) ;
/// le rendu n'a qu'un point de montage, `inSyncPillBand()`.
nonisolated enum SyncPillPlacement {

    /// L'air entre le bas de la pastille et le haut du chrome bas.
    static let gapAboveChrome: CGFloat = 8

    /// Ce que le point de montage ajoute au-dessus du bord bas (zone sûre ou
    /// clavier) : la hauteur du chrome déclaré, puis l'écart.
    static func bottomPadding(dockedChromeHeight: CGFloat) -> CGFloat {
        max(dockedChromeHeight, 0) + gapAboveChrome
    }

    /// Le bord contre lequel la pastille se pose, mesuré depuis le bas de
    /// l'écran : le haut du clavier quand il est levé, la zone sûre sinon.
    static func keyboardAwareEdge(safeAreaBottom: CGFloat, keyboardHeight: CGFloat) -> CGFloat {
        max(keyboardHeight, safeAreaBottom, 0)
    }

    /// Le bas de la pastille, mesuré depuis le bas de l'écran — la décision
    /// entière, telle que SwiftUI la réalise (le bord, puis `bottomPadding`).
    static func bottomFromScreenEdge(safeAreaBottom: CGFloat,
                                     keyboardHeight: CGFloat,
                                     dockedChromeHeight: CGFloat) -> CGFloat {
        keyboardAwareEdge(safeAreaBottom: safeAreaBottom, keyboardHeight: keyboardHeight)
            + bottomPadding(dockedChromeHeight: dockedChromeHeight)
    }

    /// **La hauteur qu'un chrome déclare, depuis sa propre mesure** : sa
    /// hauteur, plus l'air que son hôte laisse sous lui (la barre de recherche
    /// de la liste est décollée de 8 pt du bord sûr).
    ///
    /// L'encart bas que rapporte la mesure ne se retranche PAS. Mesuré au
    /// simulateur (iPhone 15 Pro Max, 2026-10-16) : la pile de la barre de la
    /// conversation, pourtant posée sous `ignoresSafeArea(.container, edges:
    /// .bottom)`, s'arrête au bord sûr (`maxY` 898 = 932 − 34) pendant que son
    /// lecteur rapporte un encart de 34 pt. Le retrancher posait la pastille
    /// SUR la rangée d'options de la barre.
    static func dockedHeight(measuredHeight: CGFloat, liftAboveEdge: CGFloat = 0) -> CGFloat {
        max(measuredHeight, 0) + max(liftAboveEdge, 0)
    }

    /// **La hauteur qu'un chrome déclare, depuis la position de son haut** —
    /// pour un hôte qui ignore toute la zone sûre et pose sa barre lui-même
    /// (lecteur de story, décollé de 20 pt de la zone sûre au repos).
    static func dockedHeight(chromeTopFromScreenBottom: CGFloat,
                             safeAreaBottom: CGFloat,
                             keyboardHeight: CGFloat) -> CGFloat {
        let edge = keyboardAwareEdge(safeAreaBottom: safeAreaBottom, keyboardHeight: keyboardHeight)
        return max(chromeTopFromScreenBottom - edge, 0)
    }

    /// La courbe sur laquelle la pastille rejoint une NOUVELLE hauteur de
    /// chrome (barre qui grandit d'une ligne, panneau d'émojis, arrivée dans une
    /// conversation) — celle de la barre et de son panneau d'émojis.
    static let dockAnimation: Animation = .spring(response: 0.3, dampingFraction: 0.8)
}

/// **Qui déclare le chrome bas : le DERNIER écran monté** (#10840).
///
/// Une conversation poussée sur une autre, un lecteur de story ouvert sur une
/// conversation (un `fullScreenCover` ne prévient pas l'écran recouvert) : la
/// déclaration la plus récente décide, et la retirer rend la précédente. Une
/// mise à jour garde son rang — la barre qui grandit d'une ligne ne passe pas
/// devant l'écran monté après elle.
nonisolated struct SyncPillDockClaims: Equatable {

    private struct Claim: Equatable {
        let id: String
        var height: CGFloat
    }

    private var claims: [Claim] = []

    /// La hauteur du chrome sur lequel la pastille se pose ; 0 sans déclaration.
    var height: CGFloat { claims.last?.height ?? 0 }

    /// Au demi-point : une mesure qui ne bouge que d'une fraction ne republie
    /// rien, et la pastille ne se réévalue pas à chaque image d'une animation.
    mutating func claim(_ id: String, height: CGFloat) {
        let rounded = (max(height, 0) * 2).rounded() / 2
        if let index = claims.firstIndex(where: { $0.id == id }) {
            claims[index].height = rounded
        } else {
            claims.append(Claim(id: id, height: rounded))
        }
    }

    mutating func release(_ id: String) {
        claims.removeAll { $0.id == id }
    }
}

/// Le registre des déclarations, partagé par les points de montage de la
/// pastille et les écrans qui portent un chrome bas. Seul `SyncPillBandMount`
/// l'observe ; les écrans ne font qu'y écrire.
@MainActor
final class SyncPillDock: ObservableObject {
    // Une deinit synthétisée isolée au MainActor double-libère au démontage hors d'une tâche (iOS 26.1, #9694).
    // Corps vide : aucun état isolé n'est touché.
    nonisolated deinit {}

    static let shared = SyncPillDock()

    @Published private(set) var claims = SyncPillDockClaims()

    func claim(_ id: String, height: CGFloat) {
        var next = claims
        next.claim(id, height: height)
        guard next != claims else { return }
        claims = next
    }

    func release(_ id: String) {
        var next = claims
        next.release(id)
        guard next != claims else { return }
        claims = next
    }
}

/// Le SEUL point de montage de la position de la pastille : contre le bord bas
/// de la zone sûre de l'hôte (que SwiftUI soulève avec le clavier), plus la
/// hauteur du chrome déclaré. Aucune lecture de fenêtre ni de clavier : lire la
/// fenêtre clé depuis l'intérieur fige SwiftUI (cycle AttributeGraph).
private struct SyncPillBandMount: ViewModifier {
    @ObservedObject var dock: SyncPillDock

    func body(content: Content) -> some View {
        content
            .padding(.bottom, SyncPillPlacement.bottomPadding(dockedChromeHeight: dock.claims.height))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .animation(SyncPillPlacement.dockAnimation, value: dock.claims.height)
    }
}

/// Un écran qui porte un chrome bas le DÉCLARE : la hauteur mesurée de sa
/// barre, plus l'air que son hôte laisse sous elle.
private struct SyncPillMeasuredDocking: ViewModifier {
    let dock: SyncPillDock
    let liftAboveEdge: CGFloat
    let onHeightChange: ((CGFloat) -> Void)?
    @State private var id = "dock.\(UUID().uuidString)"

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo in
                    Color.clear
                        .onAppear {
                            onHeightChange?(geo.size.height)
                            claim(geo)
                        }
                        .adaptiveOnChange(of: geo.size.height) { _, height in
                            onHeightChange?(height)
                            claim(geo)
                        }
                }
            )
            .onDisappear { dock.release(id) }
    }

    private func claim(_ geo: GeometryProxy) {
        dock.claim(id, height: SyncPillPlacement.dockedHeight(
            measuredHeight: geo.size.height, liftAboveEdge: liftAboveEdge))
    }
}

/// Un écran qui connaît déjà la hauteur de son chrome au-dessus du bord bas la
/// déclare telle quelle (`nil` : aucun chrome affiché).
private struct SyncPillDeclaredDocking: ViewModifier {
    let dock: SyncPillDock
    let height: CGFloat?
    @State private var id = "dock.\(UUID().uuidString)"

    func body(content: Content) -> some View {
        content
            .onAppear { declare(height) }
            .adaptiveOnChange(of: height) { _, next in declare(next) }
            .onDisappear { dock.release(id) }
    }

    private func declare(_ height: CGFloat?) {
        guard let height else { return dock.release(id) }
        dock.claim(id, height: height)
    }
}

extension View {
    /// Pose la pastille de synchronisation au-dessus du chrome bas déclaré, et
    /// la fait suivre le clavier (`SyncPillPlacement`, #10840). À appliquer à
    /// `ConnectionBanner` dans un `.overlay` de l'hôte.
    func inSyncPillBand(dock: SyncPillDock = .shared) -> some View {
        modifier(SyncPillBandMount(dock: dock))
    }

    /// Déclare ce chrome bas — mesuré — comme le sol de la pastille
    /// (`liftAboveEdge` : l'air que l'hôte laisse sous lui), et relaie sa
    /// hauteur brute à l'hôte qui la suivait déjà.
    func docksSyncPill(dock: SyncPillDock = .shared,
                       liftAboveEdge: CGFloat = 0,
                       onHeightChange: ((CGFloat) -> Void)? = nil) -> some View {
        modifier(SyncPillMeasuredDocking(dock: dock, liftAboveEdge: liftAboveEdge, onHeightChange: onHeightChange))
    }

    /// Déclare un chrome bas dont l'hôte connaît la hauteur au-dessus du bord
    /// bas (`nil` : aucun chrome affiché).
    func docksSyncPill(dock: SyncPillDock = .shared, height: CGFloat?) -> some View {
        modifier(SyncPillDeclaredDocking(dock: dock, height: height))
    }
}
