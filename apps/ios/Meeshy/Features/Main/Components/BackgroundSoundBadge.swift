import SwiftUI
import MeeshySDK
import MeeshyUI

/// Vue commune de l'annonce du fond audio (B3.3-5) — Lot E, Task E1 :
/// « UN résolveur, TROIS surfaces » (viewer story, carte + détail post,
/// plein écran réel). Traduit l'enum PURE `BackgroundAudioAnnouncement`
/// (B5, SDK gelé) en chrome :
///
/// - `.none` ⇒ `EmptyView` — B3.5 « l'annonce n'existe que si une piste
///   existe » : jamais de placeholder.
/// - `.original` ⇒ note + onde (♫〰), SI ET SEULEMENT SI la piste est
///   ORIGINALE (B3.4) — même convention visuelle que l'ancien header du
///   reader (`note PUIS onde`, verrouillée avant E1 par
///   `StoryHeaderMetaGuardTests`, portée ici désormais).
/// - `.credit` ⇒ « ♫ titre · @pseudo » qui DÉFILE quand il dépasse (#9677) ;
///   sans titre « ♫ @pseudo · date du son » ; métadonnées toutes `nil` (cache
///   froid) ⇒ « ♫ — », JAMAIS un repli vers la note+onde : mentirait sur la
///   provenance.
///
/// **Une ligne, largeur FLEXIBLE** (#9677) : la boîte est dimensionnée par le
/// texte lui-même (masqué) — elle prend sa largeur quand il tient et cède
/// jusqu'au plus étroit quand la place manque, le crédit défilant alors dans
/// ce qui reste. Priorité de mise en page BASSE : le nom et le @pseudo voisins
/// gardent leur ligne, le crédit ne les écrase jamais, ni ne se replie.
///
/// `accentHex` : accent déterministe de la SURFACE porteuse — pour la carte
/// de post, `post.authorColor` (revue totale C8, `FeedPostCard.swift:93`),
/// le même accent qui teinte déjà `surfaceGradient`/la bordure de carte
/// (`:498`/`:501`) ; sur carte CLAIRE, l'appelant retombe sur l'indigo AA
/// déjà utilisé par les mentions/hashtags du corps (`mentionTint`) plutôt
/// que l'accent brut du post, qui peut échouer AA sur fond blanc.
///
/// Feuille de liste (montée dans `FeedPostCard`, `ReelsPlayerView`, le
/// header de story reconstruit à 60 Hz) : `Equatable` manuel pour
/// `.equatable()` au site de montage.
struct BackgroundSoundBadge: View, Equatable {
    let announcement: BackgroundAudioAnnouncement
    let accentHex: String
    /// Le son de fond est-il COUPÉ ? La note se barre, le crédit se fige — la
    /// note EST le contrôle (directive porteur 2026-10-08, #9677).
    let isMuted: Bool

    /// Le crédit suit la taille de texte choisie, plafonnée : en très grande
    /// police, ce sont les hôtes qui le passent SOUS le nom.
    @ScaledMetric(relativeTo: .caption2) private var creditFontSize: CGFloat = 11

    init(announcement: BackgroundAudioAnnouncement, accentHex: String, isMuted: Bool = false) {
        self.announcement = announcement
        self.accentHex = accentHex
        self.isMuted = isMuted
    }

    /// Accent pour une surface posée sur un MÉDIA arbitraire (photo/vidéo/
    /// gradient de story) — jamais garanti AA contre une couleur dérivée du
    /// contenu (accent de post, couleur d'avatar). Même convention que les
    /// voisins du rail (horloge, heure de publication) : blanc à opacité
    /// fixe, pas de calcul de contraste par pixel.
    static let overMediaAccentHex = "FFFFFF"

