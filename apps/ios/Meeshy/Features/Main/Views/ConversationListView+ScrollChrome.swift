import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ligne d'épinglage des stickers (LWS-6/I-063bis)

/// Le CHROME de défilement de la liste, posé sur le conteneur de défilement
/// et jamais dans son contenu : la ligne d'épinglage des stickers (inset
/// sous la barre repliée + sa position mesurée pour la pilule), la mesure de
/// la colonne, le clavier qui se retire au geste, et l'hôte d'élection de la
/// focus card. Les magasins arrivent PAR RÉFÉRENCE — rien ici ne lit le
/// défilement ni l'élu, donc rien ne ré-évalue le body de la liste.
struct ConversationListScrollChrome: ViewModifier {
    let sectionPositionRegistry: LentilleSectionPositionRegistry
    @Binding var listColumnSize: CGSize
    let scrollOffsetRelay: ScrollOffsetRelay
    let focusCandidateRegistry: LentilleFocusCandidateRegistry
    let focusElection: LentilleFocusElection
    let sceneActivity: LentilleSceneActivity

    /// Hauteur retirée à la région visible du défilement pour que les stickers
    /// épinglés se posent SOUS la barre de header au lieu de disparaître
    /// derrière elle. Vaut la hauteur de la barre REPLIÉE : c'est l'état de la
    /// barre quand on défile, donc la seule cote qui garantit un sticker
    /// entièrement visible pendant tout le défilement. Les deux valeurs
    /// viennent de `CollapsibleHeaderMetrics` (64 déployée / 44 repliée), la
    /// métrique que le header lui-même consomme — jamais un nombre recopié ici.
    /// `0` sous drapeau OFF : ni inset, ni décalage.
    /// `accessoryCollapsedHeight` (60) et non `collapsedHeight` (44) : ce
    /// header porte un `titleAccessory` (la trail compacte de stories), et
    /// replié il mesure 60 pt — la bande de stickers épinglée à 44 passait
    /// SOUS la trail (chevauchement « P[avatar]ANCIEN », 2026-08-21).
    private static var stickyHeaderInset: CGFloat {
        LentilleFeatureFlag.isLentilleListEnabled ? CollapsibleHeaderMetrics.accessoryCollapsedHeight : 0
    }

    /// Padding de contenu RESTANT, pour que la position de repos de la liste ne
    /// bouge pas d'un point : ce que l'inset prend à la région visible, ce
    /// padding cesse de le prendre au contenu. Somme constante =
    /// `expandedHeight`, drapeau ON comme OFF.
    static var contentTopPadding: CGFloat {
        CollapsibleHeaderMetrics.expandedHeight - stickyHeaderInset
    }

    func body(content: Content) -> some View {
        content
            // LIGNE D'ÉPINGLAGE (LWS-6/I-063bis). Un `LazyVStack(pinnedViews:)`
            // épingle au bord haut de la RÉGION VISIBLE de son ScrollView. Ici
            // ce bord est couvert par `ConversationListHeaderOverlay` : sans
            // inset, le sticker épinglé se rangeait DERRIÈRE la barre — la
            // restructuration I-062 était juste et son effet invisible.
            // `safeAreaInset` réduit la région visible du ScrollView interne :
            // la ligne d'épinglage descend sous la barre repliée, sans toucher
            // à `MeeshyRefreshableScroll` (SDK, gelé S1).
            // Drapeau OFF : R-a — le modificateur lui-même n'est PAS monté
            // (`LentilleStickyHeaderInsetModifier.isEnabled == false` ⇒
            // `content` renvoyé tel quel), zéro modificateur ajouté, bit à
            // bit identique à aujourd'hui. `topPadding` (`scrollContentTopPadding`)
            // reste `expandedHeight` dans les deux cas.
            .modifier(LentilleStickyHeaderInsetModifier(
                isEnabled: LentilleFeatureFlag.isLentilleListEnabled,
                height: Self.stickyHeaderInset
            ))
            // Ligne d'épinglage des stickers, en coordonnées GLOBALES : bord
            // haut de la région visible du défilement (safe area comprise)
            // plus l'inset collant. Mesurée sur le CONTENEUR — qui ne bouge
            // pas au défilement, donc zéro écriture par tick — et lue par la
            // pilule pour nommer la section réellement épinglée (2026-08-21 :
            // « le sticker le plus haut » désignait une section déjà passée).
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.frame(in: .global).minY + proxy.safeAreaInsets.top
            } action: { visibleTop in
                sectionPositionRegistry.registerPinLine(visibleTop + Self.stickyHeaderInset)
            }
            .onGeometryChange(for: CGSize.self) { $0.size } action: { listColumnSize = $0 }
            .scrollDismissesKeyboard(.interactively)
            // ÉLECTION DE LA FOCUS CARD (LWS-8/I-070). Posé sur le conteneur,
            // APRÈS l'inset sticky : l'hôte mesure le bas de la région visible du
            // défilement, la seule ancre de la bande de focus (§4.2). Il ne rend
            // rien, n'intercepte rien, et n'ajoute AUCUN observateur — il s'abonne
            // au relais d'offset qui publiait déjà, comme le header et la pilule.
            .overlay { focusElectionOverlay }
    }

    /// Drapeau OFF ⇒ AUCUN hôte d'élection : ni mesure, ni carte (LWS-8/I-070).
    /// Sous ON, l'hôte est posé sur le CONTENEUR de défilement, jamais dans son
    /// contenu — c'est la seule position d'où le bas de la région visible se
    /// mesure, et il ne défile pas avec les rangs. `LentilleFocusElectionHost`
    /// reste purement observationnel : il ne rend rien de visible et
    /// n'intercepte aucun geste — c'est `LentilleFocusCardHost` (I-071,
    /// `Lentille/Mode/LentilleFocusCard.swift`) qui peint la carte à la
    /// position qu'il publie, dans le MÊME overlay, sur le magasin
    /// `focusElection` passé par référence (ce body ne lit jamais l'élu
    /// lui-même — l'hôte de la carte le lit dans SON fichier à lui).
    @ViewBuilder
    private var focusElectionOverlay: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            LentilleFocusElectionHost(
                relay: scrollOffsetRelay,
                registry: focusCandidateRegistry,
                election: focusElection
            )
            // `LentilleFocusCardHost` a vécu ICI jusqu'au 2026-08-23 : il
            // peignait la carte de magnification par-dessus la rangée élue.
            // Retiré — la magnification vit désormais DANS la rangée
            // (`LentilleMagnifiableRow` → `LentilleConversationRow
            // .magnification`), seule position d'où elle peut à la fois
            // porter des pastilles actionnables et laisser à la rangée son
            // swipe, son glisser-déposer et son appui long. Voir l'en-tête de
            // `Lentille/Mode/LentilleFocusCard.swift`.
            // Scène (2026-08-21) : un consommateur de plus du MÊME relais —
            // niveau d'activité lu par les rangées et par la carte.
            LentilleSceneActivityHost(relay: scrollOffsetRelay, scene: sceneActivity)
        }
    }
}
