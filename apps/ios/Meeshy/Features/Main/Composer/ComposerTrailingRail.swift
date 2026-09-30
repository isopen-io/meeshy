import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail *trailing* — les CONTRÔLEURS de l'objet sélectionné** (#4063,
/// planche rév. 27 § P4, loi 12).
///
/// ## Ce qu'il porte, et pourquoi ce n'est pas une invention
///
/// Exactement ce que l'appui long propose déjà sur un objet de la scène
/// (#4046, `StoryCanvasContextAction`) : modifier · monter · reculer · sortir
/// de la scène · dupliquer · supprimer. **Même règle, autre géographie.**
///
/// Écrire ici une seconde liste aurait produit deux inventaires d'un même
/// geste, et la divergence n'aurait rougi nulle part — chacun restant cohérent
/// avec lui-même pendant que le menu offrirait ce que le rail refuse.
///
/// ## Loi 4, et elle décide de l'existence du rail entier
///
/// **Aucune sélection ⇒ aucun contrôleur ⇒ aucun rail.** Pas un rail vide, pas
/// un rail grisé : rien. La liste arrive déjà filtrée par
/// `StoryCanvasContextAction.offered` — cette vue ne décide de rien, comme sa
/// jumelle *leading*.
///
/// ## Trois décisions communes au rail *leading*, et pour les mêmes raisons
///
/// `trailing` jamais « à droite » (l'arabe échange les deux) ; ancré EN BAS
/// (le pouce) ; la vue ne filtre pas.
struct ComposerTrailingRail: View {

    /// Les actions SERVIES pour l'objet courant, dans leur ordre. Vide ⇒ le
    /// rail n'existe pas.
    let actions: [StoryCanvasContextAction]

    let plateauTint: Color

    var onAction: ((StoryCanvasContextAction) -> Void)?

    /// **Créer une SLIDE** (directive porteur 2026-08-30) : « on garde à droite
    /// les outils permettant de contrôler la scène, dont tout en haut de la
    /// liste une frame `[+]` permettant de créer un slide ».
    ///
    /// `nil` ⇒ l'hôte ne sait pas en créer, donc aucune frame (loi 4).
    var onAddSlide: (() -> Void)?

    /// **L'HISTORIQUE, qui vivait au socle** (directive porteur 2026-08-31) :
    ///
    /// > « À droite, ça agit sur les dimensions des objets, + undo/redo devrait
    /// > y être, + création d'un autre slide. »
    ///
    /// Ce qu'il défait, ce sont des gestes sur les OBJETS — poser un texte,
    /// déplacer un média, tracer. Au socle, il voisinait avec l'audience et le
    /// bouton publier, qui décident de l'ENVOI : la zone dit « ce qui part »,
    /// l'historique dit « ce que j'ai fait ». Deux niveaux du modèle dans une
    /// seule rangée.
    ///
    /// `nil` ⇒ absent, jamais grisé — même contrat que `onAddSlide`, et pour la
    /// même raison : défaire un geste qui n'existe pas n'est pas un état, c'est
    /// une promesse creuse.
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    /// **Le ressort qui pousse vers le pouce** — le même contrat que
    /// `ComposerLeadingRail.pushesToThumb`. Sur la scène plein écran (#8370), le
    /// rail FLOTTE au bas de la scène libre : un ressort l'y étirait sur toute la
    /// hauteur, colonne de verre vide au-dessus du `[+]`.
    var pushesToThumb: Bool = true

    /// **Des boutons séparés, sans libellé** (directive porteur 2026-09-27 :
    /// « fais des boutons séparés sans caption […] de petite taille »). Chaque
    /// entrée porte son disque de verre. Depuis #8713 : les OPTIONS du moment en
    /// haut, puis « Temps », annuler et rétablir en bas — le Cadre est parti au
    /// rail gauche, la nouvelle scène à la barre haute.
    var separateButtons: Bool = false

