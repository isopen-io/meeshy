import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bloc citation NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), au-dessus du texte du message qui répond.
///
/// **Rendu NATIF** (arbitrage F-083bis — remplace la réutilisation verbatim
/// de `BubbleQuotedReply` livrée par F-082) : le filet est dessiné ICI, à
/// `FocalMetrics.Quote.railWidth` (`2.5`, miroir de `thread.quote.borderSize`
/// — VÉRIFIÉ présent dans `lentille-tokens.json` avant d'écrire ce fichier,
/// RE-PREUVE §0 : rien à signaler, aucun repli nécessaire), couleur de
/// l'auteur cité (`reference.authorColor`, déjà résolue par le SDK —
/// `ReplyReference.init` retombe sur `DynamicColorGenerator.colorForName`
/// quand `authorColor` est absent : « l'accent existant du SDK », jamais
/// reconstruit ici). Le BUDGET DE LIGNES vient désormais de la règle partagée
/// des trois peaux (`QuotedReplyPresentation.previewLineLimit(for: .focal)` —
/// deux lignes) : l'unique ligne d'origine coupait la moitié des citations à
/// mi-phrase, et la MÊME citation se lisait sur trois hauteurs selon la peau
/// (#4946). Même approche native que `Focal/Row/FocalSystemRows.swift` (F-082) et pour la
/// MÊME raison : le composant réel (`BubbleQuotedReply`,
/// `BubbleQuotedReply.swift:125-127`) dessine un filet `4`pt fixe
/// (`RoundedRectangle(cornerRadius: 2).frame(width: 4)`) et jusqu'à 2-3
/// lignes de preview, sans aucun paramètre pour ajuster ni l'un ni l'autre
/// — chrome incompatible avec la cote demandée. Reconstruit nativement
/// plutôt que réutilisé tel quel ; le composant réel reste par ailleurs
/// INTACT (§1.3, personne ne l'édite).
///
/// **Résolution de langue/texte** : `reference.previewText` (comme
/// `authorColor`) est une valeur DÉJÀ RÉSOLUE en amont par le Prisme/le
/// builder de `ReplyReference` — ce bloc ne fait AUCUNE seconde résolution,
/// juste un rendu à une ligne de ce que le résolveur existant a produit
/// (même règle que WS-3/WS-4 partout ailleurs : aucun `@State` de langue).
/// `MessageTextRenderer.render` (déjà utilisé par
/// `BubbleQuotedReply`/`BubbleExpandableText`, §1.3) reste le seul renderer
/// de texte de ce fichier — mentions/hashtags continuent de se colorer,
/// rien n'est réinventé là non plus. `AttachmentKind` (glyphe + libellé
/// court, via `BubbleQuotedReply.resolveAttachmentKind`, méthode statique
/// accessible — pas `fileprivate`) et les clés i18n `bubble.reply.*` sont
/// les MÊMES que celles de `BubbleQuotedReply` — un seul domicile i18n,
/// jamais dupliqué.
///
/// **LOI DES ZONES** (directive produit 2026-08-24). Une citation n'offre que
/// TROIS classes de zone tactile, et pas une de plus :
/// 1. l'AVATAR de l'auteur cité → ouvre son profil (`onQuotedAuthorTap`) ;
/// 2. la MINIATURE ou l'ICÔNE DE LECTURE → joue ou affiche le média EN PLEIN
///    ÉCRAN (`onQuotedMediaTap`) ;
/// 3. TOUT LE RESTE, LE NOM COMPRIS → retour au message cité
///    (`jumpToOriginal`).
///
/// Le NOM n'est plus une zone tactile propre : il retombe sous la zone 3
/// (« il faut le moins de point actionnable pour permettre de pouvoir
/// manipuler le message simplement »). Ce que le nom offrait, l'avatar le
/// porte désormais — aucune capacité perdue, un point actionnable de moins,
/// et une cible ronde à la cote `FocalMetrics.Avatar.size` là où une ligne de
/// texte tronquée faisait un bouton de largeur imprévisible.
///
/// La zone 1 n'existe QUE si la citation désigne l'auteur d'un MESSAGE
/// (`!reference.isStoryReply`) : une story ou une humeur citée porte
/// `authorName == "Story"` (ou vide) et aucun avatar — il n'y a pas de
/// personne à ouvrir, et l'hôte fabriquerait une fiche au nom de « Story ».
/// Là où elle existe, l'avatar est dessiné MÊME sans URL (initiales
/// colorées, repli natif de `MeeshyAvatar`) : la porte vers le profil ne
/// dépend jamais de la présence d'une photo.
///
/// **Corollaire du « moins de points actionnables » : une capacité = UN
/// site.** Le glyphe de la ligne d'aperçu n'est la zone 2 que lorsqu'aucune
/// miniature ne la porte déjà ET que le média est réellement ouvrable
/// (`AttachmentKind.isMedia`). Un glyphe de document renverrait vers le saut
/// à l'original — exactement ce que la zone 3 fait déjà sous lui ; et un
/// glyphe tactile posé à côté d'une miniature tactile serait un second point
/// actionnable pour une seule capacité.
///
/// **Un média PROTÉGÉ n'a pas de zone 2** (`reference.quotedMediaIsProtected`,
/// vue unique ou flouté). Ni vignette, ni icône de lecture : la vignette
/// voyage sans condition depuis la passerelle, et l'hôte refuse déjà d'ouvrir
/// un tel attachement (`MessageListViewController.openQuotedMedia`). Armer
/// cette zone reviendrait à annoncer une lecture par-dessus un verrou — un
/// contrôle qui ment, et l'aperçu en clair d'un contenu à vue unique offert à
/// tout le fil, à chaque relecture. Le glyphe générique reste, le tap retombe
/// en zone 3, et le média garde son propre geste de révélation sur la rangée
/// d'origine.
///
/// **Carrousel** : la citation est une PORTE, pas une galerie.
/// `ReplyReference` ne porte qu'UNE `attachmentThumbnailUrl` et aucun compte
/// de pièces jointes (le gateway n'en sélectionne pas), donc ni liste de
/// miniatures ni badge « +N » ne serait honnête. Le tap ouvre le pager plein
/// écran de la conversation, où les images 2..N sont atteignables au
/// balayage.
///
/// Gardes : `FocalQuotedReplyRichTests.test_loiDesZones_*`.
struct FocalQuotedReplyView: View, Equatable {
    let reply: BubbleContent.Reply
    let accentHex: String
    let isDark: Bool
    let mentionDisplayNames: [String: String]
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
    /// ZONE 1 — tap sur l'AVATAR de l'auteur cité → profil (résolution hôte).
    /// Le NOM ne la déclenche plus (LOI DES ZONES, doc de tête).
    var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil
    /// ZONE 2 — tap sur la MINIATURE ou l'ICÔNE DE LECTURE → plein écran /
    /// lecture (résolution hôte ; repli hôte = saut à l'original).
    var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil

