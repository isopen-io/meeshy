import SwiftUI
import MeeshyUI

/// **La bande d'en-tête de conversation, en type NOMINAL** (#6194).
///
/// ## Ce qu'elle ferme
///
/// `ConversationView` déborde la pile du thread principal en résolvant les
/// métadonnées de son propre en-tête. Trace relevée sur `Services CEO i16pm`
/// (iOS 26.6.1) le 2026-09-12, en Debug ET en Release :
///
///     EXC_BAD_ACCESS / SIGSEGV
///     « Could not determine thread index for stack guard region »
///     swift_getTypeByMangledName → … (≈50 frames de démangleur récursif)
///       ← __swift_instantiateConcreteTypeFromMangledNameV2
///       ← ConversationView.expandedHeaderMidContent.getter
///       ← ConversationView.expandedHeaderBandBody.getter
///
/// La chaîne fautive — `body → bodyWithSheets → bodyWithCovers →
/// bodyWithLifecycle → bodyContent → floatingHeaderSection →
/// expandedHeaderBand → expandedHeaderBandBody → expandedHeaderMidContent` —
/// est faite de PROPRIÉTÉS CALCULÉES, et c'est tout le problème.
///
/// ## Pourquoi les six `AnyView` déjà posés là n'ont rien changé
///
/// `AnyView` plafonne le type vu par l'APPELANT, mais le getter matérialise
/// quand même le type de son contenu **à sa propre profondeur de pile**. Six
/// érasures successives (2026-08-17, 2026-08-21) ont donc fait migrer le crash
/// de maillon en maillon sans jamais le supprimer — le fichier en porte encore
/// les commentaires, chacun juste et chacun insuffisant.
///
/// **Seule une frontière NOMINALE coupe** : une struct `View` obtient son
/// propre nœud dans l'AttributeGraph, et le graphe DÉROULE la pile avant
/// d'évaluer son `body` (visible dans la trace : `AGGraphGetValue` réentre
/// entre deux `body`). Une propriété calculée n'obtient aucun nœud — elle
/// s'empile. C'est la leçon de #5837, qui a ramené `RootView` de 66 à 21
/// niveaux : le tronc a été traité, cette branche ne l'avait pas été.
///
/// ## Pourquoi des closures plutôt que les vues elles-mêmes
///
/// Les maillons de l'en-tête dépendent d'une douzaine d'états de
/// `ConversationView` (`composerState`, `headerState`, `viewModel`, `router`,
/// le mode de lecture, deux couleurs d'accent…). Les recâbler un par un serait
/// le vrai coût du découpage, et le risque. Une closure diffère la
/// CONSTRUCTION : elle ne s'exécute plus dans le getter de l'appelant, mais
/// dans le `body` de cette struct — c'est-à-dire après que le graphe a déroulé
/// la pile. Le bénéfice recherché est là ; le câblage fin des dépendances
/// reste à faire, et c'est le suivi de cette issue.
struct ConversationExpandedHeaderBand: View {

    /// Ce que la bande montre, résolu par `ConversationHeaderLayout` — passé en
    /// VALEUR, jamais en observant `composerState` : une feuille qui observe un
    /// objet global se re-rend pour des changements qui ne la concernent pas
    /// (« Zero Unnecessary Re-render »).
    let layout: ConversationHeaderLayout

    let backButton: () -> AnyView
    let midContent: () -> AnyView
    let avatar: () -> AnyView
    let background: () -> AnyView

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MeeshySpacing.sm) {
                if layout.showsBackButton { backButton() }
                midContent()
                avatar()
            }
            .padding(.leading, layout.showsBackButton ? 0 : MeeshySpacing.xs)
            .padding(.trailing, MeeshySpacing.sm)
        }
        .padding(layout.glassShape.innerInsets)
        .background(background())
        .padding(layout.glassShape.outerInsets)
    }
}