    /// **Le Cadre a quitté ce rail pour le rail GAUCHE** (#8713, directive
    /// porteur 2026-09-29 : « l'icône qui est au-dessus du (+) tu la mets après
    /// l'icône éclair »), et le `(+)` d'une nouvelle scène pour la barre haute.
    /// Ce qui reste en bas est l'historique — toujours — sous « Temps ».
    ///
    /// **Les OPTIONS du moment, au-dessus** (#8713, #8714) : les contrôleurs de
    /// l'outil ouvert, ou les options de l'objet touché, puis leur `(x)`. Déjà
    /// composées par `ComposerTrailingColumn.options` — cette vue ne décide de
    /// rien. Vide ⇒ la colonne se réduit à son pied.
    var options: [ComposerTrailingColumn.Entry] = []
    var onOption: ((ComposerTrailingColumn.Entry) -> Void)? = nil

    /// **« Temps »** — présent seulement quand la scène est ANIMÉE (maquette
    /// `Main.dc.html`, couloir droit : le bouton n'existe qu'en mode
    /// dynamique). Il montre ou range la frise ; `timeIsOpen` le marque actif.
    var onTime: (() -> Void)? = nil
    var timeIsOpen: Bool = false

    @State private var lastTapped: String?

    /// **Le rail n'existe que s'il porte quelque chose** : une option, un
    /// historique, « Temps », ou le `[+]` que seul l'atelier plein écran lui
    /// passe encore. Sur la scène, le `[+]` vit à la barre haute (#8713).
    private var isEmpty: Bool {
        actions.isEmpty && onAddSlide == nil && onUndo == nil && onRedo == nil && options.isEmpty
            && onTime == nil
    }

    var body: some View {
        if !isEmpty {
            if separateButtons { tiles } else { column }
        }
    }

