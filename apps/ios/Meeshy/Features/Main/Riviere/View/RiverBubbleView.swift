import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Contenu — le pont entre la géométrie PURE et ce que le lecteur voit

/// Ce que `RiverBubbleView` affiche pour un message. `RiverLaneResolver.RiverBubble`
/// (la loi) ne connaît ni texte ni nom — ce type porte ce que la loi ne
/// porte pas, résolu par l'appelant. Le Prisme (`resolveLastMessagePreview`/
/// `preferredTranslation`) s'applique ICI, côté appelant, comme pour toute
/// bulle du Fil (amendement R) — cette vue ne résout AUCUNE langue.
struct RiverBubbleContent: Equatable {
    let bubble: RiverLaneResolver.RiverBubble
    let senderDisplayName: String
    /// Graine de couleur — PAS un hex déjà résolu. `RiverBubbleView` appelle
    /// elle-même `DynamicColorGenerator.colorForName` (contrat R-133 :
    /// « couleur de ligne par participant via DynamicColorGenerator »).
    let colorSeed: String
    let timeString: String
    let text: String
    /// §7ter A.6 — verdict de forme de la géométrie source
    /// (`RiverGeometry.layout`), porté PAR BULLE plutôt qu'en lisant la
    /// géométrie complète depuis cette vue (même discipline que `bubble`,
    /// qui porte déjà sa part de la loi). Gouverne l'HABILLAGE du contour :
    /// `.lanes` ⇒ contour complet coloré (une ligne aborde la bulle) ;
    /// `.serialized` ⇒ bord gauche + bord bas colorés SEULS, reste neutre —
    /// aucune ligne n'aborde la bulle en vue sérialisée, un contour complet y
    /// mimerait une branche que le verdict de forme vient de retirer.
    let layout: RiverLaneResolver.RiverLayout
    let replyPreview: RiverReplyPreview?

    init(
        bubble: RiverLaneResolver.RiverBubble,
        senderDisplayName: String,
        colorSeed: String,
        timeString: String,
        text: String,
        layout: RiverLaneResolver.RiverLayout,
        replyPreview: RiverReplyPreview? = nil
    ) {
        self.bubble = bubble
        self.senderDisplayName = senderDisplayName
        self.colorSeed = colorSeed
        self.timeString = timeString
        self.text = text
        self.layout = layout
        self.replyPreview = replyPreview
    }
}

/// « La citation est une RÉFÉRENCE, pas une relecture » (§7ter A4) — une
/// seule ligne tronquée, même règle que `FocalQuotedReplyView`.
struct RiverReplyPreview: Equatable {
    let authorDisplayName: String
    let text: String
}

// MARK: - Initiales — pures, testables sans monter la vue

/// Extrait de la vue pour que `RiverBubbleLayoutTests` puisse l'éprouver
/// sans SwiftUI (§ tests possibles sans runtime UIKit complet).
nonisolated enum RiverBubbleLayout {
    /// Une ou deux lettres majuscules — premier caractère du premier mot, et
    /// du second s'il existe. Purement typographique : le SENS de « Toi »
    /// (résolution `isViewer`) est une affaire de l'appelant, pas de ce
    /// calcul.
    static func initials(for displayName: String) -> String {
        let letters = displayName
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .prefix(2)
            .compactMap { $0.first }
        guard !letters.isEmpty else { return "?" }
        return String(letters).uppercased()
    }
}

// MARK: - La bulle

