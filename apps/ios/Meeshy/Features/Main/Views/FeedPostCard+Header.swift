import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'en-tête de la carte de fil — vue `1h` du document composer.**
///
/// Extrait de `FeedPostCard.swift` (#4078) : le fichier portait 1490 lignes,
/// bien au-delà du budget de 800–1100, et la loi 4 de `BOUCLE.md` est nette —
/// « un fichier hors budget se découpe par responsabilité AVANT qu'une vue lui
/// ajoute quoi que ce soit ». L'en-tête est une responsabilité entière :
/// l'identité de l'auteur, son attribution de republication, le crédit du son
/// de fond, la ligne de méta et le menu.
///
/// Ce que la vue `1h` établit, et que cet en-tête porte :
///
/// > « L'icône est le verbe. ↻ @lume sans "republié de", le crédit du son sur
/// > la même ligne, la scène muette et en pause dans la carte : le mouvement
/// > vit dans la destination du tap. »
extension FeedPostCard {

    // MARK: - Author Header
    var authorHeader: some View {
        HStack(spacing: MeeshySpacing.md) {
            // Avatar
            MeeshyAvatar(
                name: post.author,
                context: .postAuthor,
                accentColor: accentColor,
                avatarURL: post.authorAvatarURL,
                storyState: authorStoryRing,
                moodEmoji: authorMoodEmoji,
                onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                onViewStory: onViewAuthorStory,
                onMoodTap: onAuthorMoodTap,
                contextMenuItems: [
                    AvatarContextMenuItem(label: String(localized: "feed.post.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                        selectedProfileUser = .from(feedPost: post)
                    }
                ]
            )
            .accessibilityLabel(String(format: String(localized: "a11y.feed.post.author_avatar", defaultValue: "Profil de %@", bundle: .main), post.author))
            .accessibilityHint(String(localized: "a11y.feed.post.author_avatar.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                // Author name with repost indicator
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Text(post.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(theme.textPrimary)

                    // Vue `1h` — l'heure appartient à la ligne du NOM, pas à la
                    // ligne de méta. Elle qualifie l'auteur (« Camille Roux, il
                    // y a 2 h »), tandis que la ligne de méta qualifie le
                    // CONTENU (langues, traductions, portée). Les mettre
                    // ensemble faisait lire « 2 h · 🇫🇷 · Impressions » comme une
                    // seule énumération, où la donnée la plus consultée — quand
                    // — se noyait dans la moins consultée.
                    // Suivie des points que ce post a rapportés (#9571).
                    PostDateWithPoints(postId: post.id, seed: post.viewerPoints, color: theme.textMuted) {
                        Text(RelativeTimeFormatter.shortString(for: post.timestamp))
                    }

                    // Attribution de republication, juste après le pseudo :
                    // l'icône, puis l'AUTEUR D'ORIGINE — rien d'autre (directive
                    // user 2026-08-19). La formule « a republié de @handle »
                    // disait en toutes lettres ce que l'icône dit déjà, et
                    // poussait le handle en bout de ligne, là où la troncature
                    // le mangeait en premier sur une carte étroite : le seul
                    // mot qui porte l'information était le premier sacrifié.
                    //
                    // Rien ne se perd pour VoiceOver : la phrase complète
                    // devient l'étiquette du groupe, l'icône restant muette.
                    // Elle serait sinon lue « @handle » sans dire pourquoi.
                    if post.repostAuthor != nil {
                        let handle = post.repost?.authorUsername ?? post.repostAuthor
                        HStack(spacing: MeeshySpacing.xxs) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.caption2)
                            if let handle {
                                Text("@\(handle)")
                                    .font(.caption)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                        }
                        .foregroundColor(theme.textMuted)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(
                            handle.map {
                                String(format: String(localized: "feed.post.reposted_from",
                                                      defaultValue: "a republié de @%@",
                                                      bundle: .main), $0)
                            } ?? String(localized: "feed.post.reposted",
                                        defaultValue: "a republié", bundle: .main)
                        )
                    }

                }

                // Vue `1h` — le crédit du son occupe sa PROPRE ligne, sous
                // l'attribution de republication.
                //
                // Il partageait la ligne du nom avec elle, et les deux se
                // disputaient la largeur : sur une carte étroite, le titre du
                // son et le handle d'origine se tronquaient l'un l'autre alors
                // que ce sont deux attributions DISTINCTES — qui a republié, et
                // à qui appartient la musique. Une ligne chacun retire la
                // concurrence au lieu d'arbitrer entre deux troncatures.
                //
                // Annonce du fond (B3.3-5), résolveur unique partagé avec le
                // viewer story et le plein écran réel (E1) —
                // `BackgroundSoundBadge` rend `EmptyView` sans piste (B3.5),
                // donc la ligne disparaît entièrement quand il n'y a pas de son.
                BackgroundSoundBadge(
                    announcement: backgroundSoundAnnouncement,
                    accentHex: backgroundSoundAccentHex
                )
                .equatable()

                // La ligne de méta qualifie le CONTENU — langues disponibles,
                // traductions, portée pour l'auteur. L'heure l'a quittée pour
                // la ligne du nom (vue `1h`) : elle qualifie l'auteur, pas le
                // post. Ce qui reste ici est masqué entièrement quand il n'y a
                // rien à dire, au lieu de laisser une ligne à un seul séparateur.
                HStack(spacing: MeeshySpacing.xs) {
                    let flags = buildAvailableFlags()
                    if !flags.isEmpty || post.translations?.isEmpty == false {

                        ForEach(flags, id: \.self) { code in
                            LanguageFlagChip(code: code, isActive: code == secondaryLangCode) {
                                handleFlagTap(code)
                            }
                        }

                        if post.translations?.isEmpty == false {
                            TranslationsBadge { showTranslationSheet = true }
                        }
                    }

                    // Reach stats (impressions · views) — visible ONLY to the
                    // post's author, after the meta row (private analytics).
                    if isAuthor {
                        MetaSeparator().font(.caption).foregroundColor(theme.textMuted)
                        // Toucher la portée ouvre « Vues » : qui a vu, et ce que
                        // chacun a fait (#9727).
                        Button { showViewersSheet = true } label: {
                            HStack(spacing: MeeshySpacing.xxs) {
                                ReachMetricLabel(
                                    icon: "chart.bar.fill",
                                    count: post.impressionCount,
                                    label: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main),
                                    tint: theme.textMuted
                                )
                                MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                                ReachMetricLabel(
                                    icon: "eye.fill",
                                    count: post.viewCount,
                                    label: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main),
                                    tint: theme.textMuted
                                )
                            }
                        }
                        .buttonStyle(GameBounceButtonStyle())
                        .accessibilityHint(String(localized: "viewer.engagement.openList.hint", defaultValue: "Ouvre la liste des personnes qui ont vu ce contenu", bundle: .main))
                    }
                }
            }

            Spacer()

            Menu {
                if let onTapPost {
                    Button {
                        onTapPost(post)
                        HapticFeedback.light()
                    } label: {
                        Label(String(localized: "feed.post.open", defaultValue: "Ouvrir", bundle: .main), systemImage: "arrow.up.right.square")
                    }
                }
                Button {
                    UIPasteboard.general.string = post.content
                    HapticFeedback.success()
                } label: {
                    Label(String(localized: "feed.post.copy_text", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
                }
                Button {
                    onShare?(post.id)
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
                }
                Button {
                    if canSaveMedia {
                        requestSaveMedia()
                    } else {
                        onBookmark?(post.id)
                        HapticFeedback.light()
                    }
                } label: {
                    Label(
                        canSaveMedia
                            ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                        systemImage: canSaveMedia ? "arrow.down.to.line" : "bookmark"
                    )
                }
                if isAuthor {
                    PublicationViewersMenuButton { showViewersSheet = true }
                }
                if onPin != nil {
                    Button {
                        onPin?(post.id)
                        HapticFeedback.light()
                    } label: {
                        Label(String(localized: "feed.post.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin")
                    }
                }
                if onEdit != nil {
                    Button {
                        onEdit?(post)
                        HapticFeedback.light()
                    } label: {
                        Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                    }
                }
                if onDelete != nil {
                    Divider()
                    Button(role: .destructive) {
                        onDelete?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                    }
                }
                if onReport != nil {
                    Divider()
                    Button(role: .destructive) {
                        onReport?(post.id)
                        HapticFeedback.medium()
                    } label: {
                        Label(String(localized: "feed.post.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(MeeshyFont.relative(MeeshyIconSize.md))
                    .foregroundColor(theme.textMuted)
                    .padding(MeeshySpacing.sm)
            }
            .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
            .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
        }
        .publicationViewersSheet(isPresented: $showViewersSheet, post: post, moodLookup: moodLookup) { viewer in
            selectedProfileUser = ProfileSheetUser(username: viewer.username)
        }
    }
}

// MARK: - Ce que le post a rapporté au lecteur « · ✦+99 » (#9571)

/// La date d'un post, suivie — très discrètement — des points que ce post a
/// rapportés au lecteur : « 2 h · ✦+99 ». Encre et corps de la date, ni
/// capsule, ni couleur, ni flamme : plus discret que la marque des
/// conversations (directive porteur 2026-10-07). Ce n'est pas un bouton.
/// Champ absent (ancien serveur, invité), `0` : la date seule.
///
/// La lecture (`seed`) est notée à chaque nouvelle valeur — la date est
/// toujours là, donc la note part même quand la marque se tait — et
/// `engagement:post-updated` fait rouler le nombre (`PostViewerPointsStore`).
struct PostDateWithPoints<DateLabel: View>: View {
    let postId: String
    let seed: Int?
    let color: Color
    @ObservedObject var store: PostViewerPointsStore = .shared
    @ViewBuilder let date: () -> DateLabel

    var body: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            date()
                .font(.caption)
                .foregroundColor(color)
            if let points = PostViewerPoints.shown(store.displayed(postId: postId, seed: seed)) {
                PostPointsMark(points: points, color: color)
                    .equatable()
            }
        }
        .task(id: seed) { store.noteRead(postId: postId, viewerPoints: seed) }
    }
}

/// « · ✦+99 » — feuille PURE, portillon `Equatable` ; le nombre roule vers sa
/// nouvelle valeur, à la hausse comme à la baisse.
struct PostPointsMark: View, Equatable {
    let points: Int
    let color: Color

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func == (lhs: PostPointsMark, rhs: PostPointsMark) -> Bool {
        lhs.points == rhs.points && lhs.color == rhs.color
    }

    var body: some View {
        HStack(spacing: 1) {
            Text(verbatim: "·")
                .padding(.trailing, 2)
            Image(systemName: "sparkle")
                .font(MeeshyFont.relative(MeeshyFont.microSize))
                .imageScale(.small)
            Text(verbatim: "+" + CompactCountLabel.text(points))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
        .font(.caption)
        .foregroundColor(color)
        .lineLimit(1)
        .fixedSize()
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: points)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityText(points))
    }

    /// « Ce post t'a rapporté 99 points ».
    static func accessibilityText(_ points: Int) -> String {
        let number = "\(points)"
        return points == 1
            ? String(localized: "feed.post.points.a11y.one",
                     defaultValue: "Ce post t'a rapporté \(number) point", bundle: .main)
            : String(localized: "feed.post.points.a11y.other",
                     defaultValue: "Ce post t'a rapporté \(number) points", bundle: .main)
    }
}