    /// **La teinte que CHAQUE branche sert : l'accent que l'hôte déclare.**
    ///
    /// Existe pour être interrogeable, parce que le défaut ne se voyait dans
    /// aucune couleur écrite ici. `FeedPostCard.backgroundSoundAccentHex` porte
    /// la garde AA (`isDark ? accent : indigo600`) et la PASSE ; la branche
    /// `.original` la consultait, la branche `.credit` la laissait tomber en
    /// déléguant à `AudioChipMarquee`, dont le blanc en dur est juste sur un
    /// média et faux sur une carte thémée. Mesuré en mode clair : **1,03:1**.
    ///
    /// > Une garde calculée, passée, et consultée par UNE branche sur deux ne
    /// > garde qu'une branche — et la branche qui la rate ne rougit nulle part,
    /// > puisqu'elle rend une couleur parfaitement valide.
    ///
    /// `nil` ⇒ aucune ligne à peindre (`.none` ne rend rien).
    nonisolated static func servedTintHex(for announcement: BackgroundAudioAnnouncement,
                                          accentHex: String) -> String? {
        switch announcement {
        case .none: return nil
        case .original, .credit: return accentHex
        }
    }

    static func == (lhs: BackgroundSoundBadge, rhs: BackgroundSoundBadge) -> Bool {
        lhs.announcement == rhs.announcement && lhs.accentHex == rhs.accentHex
            && lhs.isMuted == rhs.isMuted
    }

    var body: some View {
        switch announcement {
        case .none:
            EmptyView()
        case .original:
            HStack(spacing: MeeshySpacing.xs) {
                BackgroundSoundNote(isMuted: isMuted,
                                    font: MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold),
                                    tint: Color(hex: accentHex).opacity(MeeshyOpacity.intense))
                    .accessibilityLabel(String(localized: "story.viewer.a11y.backgroundAudio", defaultValue: "Audio de fond", bundle: .main))
                StoryHeaderAudioWaveform(paused: isMuted)
                    .opacity(isMuted ? MeeshyOpacity.strong : MeeshyOpacity.intense)
            }
        case .credit(let title, let username, _, let releasedAt):
            let text = Self.creditText(title: title, username: username, releasedAt: releasedAt)
            let tint = Color(hex: Self.servedTintHex(for: announcement, accentHex: accentHex) ?? accentHex)
            // La taille SUIT Dynamic Type (`@ScaledMetric`) ; elle s'écrit en
            // points parce que le texte masqué doit avoir EXACTEMENT la police
            // du défilant qu'il dimensionne.
            let fontSize = min(creditFontSize, 18)
            let creditFont = Font.system(size: fontSize, weight: .semibold)
            let height = ceil(fontSize * 1.3)
            HStack(spacing: MeeshySpacing.xxs) {
                BackgroundSoundNote(isMuted: isMuted, font: creditFont, tint: tint)
                Text(text)
                    .font(creditFont)
                    .lineLimit(1)
                    .frame(height: height)
                    .hidden()
                    .overlay(
                        AudioChipMarquee(text: text, paused: isMuted, height: height,
                                         fontSize: fontSize, tint: tint)
                    )
            }
            .opacity(MeeshyOpacity.intense)
            .layoutPriority(-1)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.creditAccessibilityLabel(text))
        }
    }

    /// VoiceOver lit la nature de la piste, puis son crédit — et la seule
    /// nature quand le crédit est inconnu (« — » ne se prononce pas).
    static func creditAccessibilityLabel(_ text: String) -> String {
        let track = String(localized: "story.viewer.a11y.backgroundAudio", defaultValue: "Audio de fond", bundle: .main)
        return text == unknownCreditText ? track : "\(track) · \(text)"
    }

    /// Ce que VoiceOver dit du son : « Audio de fond · titre · @auteur », ou
    /// « Audio de fond » pour l'original et le crédit inconnu.
    static func spokenDescription(of announcement: BackgroundAudioAnnouncement) -> String {
        switch announcement {
        case .none: return ""
        case .original: return creditAccessibilityLabel(unknownCreditText)
        case .credit(let title, let username, _, let releasedAt):
            return creditAccessibilityLabel(creditText(title: title, username: username, releasedAt: releasedAt))
        }
    }

    /// Ce qui suit la note quand rien du son n'est connu : « ♫ — ».
    static let unknownCreditText = "—"

    /// Texte du crédit, APRÈS la note (#9677) — la forme UNIQUE du SDK
    /// (`AudioChipDisplay.creditLine`), partagée avec la puce du lecteur :
    /// « titre · @pseudo », sinon « @pseudo · date du son », sinon « — ».
    /// Plus de durée : la jumelle web (#9678) ne la dit pas, et un crédit
    /// d'œuvre n'est pas un compteur.
    static func creditText(title: String?,
                           username: String?,
                           releasedAt: Date?,
                           locale: Locale = .current,
                           timeZone: TimeZone = .current) -> String {
        AudioChipDisplay.creditLine(title: title, username: username, releasedAt: releasedAt,
                                    locale: locale, timeZone: timeZone) ?? unknownCreditText
    }
}

