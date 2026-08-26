import SwiftUI
import MeeshySDK
import MeeshyUI

/// Reply preview affichee a l'interieur d'une bulle (citation du message
/// auquel on repond). Delegue a `BubbleStoryReplyPreview` quand la cible
/// est une story.
///
/// Was: ThemedMessageBubble.quotedReplyView (lines 961-1031) +
/// storyReplyPreview (lines 1034-1086) + replyAttachmentIcon (lines 1088-1097).
///
/// `ReplyReference` n'est ni Equatable ni Hashable cote SDK
/// (Codable & Sendable seulement), donc on projette les champs
/// rendus dans `ReplySlice` pour comparer manuellement.
///
/// **LOI DES ZONES** (directive produit 2026-08-24, appliquee ici le meme
/// jour). Une citation n'offre que TROIS classes de zone tactile, et pas une
/// de plus :
/// 1. l'AVATAR de l'auteur cite -> ouvre son profil (`onQuotedAuthorTap`) ;
/// 2. la MINIATURE ou l'ICONE DE LECTURE -> joue ou affiche le media EN PLEIN
///    ECRAN (`onQuotedMediaTap`) ;
/// 3. TOUT LE RESTE, LE NOM COMPRIS -> retour au message cite.
///
/// Cette peau ne VIOLAIT pas la loi avant ce lot : elle n'offrait qu'une seule
/// zone, et son nom n'a jamais ete tactile. Il lui manquait les zones 1 et 2 —
/// un ECART, pas une infraction. Il est comble ici parce que cette peau est
/// celle que voit TOUT LE MONDE : le programme beta naît eteint
/// (`BetaFeaturesPreference`, defaut OFF), donc `readingModes` est OFF, donc
/// `ReadingModeOrchestrator.resolveOrchestratorDecision` rend `.bubbles` des
/// sa premiere branche. La rangee plate, ou le defaut a ete signale, est
/// derriere le drapeau.
///
/// **La zone 3 vit chez l'HOTE, pas ici** — les trois hotes de ce composant
/// (`BubbleStandardLayout.bubbleInnerContentBody`,
/// `BubbleStandardLayout+Media.mediaWithReplyContainerBody`,
/// `ConversationMediaViews.replyTopSlot`) l'enveloppent chacun d'UN
/// `.onTapGesture` vers `onReplyTap`/`onStoryReplyTap`. Les zones 1 et 2 sont
/// des gestes ENFANTS : SwiftUI donne la priorite au plus interne, et ce qui
/// n'est pas couvert par elles retombe naturellement sur l'hote.
///
/// **Une zone non CABLEE n'est pas posee.** Sans son gestionnaire, aucun geste
/// n'est attache : le tap traverse jusqu'a la zone 3 au lieu d'etre avale par
/// une cible morte (loi 4 du depot — « un controle existe s'il a un effet »).
/// C'est pourquoi `authorGateTap` et `mediaGateTap` rendent un optionnel, et
/// non un booleen.
///
/// **Un media PROTEGE n'a pas de zone 2** (`reply.quotedMediaIsProtected`, vue
/// unique ou floute). Ni vignette, ni `play.circle.fill` : la vignette voyage
/// sans condition depuis la passerelle, et l'hote refuse deja d'ouvrir un tel
/// attachement (`MessageListViewController.openQuotedMedia`). Armer cette zone
/// reviendrait a annoncer une lecture par-dessus un verrou — un controle qui
/// ment — et a offrir l'apercu en clair d'un contenu a vue unique a tout le
/// fil, sur la peau que voit TOUT LE MONDE, a chaque relecture. Le glyphe
/// generique reste, le tap retombe en zone 3, et le media garde son propre
/// geste de revelation sur la rangee d'origine.
///
/// **Carrousel** : la citation est une PORTE, pas une galerie. `ReplyReference`
/// ne porte qu'UNE `attachmentThumbnailUrl` et aucun compte de pieces jointes
/// (le gateway n'en selectionne pas), donc ni liste de miniatures ni badge
/// « +N » ne serait honnete. Le tap ouvre le plein ecran de la conversation,
/// ou les images 2..N sont atteignables au balayage.
///
/// Gardes : `BubbleQuotedReplyZoneLawTests`.
struct BubbleQuotedReply: View, Equatable {
    /// Style d'enveloppe de la citation.
    /// - `.card` : variante historique — RR12 + bgColor teinté + paddings extérieurs (top 6, horizontal 6). Hôte = bulle chat colorée.
    /// - `.inline` : sans RR12 ni paddings extérieurs — la surface vient du parent (widget audio `playerBackground` ou conteneur unifié média+reply).
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.2
    enum Style: Equatable {
        case card
        case inline
    }