/// **La forme du verre de l'en-tête** (#8822, #8898).
///
/// - `none` : le fil replié, sans verre.
/// - `floatingBlock` : le fil déplié — un bloc arrondi qui flotte, avec marges.
/// - `edgeToEdgeBand` : l'aperçu tiré de la bannière. Directive porteur
///   2026-09-30 : « tout le bloc épouse l'entête arrondi puis ligne droite sur
///   la bordure basse… le tout en liquid glass ». Le verre va d'un bord à
///   l'autre, collé en haut de la feuille — l'arrondi du haut est celui de la
///   feuille, qui le découpe — et finit par une arête DROITE. C'est la bande du
///   web (`thread-header.tsx`, `inset-x-0 top-0`). Le haut réserve la place de
///   la poignée de la feuille.
enum HeaderGlassShape: Equatable {
    case none
    case floatingBlock
    case edgeToEdgeBand

    var innerInsets: EdgeInsets {
        switch self {
        case .none: return EdgeInsets()
        case .floatingBlock:
            return EdgeInsets(top: MeeshySpacing.sm - 2, leading: MeeshySpacing.sm + 2,
                              bottom: MeeshySpacing.sm - 2, trailing: MeeshySpacing.sm + 2)
        case .edgeToEdgeBand:
            return EdgeInsets(top: MeeshySpacing.lg + 2, leading: MeeshySpacing.md,
                              bottom: MeeshySpacing.sm + 2, trailing: MeeshySpacing.sm)
        }
    }

    var outerInsets: EdgeInsets {
        switch self {
        case .none:
            return EdgeInsets(top: MeeshySpacing.sm, leading: MeeshySpacing.lg, bottom: 0, trailing: MeeshySpacing.lg)
        case .floatingBlock:
            return EdgeInsets(top: MeeshySpacing.sm, leading: MeeshySpacing.sm, bottom: 0, trailing: MeeshySpacing.sm)
        case .edgeToEdgeBand:
            return EdgeInsets()
        }
    }
}

/// **Le verre de l'en-tête, en type NOMINAL** — sorti de `ConversationView`
/// (hors budget) pour porter les deux formes (#8898). Le repli iOS 16-25 est
/// celui d'`adaptiveGlass`, identique au reste de l'app.
struct ConversationHeaderGlass: View {
    let shape: HeaderGlassShape
    let accentColor: String
    let secondaryColor: String

    private static let blockRadius = MeeshyRadius.xxl - 2

    var body: some View {
        switch shape {
        case .none:
            Color.clear
        case .floatingBlock:
            Color.clear.adaptiveGlass(in: RoundedRectangle(cornerRadius: Self.blockRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: Self.blockRadius)
                        .stroke(rim(startPoint: .leading, endPoint: .trailing), lineWidth: 1)
                )
                .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.light), radius: 8, y: 2)
                .transition(.scale(scale: 0.1, anchor: .trailing).combined(with: .opacity))
        case .edgeToEdgeBand:
            // Le verre monte sous la poignée et jusqu'au bord de la feuille ;
            // l'arête basse est une ligne droite teintée de l'accent.
            Color.clear.adaptiveGlass(in: Rectangle())
                .overlay(alignment: .bottom) {
                    rim(startPoint: .leading, endPoint: .trailing)
                        .frame(height: 1)
                }
                .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.light), radius: 8, y: 3)
                .ignoresSafeArea(edges: .top)
        }
    }

    private func rim(startPoint: UnitPoint, endPoint: UnitPoint) -> LinearGradient {
        LinearGradient(colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(MeeshyOpacity.light)],
                       startPoint: startPoint, endPoint: endPoint)
    }
}

/// **Ce que la bande d'en-tête montre, et où** — loi PURE (#8822).
///
/// Deux états depuis toujours : REPLIÉ (retour, actions, avatar) et DÉPLIÉ
/// (retour, titre et étiquettes dans le bloc de verre, avatar). L'aperçu tiré
/// de la bannière héritait du premier : un chevron qui fait `router.pop()` sous
/// une feuille, et aucune identité. Exigence porteur du 2026-09-30 : « afficher
/// tout le header de la conversation dans son bloc de verre Liquid Glass sans
/// (<) ! » — l'aperçu a donc SA disposition : l'identité ET les actions dans le
/// verre, sans retour, plus la porte vers la conversation complète.
struct ConversationHeaderLayout: Equatable {
    let showsBackButton: Bool
    let showsTitle: Bool
    let showsActions: Bool
    /// La forme du verre sous l'en-tête (#8898).
    let glassShape: HeaderGlassShape
    /// L'en-tête est-il posé dans du verre (`adaptiveGlass`) ?
    var isGlassBlock: Bool { glassShape != .none }
    /// L'aperçu seul : la porte vers la conversation complète, qui remplace le
    /// calque transparent qui volait le défilement.
    let showsOpenFullConversation: Bool
    /// Hors aperçu, la frappe remplace la bande par sa barre compacte (retour +
    /// avatar) ; l'aperçu garde son en-tête — la barre compacte porte un retour.
    let yieldsToTypingBar: Bool
    /// La hauteur de la bande réserve le haut de la liste : mesurée dès que la
    /// bande a sa forme de repos (repliée, ou l'en-tête complet de l'aperçu).
    let measuresBandHeight: Bool

