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
    var isDark: Bool = false
    let messageId: String
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Ce que dit le voile à VoiceOver : le toucher le lève SUR PLACE (#8389).
    var tap: ProtectedContentTap = .revealInPlace
    /// Ce que fait le toucher SUIVANT sur le contenu révélé, là où l'hôte ne
    /// rend aucune case (la Rivière) : le plein écran de sa première pièce.
    var tapAfterReveal: ProtectedContentTap = .none
    var onMediaTap: ((MessageAttachment) -> Void)? = nil
    @ViewBuilder let content: Content

    @StateObject private var reveal = BubbleBlurRevealController()

    private var isMasked: Bool { isBlurred && !reveal.isRevealed }

    var body: some View {
        content
            // #8537 — le message révélé lève AUSSI le voile de ses pièces
            // floutées : un toucher montre l'image, le suivant l'ouvre.
            .environment(\.focalMessageRevealed, reveal.isRevealed)
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
                } else if reveal.isRevealed, case .openFullscreen(let media) = tapAfterReveal, let onMediaTap {
                    Button {
                        HapticFeedback.light()
                        onMediaTap(media)
                    } label: {
                        Color.clear.contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(tapAfterReveal.accessibilityHint ?? "")
                }
            }
    }

    /// Même contrat d'interaction — et MÊME composant — que la bulle : le
    /// contenu voilé EST l'affordance, tap = révélation temporaire (5 s par
    /// défaut, le contrôleur re-floute seul) ou consommation de la vue unique.
    private var revealAffordance: some View {
        // #7452 — l'affordance est LA MÊME qu'en bulle (`ProtectedVeilAffordance`,
        // MeeshyUI) : même libellé, même indice, même geste. Elle était
        // dupliquée ici avec ses propres clés i18n, et ni l'une ni l'autre ne
        // disait qu'une vue unique se CONSOMME au toucher.
        ProtectedVeilAffordance(isViewOnce: isViewOnce, isDark: isDark, hint: tap.accessibilityHint) {
            HapticFeedback.medium()
            reveal.requestReveal(
                request: BubbleBlurRevealLifecycle.RevealRequest(
                    messageId: messageId,
                    isViewOnce: isViewOnce
                ),
                consumeViewOnce: onConsumeViewOnce
            )
        }
    }
}

/// Le message qui porte cette pièce est-il RÉVÉLÉ (`FocalProtectedContent`) ?
/// Lu par `FocalGridCell` : une pièce floutée d'un message révélé se montre
/// sans second voile « Contenu masqué » (#8537). La vue unique n'est pas visée.
private struct FocalMessageRevealedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var focalMessageRevealed: Bool {
        get { self[FocalMessageRevealedKey.self] }
        set { self[FocalMessageRevealedKey.self] = newValue }
    }
}
