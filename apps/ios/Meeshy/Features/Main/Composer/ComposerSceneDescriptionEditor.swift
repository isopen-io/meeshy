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

    var body: some View {
        ComposerDescriptionLayer(
            text: $text,
            placeholder: placeholder,
            // Six lignes : au-delà, la zone mangerait la scène qu'elle est
            // censée laisser voir. Le champ défile — il ne tronque pas.
            collapsedLineLimit: 6,
            opensEditingOnAppear: true
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) { fond }
        .background { mesure }
        .onPreferenceChange(ComposerDescriptionEditorHeightKey.self, perform: onHeightChange)
        // **Le schéma est ÉPINGLÉ sombre, et ce n'est pas un goût.**
        //
        // `ComposerDescriptionLayer` peint son champ avec
        // `glassControlForeground()`, qui résout clair/sombre depuis
        // l'ENVIRONNEMENT. L'environnement du meuble est celui de l'app — clair
        // — alors que cette zone se pose sur la teinte du plateau, qui est
        // sombre. Résultat mesuré à l'écran : « Ajoutez une description… » en
        // gris sombre sur navy, et un champ qu'on ne sait pas lire est un champ
        // qu'on n'ose pas remplir.
        //
        // C'est le même geste que l'atelier fait pour son propre chrome
        // (`canvasChromeScheme`) : la vue ne devine pas son fond, on le lui dit.
        .environment(\.colorScheme, .dark)
        // **« Terminé » au-dessus du clavier**, à la place que le système lui
        // réserve — jamais un bouton flottant, qui se retrouverait sous le
        // clavier dès que le texte grandit.
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                // `indigo400`, pas `indigo500` : c'est le jeton d'accent que le
                // meuble mesure déjà au seuil composant (3:1). En introduire un
                // second obligerait la suite de contraste à le mesurer sur les
                // trois teintes de plateau — pour un bouton qui vit sur la barre
                // de clavier, où aucune de ces teintes n'est le fond.
                Button(ComposerDescriptionCopy.doneShort, action: onDone)
                    .foregroundColor(MeeshyColors.indigo400)
            }
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