    static func == (lhs: FocalQuotedReplyView, rhs: FocalQuotedReplyView) -> Bool {
        lhs.reply == rhs.reply
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
    }

    private var reference: ReplyReference { reply.reference }

    /// Couleur de l'auteur CITÉ — `accentHex` (l'accent de LA CONVERSATION)
    /// seulement quand la citation pointe vers son propre message (`isMe`) ;
    /// sinon `reference.authorColor`, déjà résolu par le SDK. Même règle
    /// que le filet historique de `BubbleQuotedReply` (contrat Focal §0 :
    /// « couleur de l'auteur cité »).
    ///
    /// Une SEULE teinte pour le filet ET les initiales de l'avatar : la
    /// citation d'une même personne se reconnaît à sa couleur, quel que soit
    /// l'élément qui la porte.
    private var authorHex: String {
        reference.isMe ? accentHex : reference.authorColor
    }

    private var railColor: Color {
        Color(hex: authorHex)
    }

    private var titleColor: Color {
        isDark ? Color.white.opacity(0.85) : Color.black.opacity(0.75)
    }

    private var previewColor: Color {
        ThemeManager.shared.textMuted
    }

    /// NOM de l'auteur cité — celui dont l'avatar tire ses INITIALES. La
    /// ponctuation du titre (« Alice : ») n'a rien à faire dans un monogramme.
    private var authorName: String {
        if reference.isMe { return String(localized: "bubble.reply.you", defaultValue: "Vous", bundle: .main) }
        if !reference.authorName.isEmpty { return reference.authorName }
        if reference.moodEmoji != nil { return String(localized: "bubble.reply.mood", defaultValue: "Humeur", bundle: .main) }
        return reference.authorName
    }