    static func resolve(previewMode: Bool, showOptions: Bool) -> ConversationHeaderLayout {
        if previewMode {
            return ConversationHeaderLayout(
                showsBackButton: false, showsTitle: true, showsActions: true, glassShape: .edgeToEdgeBand,
                showsOpenFullConversation: true, yieldsToTypingBar: false, measuresBandHeight: true
            )
        }
        return ConversationHeaderLayout(
            showsBackButton: true, showsTitle: showOptions, showsActions: !showOptions,
            glassShape: showOptions ? .floatingBlock : .none,
            showsOpenFullConversation: false, yieldsToTypingBar: true, measuresBandHeight: !showOptions
        )
    }
}

/// **Le contenu médian de la bande, en type NOMINAL** (#6194).
///
/// C'est le getter de ce maillon que la trace désigne, juste sous
/// `__swift_instantiateConcreteTypeFromMangledNameV2`. Il portait déjà un
/// `AnyView` — insuffisant, pour la raison dite plus haut : l'érasure borne le
/// type de l'appelant, pas la pile du getter.
///
/// Le gain de la forme nominale est ici DOUBLE : elle crée un nœud d'attribut
/// (le graphe déroule la pile), **et** son nom remplace tout le sous-arbre
/// structurel dans les mangled names de ses hôtes — c'est ce dernier point qui
/// raccourcit la récursion du démangleur, laquelle occupait ~50 des 211 frames
/// relevées.
struct ConversationHeaderMidContent: View {

    let layout: ConversationHeaderLayout
    let titleAndTags: () -> AnyView
    let actionButtons: () -> AnyView

    var body: some View {
        if layout.showsTitle && layout.showsActions {
            // L'aperçu (#8822) : l'identité prend la place, les actions la suivent.
            // Les actions gardent leur taille (`fixedSize`) : comprimées, la
            // puce de mode chevauchait la loupe — c'est le titre qui tronque.
            HStack(spacing: MeeshySpacing.xs) {
                titleAndTags()
                actionButtons().fixedSize()
            }
        } else if layout.showsTitle {
            titleAndTags()
        } else {
            // Le bouton d'appel reste à côté de la recherche dans les DEUX
            // états : le repli ne bascule que la zone nom/tags.
            HStack {
                Spacer()
                actionButtons()
            }
        }
    }
}

/// **La grappe d'actions de l'en-tête, en type NOMINAL** (#6194).
///
/// Appel + recherche + mode de lecture. Le commentaire qu'elle remplace
/// racontait la bonne histoire avec le mauvais remède : « éraser un cran plus
/// bas ne suffisait pas — l'APPELANT doit quand même résoudre le type opaque
/// COMPOSITE, TOUS ses enfants combinés ». C'est exact, et c'est précisément ce
/// qu'un type nominal supprime : le nom se substitue au sous-arbre entier.
///
/// Loi commune `ScrollMotion` conservée : la grappe s'efface pendant le
/// défilement et revient à l'arrêt. Le retour, l'avatar et le titre ne la
/// suivent pas — on doit pouvoir quitter la conversation et savoir où l'on est,
/// même en plein défilement.
struct ConversationHeaderActionsCluster: View {

    let callButtons: () -> AnyView
    let searchButton: () -> AnyView
    let readingModeCluster: () -> AnyView

    var body: some View {
        HStack(spacing: 0) {
            callButtons().layoutPriority(1)
            searchButton()
            readingModeCluster()
        }
        .hiddenWhileScrolling()
    }
}

