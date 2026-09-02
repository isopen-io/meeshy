import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le post CITÉ dans la page détail — l'embed de republication et sa langue.**
///
/// Extrait de `PostDetailView.swift` (#4841) : le fichier était repassé au-dessus
/// du budget après le lot de la vue `2h` (#4086), qui lui avait ajouté l'item
/// Commentaires et remonté ses cibles tactiles à 45 pt. Ces lignes-là ont une
/// raison ; ce qui leur manquait était une extraction.
///
/// **Le découpage suit la responsabilité, pas la tranche.** Ce fichier porte tout
/// ce qui rend un contenu REPUBLIÉ à l'intérieur du détail — l'attribution
/// compacte d'une story republiée, l'embed complet, et la résolution de langue
/// qui décide quel texte du post cité s'affiche. Les deux `@State` de cette
/// responsabilité (`repostSecondaryLangCode`, `repostActiveDisplayLangCode`)
/// restent dans le type : Swift n'autorise pas de propriété stockée en
/// extension. C'est la seule raison pour laquelle ils ne sont pas ici.
///
/// Six membres ont perdu leur `private` pour que cette extension les voie —
/// `router`, `detailFullscreenPlace`, `accentColor`, `detailMediaSection` et les
/// deux `@State` ci-dessus. Ils restent INTERNES au module ; aucun n'est exposé
/// hors de l'app.
///
/// > Ce fichier avait déjà été découpé une fois (`PostDetailView+Canvas.swift`)
/// > et a regrossi depuis. Un plafond cumulatif attrape la CROISSANCE, jamais la
/// > RÉCIDIVE : il ne sait pas qu'un fichier a déjà été coupé, ni où.
extension PostDetailView {

