import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les présentations pilotées par l'état du composeur
//
// Extraites de `ConversationView.swift` (cohésion). Chaque modificateur emporte
// UNE présentation et son câblage ; l'hôte leur lie `composerState` (une struct
// tenue en `@State` : liée, jamais copiée) et leur remet ce qui se compose chez
// lui.

/// Popup consentement vocal (2026-07-08) : envoi d'un audio sans consentement
/// validé → proposer la traduction automatique. La validation accorde le
/// consentement de définition du profil vocal ET la traduction utilisant ce
/// profil, puis relance l'envoi ; « Plus tard » envoie tel quel (le composer
/// n'a pas encore été vidé quand ce popup interrompt le send).
struct ConversationVoiceConsentAlert: ViewModifier {
    @Binding var isPresented: Bool
    let onAccept: () -> Void
    let onLater: () -> Void

    func body(content: Content) -> some View {
        content.alert(
            String(localized: "conversation.voiceConsent.title",
                   defaultValue: "Traduction automatique des vocaux", bundle: .main),
            isPresented: $isPresented
        ) {
            Button(String(localized: "conversation.voiceConsent.accept",
                          defaultValue: "Activer", bundle: .main)) {
                onAccept()
            }
            Button(String(localized: "conversation.voiceConsent.later",
                          defaultValue: "Plus tard", bundle: .main), role: .cancel) {
                onLater()
            }
        } message: {
            Text(String(localized: "conversation.voiceConsent.message",
                        defaultValue: "Autorisez la définition de votre profil vocal pour que vos messages vocaux soient transcrits et traduits automatiquement dans la langue de chaque destinataire — y compris avec votre voix.",
                        bundle: .main))
        }
    }
}

/// Le transfert d'un message. La feuille se referme AVEC le groupe (#4005) ; une
/// fois DÉMONTÉE, le plein écran du composeur peut prendre sa place — promouvoir
/// plus tôt présenterait deux modaux à la fois.
struct ConversationForwardSheet<Picker: View>: ViewModifier {
    @Binding var composerState: ConversationComposerState
    @ViewBuilder let picker: (Message) -> Picker

    func body(content: Content) -> some View {
        content.sheet(item: $composerState.forwardMessage, onDismiss: {
            // #4005 — le transfert groupé se referme AVEC le simple.
            composerState.forwardAdditionalMessages = []
            // La feuille est DÉMONTÉE : le plein écran peut prendre sa
            // place. Promouvoir plus tôt présenterait deux modaux à la fois.
            guard let attendue = composerState.pendingComposeTarget else { return }
            composerState.pendingComposeTarget = nil
            composerState.composeMediaTarget = attendue
        }) { msgToForward in
            picker(msgToForward)
        }
    }
}

/// Les deux plein écrans que le composeur ouvre : la PORTE du média reçu et
/// l'aperçu d'un média en attente.
///
/// La porte (lot 5, O13) est un plein écran, pas une feuille : c'est un
/// atelier, et il occupe l'écran comme celui de la création. Elle vit dans la
/// couche des COVERS et non dans celle des feuilles, où le débordement de pile
/// par profondeur de type a déjà coûté dix-huit rapports device. Le montage du
/// MEUBLE, lui, reste dans la porte : le poser ici recopierait son envoi, sa
/// reprise hors-ligne et sa sortie — et ce lot livre justement un SECOND
/// déclencheur du même chemin.
struct ConversationComposeCovers: ViewModifier {
    @Binding var composerState: ConversationComposerState
    let accentColor: String

    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var router: Router
    @Environment(\.meeshyConversationList) private var conversationListViewModel

    func body(content: Content) -> some View {
        content
            .conversationCover(item: $composerState.composeMediaTarget) { cible in
                MediaComposerDoor(
                    // L'INTENTION naît dans la porte, pas ici : un second site
                    // qui la construirait serait un second contrat à tenir
                    // d'accord, et ce lot a DEUX déclencheurs pour une seule
                    // présentation. L'hôte ne remet que la cible.
                    target: cible,
                    storyViewModel: storyViewModel,
                    preview: MediaComposerPreviewHosts(router: router, conversationList: conversationListViewModel, statusViewModel: statusViewModel),
                    onDismiss: { composerState.composeMediaTarget = nil }
                )
            }
            .conversationCover(item: $composerState.previewMedia) { media in
                switch media.type {
                case "video", "audio":
                    ComposerQuotedPlaybackFullscreen(
                        media: media,
                        accentColor: accentColor,
                        onClose: { composerState.previewMedia = nil }
                    )
                default:
                    ImageFullscreen(imageUrl: media.url, accentColor: accentColor).contentExitGate(ComposerPreviewExit.gate)
                }
            }
    }
}
