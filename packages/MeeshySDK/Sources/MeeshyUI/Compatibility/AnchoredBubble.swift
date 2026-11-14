import SwiftUI

/// Une bulle posée contre son bouton, y compris sur iPhone, à partir d'iOS 16.4 ;
/// avant, une feuille basse à la hauteur donnée — le contenu et les gestes restent
/// les mêmes. Jumelle d'`anchoredPicker`, qui garde la feuille en largeur compacte :
/// une bulle sert une carte courte qu'on lit d'un coup d'œil, un sélecteur une liste.
/// Le popover reste ici, dans le SDK : aucun fichier de l'app n'en pose un à la main.
private struct AnchoredBubbleModifier<BubbleContent: View>: ViewModifier {
    @Binding var isPresented: Bool
    let compactHeight: CGFloat
    let arrowEdge: Edge
    let bubbleContent: () -> BubbleContent

    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.popover(isPresented: $isPresented, arrowEdge: arrowEdge) {
                bubbleContent().presentationCompactAdaptation(.popover)
            }
        } else {
            content.sheet(isPresented: $isPresented) {
                bubbleContent().presentationDetents([.height(compactHeight)])
            }
        }
    }
}

public extension View {
    func anchoredBubble<Content: View>(
        isPresented: Binding<Bool>,
        compactHeight: CGFloat,
        arrowEdge: Edge = .top,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        modifier(AnchoredBubbleModifier(
            isPresented: isPresented,
            compactHeight: compactHeight,
            arrowEdge: arrowEdge,
            bubbleContent: content
        ))
    }
}