/// **La section d'en-tête flottante, en type NOMINAL** (#6213 bis).
///
/// ## Ce qu'elle ferme, et pourquoi #6194 ne suffisait pas
///
/// #6194 a supprimé la récursion du démangleur : la trace du 2026-09-12 22:50
/// ne contient plus une seule frame `swift_getTypeByMangledName`, et la pile
/// est passée de 211 à 149 cadres. L'app plantait pourtant toujours à
/// l'ouverture d'une conversation, du même `signal 11`.
///
/// **Parce que la cause n'a jamais été le démangleur — c'était la TAILLE des
/// cadres, et le démangleur n'en était qu'un symptôme.** Mesuré sur
/// `Services CEO i16pm` (pile principale de 1008 Ko) par `CrashStackDumper`,
/// qui écrit désormais l'adresse fautive et le palmarès des cadres :
///
///     signal 0xb  si_addr=0x16b4579e0  stack_low=0x16b458000
///     → l'adresse fautive est 1 568 octets SOUS le plancher : page de garde.
///
///     565 712 o   floatingHeaderSectionBody   ← 55 % de la pile, UN cadre
///     116 752 o   bodyWithLifecycle
///      81 872 o   bodyContent
///      64 656 o   copie de State<ConversationComposerState>
///         176 o   expandedHeaderBand          ← la struct nominale de #6194
///
/// La dernière ligne est la démonstration : le maillon converti en type
/// nominal ne pèse plus **176 octets**, quand son parent resté propriété
/// calculée en pèse **565 712**. Le remède de #6194 était le bon ; il n'avait
/// simplement pas été appliqué assez haut dans la chaîne.
///
/// ## Le mécanisme, en une phrase
///
/// En `-Onone`, une propriété qui rend `some View` est retournée
/// INDIRECTEMENT : l'APPELANT réserve la place du type concret. Quand cet
/// appelant porte trois branches (`if/else if/else`) plus une conditionnelle,
/// il réserve la place de TOUTES — celles qui ne s'exécuteront pas comprises.
/// Une closure `() -> AnyView` renverse cela : la construction se fait dans le
/// cadre de la CLOSURE, entré puis quitté, et l'appelant ne voit passer que
/// seize octets. Les branches ne s'additionnent plus, elles se succèdent.
///
/// C'est pourquoi `AnyView` posé sur la branche (`AnyView(anonymousHeaderBar)`)
/// ne servait à rien ici : l'érasure a lieu APRÈS que l'appelant a réservé la
/// place du type opaque. Elle borne ce qui SORT, jamais ce qui a été réservé
/// pour entrer.
struct ConversationFloatingHeaderSection: View {

    let isAnonymous: Bool
    let isTyping: Bool
    let showSearch: Bool
    /// Passés en valeurs PRIMITIVES pour les `.animation(_:value:)` : la vue
    /// n'observe aucun objet, elle reçoit ce dont ses transitions dépendent.
    let showOptions: Bool
    let hidesHeaderActions: Bool
    /// La bande réserve-t-elle le haut de la liste ? `ConversationHeaderLayout.measuresBandHeight`.
    let measuresBandHeight: Bool

    let anonymousBar: () -> AnyView
    let typingBar: () -> AnyView
    let expandedBand: () -> AnyView
    let searchBar: () -> AnyView
    /// Hauteur de la bande REPLIÉE (#7998) : elle grandit avec Dynamic Type,
    /// et la pill de jour doit démarrer sous elle. Dépliée, la pill se retire
    /// — sa hauteur n'est pas publiée, pour ne pas faire sauter le fil.
    let onBandHeightChange: (CGFloat) -> Void

    var body: some View {
        VStack {
            if isAnonymous {
                anonymousBar()
            } else if isTyping {
                typingBar()
            } else {
                expandedBand()
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        if measuresBandHeight { onBandHeightChange(height) }
                    }
            }

            if showSearch {
                searchBar()
            }

            Spacer()
        }
        .zIndex(100)
        // Le mouvement est PUBLIÉ ici, consommé plus bas par les seuls
        // `.hiddenWhileScrolling()` des grappes de boutons (inchangé).
        .scrollMotionActive(hidesHeaderActions)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showSearch)
    }
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
    /// Hauteur MESURÉE de la bande d'en-tête repliée (#7998).
    var bandHeight: CGFloat = 0
}
