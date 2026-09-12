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

    /// Le tiroir d'options est-il ouvert ? Gouverne les marges et le fond.
    /// Passé en valeur PRIMITIVE, jamais en observant `composerState` : une
    /// feuille qui observe un objet global se re-rend pour des changements qui
    /// ne la concernent pas (« Zero Unnecessary Re-render »).
    let showOptions: Bool

    let backButton: () -> AnyView
    let midContent: () -> AnyView
    let avatar: () -> AnyView
    let background: () -> AnyView

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MeeshySpacing.sm) {
                backButton()
                midContent()
                avatar()
            }
            .padding(.trailing, MeeshySpacing.sm)
        }
        .padding(.horizontal, showOptions ? MeeshySpacing.sm + 2 : 0)
        .padding(.vertical, showOptions ? MeeshySpacing.sm - 2 : 0)
        .background(background())
        .padding(.horizontal, showOptions ? MeeshySpacing.sm : MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
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

    let showOptions: Bool
    let titleAndTags: () -> AnyView
    let actionButtons: () -> AnyView

    var body: some View {
        if showOptions {
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
