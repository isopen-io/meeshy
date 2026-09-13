import SwiftUI
import UIKit

// MARK: - LE MENU SYSTÈME D'UN MESSAGE, OUVERT AU DOUBLE TAP (#6117)
//
// **Directive porteur du 2026-09-12** : « le menu natif avec effet systeme
// liquid glass ou effet systeme selon la version iOS se fait au double tap !
// Mais le menu meeshy se fait au longpress. » Et sur son contenu : « quelques
// operation primaire répondre, transférer, modifier, sélectionner, copier,
// supprimer et plus ».
//
// ## Pourquoi `UIEditMenuInteraction` et pas `.contextMenu`
//
// Un `.contextMenu` SwiftUI — celui que le fil attache aujourd'hui sous
// iOS 26 — **ne s'ouvre que par pression longue**. Il n'a aucune API publique
// de présentation programmatique, donc aucun double tap ne peut le déclencher.
// C'est ce qui m'a fait dire au porteur que sa demande était irréalisable ;
// c'était vrai du mauvais menu.
//
// `UIEditMenuInteraction` (iOS 16+) est l'autre menu système : celui de
// « Copier / Coller ». Il se présente **par code**
// (`presentEditMenu(with:)`), porte des actions personnalisées, et prend
// l'apparence système de chaque version — Liquid Glass sous iOS 26, la barre
// sombre arrondie avant. C'est exactement ce que la directive décrit, et sa
// forme en BARRE d'opérations primaires correspond au contenu demandé.
//
// Il n'était utilisé nulle part dans le dépôt.
//
// ## Ce que ce fichier ne fait pas
//
// Il ne DÉCIDE de rien. Les actions lui sont remises par l'hôte, déjà
// résolues — c'est la même discipline que `MessageOverlayMenu`, qui reçoit ses
// rappels plutôt que de les construire. Ce fichier est un PONT, et un pont qui
// choisirait ce qu'il transporte serait un second site de décision.

/// Une opération primaire du menu système, décrite **sans UIKit** pour que
/// l'hôte SwiftUI n'ait pas à connaître `UIAction`.
///
/// `isDestructive` n'est pas cosmétique : le système le rend en rouge et le
/// place en fin de barre. Le dire ici évite que chaque hôte le redécide.
struct MessageEditMenuAction: Identifiable {
    let id: String
    let title: String
    /// Nom SF Symbol. `nil` pour une action sans glyphe.
    let systemImage: String?
    let isDestructive: Bool
    let perform: () -> Void

    init(id: String,
         title: String,
         systemImage: String? = nil,
         isDestructive: Bool = false,
         perform: @escaping () -> Void) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.isDestructive = isDestructive
        self.perform = perform
    }
}

extension MessageEditMenuAction {

    /// **Les opérations primaires d'un message, dans l'ordre que le porteur a
    /// fixé** (2026-09-12) : « les options qu'il faut en premier c'est editer,
    /// selectionner et composer ».
    ///
    /// L'ordre n'est pas cosmétique — le menu système est une BARRE, et ce qui
    /// dépasse se rejoint par un chevron. Les trois premières sont donc les
    /// seules dont on garantit qu'elles sont visibles sans geste
    /// supplémentaire.
    ///
    /// ## Aucun rappel n'est réécrit ici
    ///
    /// Les six viennent de `ConversationView`, qui les résout déjà pour le menu
    /// Meeshy. Le menu système sert les MÊMES — sans quoi deux entrées du même
    /// nom, dans deux menus du même message, feraient deux choses.
    ///
    /// **`peutEditer` est REMIS, jamais recalculé** : la règle
    /// (`msg.isMe || isCurrentUserAdminOrMod`) est écrite trois fois dans
    /// `ConversationView` ; une quatrième écriture ici garantirait la
    /// divergence. Un message qu'on ne peut pas éditer n'affiche pas l'entrée
    /// — plutôt qu'un grisé : la loi 4 se tient par la RÈGLE, pas par un
    /// contrôle inerte.
    ///
    /// ## « Plus… » ouvre le GRAND menu
    ///
    /// Directive du même jour : « le plus doit ouvrir le grand menu et non le
    /// menu longpress ». Les deux sont distincts et ce lot les sépare
    /// définitivement — l'appui long ouvre l'overlay (réactions + actions),
    /// « Plus… » ouvre `MessageMoreSheet`, la feuille complète. Les faire
    /// coïncider rendrait le double tap redondant avec l'appui long, ce que la
    /// directive écarte explicitement.
    static func primaires(messageId: String,
                          peutEditer: Bool,
                          editer: ((String) -> Void)?,
                          selectionner: ((String) -> Void)?,
                          composer: ((String) -> Void)?,
                          repondre: ((String) -> Void)?,
                          transferer: ((String) -> Void)?,
                          plus: ((String) -> Void)?) -> [MessageEditMenuAction] {
        var actions: [MessageEditMenuAction] = []

        // — Les trois premières, dans l'ordre de la directive —

        if peutEditer, let editer {
            actions.append(.init(id: "edit",
                                 title: String(localized: "message.action.edit",
                                               defaultValue: "Éditer", bundle: .main),
                                 systemImage: "pencil") { editer(messageId) })
        }
        if let selectionner {
            actions.append(.init(id: "select",
                                 title: String(localized: "message.action.select",
                                               defaultValue: "Sélectionner", bundle: .main),
                                 systemImage: "checkmark.circle") { selectionner(messageId) })
        }
        if let composer {
            actions.append(.init(id: "compose",
                                 title: String(localized: "message.action.compose",
                                               defaultValue: "Composer", bundle: .main),
                                 systemImage: "wand.and.stars") { composer(messageId) })
        }

        // — Puis ce que la barre montre si la place le permet —

        if let repondre {
            actions.append(.init(id: "reply",
                                 title: String(localized: "message.action.reply",
                                               defaultValue: "Répondre", bundle: .main),
                                 systemImage: "arrowshape.turn.up.left") { repondre(messageId) })
        }
        if let transferer {
            actions.append(.init(id: "forward",
                                 title: String(localized: "message.action.forward",
                                               defaultValue: "Transférer", bundle: .main),
                                 systemImage: "arrowshape.turn.up.right") { transferer(messageId) })
        }
        if let plus {
            actions.append(.init(id: "more",
                                 title: String(localized: "message.action.more",
                                               defaultValue: "Plus…", bundle: .main),
                                 systemImage: "ellipsis") { plus(messageId) })
        }

        return actions
    }
}