/// La bulle Rivière — anatomie GELÉE de la rangée plate du Fil (`thread.*`,
/// §7ter A2) posée SUR la ligne de son auteur.
///
/// **§7ter A.5 (amendement, 2026-08-17) — l'identité est AU-DESSUS de la
/// bulle, HORS d'elle.** La première forme rendait la pastille+nom+heure
/// DANS le haut de la bulle, pour éviter que le trait ne traverse un mot :
/// la vraie réponse n'était pas de déplacer l'identité, c'est de BORNER le
/// nom à `RiverMetrics.Bubble.identityNameMaxWidth` (~44 % de
/// `contentWidth`, relevé sur la maquette normative) — la branche descend à
/// l'aplomb du CENTRE du couloir, donc elle croise TOUJOURS du vide dans la
/// rangée d'identité, entre le nom borné et l'heure. Une peau n'a AUCUNE
/// découpe à calculer : le trait (`RiverLaneCanvas`) passe DERRIÈRE (posé en
/// `.background` du grid par `RiverStreamHost`), et c'est le fond OPAQUE de
/// `messageBox` qui l'interrompt de lui-même — la rangée d'identité, elle,
/// n'a pas de fond, donc le trait s'y voit passer, dans le vide entre le nom
/// et l'heure.
///
/// **§7ter A.6 — l'habillage du contour suit le VERDICT DE FORME.** En
/// couloirs (`layout == .lanes`), une ligne ABORDE la bulle : contour
/// complet, même couleur/épaisseur que le trait (`RiverMetrics.Line.width`)
/// — « le bord de la bulle EST un segment de sa ligne » (amendement R). En
/// vue sérialisée, AUCUNE ligne ne l'aborde (l'axe horizontal a été retiré
/// par la loi, §7ter C) : un contour complet coloré y mimerait une branche
/// qui n'existe plus. Restent le bord GAUCHE et le bord BAS (couleur
/// d'auteur, même épaisseur que le trait), le reste neutre
/// (`RiverMetrics.Bubble.flatBorderWidth`, 1pt).
///
/// **« Le message en ENTIER »** (§7ter A1) : AUCUN `.lineLimit` sur le texte
/// principal — c'est ce qui rend la hauteur du rang MESURÉE plutôt que
/// supposée. La citation d'une réponse, elle, reste UNE ligne tronquée
/// (`RiverReplyPreview`, A4).
///
/// **Ne mesure pas sa propre position.** Elle publie son cadre — identité
/// COMPRISE, désormais — via `MessageFramePreferenceKey`, la MÊME primitive
/// que le Fil (`Features/Main/Views/MessageFrameTracker.swift`, réutilisée
/// TELLE QUELLE, jamais un second `PreferenceKey` concurrent), sur le
/// conteneur EXTÉRIEUR de cette vue (identité + bulle) — dans le repère
/// `RiverCoordinateSpace.name`. `RiverLaneCanvas` LIT ce cadre pour tracer la
/// ligne ; cette vue ne trace rien, elle pose du texte (garde R15 : aucune
/// géométrie recalculée ici). C'est cette mesure ÉLARGIE, sans aucun
/// changement dans `RiverLaneCanvas.swift`, qui fait traverser le trait par
/// la rangée d'identité : le tracé est déjà, par construction, une ligne
/// droite du haut du cadre mesuré à sa base.
struct RiverBubbleView: View, Equatable {
    let content: RiverBubbleContent
    let contentWidth: CGFloat

    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: RiverBubbleView, rhs: RiverBubbleView) -> Bool {
        lhs.content == rhs.content && lhs.contentWidth == rhs.contentWidth
    }

    private var colorHex: String { DynamicColorGenerator.colorForName(content.colorSeed) }
    private var laneColor: Color { Color(hex: colorHex) }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if content.bubble.isFirstInGroup {
                identityHeader
            }
            messageBox
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: MessageFramePreferenceKey.self,
                    value: [content.bubble.messageId: proxy.frame(in: .named(RiverCoordinateSpace.name))]
                )
            }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
    }

    // MARK: - Corps du message — la bulle proprement dite

    /// Le rectangle qui porte le fond opaque et le contour (§7ter A.6) — SEUL
    /// à porter `contentWidth`/le padding interne. L'identité (`identityHeader`)
    /// N'EN FAIT PLUS PARTIE (§7ter A.5).
    private var messageBox: some View {
        VStack(alignment: .leading, spacing: RiverMetrics.Bubble.baseGap) {
            if let replyPreview = content.replyPreview {
                quotedReply(replyPreview)
            }

            // « Le message en ENTIER » (§7ter A1) — pas de lineLimit ici.
            Text(content.text)
                .font(MeeshyFont.relative(FocalMetrics.Text.size))
                .lineSpacing(FocalMetrics.Text.lineSpacing(forResolvedFontSize: FocalMetrics.Text.size))

            if !content.bubble.isFirstInGroup {
                footerTime
            }
        }
        // `gutter` reste au propriétaire de la COLONNE (`RiverStreamHost`,
        // l'espace EXTÉRIEUR à la bulle où passe le trait) — jamais dupliqué
        // ici : le seul écart interne de cette vue est `baseGap`.
        .padding(.horizontal, RiverMetrics.Bubble.baseGap)
        .padding(.vertical, RiverMetrics.Bubble.baseGap)
        .frame(width: contentWidth, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: RiverMetrics.Bubble.detourRadius, style: .continuous)
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
        )
        .overlay(bubbleOutline)
    }

    /// §7ter A.6 — l'habillage suit le VERDICT DE FORME, jamais une
    /// préférence de peau (voir la docstring de tête du fichier).
    @ViewBuilder
    private var bubbleOutline: some View {
        let shape = RoundedRectangle(cornerRadius: RiverMetrics.Bubble.detourRadius, style: .continuous)
        if content.layout == .lanes {
            shape.strokeBorder(laneColor, lineWidth: RiverMetrics.Line.width)
        } else {
            // Vue sérialisée : contour neutre PARTOUT, puis deux barres
            // droites (gauche/bas) posées PAR-DESSUS en couleur d'auteur —
            // approximation décorative assumée (deux rectangles, pas une
            // découpe de coin), jamais éprouvée pixel-à-pixel hors device.
            ZStack {
                shape.strokeBorder(neutralOutlineColor, lineWidth: RiverMetrics.Bubble.flatBorderWidth)
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Rectangle()
                        .fill(laneColor)
                        .frame(height: RiverMetrics.Line.width)
                }
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(laneColor)
                        .frame(width: RiverMetrics.Line.width)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    /// Contour NEUTRE de la vue sérialisée. Aucun système de couleur
    /// « ligne/séparateur » établi côté iOS pour ce sous-système à ce jour
    /// (RE-PREUVE : ni `MeeshyColors`, ni `ThemeManager` ne portent de teinte
    /// nommée « line »/« separator » — écart signalé, pas contourné en
    /// silence) — équivalent le plus proche : la couleur système de
    /// séparation, qui s'adapte déjà light/dark sans travail supplémentaire.
    private var neutralOutlineColor: Color { Color(uiColor: .separator) }

    // MARK: - En-tête d'identité (tête de groupe seulement) — §7ter A.5, HORS de la bulle

    private var identityHeader: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(laneColor)
                .frame(width: FocalMetrics.Avatar.size, height: FocalMetrics.Avatar.size)
                .overlay(
                    Text(RiverBubbleLayout.initials(for: content.senderDisplayName))
                        .font(MeeshyFont.relative(FocalMetrics.Avatar.size / 2, weight: .bold))
                        .foregroundColor(.white)
                )

            // §7ter A.5 — borné à la moitié de la largeur de la bulle : la
            // branche descend à l'aplomb du CENTRE du couloir, cette borne
            // garantit qu'elle croise du vide ici, jamais un mot. Un nom
            // plus long s'élide (`.lineLimit(1)`), comme sur le Fil.
            Text(content.senderDisplayName)
                .font(MeeshyFont.relative(FocalMetrics.Name.size, weight: FocalMetrics.Name.weight))
                .foregroundColor(laneColor)
                .lineLimit(1)
                .frame(
                    maxWidth: contentWidth * RiverMetrics.Bubble.identityNameMaxWidth,
                    alignment: .leading
                )

            Spacer(minLength: 0)

            // « L'heure vit en base de bulle » (amendement R) : en tête de
            // groupe, la base ET la tête portent la même horloge — c'est la
            // règle du Fil (`FocalIdentityHeader`/`FocalMetaRow`, même
            // horodatage dans les deux positions selon qu'un rang ouvre ou
            // prolonge un groupe).
            Text(content.timeString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
        }
        // Même largeur que `messageBox` (`contentWidth`) : la pastille
        // s'aligne sur le bord GAUCHE de la bulle, l'heure sur son bord
        // DROIT — la rangée d'identité partage l'emprise horizontale de la
        // bulle, exactement comme `.idh`/`.bub`, deux enfants directs de
        // `.cell` dans la maquette normative.
        .frame(width: contentWidth, alignment: .leading)
    }

    // MARK: - Heure en base de bulle (rangée de suite)

    private var footerTime: some View {
        HStack {
            Spacer(minLength: 0)
            Text(content.timeString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
        }
    }

    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    // MARK: - Citation de réponse — une ligne, jamais plus (§7ter A4)

    private func quotedReply(_ reply: RiverReplyPreview) -> some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(laneColor.opacity(0.6))
                .frame(width: FocalMetrics.Quote.railWidth)
            Text("\(reply.authorDisplayName) · \(reply.text)")
                .font(MeeshyFont.relative(FocalMetrics.Text.size - 2))
                .foregroundColor(metaTint)
                .lineLimit(1)
                .padding(.leading, 8)
        }
    }

    // MARK: - Accessibilité

    private var accessibilityLabel: String {
        var parts = [content.senderDisplayName, content.text, content.timeString]
        if let reply = content.replyPreview {
            parts.append(
                String(
                    format: String(localized: "riviere.bubble.replyTo", defaultValue: "en réponse à %@", bundle: .main),
                    reply.authorDisplayName
                )
            )
        }
        return parts.joined(separator: ", ")
    }
}