    var style: Style = .card
    let reply: ReplyReference
    let parentIsMe: Bool
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]
    /// ZONE 1 — tap sur l'AVATAR de l'auteur cite -> sa fiche profil
    /// (resolution hote : `MessageListViewController.openQuotedAuthorProfile`,
    /// qui relit le message cite dans le store pour ouvrir le profil REEL).
    /// `nil` ⇒ zone 1 non armee, le tap retombe sur la zone 3.
    var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil
    /// ZONE 2 — tap sur la MINIATURE ou l'ICONE DE LECTURE -> le media cite en
    /// PLEIN ECRAN, ou sa lecture pour un audio (resolution hote :
    /// `MessageListViewController.openQuotedMedia`). Meme regle de nullite.
    var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil

    /// Cote de l'avatar de la ZONE 1 — la MEME que celle de la rangee plate
    /// (`FocalMetrics.Avatar.size`), sans emprunter le jeton d'une autre peau :
    /// une citation montre le meme visage a la meme taille, quelle que soit la
    /// peau qui la rend.
    static let authorAvatarSize: CGFloat = 22

    /// Cote de la miniature citee — valeur historique de ce fichier, NOMMEE
    /// pour que la ZONE 2 et son bouton play parlent de la meme surface.
    static let thumbnailSize: CGFloat = 38

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.style == rhs.style &&
        lhs.parentIsMe == rhs.parentIsMe &&
        lhs.accentHex == rhs.accentHex &&
        lhs.isDark == rhs.isDark &&
        lhs.mentionDisplayNames == rhs.mentionDisplayNames &&
        Self.replySlice(lhs.reply) == Self.replySlice(rhs.reply)
    }

    /// Champs effectivement lus par le body. Tout changement dans le rendu
    /// doit synchroniser cette projection.
    private static func replySlice(_ reply: ReplyReference) -> ReplySlice {
        ReplySlice(
            messageId: reply.messageId,
            authorName: reply.authorName,
            authorColor: reply.authorColor,
            authorAvatarUrl: reply.authorAvatarUrl,
            previewText: reply.previewText,
            isMe: reply.isMe,
            attachmentType: reply.attachmentType,
            attachmentThumbnailUrl: reply.attachmentThumbnailUrl,
            attachmentIsProtected: reply.attachmentIsProtected,
            isStoryReply: reply.isStoryReply,
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount,
            storyThumbnailUrl: reply.storyThumbnailUrl,
            moodEmoji: reply.moodEmoji
        )
    }

    fileprivate struct ReplySlice: Equatable {
        let messageId: String
        let authorName: String
        let authorColor: String
        /// L'avatar de la ZONE 1 arrive APRES coup (premier refresh serveur,
        /// hydratation du cache). Sans lui dans la projection, la citation
        /// resterait figee sur ses initiales pour toujours.
        let authorAvatarUrl: String?
        let previewText: String
        let isMe: Bool
        let attachmentType: String?
        let attachmentThumbnailUrl: String?
        /// La protection DECIDE si la vignette et le badge play sont rendus.
        /// Absente de cette projection, la citation resterait figee sur le
        /// rendu de la premiere resolution : un media revele — ou une
        /// protection qui arrive enfin sur le fil — ne redessinerait jamais.
        let attachmentIsProtected: Bool?
        let isStoryReply: Bool
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
        let storyThumbnailUrl: String?
        let moodEmoji: String?
    }

    private var theme: ThemeManager { ThemeManager.shared }

    /// Distinct des liens URL — et thématisé (cf. `MeeshyColors.mentionColor`).
    private var mentionTint: Color {
        MeeshyColors.mentionColor(isDark: isDark)
    }

    private var hashtagTint: Color {
        MeeshyColors.hashtagColor(isDark: isDark)
    }

    /// Titre de la citation. Pour un mood échoé par le serveur, `authorName`
    /// peut être vide → on retombe sur le libellé localisé "Humeur".
    private var quotedTitle: String {
        if reply.isMe { return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) }
        if !reply.authorName.isEmpty { return reply.authorName }
        if reply.moodEmoji != nil { return String(localized: "bubble.reply.mood", defaultValue: "Humeur", bundle: .main) }
        return reply.authorName
    }

    /// Date de publication du mood cité, rendue sur la ligne de titre.
    /// Vide pour toute citation qui n'est pas un mood : les citations de
    /// message et de story gardent leur composition d'origine.
    @ViewBuilder
    private func moodDateLabel(previewColor: Color) -> some View {
        if reply.moodEmoji != nil, let date = reply.storyPublishedAt {
            Text(date, style: .relative)
                .font(.caption2)
                .foregroundColor(previewColor.opacity(0.8))
                .lineLimit(1)
                .layoutPriority(-1)
        }
    }

    // MARK: - LOI DES ZONES : les deux portes et leur armement

    /// La ZONE 1 n'existe que pour la citation d'un MESSAGE. Une story ou une
    /// humeur citee porte `authorName == "Story"` (ou reste vide) et aucun
    /// avatar ne voyage avec son instantane : il n'y a pas de personne a
    /// ouvrir, et l'hote fabriquerait une fiche au nom de « Story ». Les
    /// QUATRE producteurs d'une citation de story ou d'humeur posent
    /// `isStoryReply: true` — un seul predicat suffit donc a les couvrir.
    private var showsAuthorGate: Bool {
        !reply.isStoryReply
    }

    /// Le geste de la ZONE 1, ou `nil` s'il n'y a rien a declencher.
    private var authorGateTap: (() -> Void)? {
        guard let onQuotedAuthorTap, showsAuthorGate else { return nil }
        return { onQuotedAuthorTap(reply) }
    }

    /// URL de la miniature citee — piece jointe d'un message, ou story.
    ///
    /// Une piece jointe PROTEGEE (vue unique, floutee) n'en fournit AUCUNE :
    /// la vignette voyage sans condition depuis la passerelle, la protection
    /// est ce qui decide de la rendre. Sans ce filtre, la citation d'une video
    /// a vue unique affichait sa vignette en clair, visible par tout le fil et
    /// a chaque relecture.
    private var thumbnailUrlString: String? {
        if reply.isStoryReply {
            guard let raw = reply.storyThumbnailUrl, !raw.isEmpty else { return nil }
            return raw
        }
        guard !reply.quotedMediaIsProtected,
              let raw = reply.attachmentThumbnailUrl, !raw.isEmpty else { return nil }
        return raw
    }

    /// Genre de la piece jointe citee — resolu UNE fois : le glyphe, le badge
    /// play et la question « ce glyphe est-il la zone media ? » la posent tous
    /// les trois.
    private var attachmentKind: AttachmentKind? {
        Self.resolveAttachmentKind(reply.attachmentType)
    }

    /// Le geste de la ZONE 2, ou `nil`. Une STORY citee en est exclue : son
    /// chemin (zone 3 -> `onStoryReplyTap`) ouvre DEJA le viewer plein ecran
    /// demande, et le dedoubler serait un second point actionnable pour une
    /// seule capacite.
    ///
    /// **Un media PROTEGE n'arme rien non plus.** `MessageListViewController
    /// .openQuotedMedia` refuse deja de l'ouvrir : l'armer ici poserait un
    /// `play.circle.fill` par-dessus un verrou, c'est-a-dire un controle qui
    /// ment. Le tap retombe en zone 3, ou le media garde son propre geste de
    /// revelation sur la rangee d'origine.
    private var mediaGateTap: (() -> Void)? {
        guard let onQuotedMediaTap, !reply.isStoryReply, !reply.quotedMediaIsProtected,
              reply.attachmentType != nil || thumbnailUrlString != nil
        else { return nil }
        return { onQuotedMediaTap(reply) }
    }

    /// ZONE 2, forme SANS miniature. Le glyphe ne devient tactile que si
    /// aucune miniature ne porte deja la zone media (sinon deux points
    /// actionnables pour une capacite) ET si le media s'ouvre vraiment
    /// (`isMedia` = image/video/audio). Un document renverrait au message
    /// cite — ce que la zone 3 fait deja sous lui.
    private var glyphOpensTheMedia: Bool {
        thumbnailUrlString == nil && (attachmentKind?.isMedia ?? false)
    }

    /// ZONE 1 — l'avatar de l'auteur cite, seule porte vers son profil. Le NOM
    /// pose a cote reste INERTE : un tap dessus traverse jusqu'a la zone 3.
    ///
    /// Composant PARTAGE du depot (`MeeshyAvatar`), a qui l'on confie son
    /// propre `onTap` : il porte alors sa forme de frappe CIRCULAIRE, son
    /// retour haptique et son libelle — rien n'est redessine ici. Pas de
    /// presence, pas d'anneau story, pas d'humeur : une citation est une trace
    /// figee du passe, pas une carte de presence.
    ///
    /// L'avatar est dessine MEME sans URL (initiales colorees, repli natif du
    /// composant) : la porte vers le profil ne depend jamais d'une photo.
    @ViewBuilder
    private var authorGate: some View {
        if showsAuthorGate {
            MeeshyAvatar(
                name: quotedTitle,
                context: .custom(Self.authorAvatarSize),
                accentColor: reply.isMe ? accentHex : reply.authorColor,
                avatarURL: reply.authorAvatarUrl,
                enablePulse: false,
                isDark: isDark,
                onTap: authorGateTap
            )
            .accessibilityAddTraits(authorGateTraits)
            .accessibilityHint(authorGateHint)
        }
    }

    /// Un trait de BOUTON sur un avatar que l'hote n'a pas cable serait un
    /// mensonge : VoiceOver annoncerait une cible qui ne fait rien. Le trait
    /// suit donc l'ARMEMENT de la zone, pas sa presence a l'ecran.
    private var authorGateTraits: AccessibilityTraits {
        authorGateTap == nil ? [] : .isButton
    }

    /// Meme regle pour l'indice. La cle est celle que la rangee plate a
    /// DEPLACEE du nom vers l'avatar le 2026-08-24 : elle vit desormais aux
    /// deux endroits ou la ZONE 1 existe, et n'est donc morte nulle part.
    private var authorGateHint: String {
        guard authorGateTap != nil else { return "" }
        return String(localized: "bubble.reply.author_hint", defaultValue: "Affiche le profil de l'auteur cité", bundle: .main)
    }

    /// Bouton play pose sur la miniature d'une piste temporelle citee — c'est
    /// l'affordance « toucher pour jouer en plein ecran ». Decoratif pour
    /// VoiceOver : la miniature qui le porte se nomme deja.
    @ViewBuilder
    private var playBadge: some View {
        if mediaGateTap != nil, attachmentKind?.hasTimebasedTrack == true {
            Image(systemName: "play.circle.fill")
                .font(MeeshyFont.relative(16, weight: .bold))
                .foregroundStyle(.white)
                .shadow(radius: 2)
                .accessibilityHidden(true)
        }
    }

    /// ZONE 2, forme AVEC miniature. Sans geste arme, l'image reste une image
    /// et le tap continue jusqu'a la zone 3.
    @ViewBuilder
    private var quotedThumbnail: some View {
        if let thumbUrl = thumbnailUrlString {
            let thumbnail = CachedAsyncImage(
                url: thumbUrl,
                targetSize: CGSize(width: Self.thumbnailSize, height: Self.thumbnailSize)
            ) {
                Color(hex: reply.authorColor).opacity(0.3)
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: Self.thumbnailSize, height: Self.thumbnailSize)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay { playBadge }

            if let mediaGateTap {
                thumbnail
                    .contentShape(Rectangle())
                    .onTapGesture(perform: mediaGateTap)
                    .accessibilityLabel(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main))
            } else {
                thumbnail
            }
        }
    }

    /// Glyphe de la ligne d'apercu. ZONE 2 quand il est la SEULE affordance du
    /// media ; simple ornement sinon, efface de VoiceOver puisque le libelle
    /// court voisin (« Photo », « Video », …) dit deja le genre.
    ///
    /// Une piste temporelle (audio, video) montre `play.circle.fill` — une
    /// ACTION. Le `waveform` historique nommait un TYPE : il ne disait pas que
    /// l'audio cite pouvait s'ecouter. `AttachmentKind.sfSymbolName` reste
    /// intouche pour toutes les autres surfaces, qui decrivent bien un type.
    @ViewBuilder
    private func previewGlyph(previewColor: Color) -> some View {
        if let kind = attachmentKind {
            if let mediaGateTap, glyphOpensTheMedia {
                Image(systemName: kind.hasTimebasedTrack ? "play.circle.fill" : kind.sfSymbolName)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(previewColor)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: mediaGateTap)
                    .accessibilityLabel(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main))
            } else {
                Image(systemName: kind.sfSymbolName)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(previewColor)
                    .accessibilityHidden(true)
            }
        }
    }

    var body: some View {
        let accentBarColor = Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let nameColor: Color = parentIsMe
            ? .white.opacity(0.9)
            : Color(hex: reply.isMe ? accentHex : reply.authorColor)
        let previewColor: Color = parentIsMe
            ? .white.opacity(0.65)
            : theme.textMuted
        let bgColor: Color = parentIsMe
            ? Color.white.opacity(0.15)
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05))

        let contentBody = HStack(spacing: 0) {
            // Left accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(parentIsMe ? Color.white.opacity(0.7) : accentBarColor)
                .frame(width: 4)

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    // Titre + date du mood sur la MÊME ligne : dans l'aperçu, la
                    // date vivait avec le contenu et lui mangeait sa largeur, ce
                    // qui le coupait à mi-phrase.
                    HStack(spacing: 6) {
                        // ZONE 1. Le NOM qui la suit est INERTE : sous la LOI
                        // DES ZONES il retombe en zone 3 (retour au message
                        // cite), et il n'a jamais porte de geste ici.
                        authorGate

                        Text(quotedTitle)
                            .font(.caption.weight(.bold))
                            .foregroundColor(nameColor)
                            .lineLimit(1)

                        moodDateLabel(previewColor: previewColor)

                        Spacer(minLength: 0)
                    }

                    if reply.moodEmoji != nil {
                        BubbleMoodReplyPreview(reply: reply, previewColor: previewColor)
                    } else if reply.isStoryReply {
                        BubbleStoryReplyPreview(reply: reply, previewColor: previewColor)
                    } else {
                        HStack(spacing: 5) {
                            previewGlyph(previewColor: previewColor)

                            // Empty preview text + attachment → use the kind's
                            // localized short label ("Photo", "Vidéo", ...)
                            // instead of the hardcoded "Media" fallback that
                            // surfaced before the AttachmentKind plumbing fix.
                            let fallback = attachmentKind?.shortLabel ?? String(localized: "bubble.reply.media", defaultValue: "Media", bundle: .main)
                            MessageTextRenderer.render(
                                reply.previewText.isEmpty ? fallback : reply.previewText,
                                fontSize: 12, color: previewColor,
                                mentionColor: mentionTint, hashtagColor: hashtagTint, accentColor: previewColor,
                                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                            )
                            .lineLimit(2)
                            .tint(previewColor)
                        }
                    }
                }

                Spacer(minLength: 0)

                // ZONE 2 — miniature du media cite, bouton play par-dessus
                // une piste temporelle. Tap : le media EN PLEIN ECRAN.
                quotedThumbnail
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
        }
        .padding(.vertical, 8)
        // La barre d'accent (RoundedRectangle) est infiniment flexible en
        // hauteur : sans fixedSize, un hôte qui sur-propose de la hauteur
        // (VStack du conteneur média+citation quand la vidéo letterboxe)
        // fait gonfler la citation qui absorbe tout l'excédent. On la fige
        // à sa hauteur idéale (titre + 2 lignes max de preview).
        .fixedSize(horizontal: false, vertical: true)
        .contentShape(Rectangle())

        switch style {
        case .card:
            contentBody
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(bgColor)
                )
                .padding(.horizontal, 6)
                .padding(.top, 6)
        case .inline:
            contentBody
        }
    }

    // MARK: - Attachment kind resolution

    /// Decodes `ReplyReference.attachmentType` to the canonical
    /// `AttachmentKind` (single source of truth — see
    /// `AttachmentKind.swift`).
    ///
    /// Two-step fallback for forward-compat with any cached payload that
    /// still carries the raw MIME (`"image/jpeg"`) instead of the short
    /// kind rawValue (`"image"`):
    ///   1. try `AttachmentKind(rawValue:)` — new payloads
    ///   2. fall back to `AttachmentKind(mimeType:)` — legacy / cached
    ///
    /// Returns `nil` only when the input is `nil`. Unknown values still
    /// resolve to `.other` (paperclip + "Fichier") so the UI never shows
    /// an unlabeled glyph.
    static func resolveAttachmentKind(_ type: String?) -> AttachmentKind? {
        guard let type, !type.isEmpty else { return nil }
        if let exact = AttachmentKind(rawValue: type) { return exact }
        return AttachmentKind(mimeType: type)
    }
}

