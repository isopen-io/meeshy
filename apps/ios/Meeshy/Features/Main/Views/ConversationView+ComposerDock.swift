import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le dock du composeur : suggestions, zone de saisie, panneau emoji
//
// Extrait de `ConversationView.swift` (cohésion). Le dock empile, au bas de
// l'écran, trois choses qui partagent un même sol (la pastille de
// synchronisation) : les suggestions de mention, la ZONE (composeur, barre de
// sélection ou zone « débloquer » — choisie par l'hôte, qui connaît l'état) et
// le panneau emoji. La zone est un `@ViewBuilder`, pas un `AnyView` : la
// structure de la branche choisie reste celle que SwiftUI suivait avant.

struct ConversationComposerDock<Zone: View>: View {
    let viewModel: ConversationViewModel
    let composerText: ConversationComposerTextModel
    @Binding var composerState: ConversationComposerState
    let accentColor: String
    let isDark: Bool
    let onHeightChange: (CGFloat) -> Void
    let zone: Zone

    init(
        viewModel: ConversationViewModel,
        composerText: ConversationComposerTextModel,
        composerState: Binding<ConversationComposerState>,
        accentColor: String,
        isDark: Bool,
        onHeightChange: @escaping (CGFloat) -> Void,
        @ViewBuilder zone: () -> Zone
    ) {
        self.viewModel = viewModel
        self.composerText = composerText
        self._composerState = composerState
        self.accentColor = accentColor
        self.isDark = isDark
        self.onHeightChange = onHeightChange
        self.zone = zone()
    }

    var body: some View {
        VStack {
            Spacer()
            VStack(spacing: 0) {
                MentionSuggestionOverlay(controller: viewModel.mentionController,
                                         accentColor: accentColor) { candidate in
                    composerText.text = viewModel.insertMention(candidate, into: composerText.text)
                }
                // #4005 — la barre de sélection REMPLACE le composer, jamais un
                // troisième bandeau au-dessus : composer un nouveau message et
                // sélectionner des anciens messages sont deux intentions qui ne
                // coexistent pas.
                zone
                // Panneau emoji inline — glisse vers le haut À LA PLACE DU
                // CLAVIER, donc EN DESSOUS de la barre de composition (jamais
                // au-dessus). Même placement que le carrousel de pièces
                // jointes et que le composer story, pour une bascule
                // clavier ⇄ emoji sans saut visuel.
                if composerState.showTextEmojiPicker {
                    EmojiKeyboardPanel(
                        style: isDark ? .dark : .light,
                        onSelect: { emoji in
                            composerState.emojiToInject = emoji
                        }
                    )
                    .frame(height: 260)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            // Composer transparent, sans fond (#3920, directive porteur
            // 2026-08-26) : le seul état qui dépendait de ce matériau
            // PARTAGÉ était le composer nu — `MentionSuggestionOverlay`,
            // `EmojiKeyboardPanel`, `closedConversationBanner` et
            // `blockedComposerZone` se dotent CHACUN de leur propre fond
            // (`.ultraThinMaterial`/`.regularMaterial`), donc aucun n'en
            // dépend plus ici.
            .ignoresSafeArea(.container, edges: .bottom)
            // La barre est le sol de la pastille de synchronisation, qui la
            // suit sur le clavier (#10840) ; sa hauteur brute sert toujours
            // la réserve basse du fil.
            .docksSyncPill(onHeightChange: onHeightChange)
        }
    }
}