    /// **Les options EN HAUT, l'historique EN BAS** (#8713, #8714).
    ///
    /// Les options défilent quand elles ne tiennent pas — dix sections d'un
    /// texte et ses quatre actions dépassent la hauteur d'un téléphone clavier
    /// levé — et le pied, lui, ne défile JAMAIS : la place que le doigt apprend
    /// pour défaire ne dépend pas du nombre d'options. `ViewThatFits`, comme
    /// le rail gauche (#6131) : le débordement est une question de PLACE.
    @ViewBuilder
    private var tiles: some View {
        if options.isEmpty {
            footStack
                .accessibilityElement(children: .contain)
                .accessibilityLabel(Text(ComposerTrailingRailCopy.sceneRailLabel))
        } else {
            // **Le `(x)` est HORS du défilement** — la promesse du rail gauche
            // (#4582, #8652) portée à droite : la sortie reste visible quand
            // les options débordent, c'est-à-dire quand on en a le plus besoin.
            ViewThatFits(in: .vertical) {
                VStack(spacing: ComposerRailGeometry.floatingEntrySpacing) {
                    optionStack
                    exitStack
                    Spacer(minLength: ComposerRailGeometry.floatingEntrySpacing)
                    footStack
                }
                VStack(spacing: ComposerRailGeometry.floatingEntrySpacing) {
                    ScrollView(.vertical, showsIndicators: false) { optionStack }
                    exitStack
                    footStack
                }
            }
            .frame(maxHeight: .infinity, alignment: .top)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerTrailingColumnPaint.groupLabel(options)))
        }
    }

    private var optionStack: some View {
        entryStack(options.filter { !$0.isExit })
    }

    private var exitStack: some View {
        entryStack(options.filter(\.isExit))
    }

    private func entryStack(_ entrees: [ComposerTrailingColumn.Entry]) -> some View {
        VStack(spacing: ComposerRailGeometry.floatingEntrySpacing) {
            ForEach(entrees) { entree in
                let peint = ComposerTrailingColumnPaint(entree)
                tile(symbol: peint.symbol, label: peint.label, key: entree.id,
                     isOn: peint.isOn, tint: peint.tint) {
                    onOption?(entree)
                }
            }
        }
    }

    /// Le pied : « Temps » d'une scène animée, puis annuler et rétablir — ces
    /// deux-là au plus bas, sous le pouce.
    private var footStack: some View {
        VStack(spacing: ComposerRailGeometry.floatingEntrySpacing) {
            if let onTime {
                tile(symbol: "timeline.selection", label: ComposerSceneFriseCopy.timeButton,
                     key: "time", isOn: timeIsOpen, action: onTime)
            }
            if let onUndo {
                tile(symbol: "arrow.uturn.backward", label: ComposerHistoryCopy.undo,
                     key: "undo", isOn: false, action: onUndo)
            }
            if let onRedo {
                tile(symbol: "arrow.uturn.forward", label: ComposerHistoryCopy.redo,
                     key: "redo", isOn: false, action: onRedo)
            }
            if let onAddSlide {
                tile(symbol: "plus.rectangle.on.rectangle", label: ComposerTrailingRailCopy.addSlide,
                     key: "slide.add", isOn: false, action: onAddSlide)
            }
        }
    }

    /// Un bouton SÉPARÉ : l'icône seule, petite, dans son disque de verre —
    /// indigo quand l'outil qu'il ouvre est actif. Le libellé reste le nom
    /// accessible.
    private func tile(symbol: String,
                      label: String,
                      key: String,
                      isOn: Bool,
                      tint: Color = MeeshyColors.textPrimary(isDark: true),
                      action: @escaping () -> Void) -> some View {
        Button {
            lastTapped = key
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(tint)
                .composerToolBounce(active: lastTapped == key)
                .modifier(ComposerRailButtonGlass(active: true, plateauTint: plateauTint,
                                                  tint: isOn ? MeeshyColors.brandPrimary : nil))
                .frame(width: ComposerRailGeometry.railWidth, height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private var column: some View {
        Group {
            VStack(spacing: MeeshySpacing.smPlus) {
                if pushesToThumb { Spacer(minLength: 0) }
                // **`[+]` TOUT EN HAUT**, jamais mêlée aux contrôleurs de
                // l'objet : elle n'agit pas sur le même niveau du modèle. Les
                // contrôleurs modifient UN objet ; celle-ci ajoute une PAGE à
                // la publication. Les voisiner sans les distinguer ferait
                // ranger « dupliquer » et « nouvelle slide » dans le même
                // geste mental.
                if let onAddSlide {
                    addSlideButton(onAddSlide)
                    if !actions.isEmpty {
                        Divider()
                            .frame(width: 22)
                            .overlay(MeeshyColors.textSecondary(isDark: true).opacity(0.25))
                    }
                }
                ForEach(actions, id: \.self) { action in
                    actionButton(action)
                }
                // **L'historique en BAS, le plus près du pouce.** Défaire est le
                // geste le plus fréquent du rail, et le ressort qui pousse le
                // contenu vers le bas met la dernière entrée à portée. Le `[+]`
                // garde sa place tout en haut : il n'agit pas sur un objet mais
                // ajoute une PAGE, et la directive du 2026-08-30 l'y a mis.
                if onUndo != nil || onRedo != nil {
                    if !actions.isEmpty || onAddSlide != nil {
                        Divider()
                            .frame(width: 22)
                            .overlay(MeeshyColors.textSecondary(isDark: true).opacity(0.25))
                    }
                    if let onUndo {
                        historyButton(systemName: "arrow.uturn.backward",
                                      label: ComposerHistoryCopy.undo, action: onUndo)
                    }
                    if let onRedo {
                        historyButton(systemName: "arrow.uturn.forward",
                                      label: ComposerHistoryCopy.redo, action: onRedo)
                    }
                }
            }
            .frame(width: ComposerRailGeometry.railWidth)
            .padding(.vertical, 8)
            // Verre TEINTÉ du plateau : le rail flotte sur la scène (#8370).
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: ComposerRailGeometry.railWidth / 2, style: .continuous),
                           tint: plateauTint.opacity(0.55))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerTrailingRailCopy.railLabel))
        }
    }

    /// La frame `[+]`. Un CADRE, pas un cercle : ce qu'on ajoute est une
    /// surface, et le glyphe le dit.
    private func addSlideButton(_ action: @escaping () -> Void) -> some View {
        Button {
            lastTapped = "slide.add"
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: "plus.rectangle.on.rectangle")
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .composerToolBounce(active: lastTapped == "slide.add")
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(ComposerTrailingRailCopy.addSlide))
    }

    private func actionButton(_ action: StoryCanvasContextAction) -> some View {
        Button {
            lastTapped = String(describing: action)
            onAction?(action)
            HapticFeedback.light()
        } label: {
            Image(systemName: action.systemImage)
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                // La seule action DESTRUCTRICE porte la couleur sémantique
                // d'erreur — jamais une couleur de format (U15).
                .foregroundColor(action == .delete
                                 ? MeeshyColors.error
                                 : MeeshyColors.textSecondary(isDark: true))
                .composerToolBounce(active: lastTapped == String(describing: action))
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(action.title))
    }

    /// Une entrée d'historique — même gabarit que les contrôleurs voisins, pour
    /// que la colonne reste une colonne. Le verre de la capsule du socle ne la
    /// suit pas : ici c'est le socle du RAIL qui le porte, pour toutes.
    private func historyButton(systemName: String,
                               label: String,
                               action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                // `.title3`, comme les deux contrôleurs voisins de la même
                // colonne : une taille figée ne scalerait pas avec le Dynamic
                // Type, et l'historique n'a aucune raison d'être le seul bouton
                // du rail à ne pas grossir avec les autres.
                .font(.title3)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(label))
    }

}