/// Le porteur UIKit de l'interaction, invisible et de taille nulle dans la
/// hiérarchie SwiftUI.
///
/// Il vit en `background` de la cellule plutôt qu'en overlay : une vue de
/// fond ne capte aucune touche, donc elle ne peut pas voler le simple tap de
/// la bulle ni le scrub d'un média.
final class EditMenuHostView: UIView, UIEditMenuInteractionDelegate {

    /// DEINIT NON ISOLÉE (#6226) — ce dépôt compile sous
    /// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (SE-0466), donc la deinit
    /// SYNTHÉTISÉE de cette classe est `@MainActor`. Or c'est une `UIView` :
    /// UIKit la libère au recyclage de cellule, hors d'une tâche, et la
    /// libération isolée double-libère (`pointer being freed was not
    /// allocated`, abrt). Garde : `MainActorDeinitSourceGuardTests`, qui a
    /// rougi dès l'arrivée de cette classe.
    nonisolated deinit {}

    /// Remises à chaque présentation par l'hôte SwiftUI — jamais mémorisées
    /// au-delà : une action capturée une fois vaudrait pour un message que la
    /// cellule ne porte peut-être plus (les cellules se RECYCLENT).
    var actions: [MessageEditMenuAction] = []

    private lazy var interaction = UIEditMenuInteraction(delegate: self)

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        addInteraction(interaction)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) n'est pas employé") }

    /// Présente le menu système à l'endroit exact du doigt.
    ///
    /// `sourcePoint` est en coordonnées de CETTE vue ; l'hôte SwiftUI le
    /// convertit depuis l'espace de la cellule.
    func present(at point: CGPoint) {
        guard !actions.isEmpty else { return }
        interaction.presentEditMenu(with: UIEditMenuConfiguration(identifier: nil, sourcePoint: point))
    }

    // MARK: - UIEditMenuInteractionDelegate

    /// **Les actions SYSTÈME suggérées sont écartées.** Un message n'est pas un
    /// champ de texte : « Couper », « Coller », « Tout sélectionner » y sont
    /// sans objet, et les laisser ferait cohabiter des verbes qui n'agissent
    /// sur rien avec ceux qui agissent — la loi 4 sous une autre forme.
    func editMenuInteraction(_ interaction: UIEditMenuInteraction,
                             menuFor configuration: UIEditMenuConfiguration,
                             suggestedActions: [UIMenuElement]) -> UIMenu? {
        UIMenu(children: actions.map { action in
            UIAction(title: action.title,
                     image: action.systemImage.map { UIImage(systemName: $0) } ?? nil,
                     attributes: action.isDestructive ? .destructive : []) { _ in
                action.perform()
            }
        })
    }
}

private struct EditMenuHost: UIViewRepresentable {
    let actions: [MessageEditMenuAction]
    /// Reçoit la vue dès qu'elle existe, pour que le geste puisse la piloter.
    let onReady: (EditMenuHostView) -> Void

    func makeUIView(context: Context) -> EditMenuHostView {
        let view = EditMenuHostView(frame: .zero)
        view.actions = actions
        onReady(view)
        return view
    }

    func updateUIView(_ uiView: EditMenuHostView, context: Context) {
        // Réécrites à CHAQUE mise à jour : une cellule recyclée porte un autre
        // message, et des actions périmées agiraient sur le mauvais.
        uiView.actions = actions
        onReady(uiView)
    }
}

/// **Le double tap ouvre le menu système** — posé sur le conteneur commun des
/// trois peaux, jamais à l'intérieur d'une bulle.
///
/// `SpatialTapGesture` et non `onTapGesture(count: 2)` : le menu système
/// s'ancre sur un POINT, et seul le geste spatial le donne. Un menu ancré au
/// centre de la cellule pointerait à côté du doigt sur un message long.
///
/// `isEnabled` plutôt qu'un `if` chez l'appelant : une branche conditionnelle
/// dans un `@ViewBuilder` change l'IDENTITÉ de la vue, ce qui recrée son état à
/// chaque bascule. Ici l'identité est stable et seule la reconnaissance du
/// geste s'éteint — même raison que `QuickReactionDoubleTap` avant lui.
struct NativeMessageEditMenu: ViewModifier {

    let isEnabled: Bool
    let actions: [MessageEditMenuAction]

    @State private var host: EditMenuHostView?

    func body(content: Content) -> some View {
        content
            .background(EditMenuHost(actions: actions) { view in
                if host !== view { DispatchQueue.main.async { host = view } }
            })
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { value in
                        guard isEnabled, let host else { return }
                        HapticFeedback.light()
                        host.present(at: value.location)
                    },
                including: isEnabled ? .all : .subviews
            )
    }
}
