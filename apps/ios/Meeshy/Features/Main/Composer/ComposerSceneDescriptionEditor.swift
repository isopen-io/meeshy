import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La zone de saisie de la description — un TYPE NOMMÉ, et c'est la raison
/// principale de ce fichier** (#4361).
///
/// Elle a d'abord vécu comme propriété calculée du meuble, montée dans une
/// fermeture `.overlay(alignment: .bottom)` de `body`. Elle plantait le
/// simulateur à l'ouverture, avec une trace sans ambiguïté :
///
/// ```
/// 6  swift ... ValueWitnesses<SwiftRetainableBox>::initializeWithCopy
/// 7  SwiftUI  ExclusiveGesture.wcp
/// … huit copies de témoin imbriquées …
/// 16 Meeshy   MeeshyComposerHost.body.sceneDescriptionEditor closure
/// ```
///
/// Ce n'est pas un cycle ni un état mal placé : c'est un **débordement de pile
/// par PROFONDEUR DE TYPE**. Chaque modificateur empilé dans la fermeture
/// (`background` × 2, `toolbar`, `transition`, `animation`) enrichit le type
/// générique que `body` doit copier, et la copie de témoin devient récursive
/// assez profondément pour épuiser la pile. Le dépôt paie déjà cette leçon
/// ailleurs (`reference_swiftui_type_depth_stack_overflow`) : le remède n'est
/// pas de simplifier la vue, c'est de lui donner un NOM — un type nommé
/// referme la profondeur derrière un seul `some View`.
///
/// **Et le simulateur ment dans le sens rassurant** : il offre 8 Mo de pile
/// contre ~1 Mo à un appareil. Une profondeur qui plante ici plante partout ;
/// une profondeur qui passe ici peut encore tomber sur un iPhone.
struct ComposerSceneDescriptionEditor: View {

    @Binding var text: String
    let placeholder: String
    /// La teinte du PLATEAU. La zone appartient au meuble : elle ne flotte pas
    /// au-dessus de lui, et elle n'emprunte pas le navy du socle sur lequel elle
    /// se pose — mesuré à l'écran, l'amorce y devenait gris sombre sur navy, et
    /// un champ qu'on ne sait pas lire est un champ qu'on n'ose pas remplir.
    let plateauTint: Color
    let onDone: () -> Void
    let onHeightChange: (CGFloat) -> Void

    /// **La langue du texte, servie AU-DESSUS de la coche** (#5137). Simple
    /// relais : la zone ne construit pas la capsule — elle ne sait ni quelle
    /// langue est déclarée, ni quel portail ouvre le sélecteur. Le calque la
    /// peint, l'hôte la fabrique, et personne au milieu ne décide.
    var languageAccessory: AnyView?

    /// Relais du libellé de la coche (#4890) — voir
    /// `ComposerDescriptionLayer.validationLabel`. Le défaut garde ce que
    /// l'appelant historique avait.
    var validationLabel: String = ComposerDescriptionCopy.done

    var body: some View {
        // **Le glissement est CONTRÔLÉ, pas déclenché** (directive porteur
        // 2026-08-30, precision) :
        //
        // > « Le swipe vers le bas doit faire swiper le clavier vers le bas
        // > aussi en même temps — c'est un swipe contrôlé, si on annule le
        // > clavier reste et on peut écrire. Le swipe fait partir le clavier
        // > d'abord, avant de faire partir la zone de saisie. »
        //
        // Un `DragGesture.onEnded` ne pouvait pas rendre ça : il DÉCIDE à la
        // levée du doigt, sans rien montrer pendant, et rien n'y est annulable
        // — le clavier partait d'un coup, après la zone, dans le désordre.
        //
        // `scrollDismissesKeyboard(.interactively)` est le mécanisme SYSTÈME de
        // ce geste : le clavier suit le doigt, image par image, et remonte si on
        // relâche avant d'avoir fini. C'est exactement « contrôlé », et le
        // fabriquer à la main aurait donné une imitation qui diverge du reste de
        // l'OS.
        //
        // Il exige un conteneur défilant — d'où le `ScrollView`. Il ne défile
        // rien tant que le champ tient en six lignes ; sa seule raison d'être ici
        // est de porter le geste.
        ScrollView {
            editeur
        }
        .scrollDismissesKeyboard(.interactively)
        // Le conteneur ne doit pas prendre plus de place que son contenu : sans
        // cela, la zone occuperait tout le bas de l'écran et la réserve remontée
        // à l'atelier ferait fuir la scène vers le haut.
        .frame(maxHeight: mesureHauteur)
        .background(alignment: .top) { fond }
        .environment(\.colorScheme, .dark)
    }

    /// La hauteur mesurée du contenu, servie au `ScrollView` pour qu'il ne
    /// s'étale pas. `nil` tant que rien n'est mesuré — le conteneur prend alors
    /// sa taille naturelle, ce qui est le seul défaut sûr : une valeur devinée
    /// ferait sauter la scène à la première image.
    @State private var mesureHauteur: CGFloat?

    private var editeur: some View {
        ComposerDescriptionLayer(
            text: $text,
            placeholder: placeholder,
            // Six lignes : au-delà, la zone mangerait la scène qu'elle est
            // censée laisser voir. Le champ défile — il ne tronque pas.
            collapsedLineLimit: 6,
            opensEditingOnAppear: true,
            // La coche du champ EST la validation (directive porteur
            // 2026-08-30) : elle range la zone, comme le glissement vers le bas.
            // Deux gestes, un seul acte — et plus de « Terminé » en doublon sur
            // la barre du clavier.
            onValidate: onDone,
            // APRÈS `onValidate:` — l'ordre suit la DÉCLARATION du calque, que
            // Swift n'autorise pas à réordonner (`fillsAvailableHeight` garde sa
            // valeur par défaut entre les deux).
            languageAccessory: languageAccessory,
            validationLabel: validationLabel
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background { mesure }
        .onPreferenceChange(ComposerDescriptionEditorHeightKey.self) { hauteur in
            mesureHauteur = hauteur
            onHeightChange(hauteur)
        }
    }

    /// Le filet du haut dit où la scène s'arrête et où l'écriture commence, sans
    /// fermer la zone par une bordure.
    private var fond: some View {
        ZStack(alignment: .top) {
            plateauTint.ignoresSafeArea(edges: .bottom)
            Rectangle()
                .fill(Color.white.opacity(0.14))
                .frame(height: 1)
        }
    }

    /// La MESURE, en `background` : une `GeometryReader` posée en overlay
    /// capterait les taps destinés au champ.
    private var mesure: some View {
        GeometryReader { geo in
            Color.clear.preference(key: ComposerDescriptionEditorHeightKey.self,
                                   value: geo.size.height)
        }
    }
}
