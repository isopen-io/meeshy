import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La couche d'information du lecteur de réel — vue `2g` du document composer.**
///
/// Extraite de `ReelsPlayerView.swift` (#4484) — elle appartient à `ReelPageView`,
/// la page d'un réel, et non à l'hôte `ReelsPlayerView` qui les empile : le fichier portait 2140 lignes,
/// très au-delà du budget 800–1100, et la loi 4 de `BOUCLE.md` interdit
/// d'ajouter à un fichier hors budget — « extraire d'abord, ajouter ensuite ».
/// L'overlay d'info est une responsabilité entière : l'identité de l'auteur, sa
/// ligne de méta, la légende, le lieu, la rangée de langues, l'annonce du son de
/// fond et son muet.
///
/// Ce que la vue `2g` établit, et que cette couche porte :
///
/// > « Deux sons, un seul bouton. Le 🔇 du rail ne pilote que la piste de fond
/// > empruntée ; l'audio natif du réel reste actif par design, et le bouton ne
/// > se monte que s'il existe réellement un lecteur local à piloter. »
extension ReelPageView {

    var authorMetaLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if let username = reel.authorUsername, !username.isEmpty {
                Text("@\(username)")
                    .font(MeeshyFont.relative(MeeshyFont.smallSize))
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
            if isAuthor {
                if reel.authorUsername?.isEmpty == false { metaDot }
                statInline(icon: "chart.bar.fill", count: reel.impressionCount,
                           a11yLabel: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                metaDot
                statInline(icon: "eye.fill", count: reel.viewCount,
                           a11yLabel: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main))
            }
        }
    }

    /// **Le son de fond du réel, sur SA ligne** (#9677, directive porteur
    /// 2026-10-08) — sous la rangée de l'auteur, toute la largeur du bloc
    /// d'infos, comme le crédit du lecteur de story. Partagé avec le @pseudo,
    /// les compteurs et le baffle, il n'avait que ≈ 40 pt (recette 402 pt).
    ///
    /// Hors du bouton du profil, et c'est la NOTE qui coupe le son : plus de
    /// baffle. L'état est celui qui joue vraiment — le muet du PLAYER pour un
    /// réel composé (#6745), le lecteur du son emprunté sinon. Sans moteur local
    /// à piloter (son incrusté dans la vidéo), le crédit s'annonce sans contrôle.
    /// La piste PROPRE d'une vidéo n'est pas touchée : elle joue toujours
    /// (`drive()` réaffirme `manager.isMuted = false`).
    @ViewBuilder
    var soundCreditRow: some View {
        let announcement = BackgroundSoundBadge.announcement(for: reel.storyEffects)
        if BackgroundSoundBadge.showsMuteButton(for: announcement) {
            Group {
                if isSceneReel {
                    BackgroundSoundMuteControl(announcement: announcement,
                                               accentHex: BackgroundSoundBadge.overMediaAccentHex,
                                               isMuted: sceneSoundMuted) { sceneSoundMuted.toggle() }
                } else if borrowedSoundTrack != nil {
                    ReelBorrowedSoundCredit(audioPlayer: audioPlayer, announcement: announcement)
                } else {
                    BackgroundSoundBadge(announcement: announcement,
                                         accentHex: BackgroundSoundBadge.overMediaAccentHex)
                        .equatable()
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .mediaChromeLegible()
        }
    }

    var metaDot: some View {
        MetaSeparator().font(MeeshyFont.relative(MeeshyFont.smallSize)).foregroundColor(.white.opacity(0.55))
    }

    func statInline(icon: String, count: Int, a11yLabel: String) -> some View {
        ReachMetricLabel(
            icon: icon,
            count: count,
            label: a11yLabel,
            tint: MeeshyColors.mediaChromeSecondary,
            iconFont: MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold)
        )
    }

    /// Légende du reel rendue par `MessageTextRenderer` pour teinter `@mention`
    /// et `#hashtag`. Fond TOUJOURS sombre (vidéo plein écran) : on épingle les
    /// variantes `isDark: true` plutôt que de suivre le thème de l'app — les
    /// variantes light (indigo600/800) seraient illisibles sur la vidéo.
    /// Les URLs restent blanches + soulignées (convention plein écran).
    var infoOverlay: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.smPlus) {
                // Avatar tap → author's story (if active) else profile.
                Button(action: onTapAvatar) {
                    MeeshyAvatar(
                        name: reel.author,
                        context: .postAuthor,
                        accentColor: accentColor,
                        avatarURL: reel.authorAvatarURL
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.avatar", defaultValue: "Story de l'auteur", bundle: .main))

                // Name tap → author profile.
                Button(action: onTapAuthorName) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(reel.author)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                            .foregroundColor(MeeshyColors.mediaChromeForeground)
                        authorMetaLine
                    }
                    // #6693 — sur un réel clair, le nom blanc passait sans voile sur les
                    // bandes jaune et verte : il reçoit l'ombre de la légende quand la loi
                    // dit le fond clair.
                    .mediaChromeLegible()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.profile", defaultValue: "Profil de l'auteur", bundle: .main))
            }

            soundCreditRow

            // Audio reels show the post caption only when it adds something
            // beyond the transcript hero; text/image reels always show it.
            // Collapsed: 3 lines + tap to expand. Expanded: a height-bounded
            // ScrollView so a long caption stays fully readable AND scrollable
            // instead of overflowing off the top of the screen (the previous
            // `lineLimit(nil)` + `fixedSize` grew unbounded and clipped).
            // #4484 — la légende du réel rejoint la couche PARTAGÉE.
            //
            // Trois surfaces repliaient la même chose de trois façons : la
            // story par `MediaCaptionOverlay` (#4474), ce lecteur par
            // `lineLimit(3)` puis un dépliage plafonné à 240 pt, la carte de
            // feed par `lineLimit(2)`. Une même légende montrait donc un
            // nombre de mots différent selon l'écran où on la lisait.
            //
            // Ce qui passe au composant est la RÈGLE — 15 mots de tête au-delà
            // de 30, l'invite, l'ancrage bas-gauche déplié, le scrim. Le RENDU
            // reste ici : `MessageTextRenderer` colore et rend cliquables les
            // mentions et les hashtags, que la cible `2g` dessine
            // explicitement (« … personne. #nord »). Un composant qui rendrait
            // le texte lui-même les ferait disparaître — décision écrite dans
            // #4484 avant d'être codée, conformément à la loi 2 de `BOUCLE.md`.
            //
            // La carte de feed n'est PAS visée : dans une liste défilante, une
            // carte parmi beaucoup ne se déplie pas en plein écran.
            if audioMedia == nil, !displayedDescription.isEmpty {
                MediaCaptionOverlay(
                    caption: displayedDescription,
                    isExpanded: descriptionExpanded,
                    // #9075 — les adresses de la légende s'ouvrent par `/l/`.
                    trackedLinks: reel.trackedLinkMap,
                    validUsernames: reel.validMentionUsernames,
                    // **Aucun retrait à elle** (directive porteur 2026-09-01) :
                    // la colonne d'information est déjà posée à 16 pt par
                    // `ReelsPlayerView`, et les 20 pt que la couche ajoutait
                    // indentaient la légende de 36 quand le nom de l'auteur,
                    // juste au-dessus, restait à 16. La légende s'aligne
                    // désormais sur ses voisines — la manière de la carte de
                    // réel, où légende, auteur et actions partagent UN retrait.
                    horizontalInset: 0,
                    // **Aucun voile sous le corpus déplié** (directive porteur
                    // 2026-09-03, capture à l'appui : « il faut enlever le fond
                    // noir »).
                    //
                    // Le défaut du composant est `true`, et l'OMETTRE
                    // repeindrait le dégradé en silence — d'où la valeur posée
                    // explicitement plutôt que retirée du composant partagé : le
                    // plein écran média d'une conversation n'est pas visé et
                    // garde le sien.
                    //
                    // La raison qui l'avait gardé ici — « le réel ne peint qu'un
                    // voile de BAS DE PAGE, presque transparent là où un corpus
                    // déplié monte » — décrivait un risque de LISIBILITÉ. Il est
                    // couvert ailleurs : le corpus passe par
                    // `legibleOverCanvas()`, deux ombres portées qui tiennent
                    // déjà la légende de la story sans voile depuis le
                    // 2026-09-02. Le réel hérite d'une propriété éprouvée sur un
                    // hôte jumeau, pas d'un pari.
                    dimsBackgroundWhenExpanded: false,
                    onToggle: {
                        withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                    }
                )
            }

            // Indicateur de position type sticker (constat user 2026-07-30) —
            // même pill que la story/le feed, cliquable → carte plein écran.
            if let place = reel.location {
                FeedPostLocationSticker(place: place) {
                    reelFullscreenPlace = BubbleFullscreenPlace(place: place)
                }
            }

            // Prisme Linguistique — meta row mirroring the message-bubble footer:
            // timestamp, then the translate toggle, then the available-language
            // flag pills (tap a flag to read that language; the active one is
            // underlined). Inline next to the date, as in conversation bubbles.
            // For an AUDIO reel the flags switch the AUDIO (transcript + TTS) —
            // the original transcription language + every translated-audio target
            // language — instead of the post-body text. For text/image reels they
            // switch the post-body translation.
            ReelMetaRow(
                timestamp: RelativeTimeFormatter.shortString(for: reel.timestamp),
                originalLanguage: metaOriginalLanguage,
                translationLanguages: metaTranslationLanguages,
                selectedLanguage: selectedLanguage,
                onSelectLanguage: { code in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedLanguage = (selectedLanguage?.lowercased() == code.lowercased()) ? nil : code
                    }
                }
            )
        }
        .shadow(color: .black.opacity(0.4), radius: 4, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Le crédit du son emprunté, qui le coupe : la seule vue de la page qui LIT
/// `isPlaying`, donc la seule qui observe le moteur — la page, elle, ne se
/// ré-évalue plus à chaque battement de `currentTime`.
struct ReelBorrowedSoundCredit: View {
    @ObservedObject var audioPlayer: AudioPlaybackManager
    let announcement: BackgroundAudioAnnouncement

    var body: some View {
        BackgroundSoundMuteControl(announcement: announcement,
                                   accentHex: BackgroundSoundBadge.overMediaAccentHex,
                                   isMuted: !audioPlayer.isPlaying) {
            audioPlayer.togglePlayPause()
        }
    }
}
