import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Glisser un commentaire pour y répondre, et le lire avec ses effets
//
// Directive porteur 2026-09-28 (#8582) : « lorsqu'on swipe vers la droite sur
// un commentaire ça ouvre le composeur de message pour y répondre […] De plus
// il faut appliquer les effets sur les commentaires (flou, scintillement, zoom,
// pulse etc.) que ce soit en Feeds, en vue détaillée, en commentaire de Réel,
// en commentaire de story ! »
//
// Deux modificateurs, parce que deux PORTÉES — pas deux règles :
//
// | modificateur | posé sur | porte |
// |---|---|---|
// | `commentSwipeToReply(onReply:)` | la LIGNE entière | le glissé « répondre » |
// | `commentBody(effects:)` | le CORPS (texte + médias) | le voile du flou + les effets |
//
// Le voile ne couvre que le corps : l'auteur, l'heure et les actions restent
// lisibles, comme dans une bulle protégée. Chaque surface de commentaire (feuille,
// page détail, aperçu du fil, story) monte les DEUX — une surface qui en oublie
// un redevient la jumelle divergente que ce fichier existe pour empêcher
// (`CommentSwipeToReplyWiringGuardTests`).

/// Règles pures du glissé d'un commentaire. Il reprend la PISTE de la bulle
/// (`BubbleSwipeResistance` : engagement 3:1 au-delà de 22 pt, zone de 72 pt,
/// élastique, seuil de 66 pt) avec UNE différence : un commentaire n'a qu'une
/// action, la réponse, donc seul le glissé vers la DROITE déplace la ligne.
enum CommentSwipeRules {

    /// Décalage à afficher pour la translation du doigt, ou `nil` quand le
    /// geste n'est pas (encore) un glissé horizontal franc — il appartient
    /// alors au défilement, et la ligne garde sa position.
    static func offset(forTranslation translation: CGSize) -> CGFloat? {
        guard BubbleSwipeResistance.shouldEngage(
            translationWidth: translation.width,
            translationHeight: translation.height,
            isScrubbing: false,
            resistance: .normal
        ) else { return nil }
        return max(0, BubbleSwipeResistance.trackedOffset(translation: translation.width))
    }

    /// Relâcher au-delà du seuil répond ; en deçà, le geste s'annule et la
    /// ligne revient au repos sans rien déclencher.
    static func repliesOnRelease(offset: CGFloat) -> Bool {
        BubbleSwipeResistance.commits(offset: offset)
    }

    /// Avancement de 0 à 1 jusqu'au seuil — pilote la flèche révélée à gauche.
    static func progress(offset: CGFloat) -> CGFloat {
        min(1, max(0, offset / BubbleSwipeResistance.commitDistance))
    }
}

/// Un commentaire flouté se lit sous un voile tant que le lecteur ne l'a pas
/// touché. Le compositeur de commentaire OFFRE le flou (`ComposerMode.comment`)
/// et l'envoie ; les lignes le recevaient et l'affichaient EN CLAIR, parce que
/// `.messageEffects` ne rend que les effets d'apparition et persistants.
enum CommentVeilRules {
    static func isVeiled(effects: MessageEffects, isRevealed: Bool) -> Bool {
        effects.flags.contains(.blurred) && !isRevealed
    }
}

extension View {
    /// Glisser la ligne vers la droite répond au commentaire. Posé en
    /// `.simultaneousGesture` : le défilement vertical garde la main tant que
    /// le geste n'est pas un glissé horizontal franc (même règle que la bulle).
    func commentSwipeToReply(onReply: @escaping () -> Void) -> some View {
        modifier(CommentSwipeToReplyModifier(onReply: onReply))
    }

    /// Le corps d'un commentaire (texte + médias) avec ses effets : le voile du
    /// flou, puis les effets d'apparition et persistants par le MÊME rendu que
    /// les messages.
    func commentBody(effects: MessageEffects) -> some View {
        modifier(CommentBodyModifier(effects: effects))
    }
}

// MARK: - Le glissé

private struct CommentSwipeToReplyModifier: ViewModifier {
    let onReply: () -> Void