extension BackgroundSoundBadge {
    /// Provenance (B3.4) à partir des `StoryEffects` d'un POST ou d'une
    /// STORY — miroir app-side EXACT du convertisseur §C2 :
    ///
    /// 1. v3 ⇒ `storyEffects.canvasV3?.sound` (déjà bridgé en runtime, B7) ;
    /// 2. sinon la forme MODERNE dominante en production — un
    ///    `audioPlayerObjects` avec `isBackground == true` (posé par le
    ///    timeline editor ET par un son EMPRUNTÉ à la bibliothèque,
    ///    `BorrowedSoundPost.effects(for:)`/`StoryComposerViewModel
    ///    .addBorrowedSound`) — `soundId` posé ⇒ bibliothèque, absent ⇒
    ///    piste propre ORIGINALE. Fonder l'existence sur ce CHAMP D'OBJET
    ///    plutôt que sur `backgroundAudioId` seul est ce qui manquait :
    ///    c'est la forme que `resolvedBackgroundAudio` (SDK,
    ///    `StoryModels.swift`) consulte EN PREMIER ;
    /// 3. sinon le legacy pur v1 (aucun `audioPlayerObjects`) :
    ///    `backgroundAudioId` ⇒ bibliothèque — miroir de
    ///    `CanvasV3Migration.swift:323-330`/`restoreSound:577`, où ce même
    ///    champ ne reçoit QUE des soundId de bibliothèque à la
    ///    reconversion v3→legacy.
    ///
    /// `voiceAttachmentId` (note vocale) N'EST PAS un signal d'existence
    /// ici : une note vocale seule n'est pas un « fond audio » au sens que
    /// cette icône représente, donc elle n'annonce rien.
    ///
    /// Écrit UNE fois, appelé par les trois surfaces de lecture via
    /// `announcement(for:)` ci-dessous.
    static func backgroundSound(of storyEffects: StoryEffects?) -> BackgroundSoundV3? {
        guard let storyEffects else { return nil }
        if let sound = storyEffects.canvasV3?.sound { return sound }
        if let entry = storyEffects.audioPlayerObjects?.first(where: { $0.isBackground == true }) {
            if let soundId = entry.soundId, !soundId.isEmpty {
                return BackgroundSoundV3(source: .library(soundId: soundId), volume: 1)
            }
            return BackgroundSoundV3(source: .original, volume: 1)
        }
        if let soundId = storyEffects.backgroundAudioId, !soundId.isEmpty {
            return BackgroundSoundV3(source: .library(soundId: soundId), volume: 1)
        }
        return nil
    }

    /// Annonce complète (B5) : provenance ci-dessus + métadonnées de
    /// bibliothèque portées par l'entrée FOND des chips — MÊMES champs que
    /// le viewer story lisait déjà avant cette migration
    /// (`bg.name`/`bg.soundAuthorUsername`/`bg.duration`), réutilisés ici,
    /// rien d'inventé. Point d'entrée UNIQUE : les trois surfaces de
    /// lecture appellent CETTE fonction, jamais
    /// `AudioChipDisplay.backgroundAnnouncement(` directement — « un
    /// résolveur, trois surfaces ».
    /// **L'ENTRÉE de fond elle-même — la trace, pas son annonce** (#5602).
    ///
    /// `announcement(for:)` en tire trois chaînes ; la trace de la fiche détail
    /// a besoin de l'OBJET, qui porte en plus `waveformSamples` — le relevé que
    /// le spectre dessine, et dont l'absence commande la sinusoïde de repli.
    ///
    /// Site UNIQUE de la question « quelle entrée est le fond ? », partagé avec
    /// l'annonce : deux `first(where:)` écrits côte à côte finissent par
    /// diverger sur le jour où le prédicat change.
    static func backgroundTrace(of storyEffects: StoryEffects?) -> StoryAudioPlayerObject? {
        storyEffects?.audioPlayerObjects?.first(where: { $0.isBackground == true })
    }

