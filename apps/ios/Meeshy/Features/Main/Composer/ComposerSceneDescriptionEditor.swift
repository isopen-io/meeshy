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
            opensEditingOnAppear: true,
            // La coche du champ EST la validation (directive porteur
            // 2026-08-30) : elle range la zone, comme le glissement vers le bas.
            // Deux gestes, un seul acte — et plus de « Terminé » en doublon sur
            // la barre du clavier.
            onValidate: onDone
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
        // **Le glissement vers le BAS valide et ferme** (directive porteur
        // 2026-08-30). Il remplace le « Terminé » de la barre de clavier, qui
        // faisait DOUBLON avec la coche que le champ porte déjà — deux commandes
        // pour un même acte, dont l'une occupait une barre système.
        //
        // Le geste va dans le sens du RANGEMENT : on repousse la zone vers le
        // bas d'où elle est venue, et c'est aussi celui que le clavier suit
        // quand il se retire. Un glissement vers le haut aurait dit l'inverse.
        //
        // Seuil de 40 pt et dominance verticale : sans eux, un glissement
        // horizontal dans le champ — pour placer le curseur — fermerait la
        // saisie au premier tremblement du pouce.
        .gesture(
            DragGesture(minimumDistance: 20)
                .onEnded { valeur in
                    guard valeur.translation.height > 40,
                          valeur.translation.height > abs(valeur.translation.width)
                    else { return }
                    onDone()
                }
        )
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