    @State private var offset: CGFloat = 0
    @State private var didCrossThreshold = false
    /// Un doigt sur la waveform ou la barre de lecture d'un média de
    /// commentaire possède le glissé horizontal — même cession que la bulle.
    @State private var isMediaScrubbing = false
    /// En arabe, « vers la droite » se lit « depuis le bord de DÉBUT » : le
    /// glissé passe en sens de lecture (`ReadingDirection`), et `.offset` — que
    /// SwiftUI retourne en RTL — le rend sous le doigt.
    @Environment(\.layoutDirection) private var layoutDirection

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .background(alignment: .leading) {
                CommentSwipeReplyIndicator(progress: CommentSwipeRules.progress(offset: offset),
                                           isArmed: CommentSwipeRules.repliesOnRelease(offset: offset))
                    .frame(width: max(0, offset))
                    .clipped()
            }
            .onPreferenceChange(MediaScrubbingPreferenceKey.self) { isMediaScrubbing = $0 }
            .simultaneousGesture(dragGesture, including: isMediaScrubbing ? .none : .all)
            .accessibilityAction(named: String(localized: "a11y.comment.reply", defaultValue: "Répondre", bundle: .main)) {
                onReply()
            }
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: BubbleSwipeResistance.minimumDistance(.normal))
            .onChanged { value in
                let reading = CGSize(
                    width: ReadingDirection.readingDelta(value.translation.width, layoutDirection: layoutDirection),
                    height: value.translation.height
                )
                guard let tracked = CommentSwipeRules.offset(forTranslation: reading) else { return }
                offset = tracked
                let crossed = CommentSwipeRules.repliesOnRelease(offset: tracked)
                if crossed && !didCrossThreshold {
                    HapticFeedback.light()
                }
                didCrossThreshold = crossed
            }
            .onEnded { _ in
                if CommentSwipeRules.repliesOnRelease(offset: offset) {
                    onReply()
                    HapticFeedback.success()
                }
                didCrossThreshold = false
                withAnimation(.spring(response: 0.42, dampingFraction: 0.62, blendDuration: 0.04)) {
                    offset = 0
                }
            }
    }
}

/// La flèche « répondre » révélée dans l'espace que la ligne libère à gauche.
/// Elle grandit avec le glissé et prend la couleur de la marque au seuil.
private struct CommentSwipeReplyIndicator: View {
    let progress: CGFloat
    let isArmed: Bool

    var body: some View {
        Image(systemName: "arrowshape.turn.up.left.fill")
            .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
            .foregroundStyle(isArmed ? MeeshyColors.brandPrimary : MeeshyColors.brandPrimary.opacity(MeeshyOpacity.strong))
            .scaleEffect(0.6 + 0.4 * progress)
            .opacity(progress)
            .animation(.easeInOut(duration: 0.15), value: isArmed)
            .accessibilityHidden(true)
    }
}

// MARK: - Le corps et ses effets

private struct CommentBodyModifier: ViewModifier {
    let effects: MessageEffects

    @ViewBuilder
    func body(content: Content) -> some View {
        if effects.flags.contains(.blurred) {
            content
                .modifier(CommentBlurVeil(effects: effects))
                .messageEffects(effects)
        } else {
            content.messageEffects(effects)
        }
    }
}

/// Le voile d'un commentaire flouté : même contrôleur que la bulle
/// (`BubbleBlurRevealController` — on révèle, on lit, ça se referme) et même
/// affordance (`ProtectedVeilAffordance`, « Contenu masqué · toucher pour
/// révéler »). Le toucher de révélation n'existe QUE sous le voile : une fois
/// le corps révélé, ses médias reprennent leurs propres touchers.
private struct CommentBlurVeil: ViewModifier {
    let effects: MessageEffects

    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var reveal = BubbleBlurRevealController()

    private var isVeiled: Bool {
        CommentVeilRules.isVeiled(effects: effects, isRevealed: reveal.isRevealed)
    }

    func body(content: Content) -> some View {
        content
            .blur(radius: isVeiled ? 16 : 0)
            .allowsHitTesting(!isVeiled)
            .accessibilityHidden(isVeiled)
            .overlay {
                if reveal.fogOpacity > 0 {
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .opacity(reveal.fogOpacity)
                        .allowsHitTesting(false)
                }
            }
            .overlay {
                if isVeiled {
                    ProtectedVeilAffordance(isViewOnce: false, isDark: colorScheme == .dark) {
                        HapticFeedback.medium()
                        reveal.requestReveal(
                            request: BubbleBlurRevealLifecycle.RevealRequest(messageId: "", isViewOnce: false),
                            consumeViewOnce: nil
                        )
                    }
                }
            }
    }
}