/// Le libellé du rail. Les ACTIONS, elles, portent déjà le leur
/// (`StoryCanvasContextAction.title`) — le réemployer garde le menu et le rail
/// d'accord sur les mots, ce qu'une seconde table de libellés perdrait au
/// premier renommage.
nonisolated enum ComposerTrailingRailCopy {
    static var railLabel: String {
        String(localized: "composer.rail.trailing.label",
               defaultValue: "Modifier l'objet sélectionné", bundle: .main)
    }

    static var sceneRailLabel: String {
        String(localized: "composer.rail.trailing.scene",
               defaultValue: "Outils de la scène", bundle: .main)
    }

    static var addSlide: String {
        String(localized: "composer.rail.slide.add",
               defaultValue: "Nouvelle slide", bundle: .main)
    }

    /// Le `(x)` d'une sélection (#8714) : il ne détruit rien, il rend la scène.
    static var exitObject: String {
        String(localized: "composer.rail.object.exit",
               defaultValue: "Quitter l'objet", bundle: .main)
    }
}

/// Les mots des EFFETS de la scène (#8712, #8792) : deux familles, deux noms.
nonisolated enum ComposerSceneEffectCopy {
    static func label(_ effect: ComposerSceneEffect) -> String {
        switch effect {
        case .opening:
            return String(localized: "composer.scene.effect.opening",
                          defaultValue: "Effet d'ouverture", bundle: .main)
        case .visual:
            return String(localized: "composer.scene.effect.visual",
                          defaultValue: "Effet visuel", bundle: .main)
        }
    }

    /// Les deux rangées du carrousel d'ouverture : l'entrée, puis la sortie.
    static var openingRow: String {
        String(localized: "composer.scene.effect.openingRow",
               defaultValue: "Ouverture", bundle: .main)
    }

    static var closingRow: String {
        String(localized: "composer.scene.effect.closingRow",
               defaultValue: "Fermeture", bundle: .main)
    }

    static var column: String {
        String(localized: "composer.scene.effects",
               defaultValue: "Effets de la scène", bundle: .main)
    }

    static var close: String {
        String(localized: "composer.scene.effect.close",
               defaultValue: "Fermer les effets", bundle: .main)
    }
}

/// **Ce qu'une entrée de la colonne PEINT** — glyphe, nom, état, teinte — lu
/// des inventaires qui la décrivent déjà : le contrôleur de l'outil, la table
/// de l'éditeur d'objet, l'action du SDK. Aucun libellé n'est réécrit ici.
struct ComposerTrailingColumnPaint {
    let symbol: String
    let label: String
    let isOn: Bool
    let tint: Color

    /// Ce que VoiceOver annonce en entrant dans la colonne : les effets de la
    /// scène, les réglages d'un outil, ou l'objet touché.
    static func groupLabel(_ options: [ComposerTrailingColumn.Entry]) -> String {
        if options.contains(where: { if case .sceneEffect = $0 { return true }; return false }) {
            return ComposerSceneEffectCopy.column
        }
        if options.contains(where: { if case .backgroundSection = $0 { return true }; return false }) {
            return ComposerBackgroundToolsCopy.entered
        }
        if options.contains(.exitTool) { return ComposerRailCopy.toolRailLabel }
        return ComposerTrailingRailCopy.railLabel
    }