    static func announcement(for storyEffects: StoryEffects?) -> BackgroundAudioAnnouncement {
        let backgroundEntry = backgroundTrace(of: storyEffects)
        return AudioChipDisplay.backgroundAnnouncement(
            sound: backgroundSound(of: storyEffects),
            libraryTitle: backgroundEntry?.name,
            libraryUsername: backgroundEntry?.soundAuthorUsername,
            libraryDuration: backgroundEntry?.duration.map(TimeInterval.init),
            libraryReleasedAt: backgroundEntry?.soundReleaseDate
        )
    }

    /// **L'annonce d'un POST** (#9677) : celle des effets qu'il JOUE — les
    /// siens, ou ceux de la story qu'il republie quand l'enveloppe est vide
    /// (`FeedPost.playedStoryEffects`, le repli que le lecteur et le détail
    /// appliquent déjà). Sans lui, la carte d'une story republiée se taisait
    /// pendant que son embed jouait le son de la source.
    static func announcement(for post: FeedPost) -> BackgroundAudioAnnouncement {
        announcement(for: post.playedStoryEffects)
    }

    /// B3.6 — Lot E, Task E2 : le bouton 🔇 existe SI ET SEULEMENT SI une
    /// piste existe — LE MÊME prédicat que l'annonce elle-même (B3.5),
    /// jamais une seconde condition d'existence recopiée localement qui
    /// pourrait diverger. Les surfaces qui montent un bouton muet appellent
    /// CE booléen sur l'annonce qu'elles ont déjà résolue pour leur badge
    /// (`announcement(for:)` ci-dessus) — jamais un `!= .none` recopié à la
    /// main sur un `StoryEffects?` séparé.
    static func showsMuteButton(for announcement: BackgroundAudioAnnouncement) -> Bool {
        announcement != .none
    }

    /// Icône du bouton muet — B3.6, « l'icône dit l'état » : SEUL l'état
    /// local de la surface décide, jamais la provenance/l'annonce. Même
    /// convention que `VideoTransportControls.muteButton` (SDK, plein écran
    /// post) et le rail muet du viewer story (`StoryViewerView+Sidebar`) —
    /// un seul jeu d'icônes, jamais une variante par surface.
    static func muteIconName(isMuted: Bool) -> String {
        isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill"
    }