    /// Le titre RENDU — « Alice : », composé par la règle partagée des trois
    /// peaux (`QuotedReplyPresentation`), espace insécable comprise. Une
    /// citation se lit de la même façon dans la bulle, ici et dans le bandeau
    /// du composeur (#4946).
    private var title: String {
        QuotedReplyPresentation.title(author: authorName)
    }

    /// « 1024×768 · 0:42 · 1,2 Mo » — les faits du média cité, ou `nil` quand
    /// aucun n'est connu ET pour tout média PROTÉGÉ : la règle partagée refuse
    /// d'un seul endroit ce qui décrirait le secret par la bande.
    private var quotedDetails: String? {
        QuotedReplyPresentation.detailsLabel(for: reference)
    }

    /// URL de miniature du contenu cité — pièce jointe d'un message, ou
    /// story. `nil` ⇒ pas de vignette, la ligne glyphe+libellé reste seule.
    ///
    /// Une pièce jointe PROTÉGÉE (vue unique, floutée) n'en fournit aucune :
    /// la vignette voyage sans condition depuis la passerelle, la protection
    /// est ce qui décide de la rendre. La story, elle, n'est jamais protégée
    /// à ce titre — son URL reste servie.
    private var thumbnailURL: URL? {
        let attachmentThumb = reference.quotedMediaIsProtected ? nil : reference.attachmentThumbnailUrl
        let raw = attachmentThumb ?? reference.storyThumbnailUrl
        guard let raw, !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    /// Le média cité est jouable/affichable en surface dédiée : la zone
    /// média (miniature ou glyphe) route alors vers `onQuotedMediaTap` au
    /// lieu du saut à l'original. Les stories gardent leur chemin
    /// (`onStoryReplyTap` ouvre le viewer) — qui est DÉJÀ le plein écran
    /// demandé, d'où le repli sans perte de capacité.
    ///
    /// **Un média PROTÉGÉ n'arme rien.** `MessageListViewController
    /// .openQuotedMedia` refuse déjà de l'ouvrir ; l'armer ici poserait une
    /// icône de lecture au-dessus d'un verrou, c'est-à-dire un contrôle qui
    /// ment. Le tap retombe en zone 3, où le média garde son propre geste de
    /// révélation.
    private var hasTappableMedia: Bool {
        !reply.isStory
            && !reference.quotedMediaIsProtected
            && (reference.attachmentType != nil || thumbnailURL != nil)
    }

    /// ZONE 1 — la porte vers le profil. Absente sur une story ou une humeur
    /// citée : `authorName` y vaut littéralement « Story » (ou reste vide) et
    /// aucun avatar ne voyage avec le snapshot, l'hôte fabriquerait une fiche
    /// à ce nom. Voir la LOI DES ZONES en tête de fichier.
    private var showsAuthorGate: Bool {
        !reference.isStoryReply
    }

    /// Genre de la pièce jointe citée — résolu UNE fois : le glyphe et la
    /// question « ce glyphe est-il la zone média ? » la posent toutes deux.
    private var attachmentKind: AttachmentKind? {
        BubbleQuotedReply.resolveAttachmentKind(reference.attachmentType)
    }

    /// ZONE 2, forme sans miniature. Le glyphe ne devient tactile que si
    /// AUCUNE miniature ne porte déjà la zone média (sinon deux points
    /// actionnables pour une seule capacité) ET si le média est réellement
    /// ouvrable (`isMedia` = image/vidéo/audio). Un document renverrait au
    /// message cité — ce que la zone 3 fait déjà sous lui.
    private var glyphOpensTheMedia: Bool {
        thumbnailURL == nil && hasTappableMedia && (attachmentKind?.isMedia ?? false)
    }

    /// Saut à l'original — le comportement historique du bloc entier,
    /// conservé pour le texte/fond de la citation.
    private func jumpToOriginal() {
        guard !reference.messageId.isEmpty else { return }
        if reply.isStory {
            onStoryReplyTap?(reference.messageId)
        } else {
            onReplyTap?(reference.messageId)
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: FocalMetrics.Quote.railWidth / 2)
                .fill(railColor)
                .frame(width: FocalMetrics.Quote.railWidth)

            // ZONE 2 — miniature du média cité (image/vidéo/story), bouton
            // play par-dessus la vidéo. Tap : le média EN PLEIN ÉCRAN, pas le
            // saut. Le repli `jumpToOriginal` ne sert qu'à la story, dont le
            // viewer EST le plein écran demandé : aucune capacité n'y diverge.
            if let thumbnailURL {
                CachedAsyncImage(
                    url: thumbnailURL.absoluteString,
                    // Le flou instantané plutôt qu'un carré de couleur unie le
                    // temps du réseau. `nil` pour un média protégé — un flou
                    // EST une image (règle partagée, site unique).
                    thumbHash: QuotedReplyPresentation.thumbHash(for: reference)
                ) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(railColor.opacity(0.18))
                }
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay {
                    // Le GENRE résolu, jamais la chaîne brute. `attachmentType`
                    // porte le MIME (« video/mp4 ») sur le chemin de rendu réel
                    // — `MessagePersistenceActor` y grave `mimeType`, et le
                    // cache le rend tel quel : une comparaison à « video » n'y
                    // est vraie que sur la bulle OPTIMISTE, qui pose le
                    // rawValue court. Le bouton play disparaissait donc dès que
                    // le serveur accusait, pour ne plus jamais revenir.
                    // `hasTimebasedTrack` couvre en outre l'audio cité, dont la
                    // demande produit réclame l'icône de lecture au même titre.
                    if attachmentKind?.hasTimebasedTrack == true {
                        // Même glyphe que la zone média sans miniature : UN
                        // seul vocabulaire visuel pour « ceci se joue ».
                        Image(systemName: "play.circle.fill")
                            .font(MeeshyFont.relative(16, weight: .bold))
                            .foregroundStyle(.white)
                            .shadow(radius: 2)
                            .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    if hasTappableMedia {
                        onQuotedMediaTap?(reference)
                    } else {
                        jumpToOriginal()
                    }
                }
                .accessibilityLabel(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main))
            }

            VStack(alignment: .leading, spacing: 1) {
                titleLine

                previewLine
                    .lineLimit(QuotedReplyPresentation.previewLineLimit(for: .focal))

                // « 1024×768 · 0:42 · 1,2 Mo ». La rangée plate est dense :
                // la ligne n'apparaît que lorsqu'un fait existe, et jamais
                // pour un média protégé.
                if let details = quotedDetails {
                    Text(details)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize))
                        .foregroundColor(previewColor.opacity(0.8))
                        .lineLimit(QuotedReplyPresentation.titleLineLimit)
                }
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
        .contentShape(Rectangle())
        .onTapGesture {
            jumpToOriginal()
        }
    }

    /// Ligne d'identité de la citation : l'AVATAR (ZONE 1, seule porte vers
    /// le profil) puis le NOM, désormais INERTE — un tap dessus traverse
    /// jusqu'à la zone 3 et retourne au message cité.
    ///
    /// L'avatar est le composant partagé du dépôt (`MeeshyAvatar`), monté à
    /// la cote nommée `FocalMetrics.Avatar.size` (jamais un littéral, garde
    /// R15) et à qui l'on confie son propre `onTap` : il porte alors sa
    /// forme de frappe CIRCULAIRE, son retour haptique et son libellé
    /// d'accessibilité (`name`) — rien n'est redessiné ici.
    ///
    /// Pas de `presenceState`, de `storyState` ni de `moodEmoji` : une
    /// citation est une trace figée du passé, pas une carte de présence.
    @ViewBuilder
    private var titleLine: some View {
        HStack(spacing: 5) {
            if showsAuthorGate {
                MeeshyAvatar(
                    name: authorName,
                    context: .custom(FocalMetrics.Avatar.size),
                    accentColor: authorHex,
                    avatarURL: reference.authorAvatarUrl,
                    enablePulse: false,
                    isDark: isDark,
                    onTap: { onQuotedAuthorTap?(reference) }
                )
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(String(localized: "bubble.reply.author_hint", defaultValue: "Affiche le profil de l'auteur cité", bundle: .main))
            }

            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(titleColor)
                .lineLimit(QuotedReplyPresentation.titleLineLimit)
        }
    }

    /// Glyphe de la ligne d'aperçu. ZONE 2 quand il est la SEULE affordance
    /// du média (aucune miniature) et que ce média s'ouvre vraiment ; simple
    /// ornement sinon, effacé de VoiceOver puisque le libellé court voisin
    /// (« Photo », « Vidéo », …) dit déjà le genre.
    ///
    /// Une piste temporelle (audio, vidéo) montre `play.circle.fill` — une
    /// ACTION. Le `waveform` historique nommait un TYPE : il ne disait pas
    /// que l'audio cité pouvait s'écouter, et `AttachmentKind.sfSymbolName`
    /// reste intouché pour toutes les autres surfaces qui, elles, décrivent
    /// bien un type.
    @ViewBuilder
    private var previewGlyph: some View {
        if let kind = attachmentKind {
            if glyphOpensTheMedia {
                Image(systemName: kind.hasTimebasedTrack ? "play.circle.fill" : kind.sfSymbolName)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
                    .contentShape(Rectangle())
                    .onTapGesture { onQuotedMediaTap?(reference) }
                    .accessibilityLabel(String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main))
            } else {
                Image(systemName: kind.sfSymbolName)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
                    .accessibilityHidden(true)
            }
        }
    }

    /// Une seule ligne, quel que soit le genre de citation — mood / story /
    /// message avec pièce jointe / message texte simple.
    @ViewBuilder
    private var previewLine: some View {
        if let emoji = reference.moodEmoji {
            HStack(spacing: 4) {
                Text(emoji).font(MeeshyFont.relative(MeeshyFont.captionSize))
                Text(reference.previewText)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .foregroundColor(previewColor)
            }
        } else if reference.isStoryReply {
            HStack(spacing: 4) {
                Image(systemName: "camera.fill")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
                    .accessibilityHidden(true)
                Text(String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(previewColor)
            }
        } else {
            HStack(spacing: 4) {
                previewGlyph
                let fallback = attachmentKind?.shortLabel ?? String(localized: "bubble.reply.media", defaultValue: "Médias", bundle: .main)
                MessageTextRenderer.render(
                    reference.previewText.isEmpty ? fallback : reference.previewText,
                    fontSize: 12,
                    color: previewColor,
                    mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                    accentColor: previewColor,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .tint(previewColor)
            }
        }
    }
}
