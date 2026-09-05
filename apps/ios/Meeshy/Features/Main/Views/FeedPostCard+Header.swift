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
        HStack(spacing: 12) {
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

            VStack(alignment: .leading, spacing: 2) {
                // Author name with repost indicator
                HStack(spacing: 6) {
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
                    Text(timeAgo(from: post.timestamp))
                        .font(.caption)
                        .foregroundColor(theme.textMuted)

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
                        HStack(spacing: 3) {
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
                HStack(spacing: 4) {
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
                        HStack(spacing: 3) {
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
                    if post.primaryReelDisplayMedia != nil {
                        requestSaveMedia()
                    } else {
                        onBookmark?(post.id)
                        HapticFeedback.light()
                    }
                } label: {
                    Label(
                        post.primaryReelDisplayMedia != nil
                            ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
                        systemImage: post.primaryReelDisplayMedia != nil ? "arrow.down.to.line" : "bookmark"
                    )
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
                    .font(MeeshyFont.relative(16))
                    .foregroundColor(theme.textMuted)
                    .padding(8)
            }
            .accessibilityLabel(String(localized: "feed.post.more_options", defaultValue: "Plus d'options", bundle: .main))
            .accessibilityHint(String(localized: "feed.post.more_options.hint", defaultValue: "Ouvre le menu des actions", bundle: .main))
        }
    }
}