    /// B3.6, correctif revue DoD (rejet du commit 1721a0ee2, constat majeur
    /// #3) — porte du bouton muet du DÉTAIL (`PostDetailView`) : DOIT
    /// coïncider avec le canvas RÉELLEMENT rendu par `postDetailContent`
    /// (`storyCanvasSection` pour une story avec contenu, `repostEmbed` pour
    /// une story-repost), jamais résolue séparément sur
    /// `StoryItem(feedPost:).storyEffects` seul — cette dernière valeur
    /// reste non-nil pour un post NON-story portant son PROPRE fond audio
    /// (son emprunté, forme dominante E1, `BorrowedSoundPost.effects(for:)`)
    /// alors qu'AUCUN canvas ne rend nulle part pour ce post : le bouton
    /// serait monté, le tap ne piloterait rien.
    ///
    /// `renderedItem` est la MÊME valeur `StoryItem(feedPost: post)` que
    /// l'appelant a déjà construite pour son propre rendu (correctif revue
    /// mineur #8) — jamais une seconde conversion ici.
    /// **Vue `2h` (#4086) — une règle, trois consommateurs.**
    ///
    /// Cette porte s'écrivait en deux branches qui REDISAIENT, chacune à sa
    /// façon, ce que deux sites de rendu décidaient déjà. La branche
    /// republication ne demandait que le TYPE : elle répondait donc `true`
    /// pour une story republiée dont la source est expirée ou sans asset —
    /// et elle avait raison, puisque `repostEmbed` rendait dans ce cas un
    /// canvas NOIR là où une story native affiche « Story indisponible ».
    /// La porte était cohérente avec le rendu fautif, jamais avec la règle.
    ///
    /// `canvasHasContent` est désormais la règle, et les trois sites la
    /// consultent : le placeholder natif en est la négation, le placeholder
    /// du repost aussi (il n'existait pas), et cette porte l'exige en plus du
    /// fait qu'il s'agisse bien d'un post À CANVAS.
    ///
    /// Ce second facteur reste indispensable : `renderedItem.storyEffects`
    /// est non-nil pour un post NON-story portant son PROPRE fond audio (son
    /// emprunté, forme dominante E1, `BorrowedSoundPost.effects(for:)`) alors
    /// qu'aucun canvas ne rend nulle part — le bouton serait monté, le tap ne
    /// piloterait rien.
    ///
    /// `renderedItem` est la MÊME valeur `StoryItem(feedPost: post)` que
    /// l'appelant a déjà construite pour son propre rendu (correctif revue
    /// mineur #8) — jamais une seconde conversion ici.
    static func detailCanvasIsRendered(post: FeedPost, renderedItem: StoryItem) -> Bool {
        isCanvasPost(post) && canvasHasContent(renderedItem)
    }

    /// **Ce post rend-il SON PROPRE canvas, en ligne ?**
    ///
    /// Deux façons d'en porter un, et la seconde a été ajoutée le 2026-09-06
    /// sur un constat porteur : « la vue détail ne montre pas la scène sans
    /// média intégré… pourtant en feed on voit bien la scène ».
    ///
    /// Le fil et le détail ne posaient pas la même question :
    ///
    /// | | ce qu'il demandait |
    /// |---|---|
    /// | fil (`FeedPostCard.cardSceneDocument`) | `post.storyEffects?.canvasV3 != nil` |
    /// | détail (`postDetailContent`) | `post.isStory` |
    ///
    /// Or un POST porte désormais une scène — mesuré sur le fil de production :
    /// des lignes `type: POST` avec `storyEffects` de forme v3 (`scenes`, `v`).
    /// Le fil les peignait, le détail rendait un écran VIDE : ni canvas, ni
    /// média, ni même le repli « Story indisponible », puisque la section
    /// n'était pas appelée du tout.
    ///
    /// > **Un `isStory` employé comme « porte-t-il une scène ? » était juste
    /// > tant que seules les stories en portaient.** Ce n'est plus une
    /// > question de TYPE mais de CONTENU, et le type ne rougit pas quand le
    /// > contenu déménage.
    ///
    /// **Et le discriminant est `canvasV3`, jamais `storyEffects` seul** —
    /// c'est ce que dit déjà `detailCanvasIsRendered` ci-dessus : un post
    /// NON-story portant son propre fond audio emprunté
    /// (`BorrowedSoundPost.effects(for:)`) a des `storyEffects` non-nil sans
    /// qu'aucun canvas ne rende nulle part. Le fil interroge `canvasV3` pour
    /// cette raison ; le détail le fait maintenant aussi, avec le MÊME champ.
    static func rendersOwnCanvas(_ post: FeedPost) -> Bool {
        post.isStory || post.storyEffects?.canvasV3 != nil
    }

