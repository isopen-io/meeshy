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
        HStack(spacing: 5) {
            if let username = reel.authorUsername, !username.isEmpty {
                Text("@\(username)").font(.caption).foregroundColor(.white.opacity(0.7))
            }
            if isAuthor {
                if reel.authorUsername?.isEmpty == false { metaDot }
                statInline(icon: "chart.bar.fill", count: reel.impressionCount,
                           a11yLabel: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main))
                metaDot
                statInline(icon: "eye.fill", count: reel.viewCount,
                           a11yLabel: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main))
            }

            // Annonce du fond (B3.3-5), résolveur unique partagé avec la
            // carte de post et le viewer story (E1) — BackgroundSoundBadge
            // rend EmptyView sans piste (B3.5). Résolue UNE fois : le bouton
            // muet (B3.6, Task E2) juste après partage la MÊME valeur — un
            // seul prédicat, jamais une seconde résolution qui pourrait
            // diverger.
            let announcement = BackgroundSoundBadge.announcement(for: reel.storyEffects)
            BackgroundSoundBadge(announcement: announcement, accentHex: accentColor)
                .equatable()

            // Muet LOCAL du fond storyEffects — distinct de l'audio NATIF du
            // réel (toujours actif, `drive()` réaffirme `manager.isMuted =
            // false`, non touché ici). Gate renforcée (correctif revue DoD,
            // BLOQUANT #1) : le bouton ne se monte QUE si un lecteur LOCAL
            // existe réellement pour le piloter (`borrowedSoundTrack`,
            // chargé dans `audioPlayer` par `startBorrowedSoundIfNeeded()`)
            // — l'annonce seule peut être vraie sans qu'aucun moteur pilotable
            // ne joue localement (ex. audio incrusté dans une vidéo). Le tap
            // pilote RÉELLEMENT `audioPlayer` (pause/reprise, position
            // conservée) — l'icône et le libellé a11y suivent
            // `audioPlayer.isPlaying`, jamais un état local séparé qui
            // pourrait diverger du son réellement audible.
            if BackgroundSoundBadge.showsMuteButton(for: announcement), borrowedSoundTrack != nil {
                Button {
                    audioPlayer.togglePlayPause()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: BackgroundSoundBadge.muteIconName(isMuted: !audioPlayer.isPlaying))
                        .font(MeeshyFont.relative(10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(audioPlayer.isPlaying
                    ? String(localized: "reels.action.mute", defaultValue: "Couper le son de fond", bundle: .main)
                    : String(localized: "reels.action.unmute", defaultValue: "Réactiver le son de fond", bundle: .main))
            }
        }
    }

    var metaDot: some View {
        MetaSeparator().font(.caption).foregroundColor(.white.opacity(0.55))
    }

    func statInline(icon: String, count: Int, a11yLabel: String) -> some View {
        ReachMetricLabel(
            icon: icon,
            count: count,
            label: a11yLabel,
            tint: .white.opacity(0.85),
            iconFont: MeeshyFont.relative(10, weight: .semibold)
        )
    }

    /// Légende du reel rendue par `MessageTextRenderer` pour teinter `@mention`
    /// et `#hashtag`. Fond TOUJOURS sombre (vidéo plein écran) : on épingle les
    /// variantes `isDark: true` plutôt que de suivre le thème de l'app — les
    /// variantes light (indigo600/800) seraient illisibles sur la vidéo.
    /// Les URLs restent blanches + soulignées (convention plein écran).
    var infoOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
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
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(.white)
                        authorMetaLine
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "reels.author.profile", defaultValue: "Profil de l'auteur", bundle: .main))
            }

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
                    // **Aucun retrait à elle** (directive porteur 2026-09-01) :
                    // la colonne d'information est déjà posée à 16 pt par
                    // `ReelsPlayerView`, et les 20 pt que la couche ajoutait
                    // indentaient la légende de 36 quand le nom de l'auteur,
                    // juste au-dessus, restait à 16. La légende s'aligne
                    // désormais sur ses voisines — la manière de la carte de
                    // réel, où légende, auteur et actions partagent UN retrait.
                    horizontalInset: 0,
                    onToggle: {
                        withAnimation(.easeInOut(duration: 0.2)) { descriptionExpanded.toggle() }
                    },
                    render: { texte, taille in
                        MessageTextRenderer.render(
                            texte,
                            fontSize: taille,
                            color: .white,
                            mentionColor: MeeshyColors.mentionColor(isDark: true),
                            hashtagColor: MeeshyColors.hashtagColor(isDark: true),
                            accentColor: .white,
                            usesRelativeFont: true
                        )
                        .tint(.white)
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
