import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La barre universelle, AU-DESSUS du média en plein écran (#6165)
//
// Directive porteur 2026-09-12 : « permettre de répondre ou commenter un
// attachement directement à partir de sa vue en plein écran, donc citer la
// pièce directement avec une universal composer bar qui apparaît pour dire la
// réponse à la pièce. »
//
// **Ce fichier n'écrit AUCUN composer.** Il HÉBERGE `UniversalComposerBar`,
// exactement comme `StoryComposerBarView` l'héberge au-dessus du canvas d'une
// story — même barre, même envoi, même sélecteur de langue, même clavier. Spec
// porteur 2026-05-28, toujours en vigueur : « Il faut avoir qu'une seule zone
// de saisie ». Une seconde barre écrite à la main aurait divergé au premier
// ajustement de l'une des deux.
//
// Ce qu'il ajoute est une BANNIÈRE : la pièce REGARDÉE, nommée par son ancre
// (#6164), avec sa vignette et sa nature.

/// La barre de réponse du plein écran — montée par la galerie au-dessus du
/// média, jamais à sa place.
struct MediaReplyComposerBar: View {

    /// La citation de la pièce REGARDÉE, composée par l'hôte via la fabrique
    /// UNIQUE (`optimisticReplyReference(quoting:citing:)`). Elle porte
    /// `attachmentId` — l'ancre que l'envoi gravera — donc la bannière et le
    /// corps REST décrivent la même pièce par UNE résolution.
    let citation: ReplyReference
    let accentColor: String

    /// L'identifiant de la PIÈCE citée — la clé du brouillon.
    let pieceId: String

    /// **Le brouillon survit à la fermeture de la barre** (exigence #6165 :
    /// « en sortir rend le média intact, brouillon compris »).
    ///
    /// Le texte vit dans un `@State` INTERNE à `UniversalComposerBar`, donc il
    /// meurt avec elle : refermer la barre effacerait ce qu'on venait d'écrire.
    /// On le tient donc chez l'hôte, par le canal que la barre expose déjà —
    /// `storyId` + `getDraft` / `onSaveDraft`, son mécanisme de brouillon par
    /// contexte, plus `onTextChange` pour la frappe en cours. Réemployer ce
    /// canal plutôt qu'en écrire un second est ce qui garantit qu'un envoi
    /// vide bien le brouillon : la barre le fait déjà, à son site d'envoi.
    @Binding var draft: String

    /// La langue de composition, tenue par la galerie : elle survit à un
    /// changement de page, et se relit quand la barre remonte.
    @Binding var composerLanguage: String

    /// `(texte, langue)` — l'hôte résout le porteur et compose l'ancre
    /// (`ConversationViewModel.sendReplyToAttachment`). La barre ne connaît
    /// aucun identifiant de message : elle ne sait que ce qu'elle montre.
    let onSend: (_ text: String, _ language: String) -> Void

    /// Le doigt sur la croix de la bannière : la barre redescend, le média
    /// reste. **Rien ne se referme** — c'est tout l'objet du lot.
    let onCancel: () -> Void

    @State private var composerEffects: MessageEffects = .none
    @State private var composerBlurEnabled = false
    @State private var emojiToInject = ""
    @State private var focusTrigger = false

    /// **La mention `@` d'une réponse à une pièce** (#7847) : la même liste
    /// que partout — contacts depuis le cache, puis l'annuaire dès la deuxième
    /// lettre. La galerie ne connaît pas l'id de la conversation, d'où
    /// l'annuaire plutôt que l'endpoint contextuel.
    @StateObject private var mentionController = MentionComposerController(context: .composerDraft)

    private var secondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(accentColor, degrees: 30)
    }

    var body: some View {
        VStack(spacing: 0) {
            MentionSuggestionOverlay(controller: mentionController, accentColor: accentColor) { candidate in
                draft = mentionController.insertMention(candidate, into: draft)
            }
            composerBar
        }
    }

    private var composerBar: some View {
        UniversalComposerBar(
            style: .dark,
            // **Pas de `mode:`, et c'est une décision.** `.message` allumerait
            // l'échelle de pièces jointes et la capture vocale, que cet hôte ne
            // sait pas encore servir : le plein écran n'a ni le pipeline
            // d'upload de la conversation, ni la feuille de consentement vocal
            // — présentée par `ConversationView`, qui est COUVERTE par ce plein
            // écran et ne monterait donc jamais. Un « + » inerte serait un
            // contrôle qui ment (loi 4) ; les flags explicites disent la
            // vérité. Suivi : pièces jointes et vocal depuis le plein écran.
            onIngest: { ingests in ingest(ingests) },
            placeholder: String(localized: "media.reply.placeholder",
                                defaultValue: "Répondre à cette pièce…",
                                bundle: .main),
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            showVoice: false,
            showLocation: false,
            showAttachment: false,
            showLanguageSelector: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSendMessage: { text, _, language in onSend(text, language) },
            textBinding: $draft,
            replyBanner: AnyView(citationBanner),
            onTextChange: { text in
                draft = text
                mentionController.handleQuery(in: text)
            },
            // Les quatre relais d'enregistrement sont OBLIGATOIRES par
            // signature (#4560 : un `?` y codait « ce relais peut manquer »,
            // et un hôte mal câblé posait alors des vocaux muets). Ici
            // `showVoice: false` : aucune prise ne peut démarrer, aucun bouton
            // n'est rendu, et ces quatre no-op ne sont jamais atteints.
            onStartRecording: {},
            onStopRecordingToAttachment: {},
            onSendRecording: {},
            onCancelRecording: {},
            externalIsRecording: false,
            externalRecordingDuration: 0,
            onRequestTextEmoji: nil,
            injectedEmoji: $emojiToInject,
            isBlurEnabled: $composerBlurEnabled,
            pendingEffects: $composerEffects,
            storyId: pieceId,
            onSaveDraft: { _, text, _ in draft = text },
            getDraft: { _ in draft.isEmpty ? nil : (text: draft, attachments: []) },
            focusTrigger: $focusTrigger
        )
        .onAppear {
            // La barre monte PARCE QU'on a touché « répondre » : le clavier
            // suit, sans second geste. Chemin nominal ≤ 2 gestes (dimension 7).
            focusTrigger = true
        }
    }

    // MARK: - La bannière : CETTE pièce, pas son message

    /// **Ce que la bannière montre est la pièce REGARDÉE** — sa vignette et sa
    /// nature —, jamais le média représentatif de son message. C'est la moitié
    /// visible de #6164 : sans l'ancre, répondre depuis la troisième photo d'un
    /// carrousel affichait la première ici, et gravait la première dans le fil.
    ///
    /// Une pièce PROTÉGÉE n'arrive jamais ici : `FullscreenReplyRoute` refuse
    /// le bouton, et `sendReplyToAttachment` refuse l'envoi. La garde de
    /// rendu reste posée quand même (`quotedMediaIsProtected`) — une vignette
    /// est ce qui SORT de la conversation, et elle ne doit dépendre d'aucun
    /// appelant.
    private var citationBanner: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: accentColor))
                .frame(width: 3, height: 38)

            if !citation.quotedMediaIsProtected,
               let thumb = citation.attachmentThumbnailUrl, !thumb.isEmpty {
                CachedAsyncImage(url: thumb,
                                 targetSize: CGSize(width: 38, height: 38),
                                 thumbHash: QuotedReplyPresentation.thumbHash(for: citation)) {
                    Color(hex: accentColor).opacity(0.3)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(alignment: .center) {
                    if citation.attachmentType == AttachmentKind.video.rawValue {
                        Image(systemName: "play.circle.fill")
                            .font(MeeshyFont.relative(16))
                            .foregroundStyle(.white, .black.opacity(0.4))
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "arrowshape.turn.up.left.fill")
                        .font(MeeshyFont.relative(9, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                    Text(QuotedReplyPresentation.title(author: bannerAuthor))
                        .font(MeeshyFont.relative(11, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                        .lineLimit(QuotedReplyPresentation.titleLineLimit)
                }
                Text(citation.previewText)
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(QuotedReplyPresentation.previewLineLimit(for: .composer))
            }

            Spacer(minLength: 0)

            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(9, weight: .bold))
                    .foregroundColor(.white.opacity(0.6))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.white.opacity(0.12)))
            }
            .accessibilityLabel(String(localized: "media.reply.cancel",
                                       defaultValue: "Annuler la réponse", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(hex: accentColor).opacity(0.18))
        .overlay(
            Rectangle()
                .fill(Color(hex: accentColor).opacity(0.35))
                .frame(height: 0.5),
            alignment: .bottom
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "media.reply.banner.a11y",
                   defaultValue: "Réponse à la pièce de \(bannerAuthor)",
                   bundle: .main)
        )
    }

    // MARK: - Le dépôt et le collage : ce que ce plein écran sait servir

    /// **Toute racine de `UniversalComposerBar` câble `onIngest`** — sans lui,
    /// le dépôt et le collage y sont muets (`ComposerIngestWiringParityTests`).
    /// Le TEXTE rejoint la saisie, au curseur quand le champ a le focus. Un
    /// FICHIER, que ce plein écran ne sait pas encore envoyer
    /// (`showAttachment: false`, suivi #6653), est refusé à voix haute et son
    /// temporaire supprimé : un dépôt qui ne produirait rien serait un contrôle
    /// qui ment (loi 4).
    private func ingest(_ ingests: [ComposerIngest]) {
        if let block = CommentComposerIngestion.mergedText(from: ingests),
           !CommentComposerIngestion.insertAtCursor(block) {
            emojiToInject = block
        }
        let refused = CommentComposerIngestion.files(from: ingests)
        guard !refused.isEmpty else { return }
        refused.forEach { try? FileManager.default.removeItem(at: $0.url) }
        ComposerIngestFeedback.showFailure(names: refused.map(\.name))
    }

    private var bannerAuthor: String {
        if citation.isMe {
            return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main)
        }
        return citation.authorName
    }
}
