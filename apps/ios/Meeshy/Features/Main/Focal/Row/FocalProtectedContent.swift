import SwiftUI
import MeeshyUI

/// Flou de CONFIDENTIALITÉ au niveau MESSAGE pour la rangée plate — matrice
/// §5 « Éphémère / flou / vue unique » : « Le flou s'applique au bloc contenu
/// de la rangée ». Jusqu'au 2026-08-18, `FocalRow` ne lisait JAMAIS
/// `content.isBlurred` : un message protégé s'affichait EN CLAIR en Focal —
/// une régression de confidentialité pure, sans aucun test rouge
/// (la fixture de `FocalRealtimeMatrixTests` figeait `isBlurred: false`).
///
/// Réutilise `BubbleBlurRevealController` TEL QUEL (§1.3 — lu, jamais
/// modifié) : même séquence tap → révélation 5 s → re-flou, même passage par
/// `consumeViewOnce` quand la révélation exige l'accusé serveur. `FocalRow`
/// reste sans `@State` (contrainte dure §WS-4) : l'état vit ICI, dans la
/// feuille dédiée — même topologie que `ThemedMessageBubble`, qui possède le
/// contrôleur pour `BubbleStandardLayout`.
///
/// Le flou ne touche NI l'identité NI la méta : l'expéditeur et l'heure
/// restent lisibles (parité bulle — seul le bloc contenu est protégé).
struct FocalProtectedContent<Content: View>: View {
    let isBlurred: Bool
    let isViewOnce: Bool
    let messageId: String
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    @ViewBuilder let content: Content

    @StateObject private var reveal = BubbleBlurRevealController()

    private var isMasked: Bool { isBlurred && !reveal.isRevealed }

    var body: some View {
        content
            .blur(radius: isMasked ? 18 : 0)
            .allowsHitTesting(!isMasked)
            .overlay {
                if reveal.fogOpacity > 0 {
                    RoundedRectangle(cornerRadius: FocalMetrics.FocusCard.radius)
                        .fill(.ultraThinMaterial)
                        .opacity(reveal.fogOpacity)
                        .allowsHitTesting(false)
                }
            }
            .overlay {
                if isMasked {
                    revealAffordance
                }
            }
    }

    /// Même contrat d'interaction — et MÊMES clés i18n — que la bulle
    /// (`BubbleStandardLayout:514-521`, un seul domicile i18n) : le contenu
    /// flouté EST l'affordance, tap = révélation temporaire (5 s par défaut,
    /// le contrôleur re-floute seul). `Button(.plain)` + `.contentShape`
    /// plutôt qu'un `.onTapGesture` nu (contrainte dure §WS-4 : un geste nu
    /// serait avalé par le long-press du conteneur).
    private var revealAffordance: some View {
        Button {
            HapticFeedback.medium()
            reveal.requestReveal(
                request: BubbleBlurRevealLifecycle.RevealRequest(
                    messageId: messageId,
                    isViewOnce: isViewOnce
                ),
                consumeViewOnce: onConsumeViewOnce
            )
        } label: {
            Color.clear.contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "bubble.content.hidden", defaultValue: "Contenu masqué", bundle: .main))
        .accessibilityHint(String(localized: "bubble.content.hidden.hint", defaultValue: "Toucher pour révéler le contenu", bundle: .main))
    }
}
