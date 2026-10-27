import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le décor du message EN FOCUS (Focal) — cadre de l'élu, bande basse
/// (traduction, drapeaux, (+), réactions), chip d'identité et chip de date.
/// Une seule responsabilité : tout ce que la rangée superpose à son contenu
/// quand elle est élue ou dépliée. Aucune hauteur réservée, aucun `@State` :
/// la rangée (`FocalRow`) la construit avec ce qu'elle lit et la pose.
struct FocalFocusChrome {
    let input: FocalRowInput
    let actions: FocalRowActions
    let focusLift: CGFloat

    private var content: BubbleContent { input.content }

    /// En focus : « Aujourd'hui 12:30 », « Hier 18:30 », « Mardi 23:40 »,
    /// « Sam. 3 oct. 2025 · 14:41 » (`FocalFocusTimestamp`) ; sinon l'heure seule.
    /// En focus : la date complète PRÉ-CALCULÉE par la configuration
    /// (`input.focusTimestamp`) ; le calcul en body n'est qu'un filet.
    private var headerTimeString: String {
        guard input.isFocused else { return content.meta.timeString }
        if let precomputed = input.focusTimestamp { return precomputed }
        guard let sentAt = input.sentAt else { return content.meta.timeString }
        return FocalFocusTimestamp.label(
            sentAt: sentAt,
            timeString: content.meta.timeString,
            now: Date(),
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui", bundle: .main),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier", bundle: .main),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier", bundle: .main)
        )
    }

    private var focusAccent: Color { Color(hex: input.accentHex) }

    /// LA chip du focus — une seule coquille pour l'identité, la date, la
    /// traduction, les drapeaux, le (+) et les réactions : capsule OPAQUE
    /// (posée sur la ligne de la carte), teintée à l'accent de la scène —
    /// SANS contour (directive 2026-08-24). L'état se lit désormais au fond
    /// seul : dense pour le drapeau affiché (`isActive`), plein pour une
    /// réaction qui est la mienne (`filled`).
    private func focusChip<Content: View>(
        isActive: Bool = false,
        filled: Bool = false,
        height: CGFloat = FocalMetrics.FocusStrip.chipHeight,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        content()
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .frame(minWidth: FocalMetrics.FocusStrip.chipMinWidth)
            .frame(height: height)
            .background(
                Capsule(style: .continuous)
                    .fill(filled ? focusAccent : MeeshyColors.backgroundSecondary(isDark: input.isDark))
                    .overlay(Capsule(style: .continuous).fill(filled ? Color.clear : focusAccent.opacity(FocalScrollPerspective.focusChipFillOpacity(isDark: input.isDark, isActive: isActive))))
            )
            .contentShape(Capsule(style: .continuous))
    }

    /// Sur la ligne BASSE de la carte du message en focus, dans CET ordre
    /// (directive 2026-08-22) : l'icône de traduction (détails), les
    /// drapeaux (afficher le contenu dans cette langue), le (+) emoji, puis
    /// les réactions — fond PLEIN quand j'ai réagi. Superposition : aucune
    /// hauteur réservée, donc affichage instantané au tick d'élection.
    private var focusStrip: some View {
        HStack(alignment: .center, spacing: 4) {
            if let translation = content.translation, !content.requiresVeil {
                Button {
                    actions.onShowTranslationDetail?(content.messageId)
                } label: {
                    focusChip {
                        Image(systemName: "character.bubble")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(focusAccent)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "focal.focus.translation_detail", defaultValue: "Détails de traduction", bundle: .main))
                ForEach(
                    FocalRow.focusFlagCodes(
                        originalLangCode: translation.originalLangCode,
                        availableFlags: translation.availableFlags,
                        activeLangCode: translation.activeLangCode,
                        limit: FocalMetrics.FocusStrip.flagLimitMagnified
                    ),
                    id: \.self
                ) { code in
                    // DIXIÈME copie (252i, #4260). Elle garde sa VUE — le fond
                    // `focusChip` n'existe que sur la bande magnifiée, et
                    // `LanguageFlagChip` étant un `Button`, l'adopter ici
                    // imbriquerait un bouton dans un bouton. Elle prend donc le
                    // VOCABULAIRE : même table, même repli, étiquette d'action,
                    // état porté par un trait et non par le seul fond de puce.
                    Button {
                        actions.onSetActiveDisplayLanguage?(content.messageId, code)
                    } label: {
                        focusChip(isActive: code.lowercased() == translation.activeLangCode.lowercased()) {
                            Text(LanguageFlagChip.flag(for: code)).font(MeeshyFont.relative(MeeshyFont.smallSize))
                        }
                    }
                    .buttonStyle(.plain)
                    .languageFlagAccessibility(
                        code: code,
                        isActive: code.lowercased() == translation.activeLangCode.lowercased()
                    )
                }
            }
            Button {
                actions.onOpenReactPicker?(content.messageId)
            } label: {
                focusChip {
                    Image(systemName: "face.smiling")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(focusAccent)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "focal.focus.add_reaction", defaultValue: "Ajouter une réaction", bundle: .main))
            ForEach(content.reactions, id: \.emoji) { reaction in
                focusReactionChip(reaction)
            }
            Spacer(minLength: 0)
        }
        .padding(.leading, FocalMetrics.FocusStrip.chipInset)
    }

    /// Réaction sur la ligne : fond PLEIN (accent) si j'ai réagi, sinon la
    /// chip neutre ; toucher = basculer, maintenir = qui a réagi.
    private func focusReactionChip(_ reaction: MeeshyReactionSummary) -> some View {
        let mine = reaction.includesMe
        return Button {
            HapticFeedback.light()
            actions.onToggleReaction?(reaction.emoji)
        } label: {
            focusChip(filled: mine) {
                HStack(spacing: MeeshySpacing.xxs) {
                    Text(reaction.emoji).font(.caption2)
                    if reaction.count > 1 {
                        Text("\(reaction.count)")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(mine ? .white : focusAccent)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.4).onEnded { _ in
            HapticFeedback.medium()
            actions.onShowReactions?(content.messageId)
        })
        .accessibilityLabel("\(reaction.emoji) \(reaction.count)")
    }

    /// Le FOND du message long DÉPLIÉ (#8147), dessiné dans le repère du
    /// CONTENU. Mêmes cotes que `focusCardInsets` : il dépasse le bloc de
    /// `focusCardInnerMargin` en haut et en bas, et s'arrête à
    /// `focusCardHorizontalInset` du bord de la cellule.
    var focusCardBackground: some View {
        FocalGlassBlock()
            .padding(.horizontal, -(FocalMetrics.Row.paddingHorizontal - FocalScrollPerspective.focusCardHorizontalInset))
            .padding(.vertical, -FocalScrollPerspective.focusCardInnerMargin)
    }

    /// Le CADRE de l'élu Focal (#8506), fond de la colonne du message : il
    /// englobe l'identité posée au-dessus du contenu descendu, le contenu
    /// GROSSI (#8537) et la bande posée dessous, à `electedCardMargin` de
    /// chacun — la disposition que la passe mesure (`electedGeometry`).
    func electedCardBackground(_ elected: FocalElectedContent?) -> some View {
        GeometryReader { proxy in
            let margin = FocalScrollPerspective.electedCardMargin
            let span = electedSpan(elected, in: proxy)
            FocalGlassBlock()
                .padding(.leading, -margin)
                .padding(.trailing, -(margin + span.extraWidth))
                .padding(.top, -(focusLift + margin))
                .padding(.bottom, -(span.stripTop + FocalMetrics.FocusStrip.chipHeight + margin - proxy.size.height))
        }
    }

    /// La bande basse de l'élu — pastille de langue, drapeaux, réactions, date —
    /// à l'échelle 1, sous le contenu grossi, sur toute la largeur du cadre.
    func electedStrip(_ elected: FocalElectedContent?) -> some View {
        GeometryReader { proxy in
            let span = electedSpan(elected, in: proxy)
            HStack(alignment: .center, spacing: 4) {
                focusStrip
                Spacer(minLength: 4)
                focusStampChip
            }
            .frame(width: proxy.size.width + span.extraWidth, height: FocalMetrics.FocusStrip.chipHeight)
            .offset(y: span.stripTop)
        }
    }

    private func electedSpan(_ elected: FocalElectedContent?, in proxy: GeometryProxy) -> (extraWidth: CGFloat, stripTop: CGFloat) {
        let bounds = elected.map { proxy[$0.bounds] } ?? CGRect(x: 0, y: 0, width: 0, height: proxy.size.height)
        let scale = elected?.scale ?? 1
        return (
            FocalScrollPerspective.electedExtraWidth(columnWidth: proxy.size.width, contentWidth: bounds.width, scale: scale),
            FocalScrollPerspective.electedStripTop(columnHeight: proxy.size.height, contentMinY: bounds.minY, contentHeight: bounds.height, scale: scale)
        )
    }

    /// HAUT-GAUCHE : l'auteur, en haut du cadre — pour TOUTES
    /// les bulles en focus.
    ///
    /// **Directive 2026-08-24.** Cette chip recomposait une identité PAUVRE :
    /// un avatar et un nom, rien d'autre. La présence, le mood, l'anneau de
    /// story et le fantôme d'un visiteur sans compte — tout ce que
    /// `FocalIdentityHeader` sait déjà porter — s'évaporaient au moment
    /// précis où le message est le plus regardé. Elle réemploie donc l'en-tête,
    /// à un gabarit plus grand, au lieu d'en réécrire une version amputée.
    ///
    /// Elle vit DANS le cadre depuis #8506, à sa marge — plus à cheval sur
    /// sa ligne haute.
    ///
    /// Le toucher passe par `onOpenProfile`, le routage que l'hôte tient
    /// déjà : la feuille de PROFIL pour un compte, la fiche de participation
    /// pour un visiteur qui n'en a pas — lui n'a pas d'autre identité que
    /// celle-là. (Cette fiche s'ouvrait pleine d'identifiants bruts : ses 39
    /// clés étaient au catalogue sans une seule valeur française. Réparé le
    /// même jour, avec la garde qui manquait.)
    var focusIdentityChip: some View {
        focusChip(height: FocalMetrics.FocusStrip.identityChipHeight) {
            FocalIdentityHeader(
            isMe: content.isMe,
                senderDisplayName: input.senderDisplayName,
                senderUsername: input.senderUsername,
                senderAvatarURL: input.senderAvatarURL,
                senderThumbHash: input.senderThumbHash,
                senderColorHex: input.senderColorHex,
                senderPresence: input.senderPresence,
                senderIsHere: input.senderIsHere,
                senderStoryRing: input.senderStoryRing,
                senderMoodEmoji: input.senderMoodEmoji,
                senderIsAnonymous: input.senderIsAnonymous, senderRing: input.senderRing,
                profileUser: input.profileSheetUser,
            isDark: input.isDark,
                agentStyle: AgentAuthoredStyle.resolve(
                isAgentAuthored: input.isAgentAuthored,
                isAgentGrammarEnabled: input.showsAgentGrammar
                ),
                onOpenProfile: actions.onOpenProfile,
                onMoodTap: actions.onMoodTap,
                avatarDiameter: FocalMetrics.FocusStrip.identityAvatarSize,
                nameSize: FocalMetrics.FocusStrip.identityNameSize,
                fillsWidth: false
            )
            .padding(.leading, -3)
        }
    }

    /// BAS-DROITE : date complète (pré-calculée) + coche d'état de réception
    /// (mes messages), sur la ligne basse à côté de la bande — toucher = les
    /// DÉTAILS du message, la feuille qu'ouvre « Infos » (#8537). Elle a quitté la ligne du HAUT le 2026-08-23 : la
    /// carte affichait alors sa date deux fois, en haut par cette chip et en
    /// bas par la méta.
    private var focusStampChip: some View {
        let metaTint: Color = input.isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
        let readTint: Color = input.isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
        return Button {
            actions.onShowMessageInfo?(content.messageId)
        } label: {
            focusChip {
                HStack(spacing: 4) {
                    Text(headerTimeString)
                        .font(MeeshyFont.relative(10.5, weight: .semibold))
                        .foregroundColor(metaTint)
                        .lineLimit(1)
                    if content.isMe, let status = content.meta.deliveryStatus {
                        BubbleDeliveryCheck(status: status, isOffline: false, tint: metaTint, readTint: readTint)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(headerTimeString)
    }
}