// MARK: - Mood reply preview

/// Citation d'une réponse à un mood/statut : emoji + contenu entier + date.
/// Le contenu du mood vit dans `reply.previewText`, l'emoji dans
/// `reply.moodEmoji`, la date dans `reply.storyPublishedAt`.
struct BubbleMoodReplyPreview: View, Equatable {
    let reply: ReplyReference
    let previewColor: Color

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.previewColor == rhs.previewColor &&
        lhs.reply.moodEmoji == rhs.reply.moodEmoji &&
        lhs.reply.previewText == rhs.reply.previewText &&
        lhs.reply.storyPublishedAt == rhs.reply.storyPublishedAt
    }

    var body: some View {
        // La date est rendue par la ligne de titre de `BubbleQuotedReply` : ici
        // elle consommait la largeur du contenu, qui se coupait à mi-phrase.
        HStack(alignment: .top, spacing: 5) {
            if let emoji = reply.moodEmoji {
                Text(emoji)
                    .font(.footnote)
            }

            if !reply.previewText.isEmpty {
                Text(reply.previewText)
                    .font(.caption)
                    .foregroundColor(previewColor)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: - Story reply preview

/// Was: ThemedMessageBubble.storyReplyPreview(_:previewColor:) (lines 1034-1086).
///
/// `previewColor` est derive du contexte parent (white.opacity(0.65) si
/// `parentIsMe`, sinon `theme.textMuted`) — il n'est pas reductible a un
/// hex de la couleur de contact, donc on garde `Color` directement.
/// SwiftUI.Color est Hashable depuis iOS 13+ (synthese Equatable OK).
struct BubbleStoryReplyPreview: View, Equatable {
    let reply: ReplyReference
    let previewColor: Color

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.previewColor == rhs.previewColor &&
        Self.previewSlice(lhs.reply) == Self.previewSlice(rhs.reply)
    }

    private static func previewSlice(_ reply: ReplyReference) -> PreviewSlice {
        PreviewSlice(
            storyPublishedAt: reply.storyPublishedAt,
            storyReactionCount: reply.storyReactionCount,
            storyCommentCount: reply.storyCommentCount,
            storyShareCount: reply.storyShareCount
        )
    }

    fileprivate struct PreviewSlice: Equatable {
        let storyPublishedAt: Date?
        let storyReactionCount: Int?
        let storyCommentCount: Int?
        let storyShareCount: Int?
    }

    @ViewBuilder
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "camera.fill")
                .font(.caption2.weight(.medium))
                .foregroundColor(previewColor)
                // Decorative glyph — the adjacent "Story" label conveys the
                // reply kind, so hide the symbol from VoiceOver.
                .accessibilityHidden(true)
            Text(String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main))
                .font(.caption.weight(.medium))
                .foregroundColor(previewColor)

            if let date = reply.storyPublishedAt {
                Text("\u{2022}")
                    .font(.caption2)
                    .foregroundColor(previewColor.opacity(0.6))
                Text(date, style: .relative)
                    .font(.caption2)
                    .foregroundColor(previewColor.opacity(0.8))
            }

            let reactions = reply.storyReactionCount ?? 0
            let comments = reply.storyCommentCount ?? 0
            let shares = reply.storyShareCount ?? 0
            if reactions > 0 || comments > 0 || shares > 0 {
                Text("(")
                    .font(.caption2)
                    .foregroundColor(previewColor.opacity(0.6))
                if reactions > 0 {
                    storyMetric(icon: "heart.fill", value: reactions)
                }
                if reactions > 0 && (comments > 0 || shares > 0) {
                    storyMetricSeparator
                }
                if comments > 0 {
                    storyMetric(icon: "bubble.right.fill", value: comments)
                }
                if comments > 0 && shares > 0 {
                    storyMetricSeparator
                }
                if shares > 0 {
                    storyMetric(icon: "arrowshape.turn.up.right.fill", value: shares)
                }
                Text(")")
                    .font(.caption2)
                    .foregroundColor(previewColor.opacity(0.6))
            }
        }
    }

    private func storyMetric(icon: String, value: Int) -> some View {
        HStack(spacing: 2) {
            Image(systemName: icon)
                .font(.caption2)
            Text("\(value)")
                .font(.caption2.weight(.medium))
        }
        .foregroundColor(previewColor.opacity(0.8))
    }

    private var storyMetricSeparator: some View {
        Text("\u{2022}")
            .font(.caption2)
            .foregroundColor(previewColor.opacity(0.5))
    }
}
