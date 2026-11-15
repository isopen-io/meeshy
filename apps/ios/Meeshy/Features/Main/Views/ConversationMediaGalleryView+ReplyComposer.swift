import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La barre de réponse du plein écran

// Extrait de `ConversationMediaGalleryView.swift` : la couche du DIALOGUE
// (#6165) est une responsabilité à elle — citer la pièce, tenir le brouillon
// par pièce et la langue de composition — que la racine n'a pas à porter. La
// racine garde `replyTarget` (le voile et le bouton « répondre » le lisent) et
// la transition clavier (`replyKeyboard`, posée sur la couche ET sur la racine).
// Les corps sont déplacés à l'identique.

/// **La barre monte, le média RESTE** (#6165).
///
/// `ignoresSafeArea(.keyboard)` est posé sur la SCÈNE (le pager et les
/// couches du plateau, chacun chez lui), jamais ici : sans cette asymétrie,
/// SwiftUI remonterait la pile ENTIÈRE à l'ouverture du clavier et le média
/// sortirait par le haut — exactement ce que l'exigence interdit. Cette
/// couche-ci, elle, doit suivre le clavier : c'est elle qu'on tape.
struct GalleryReplyComposerLayer: View {
    let accentColor: String
    let replyCitation: ((MessageAttachment) -> ReplyReference?)?
    let onSendReplyToMedia: ((MessageAttachment, String, String) -> Void)?
    /// La pièce à laquelle la barre RÉPOND — remise à `nil` à l'envoi et à l'annulation.
    @Binding var replyTarget: MessageAttachment?

    /// La langue de composition de la barre, tenue ICI pour survivre au
    /// montage / démontage de la barre : la refermer et la rouvrir ne doit pas
    /// ramener la langue au défaut.
    @State private var replyLanguage: String = DefaultComposerLanguage.resolve()
    /// **Le brouillon de réponse, PAR PIÈCE** — « en sortir rend le média
    /// intact, brouillon compris » (#6165).
    ///
    /// Par pièce et non global : deux photos d'un même lot se commentent
    /// séparément, et un texte écrit sous l'une n'a rien à faire sous l'autre.
    /// C'est la même raison que `captionLanguage` de la racine —
    /// ce qui appartient à un média se range par média.
    @State private var replyDrafts: [String: String] = [:]

    @ViewBuilder
    var body: some View {
        if let target = replyTarget, let citation = replyCitation?(target) {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                MediaReplyComposerBar(
                    citation: citation,
                    accentColor: accentColor,
                    pieceId: target.id,
                    draft: Binding(
                        get: { replyDrafts[target.id] ?? "" },
                        set: { replyDrafts[target.id] = $0 }
                    ),
                    composerLanguage: $replyLanguage,
                    onSend: { text, language in
                        onSendReplyToMedia?(target, text, language)
                        // #6751 — le clavier d'abord, la barre ensuite : la
                        // suite est décidée par `MediaReplyKeyboardInset`.
                        MediaReplyKeyboardInset.apply(MediaReplyKeyboardInset.sendEffects) {
                        // **La galerie NE SE REFERME PAS** — ni ici, ni au
                        // retrait de la barre. C'est tout l'objet du lot : on
                        // parle de la pièce en la regardant. La barre redescend
                        // pour rendre le média entier, et un second tap sur
                        // « répondre » la remonte.
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                replyTarget = nil
                            }
                        }
                        HapticFeedback.light()
                    },
                    onCancel: {
                        MediaReplyKeyboardInset.apply(MediaReplyKeyboardInset.cancelEffects) {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                replyTarget = nil
                            }
                        }
                    }
                )
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