    /// Attribution compacte d'une STORY republiée en story : icône repost +
    /// « @auteur » (SANS « via » — l'icône dit déjà la republication, même
    /// règle que le header du viewer, directive user 2026-07-13) tappable
    /// vers l'original. Remplace l'embed canvas complet (qui doublait le
    /// contenu sous le canvas principal — IMG_1161, 2026-07-13).
    func storyRepostAttributionRow(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            router.push(.postDetail(repost.id))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.2.squarepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted)
                Text("@\(repost.authorUsername ?? repost.author)")
                    .font(.footnote)
                    .foregroundColor(theme.accentText(repost.authorColor))
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(String(format: String(localized: "a11y.post.repost_author", defaultValue: "Publication repartagée de %@", bundle: .main), repost.author))
        .accessibilityHint(String(localized: "a11y.post.repost_author.hint", defaultValue: "Ouvre la publication d'origine", bundle: .main))
    }

    @ViewBuilder
    func repostEmbed(_ repost: RepostContent, renderedItem: StoryItem) -> some View {
        let isStoryRepost = (repost.type ?? "").uppercased() == "STORY"

        VStack(alignment: .leading, spacing: 0) {
            // Author header — always tappable to navigate
            Button {
                HapticFeedback.light()
                router.push(.postDetail(repost.id))
            } label: {
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(repost.author)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(repost.authorColor))
                        HStack(spacing: 4) {
                            Text(repost.timestamp, style: .relative)
                                .font(.caption2)
                                .foregroundColor(theme.textMuted)
                            // Language flags for repost translations
                            if let translations = repost.translations, !translations.isEmpty {
                                repostLanguageFlags(repost)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    Spacer()
                }
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 6)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(format: String(localized: "a11y.post.repost_author", defaultValue: "Publication repartagée de %@", bundle: .main), repost.author))
            .accessibilityHint(String(localized: "a11y.post.repost_author.hint", defaultValue: "Ouvre la publication d'origine", bundle: .main))

            // Text content with translation support.
            // For STORY reposts the caption lives inside the canvas overlays
            // (rendered below via StoryReaderRepresentable) — suppress the
            // plain body here to avoid showing the same text twice, mirroring
            // the main-post guard (`if !post.isStory`) and `StoryRepostEmbedCell`.
            if !isStoryRepost, !repost.content.isEmpty {
                let repostDisplayContent = repostEffectiveContent(repost)
                Text(repostDisplayContent)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .accessibilityLabel(String(format: String(localized: "a11y.post.repost_content", defaultValue: "Contenu repartagé : %@", bundle: .main), repostDisplayContent))

                // Inline secondary translation for repost
                if let code = repostSecondaryLangCode,
                   let secondaryText = repostSecondaryContent(repost, code: code) {
                    let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                    let display = LanguageDisplay.from(code: code)
                    VStack(spacing: 0) {
                        HStack(spacing: 6) {
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                            Circle().fill(langColor).frame(width: 3, height: 3)
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            if let display {
                                HStack(spacing: 3) {
                                    Text(display.flag).font(.caption2)
                                    Text(display.name)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundColor(langColor)
                                }
                            }
                            Text(secondaryText)
                                .font(.footnote)
                                .foregroundColor(theme.textPrimary.opacity(0.8))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(langColor.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // Story-type repost — render the canvas. Unmuted by default to match
            // the native story detail (RF3); a local mute toggle in the actions
            // bar (B3.6, Task E2) can silence it — `isCanvasMuted`. The SHARED
            // `storyCanvasContainer` brings the SAME off-screen + call-aware
            // pause wiring, so the repost canvas can't play with sound while
            // scrolled off-screen.
            if isStoryRepost {
                // Vue `2h` (#4086) — MÊME décision que le chemin natif.
                // Ce site appelait `storyCanvasContainer` directement, donc
                // sans aucune garde de contenu : une story republiée dont la
                // source est expirée ou sans asset rendait un rectangle NOIR,
                // là où la même story, native, affiche « Story indisponible ».
                // Le canvas suffisait à faire répondre `true` à la porte du
                // bouton muet, qui se montait par-dessus, prêt à piloter un
                // lecteur sans rien à jouer.
                //
                // `renderedItem` décrit bien CE contenu : `StoryItem(feedPost:)`
                // retombe sur la SOURCE d'une republication (`hasOwnContent`).
                storyCanvasOrPlaceholder(renderedItem: renderedItem) {
                    StoryReaderRepresentable(
                        repost: repost,
                        preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                        mute: isCanvasMuted,
                        isPaused: StoryDetailPlaybackPolicy.isPaused(visible: storyCanvasVisible, callActive: isCallActive)
                    )
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            } else if !repost.media.isEmpty {
                // Standard media attachments — owner is the CITED repost, not
                // the outer post: its audio's Now Playing card must show the
                // quoted author's name/avatar, not the outer post's.
                detailMediaSection(repost.media, owner: DetailMediaAuthor(repost: repost))
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            // Lieu du post SOURCE — sticker cliquable, même surface plein
            // écran que le lieu du post porteur.
            if let place = repost.location {
                FeedPostLocationSticker(place: place) {
                    detailFullscreenPlace = BubbleFullscreenPlace(place: place)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            // Audio URL (legacy story audio)
            if let audioUrl = repost.audioUrl, !audioUrl.isEmpty, !isStoryRepost {
                let repostAudio = MeeshyMessageAttachment(
                    id: "repost-audio-\(repost.id)",
                    fileName: "audio.mp3",
                    originalName: "audio.mp3",
                    mimeType: "audio/mpeg",
                    fileSize: 0,
                    fileUrl: audioUrl,
                    thumbnailColor: repost.authorColor
                )
                AudioAvailabilityResolver(attachment: repostAudio, autoDownload: true) { availability, onDownload in
                    CoordinatedAudioPlayer(
                        attachmentId: repostAudio.id,
                        nowPlayingName: repost.author,
                        nowPlayingArtworkURL: repost.authorAvatarURL,
                        makeQueuedAudio: {
                            QueuedAudio(
                                attachmentId: repostAudio.id,
                                messageId: repost.id,
                                conversationId: repost.id,
                                fileUrl: repostAudio.fileUrl,
                                durationMs: repostAudio.duration ?? 0,
                                senderName: repost.author,
                                senderAvatarURL: repost.authorAvatarURL,
                                receivedAt: repost.timestamp
                            )
                        }
                    ) { external, onPlay in
                        AudioPlayerView(
                            attachment: repostAudio,
                            context: .feedPost,
                            accentColor: repost.authorColor,
                            transcription: nil,
                            availability: availability,
                            onDownload: onDownload,
                            externalPlayer: external,
                            onPlayRequest: onPlay
                        )
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            // Stats row
            HStack(spacing: 12) {
                if repost.likes > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.caption2)
                        Text("\(repost.likes)")
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "a11y.post.like", defaultValue: "J'aime", bundle: .main))
                    .accessibilityValue(LocalizedNumber.exact(repost.likes))
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: repost.authorColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: repost.authorColor, intensity: 0.2), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Repost Language Support

    private func repostEffectiveContent(_ repost: RepostContent) -> String {
        let code = repostActiveDisplayLangCode ?? AuthManager.shared.currentUser?.preferredContentLanguages.first(where: { lang in
            repost.translations?.keys.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? repost.originalLanguage?.lowercased() ?? "fr"
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        if let translation = repost.translations?[code] ?? repost.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return repost.content
    }

    private func repostSecondaryContent(_ repost: RepostContent, code: String) -> String? {
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        return repost.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    @ViewBuilder
    private func repostLanguageFlags(_ repost: RepostContent) -> some View {
        let origLang = repost.originalLanguage?.lowercased() ?? ""
        let activeLang = repostActiveDisplayLangCode ?? origLang
        let user = AuthManager.shared.currentUser
        let flags: [String] = {
            var all: [String] = origLang.isEmpty ? [] : [origLang]
            var seen = Set(all)
            for lang in user?.preferredContentLanguages ?? [] {
                let l = lang.lowercased()
                if !seen.contains(l), repost.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                    all.append(l); seen.insert(l)
                }
            }
            return all.filter { $0 != activeLang }
        }()

        if !flags.isEmpty {
            MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
            ForEach(flags, id: \.self) { code in
                LanguageFlagChip(code: code, isActive: code == repostSecondaryLangCode) {
                    if code == origLang {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostActiveDisplayLangCode = code
                            repostSecondaryLangCode = nil
                        }
                    } else {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostSecondaryLangCode = repostSecondaryLangCode == code ? nil : code
                        }
                    }
                }
            }
            // Décorative ici : le repartage n'ouvre pas la liste des langues,
            // et les drapeaux voisins portent déjà l'information « traduit ».
            TranslationsBadge()
        }
    }
}
