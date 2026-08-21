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
/// - `.credit` ⇒ marquee crédit « titre · @pseudo · M:SS » — métadonnées
///   toutes `nil` (cache froid) ⇒ crédit générique « ♫ — », JAMAIS un repli
///   vers la note+onde : mentirait sur la provenance.
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

    /// Accent pour une surface posée sur un MÉDIA arbitraire (photo/vidéo/
    /// gradient de story) — jamais garanti AA contre une couleur dérivée du
    /// contenu (accent de post, couleur d'avatar). Même convention que les
    /// voisins du rail (horloge, heure de publication) : blanc à opacité
    /// fixe, pas de calcul de contraste par pixel.
    static let overMediaAccentHex = "FFFFFF"

    static func == (lhs: BackgroundSoundBadge, rhs: BackgroundSoundBadge) -> Bool {
        lhs.announcement == rhs.announcement && lhs.accentHex == rhs.accentHex
    }

    var body: some View {
        switch announcement {
        case .none:
            EmptyView()
        case .original:
            HStack(spacing: 4) {
                Image(systemName: "music.note")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundColor(Color(hex: accentHex).opacity(0.85))
                    .accessibilityLabel(String(localized: "story.viewer.a11y.backgroundAudio", defaultValue: "Audio de fond", bundle: .main))
                StoryHeaderAudioWaveform()
                    .opacity(0.85)
            }
        case .credit(let title, let username, let duration):
            AudioChipMarquee(
                text: Self.creditText(title: title, username: username, duration: duration),
                height: 14,
                fontSize: 11
            )
            .frame(width: 124)
            .opacity(0.85)
        }
    }

    /// Texte du crédit — carte STATIQUE : contrairement à la chip du reader
    /// (`AudioForegroundChip`/`AudioChipRemainingTimeText`), aucune des
    /// trois surfaces n'a de playhead de lecture continue à observer ici, le
    /// compte à rebours vivant n'a donc pas de sens pour ce badge. Réutilise
    /// les formateurs PURS du résolveur SDK
    /// (`AudioChipDisplay.formatRemaining`/`minuteDigits`) plutôt que d'en
    /// réinventer un — seul l'ASSEMBLAGE (titre · @pseudo · M:SS) est propre
    /// à cette carte. Toutes métadonnées `nil` (cache froid) ⇒ crédit
    /// générique « ♫ — », jamais un repli vers `.original`.
    static func creditText(title: String?, username: String?, duration: TimeInterval?) -> String {
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let author = username?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .drop(while: { $0 == "@" })
        let authorTag = (author?.isEmpty == false) ? "@\(author!)" : nil
        let durationText = duration.map {
            AudioChipDisplay.formatRemaining($0, minuteDigits: AudioChipDisplay.minuteDigits(forTotal: $0))
        }
        let parts = [cleanTitle?.isEmpty == false ? cleanTitle : nil, authorTag, durationText]
            .compactMap { $0 }
        return parts.isEmpty ? "♫ —" : parts.joined(separator: " · ")
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
    /// ici — même règle produit que la source de vérité SDK
    /// `StoryAudioAvailability.hasBackgroundAudioTrack`, qui exclut
    /// explicitement les notes vocales de la notion de « fond audio » que
    /// cette icône représente : une note vocale seule n'annonce rien.
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
    static func announcement(for storyEffects: StoryEffects?) -> BackgroundAudioAnnouncement {
        let backgroundEntry = storyEffects?.audioPlayerObjects?.first(where: { $0.isBackground == true })
        return AudioChipDisplay.backgroundAnnouncement(
            sound: backgroundSound(of: storyEffects),
            libraryTitle: backgroundEntry?.name,
            libraryUsername: backgroundEntry?.soundAuthorUsername,
            libraryDuration: backgroundEntry?.duration.map(TimeInterval.init)
        )
    }
}