    /// Ce post rend-il un canvas, par sa NATURE ou par son CONTENU ? Son
    /// propre canvas (`rendersOwnCanvas`), ou celui d'une story republiée que
    /// `repostEmbed` rend à sa place.
    ///
    /// C'est l'UNION des deux sites qui rendent un canvas dans le détail, et
    /// c'est pourquoi la porte du bouton muet la consulte : le bouton doit
    /// paraître dès qu'un canvas est peint, peu importe lequel des deux
    /// chemins l'a peint. La règle du fichier — « la porte du bouton est le
    /// même prédicat que celui du rendu » — se lit ici comme une union, pas
    /// comme une égalité avec un seul rendu.
    static func isCanvasPost(_ post: FeedPost) -> Bool {
        rendersOwnCanvas(post) || (post.repost?.type ?? "").uppercased() == "STORY"
    }

    /// **Y a-t-il quelque chose à rendre ?** La règle UNIQUE dont
    /// « Story indisponible » est exactement la négation.
    ///
    /// Elle se lit sur `StoryItem(feedPost:)`, qui retombe déjà sur la SOURCE
    /// d'une republication (`hasOwnContent`, `FeedModels.swift`) : c'est ce
    /// qui rend un prédicat unique JUSTE pour les deux chemins, et pas
    /// seulement commode.
    static func canvasHasContent(_ item: StoryItem) -> Bool {
        item.storyEffects != nil || !item.media.isEmpty
    }
}

// MARK: - La note qui se barre, et la note qui COUPE (#9677)

/// **La note du son de fond, barrée quand il est coupé.** Aucun glyphe système
/// ne barre une note : la barre oblique est tracée par-dessus, à la couleur de
/// la note, comme le `speaker.slash` qu'elle remplace.
struct BackgroundSoundNote: View {
    let isMuted: Bool
    let font: Font
    let tint: Color

    var body: some View {
        Image(systemName: "music.note")
            .font(font)
            .foregroundColor(tint)
            .overlay(
                GeometryReader { geo in
                    Capsule()
                        .fill(tint)
                        .frame(width: max(1.5, geo.size.width * 0.14),
                               height: hypot(geo.size.width, geo.size.height))
                        .rotationEffect(.degrees(-45))
                        .position(x: geo.size.width / 2, y: geo.size.height / 2)
                }
                .opacity(isMuted ? 1 : 0)
            )
    }
}

/// **Le crédit du son de fond EST le contrôle de ce son** (directive porteur
/// 2026-10-08) : plus de baffle à côté — un toucher sur la note (ou la
/// sinusoïde) coupe le fond et barre la note, un second le rétablit.
///
/// L'état ne vit pas ici : c'est celui que la surface tenait déjà pour son
/// baffle (`sceneSoundMuted` du réel composé, le lecteur du son emprunté,
/// `isCanvasMuted` du détail, `isGlobalMuted` du lecteur de story) — un seul
/// état par son, jamais un double.
struct BackgroundSoundMuteControl: View {
    let announcement: BackgroundAudioAnnouncement
    let accentHex: String
    let isMuted: Bool
    let onToggle: () -> Void

    /// Ce que VoiceOver annonce : l'ACTION que le toucher fait.
    static func accessibilityLabel(isMuted: Bool) -> String {
        isMuted
            ? String(localized: "reels.action.unmute", defaultValue: "Réactiver le son de fond", bundle: .main)
            : String(localized: "reels.action.mute", defaultValue: "Couper le son de fond", bundle: .main)
    }

    /// L'ÉTAT du son, en valeur — « Muet » ou « Son ».
    static func accessibilityValue(isMuted: Bool) -> String {
        isMuted
            ? String(localized: "story.viewer.action.mute", defaultValue: "Muet", bundle: .main)
            : String(localized: "story.viewer.action.sound", defaultValue: "Son", bundle: .main)
    }

    var body: some View {
        if BackgroundSoundBadge.showsMuteButton(for: announcement) {
            Button {
                HapticFeedback.light()
                onToggle()
            } label: {
                BackgroundSoundBadge(announcement: announcement, accentHex: accentHex, isMuted: isMuted)
                    .equatable()
                    .frame(minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.accessibilityLabel(isMuted: isMuted))
            .accessibilityValue(Self.accessibilityValue(isMuted: isMuted))
            .accessibilityHint(BackgroundSoundBadge.spokenDescription(of: announcement))
            .accessibilityAddTraits(.isButton)
        }
    }
}