    init(_ entry: ComposerTrailingColumn.Entry) {
        let neutre = MeeshyColors.textPrimary(isDark: true)
        switch entry {
        case .toolControl(let control):
            symbol = control.symbolName
            label = control.label
            isOn = control.isExpanded
            tint = neutre
        case .sceneEffect(let effet, let ouvert):
            symbol = effet.symbol
            label = ComposerSceneEffectCopy.label(effet)
            isOn = ouvert
            tint = neutre
        case .editorSection(let section):
            symbol = ComposerObjectEditorRail.symbolName(section)
            label = ComposerObjectEditorCopy.entry(section)
            isOn = false
            tint = neutre
        case .backgroundSection(let section, let ouvert):
            symbol = ComposerObjectEditorRail.symbolName(section)
            label = ComposerObjectEditorCopy.entry(section)
            isOn = ouvert
            tint = neutre
        case .objectAction(let action):
            symbol = action.systemImage
            label = action.title
            isOn = false
            // La seule action DESTRUCTRICE porte la couleur sémantique d'erreur.
            tint = action == .delete ? MeeshyColors.error : neutre
        case .exitTool:
            symbol = "xmark"
            label = ComposerToolExitCopy.label
            isOn = false
            tint = neutre
        case .exitObject:
            symbol = "xmark"
            label = ComposerTrailingRailCopy.exitObject
            isOn = false
            tint = neutre
        }
    }
}

/// **Ce que le rail *trailing* offre pour l'objet sélectionné** — une règle
/// PURE, entre la sélection et `StoryCanvasContextAction.offered`.
///
/// Elle existe pour une raison précise : `offered` prend cinq PRIMITIVES, et
/// c'est très bien pour un menu qui les a sous la main. Un hôte SwiftUI, lui,
/// n'a qu'une `StorySlide` et un id — et les dériver au site d'appel ferait
/// naître, à chaque hôte, une lecture de plus des mêmes champs.
nonisolated enum ComposerTrailingRailPolicy {

    /// - Parameter selectedId: `nil` ⇒ aucune sélection ⇒ **aucune action**, et
    ///   donc aucun rail (loi 4).
    /// - Parameter served: les actions dont l'HÔTE possède la primitive.
    ///   L'empilement, par exemple, ne vit aujourd'hui que sur la
    ///   `StoryCanvasUIView` — le meuble n'a aucune référence à cette vue et le
    ///   ViewModel n'expose pas l'équivalent. Peindre « Monter » ici ouvrirait
    ///   un bouton sans effet, ce que la loi 4 interdit, et il ne fait pas
    ///   d'exception pour ce qu'on compte câbler bientôt.
    ///
    ///   **Ce filtre est APP-side, délibérément.** La règle du SDK
    ///   (`offered`) dit ce qu'un OBJET admet ; ce paramètre dit ce que CE
    ///   meuble sait faire. Les mêler aurait fait grandir la signature partagée
    ///   d'un paramètre par capacité d'hôte.
    /// - Parameter hasEditor: l'hôte sait-il ouvrir un éditeur pour cet objet ?
    /// - Parameter canLeaveScene: l'hôte sait-il RECEVOIR un objet qui sort ?
    ///   Le SDK ne connaît ni « Story » ni « Post » : il demande l'EFFET, pas
    ///   le profil (#4046).
    static func actions(
        slide: StorySlide?,
        selectedId: String?,
        served: Set<StoryCanvasContextAction>,
        hasEditor: Bool,
        canLeaveScene: Bool
    ) -> [StoryCanvasContextAction] {
        guard let slide, let selectedId else { return [] }
        return StoryCanvasContextAction.offered(
            isLocked: StorySceneObjectPredicates.isLocked(slide: slide, id: selectedId),
            isBackground: StorySceneObjectPredicates.isBackground(slide: slide, id: selectedId),
            sharesPlaneWithAnother: StorySceneObjectPredicates.sharesPlaneWithAnother(
                slide: slide, besides: selectedId),
            hasEditor: hasEditor,
            canLeaveScene: canLeaveScene,
            // Une image et un texte n'ont pas de source a rogner : le predicat
            // interroge le MODELE, comme ses trois voisins ci-dessus. Ce que
            // l'HOTE sait faire reste dans `served`, une ligne plus bas.
            hasTrimmableSource: StorySceneObjectPredicates.hasTrimmableSource(
                slide: slide, id: selectedId),
            // **Devenir le fond** (#8716) : une image ou une vidéo POSÉE — le
            // modèle le dit, le SDK en décide le mot (mettre / remplacer).
            canBecomeBackground: slide.sceneObject(id: selectedId)?.kind == .media,
            sceneHasBackground: slide.effects.hasVisualBackgroundMedia
        )
        .filter(served.contains)
    }
}

