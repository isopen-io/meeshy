// MARK: - Extracted from ConversationView+Composer.swift (#4105)
//
// Bandeaux affichés au-dessus du composer : réponse, édition, et leurs
// aperçus de pièce jointe.
import SwiftUI
import Combine
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

extension ConversationView {

    // MARK: - Pending Attachments Row (custom preview for UCB)
    var pendingAttachmentsRow: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                pendingAttachmentsPreview
                if composerState.isLoadingMedia {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                        .padding(.horizontal, 12)
                }
            }
            if composerState.isUploading, let progress = composerState.uploadProgress {
                UploadProgressBar(progress: progress, accentColor: accentColor)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: composerState.isUploading)
    }

    // MARK: - Composer Reply Banner
    /// Titre du bandeau de réponse. Un mood échoé par le serveur peut avoir un
    /// `authorName` vide → libellé localisé "Humeur".
    func composerReplyTitle(_ reply: ReplyReference) -> String {
        if reply.isMe { return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) }
        if !reply.authorName.isEmpty { return reply.authorName }
        if reply.moodEmoji != nil { return String(localized: "bubble.reply.mood", defaultValue: "Humeur", bundle: .main) }
        return reply.authorName
    }

    func composerReplyBanner(_ reply: ReplyReference) -> some View {
        // Les faits du média cité — « 1024×768 · 0:42 · 1,2 Mo » —, résolus UNE
        // fois : la ligne qui les montre et l'énoncé VoiceOver les partagent.
        // `nil` pour un média protégé (règle partagée, site unique).
        let quotedDetails = QuotedReplyPresentation.detailsLabel(for: reply)

        return HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.isMe ? accentColor : reply.authorColor))
                .frame(width: 3, height: 36)

            // La miniature à GAUCHE, comme dans la bulle et sur la rangée
            // plate : une citation ne change pas de géographie selon la peau
            // qui la rend (#4946). Elle ne se dessine JAMAIS pour un média
            // protégé — la garde vit dans `composerReplyAttachmentPreview`.
            if let attType = reply.attachmentType {
                composerReplyAttachmentPreview(type: attType, reply: reply)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(QuotedReplyPresentation.title(author: composerReplyTitle(reply)))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.isMe ? accentColor : reply.authorColor))
                    .lineLimit(QuotedReplyPresentation.titleLineLimit)

                HStack(spacing: 4) {
                    if let emoji = reply.moodEmoji {
                        // Réponse à un mood : emoji + contenu entier + date.
                        Text(emoji)
                            .font(MeeshyFont.relative(12))
                        if let date = reply.storyPublishedAt {
                            Text(date, style: .relative)
                                .font(MeeshyFont.relative(11))
                                .foregroundColor(theme.textMuted)
                        }
                        if !reply.previewText.isEmpty {
                            Text(reply.previewText)
                                .font(MeeshyFont.relative(12))
                                .foregroundColor(theme.textSecondary)
                                .lineLimit(QuotedReplyPresentation.previewLineLimit(for: .composer))
                        }
                    } else {
                        if let attType = reply.attachmentType {
                            Image(systemName: composerReplyAttachmentIcon(attType))
                                .font(MeeshyFont.relative(10, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                        }
                        Text(reply.previewText)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(QuotedReplyPresentation.previewLineLimit(for: .composer))
                    }
                }

                if let details = quotedDetails {
                    Text(details)
                        .font(MeeshyFont.relative(11))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(QuotedReplyPresentation.titleLineLimit)
                }
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    ReplyContextCleaner(conversationId: viewModel.conversationId)
                        .clear(pendingReplyReference: &composerState.pendingReplyReference)
                }
            } label: {
                Image(systemName: "xmark")
                    // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 24×24 → figé.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
            .accessibilityLabel(String(localized: "conversation.view.composer.cancel_reply", defaultValue: "Annuler la réponse", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(
            localized: "conversation.view.composer.reply_to",
            // « vous » etait un litteral Swift NU dans l'interpolation : la cle
            // partait bien au catalogue, et son argument restait francais dans
            // les six autres langues. `bubble.reply.you` porte deja ce mot,
            // traduit, pour la bulle de reponse — meme mot, meme cle.
            // Le SECOND argument porte l'aperçu ET les détails du média cité
            // (« Photo, 800×600 · 0:05 ») : la citation ANNONCE ce qu'elle
            // montre. La forme du catalogue reste à DEUX `%@` — en ajouter un
            // troisième ferait diverger la clé de ses sept traductions.
            defaultValue: "Réponse à \(reply.isMe ? String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) : reply.authorName) : \(QuotedReplyPresentation.spokenPreview(preview: reply.previewText, details: quotedDetails))",
            bundle: .main))
    }

    // MARK: - Edit Banner
    var composerEditBanner: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(MeeshyColors.warning)
                .frame(width: 3, height: 36)

            Image(systemName: "pencil")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "conversation.view.composer.edit_message", defaultValue: "Modifier le message", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(MeeshyColors.warning)

                Text(composerState.editingOriginalContent ?? "")
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                cancelEdit()
            } label: {
                Image(systemName: "xmark")
                    // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 24×24 → figé.
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
            }
            .accessibilityLabel(String(localized: "conversation.view.composer.cancel_edit", defaultValue: "Annuler la modification", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: MeeshyColors.warningHex))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: MeeshyColors.warningHex, intensity: 0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "conversation.view.composer.editing_in_progress", defaultValue: "Modification du message en cours", bundle: .main))
    }

    /// **Le point d'entrée UNIQUE en mode édition (#4003).** Trois sites
    /// entraient en édition en écrivant `editingMessageId`/
    /// `editingOriginalContent`/`composerText.text` chacun de son côté — l'un
    /// d'eux oubliait `composerText.text`, laissant le bandeau d'édition
    /// s'afficher sur un champ VIDE. `beginEdit` sauvegarde aussi le brouillon
    /// en cours AVANT de l'écraser (`draftBeforeEdit`), restitué par
    /// `cancelEdit`/`submitEdit` — sans quoi éditer un ancien message perdait
    /// ce que l'auteur était en train de composer.
    ///
    /// Idempotent en cascade : si une édition est déjà en cours (l'auteur
    /// tape « Éditer » sur un AUTRE message sans annuler), `draftBeforeEdit`
    /// n'est PAS réécrit — il porterait alors le contenu du premier message
    /// édité au lieu du vrai brouillon d'origine.
    func beginEdit(_ message: Message) {
        if composerState.editingMessageId == nil {
            composerState.draftBeforeEdit = composerText.text
        }
        composerState.editingMessageId = message.id
        composerState.editingOriginalContent = message.content
        composerText.text = message.content
    }

    func submitEdit() {
        guard let messageId = composerState.editingMessageId else { return }
        let newContent = composerText.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newContent.isEmpty else { return }

        // Don't send if content unchanged
        if newContent == composerState.editingOriginalContent {
            cancelEdit()
            return
        }

        let id = messageId
        cancelEdit()
        Task {
            await viewModel.editMessage(messageId: id, newContent: newContent)
        }
    }

    func cancelEdit() {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            composerState.editingMessageId = nil
            composerState.editingOriginalContent = nil
            // Restitue le brouillon sauvegardé par `beginEdit` — ne le vide
            // plus inconditionnellement (#4003) : un brouillon en cours de
            // composition survit désormais à un aller-retour en édition.
            composerText.text = composerState.draftBeforeEdit ?? ""
            composerState.draftBeforeEdit = nil
        }
    }

    func composerReplyAttachmentIcon(_ type: String) -> String {
        // Route through the SDK's canonical AttachmentKind (single
        // source of truth — see `AttachmentKind.swift`) instead of the
        // duplicated switch this method used to embed. Two-step fallback
        // so cached payloads carrying raw MIME (`"image/jpeg"`) still
        // resolve correctly until the next SDK round-trip rewrites
        // them as short kinds.
        if let exact = AttachmentKind(rawValue: type) { return exact.sfSymbolName }
        return AttachmentKind(mimeType: type).sfSymbolName
    }

    // MARK: - Rich Attachment Preview for Reply Banner

    /// L'aperçu du média cité, à gauche du bandeau de réponse.
    ///
    /// **Un média PROTÉGÉ n'a NI vignette, NI ThumbHash, NI ouverture plein
    /// écran** (#4946). Les deux autres peaux le refusaient déjà
    /// (`quotedMediaIsProtected`) ; ce bandeau, lui, affichait la vignette EN
    /// CLAIR d'une photo à vue unique et l'ouvrait en plein écran au tap — sur
    /// la surface même où l'auteur compose sa réponse, donc à chaque fois qu'il
    /// répond. La protection se lit AVANT toute vignette : c'est la première
    /// question, jamais un repli.
    ///
    /// **Le GENRE est résolu, jamais comparé à une chaîne brute.**
    /// `attachmentType` porte le MIME (« image/jpeg ») sur le chemin de rendu
    /// réel (`MessagePersistenceActor` y grave `mimeType`) et le rawValue court
    /// (« image ») sur la bulle optimiste : le `switch` littéral d'origine
    /// n'était vrai que sur la seconde, et le bandeau perdait sa vignette dès
    /// que le serveur accusait. Même défaut, même correctif que le badge play
    /// de la rangée plate.
    @ViewBuilder
    func composerReplyAttachmentPreview(type: String, reply: ReplyReference) -> some View {
        let accent = Color(hex: reply.isMe ? accentColor : reply.authorColor)
        // Le flou instantané de la miniature — `nil` pour un média protégé.
        let quotedThumbHash = QuotedReplyPresentation.thumbHash(for: reply)

        if reply.quotedMediaIsProtected {
            // Ni vignette, ni ThumbHash, ni zone tactile : le glyphe générique
            // de la ligne d'aperçu et le placeholder du texte cité disent déjà
            // ce qu'il y a à dire.
            EmptyView()
        } else if type == "location" {
            composerReplyLocationTile
        } else if let kind = BubbleQuotedReply.resolveAttachmentKind(type) {
            switch kind {
            case .image:
                if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                    CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 40, height: 40), thumbHash: quotedThumbHash) {
                        accent.opacity(0.3)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture {
                        if let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                            composerState.previewMedia = PreviewMedia(url: url, type: "image")
                        }
                    }
                }

            case .video:
                if let thumbUrl = reply.attachmentThumbnailUrl, !thumbUrl.isEmpty {
                    ZStack {
                        CachedAsyncImage(url: thumbUrl, targetSize: CGSize(width: 40, height: 40), thumbHash: quotedThumbHash) {
                            accent.opacity(0.3)
                        }
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                        Image(systemName: "play.circle.fill")
                            // Doctrine 86i : overlay play décoratif borné par la vignette fixe 40×40 → figé + masqué.
                            .font(.system(size: 18))
                            .foregroundStyle(.white, .black.opacity(0.4))
                            .accessibilityHidden(true)
                    }
                    .onTapGesture {
                        if let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                            composerState.previewMedia = PreviewMedia(url: url, type: "video")
                        }
                    }
                } else {
                    replyAttachmentFallbackBadge(icon: "video.fill", color: accent)
                }

            case .audio:
                HStack(spacing: 4) {
                    Image(systemName: "play.fill")
                        // Doctrine 86i : glyphe décoratif du badge audio (waveform) → figé + masqué.
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(accent.opacity(0.6))
                        .accessibilityHidden(true)

                    HStack(spacing: 1.5) {
                        ForEach(0..<8, id: \.self) { i in
                            let h: CGFloat = [0.4, 0.7, 0.5, 1.0, 0.6, 0.9, 0.3, 0.5][i]
                            RoundedRectangle(cornerRadius: 1)
                                .fill(accent.opacity(0.35))
                                .frame(width: 2, height: 4 + 16 * h)
                        }
                    }
                    .frame(height: 22)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(accent.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(accent.opacity(0.15), lineWidth: 0.5)
                        )
                )
                .onTapGesture {
                    if let thumbUrl = reply.attachmentThumbnailUrl, let url = MeeshyConfig.resolveMediaURL(thumbUrl) {
                        composerState.previewMedia = PreviewMedia(url: url, type: "audio")
                    }
                }

            case .pdf, .spreadsheet, .document, .presentation,
                 .archive, .code, .text, .other:
                // Documents, archives, code, texte, inconnu : le glyphe de
                // FAMILLE de la source de vérité partagée, jamais un `doc.fill`
                // gravé ici — un tableur cité montre son icône de tableur. Les
                // onze cas sont énumérés SANS `default` : une famille neuve
                // oblige à décider de son badge, elle ne se range pas en
                // silence sous le repli du voisin.
                replyAttachmentFallbackBadge(icon: kind.sfSymbolName, color: MeeshyColors.info)
            }
        } else {
            EmptyView()
        }
    }

    /// La tuile de LIEU cité. Hors du `switch` par genre : « location » n'est
    /// pas une famille d'`AttachmentKind` (elle décrit un lieu, pas un
    /// fichier), et seule la bulle optimiste pose ce rawValue.
    private var composerReplyLocationTile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.success.opacity(0.15), MeeshyColors.success.opacity(0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 40, height: 40)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(MeeshyColors.success.opacity(0.2), lineWidth: 0.5)
                )

            VStack(spacing: 1) {
                Image(systemName: "mappin.circle.fill")
                    // Doctrine 86i : glyphe décoratif borné par la vignette fixe 40×40 → figé + masqué.
                    .font(.system(size: 18))
                    .foregroundStyle(MeeshyColors.success, MeeshyColors.success.opacity(0.2))
                    .accessibilityHidden(true)
                Circle()
                    .fill(MeeshyColors.success.opacity(0.3))
                    .frame(width: 6, height: 3)
                    .scaleEffect(x: 1.8, y: 1)
            }
        }
    }

    private func replyAttachmentFallbackBadge(icon: String, color: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(color.opacity(0.1))
                .frame(width: 40, height: 40)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(color.opacity(0.2), lineWidth: 0.5)
                )
            Image(systemName: icon)
                // Doctrine 86i : glyphe décoratif borné par le badge fixe 40×40 → figé + masqué.
                .font(.system(size: 16))
                .foregroundColor(color.opacity(0.7))
                .accessibilityHidden(true)
        }
    }
}
