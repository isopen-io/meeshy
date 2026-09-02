import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView header
//
// Extrait de `StoryViewerView+Sidebar.swift` (#4084, vue `2f`) : ce fichier
// portait DEUX vues entières — le rail d'actions et l'en-tête — pour
// 1 368 lignes, bien au-delà du budget de 800–1100. La loi 4 de `BOUCLE.md`
// est nette : « un fichier hors budget se découpe par responsabilité AVANT
// qu'une vue lui ajoute quoi que ce soit ». L'en-tête est une responsabilité
// entière : l'identité de l'auteur, l'heure de publication, l'attribution de
// republication, le crédit du son de fond, le menu d'options et la fermeture.
//
// Ce que la vue `2f` établit, et que cet en-tête porte :
//
// > « Le crédit du son est dans l'en-tête, le muet dans le rail. Le muet reste
// > local à la surface : le couper ici ne coupe rien dans le fil, et l'annonce
// > ne disparaît jamais parce qu'on a coupé le son. »

// MARK: - Story Header

/// Top header bar of the story viewer: author avatar + name + timestamp,
/// the kebab options menu, and the close button. Extracted from
/// `StoryViewerView.storyHeader` (formerly an `AnyView`).
struct StoryHeaderView: View {
    let currentGroup: StoryGroup?
    let currentStory: StoryItem?
    let isOwnStory: Bool
    /// Annonce du fond (B3.3-5), résolue par le parent — primitive
    /// Equatable descendue en `let` (règle « Zero Unnecessary Re-render »).
    /// Remplace `hasBackgroundAudio` + `headerAudioDisplay` (E1) : un seul
    /// résolveur partagé avec la carte de post et le plein écran réel,
    /// `BackgroundSoundBadge.announcement(for:)`.
    let backgroundSoundAnnouncement: BackgroundAudioAnnouncement
    /// La story porte-t-elle une transcription affichable ? Primitive, même
    /// règle : le header ne consulte pas les `StoryEffects` lui-même.
    let hasAudioTranscript: Bool
    /// Bascule d'affichage de la transcription, pilotée depuis le menu « … ».
    @Binding var showAudioTranscript: Bool

    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
    @Binding var showReportSheet: Bool

    /// Holds the freshly-minted `meeshy.me/l/<token>` URL for the current
    /// story share — the sheet at the end of `body` presents the system
    /// share UI as soon as it's non-nil and clears it on dismiss.
    @State private var shareableStoryLink: ShareableLink?

    /// Mints a TrackingLink for the given story (gateway route is shared
    /// with posts — a story IS a `PostType.STORY`), then surfaces the
    /// `meeshy.me/l/<token>` URL through `shareableStoryLink` so the
    /// system share sheet picks it up. Falls back to the raw URL when the
    /// mint fails so the user always has something to share.
    @MainActor
    private func mintAndShareStory(_ storyId: String) async {
        let fallback = makeStoryExternalShareURL(storyId)
        do {
            let result = try await PostService.shared.share(
                postId: storyId,
                platform: "system",
                generateLink: true
            )
            if let shortUrl = result.shortUrl, let url = URL(string: shortUrl) {
                shareableStoryLink = ShareableLink(url: url)
                HapticFeedback.light()
                return
            }
        } catch {
            // intentional fall-through: try raw URL fallback
        }
        if let fallback {
            shareableStoryLink = ShareableLink(url: fallback)
            HapticFeedback.light()
        } else {
            FeedbackToastManager.shared.showError(
                String(localized: "story.viewer.share.link.unavailable", defaultValue: "Lien indisponible", bundle: .main))
        }
    }

    /// Partage INTERNE (vers une conversation ou un contact) — troisième forme
    /// du menu (...) demandée le 2026-08-19, aux côtés de « Republier en post »
    /// et « Citer en post ». La même feuille que le bouton « Envoyer » du rail,
    /// qui reste en place : le menu regroupe les trois formes de partage, il ne
    /// retire pas l'affordance directe.
    @Binding var sharedContentWrapper: SharedContentWrapper?

    let makeStoryExternalShareURL: (String) -> URL?
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let pauseTimer: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    /// Toggle mode plein écran (session-scoped) exposé dans le menu hamburger.
    /// Quand `true`, le chrome est caché par défaut pour la session entière
    /// jusqu'au prochain toggle. Reseté par le parent quand le viewer se
    /// ferme — pas de persistance cross-session voulue.
    @Binding var isFullscreenStorySession: Bool
    /// Visibilité courante du chrome — utilisée pour synchroniser
    /// instantanément le glissement à l'activation du mode plein écran
    /// (`isFullscreenStorySession = true` ⇒ `chromeVisible = false`).
    @Binding var chromeVisible: Bool

    @State private var avatarLongPressGlow = false
    /// Cache du label VoiceOver du bouton profil auteur — recalculé
    /// UNIQUEMENT au changement de slide (`.onChange(of: currentStory?.id)`),
    /// jamais inline dans `body`. `StoryHeaderView` est reconstruit à chaque
    /// tick de la barre de progression (jusqu'à 60 Hz, cf.
    /// `StoryViewerView.storyCard(geometry:)`) — sans ce cache, `String
    /// (format:)` + plusieurs `String(localized:)` s'exécutaient des
    /// dizaines de fois par seconde pour un contenu inchangé (post-revue
    /// 2026-07-13, angle optimisation).
    @State private var cachedProfileLabel: String = ""

    /// Stickers IMAGE de la slide courante, copiables dans « Mes stickers ».
    /// Caché pour la MÊME raison que `cachedProfileLabel` : le header est
    /// reconstruit à chaque tick de la barre de progression, et le contenu
    /// d'un `Menu` est construit avec lui.
    @State private var savableStickers: [StoryStickerLibrary.Savable] = []

    /// Label VoiceOver du bouton profil auteur — inclut l'attribution de
    /// republication (icône + @handle visuels que ce label unique remplace).
    private func computeProfileLabel(for group: StoryGroup) -> String {
        guard let story = currentStory, story.repostOfId != nil,
              let handle = story.repostAuthorUsername ?? story.repostAuthorName else {
            return String(localized: "story.viewer.a11y.profileOf", defaultValue: "Profil de \(group.username)", bundle: .main)
        }
        return String(
            format: String(localized: "story.viewer.a11y.profileOf.repost", defaultValue: "Profil de %@, republication de @%@", bundle: .main),
            group.username, handle
        )
    }

    var body: some View {
        HStack(spacing: 10) {
            if let group = currentGroup {
                Button {
                    HapticFeedback.light()
                    selectedProfileUser = .from(storyGroup: group)
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            // Glow radial au long press
                            if avatarLongPressGlow {
                                Circle()
                                    .fill(
                                        RadialGradient(
                                            colors: [
                                                Color(hex: group.avatarColor).opacity(0.4),
                                                MeeshyColors.indigo500.opacity(0.2),
                                                .clear
                                            ],
                                            center: .center,
                                            startRadius: 15,
                                            endRadius: 35
                                        )
                                    )
                                    .frame(width: 70, height: 70)
                                    .blur(radius: 8)
                                    .transition(.scale(scale: 0.8).combined(with: .opacity))
                                    .allowsHitTesting(false)
                            }

                            // Pas de bordure gradient autour de l'avatar dans la
                            // slide : on est déjà dans la story de l'utilisateur,
                            // l'anneau « story dispo » serait redondant (cf. user
                            // request 2026-05-27). Le contexte `.storyViewer` suffit
                            // déjà à masquer l'anneau via `showsStoryRing == false`.
                            MeeshyAvatar(
                                name: group.username,
                                context: .storyViewer,
                                accentColor: group.avatarColor,
                                avatarURL: group.avatarURL,
                                onViewProfile: { selectedProfileUser = .from(storyGroup: group) },
                                contextMenuItems: [
                                    AvatarContextMenuItem(
                                        label: String(localized: "story.viewer.viewProfile", defaultValue: "Voir le profil", bundle: .main),
                                        icon: "person.fill"
                                    ) {
                                        selectedProfileUser = .from(storyGroup: group)
                                    }
                                ]
                            )
                            .scaleEffect(avatarLongPressGlow ? 1.05 : 1.0)
                        }
                        .onLongPressGesture(minimumDuration: 0.4) {
                            HapticFeedback.medium()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                avatarLongPressGlow = false
                            }
                            selectedProfileUser = .from(storyGroup: group)
                        } onPressingChanged: { pressing in
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                avatarLongPressGlow = pressing
                            }
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 5) {
                                // Nom borné à 16 caractères comme dans les bulles de
                                // conversation (directive user 2026-07-30) : au-delà,
                                // un pseudo long poussait l'attribution de repost et
                                // la méta hors du header. `lineLimit(1)` reste, mais
                                // en dernier recours seulement — la borne est posée
                                // à la source.
                                Text(DisplayName.truncated(group.username))
                                    .font(MeeshyFont.relative(15, weight: .bold))
                                    .foregroundColor(.white)
                                    .lineLimit(1)

                                // Vue `2f` — l'heure appartient à la ligne du NOM.
                                // Elle qualifie l'AUTEUR (« Camille Roux, il y a
                                // 2 h ») ; le crédit du son, juste dessous, qualifie
                                // le CONTENU. Les laisser sur une même ligne les
                                // faisait lire comme une seule énumération, où la
                                // donnée la plus consultée — quand — se noyait dans
                                // la moins consultée.
                                //
                                // L'icône horloge qui l'accompagnait est retirée :
                                // collée à l'auteur, « 2 h » se lit sans ambiguïté
                                // comme une date de publication, et `FeedPostCard`
                                // (vue `1h`) n'en a jamais porté — la garder ferait
                                // dire la même chose de deux façons sur deux
                                // surfaces voisines. Elle ne perd rien : elle était
                                // déjà `accessibilityHidden(true)`. La directive du
                                // 2026-07-30 qui l'avait introduite portait sur le
                                // RETRAIT du compte à rebours « Expire dans Xh » ;
                                // l'horloge y avait été re-affectée, jamais demandée
                                // pour elle-même.
                                if let story = currentStory {
                                    Text(story.timeAgo)
                                        .font(MeeshyFont.relative(12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))
                                }

                                // Republication : icône repost + "@handle" à la
                                // SUITE du nom, en graisse normale, SANS « via »
                                // (l'icône dit déjà la republication — directive
                                // user 2026-07-13, IMG_1154).
                                if let story = currentStory, story.repostOfId != nil {
                                    Image(systemName: "arrow.2.squarepath")
                                        .font(MeeshyFont.relative(10, weight: .semibold))
                                        .foregroundColor(.white.opacity(0.6))
                                        .accessibilityHidden(true)
                                    if let handle = story.repostAuthorUsername ?? story.repostAuthorName {
                                        Text("@\(handle)")
                                            .font(MeeshyFont.relative(12, weight: .regular))
                                            .foregroundColor(.white.opacity(0.65))
                                            .lineLimit(1)
                                    }
                                }
                            }

                            // Vue `2f` — le crédit du son occupe sa PROPRE ligne,
                            // sous la ligne du nom.
                            //
                            // Il partageait la largeur avec l'heure et, dès qu'une
                            // attribution de republication s'y ajoutait, avec elle
                            // aussi : sur un écran étroit, le titre du son et le
                            // handle d'origine se tronquaient l'un l'autre alors que
                            // ce sont deux attributions DISTINCTES — qui a republié,
                            // et à qui appartient la musique. Une ligne chacun retire
                            // la concurrence au lieu d'arbitrer entre deux
                            // troncatures. Même arbitrage que la vue `1h` sur
                            // `FeedPostCard+Header.swift` : la dimension 6 demande
                            // que la même information vive à la même place sur les
                            // deux surfaces.
                            //
                            // Annonce du fond (B3.3-5) : résolveur unique —
                            // `BackgroundSoundBadge` rend `EmptyView` sans piste
                            // (B3.5), donc cette ligne DISPARAÎT entièrement quand il
                            // n'y a pas de son, et le `if let story` qui l'enveloppait
                            // devient inutile (`backgroundSoundAnnouncement` se
                            // résout à `.none` sans story courante). Sinon note PUIS
                            // onde (piste ORIGINALE, directive user 2026-07-30) ou
                            // marquee crédit (bibliothèque, directive user
                            // 2026-08-02). Même vue que la carte de post et le plein
                            // écran réel (E1, « un résolveur, trois surfaces »).
                            //
                            // L'annonce ne dépend JAMAIS du muet : elle se résout sur
                            // `currentStory?.storyEffects` seul (B3.5 — c'est
                            // l'EXISTENCE d'une piste qui la gouverne, pas son
                            // audibilité), donc couper le son au rail ne la fait pas
                            // disparaître. C'est la 2e clause de la vue `2f`.
                            //
                            // Accent FIXE (pas `group.avatarColor`) : le header se
                            // pose sur un média arbitraire (photo/vidéo), comme
                            // l'heure voisine — non-régression du blanc pré-E1.
                            BackgroundSoundBadge(
                                announcement: backgroundSoundAnnouncement,
                                accentHex: BackgroundSoundBadge.overMediaAccentHex
                            )
                            .equatable()
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                // Le bouton porte un SEUL accessibilityLabel qui remplace tout
                // le contenu de son label closure (icône repost + @handle
                // inclus) — VoiceOver ne lirait jamais la republication sans
                // l'inclure explicitement ici (post-revue 2026-07-13).
                .accessibilityLabel(cachedProfileLabel)
                .accessibilityHint(String(localized: "story.viewer.a11y.profileOf.hint", defaultValue: "Ouvre le profil de \(group.username)", bundle: .main))
                .onAppear { cachedProfileLabel = computeProfileLabel(for: group) }
                .adaptiveOnChange(of: currentStory?.id) { _, _ in
                    cachedProfileLabel = computeProfileLabel(for: group)
                }
            }

            Spacer()

            // Options menu (three dots)
            Menu {
                // Toggle mode plein écran (session-scoped) — pertinent quelle
                // que soit la propriété de la story. Placé en tête du menu
                // pour être accessible immédiatement, avec un `Divider`
                // suivant qui le sépare visuellement des actions destructives
                // ou de partage propres à la story courante.
                Button {
                    HapticFeedback.light()
                    isFullscreenStorySession.toggle()
                    // Synchronise instantanément l'état au repos du chrome :
                    // mode actif ⇒ caché ; mode inactif ⇒ visible. Le
                    // touch-and-hold inversera ce repos pendant le hold.
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        chromeVisible = !isFullscreenStorySession
                    }
                } label: {
                    Label(
                        isFullscreenStorySession
                            ? String(localized: "story.viewer.fullscreen.exit", defaultValue: "Quitter le plein écran", bundle: .main)
                            : String(localized: "story.viewer.fullscreen.enter", defaultValue: "Plein écran", bundle: .main),
                        systemImage: isFullscreenStorySession
                            ? "arrow.down.right.and.arrow.up.left"
                            : "arrow.up.left.and.arrow.down.right"
                    )
                }

                // Transcription de l'audio parlé — item 7a : elle vit ICI, dans
                // les options, et non en bandeau permanent sur la story. Le
                // texte affiché suit la langue choisie via « Traductions »,
                // puisqu'il se résout sur la même chaîne de langues préférées.
                if hasAudioTranscript {
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showAudioTranscript.toggle()
                        }
                    } label: {
                        Label(
                            showAudioTranscript
                                ? String(localized: "story.viewer.transcript.hide", defaultValue: "Masquer la transcription", bundle: .main)
                                : String(localized: "story.viewer.transcript.show", defaultValue: "Afficher la transcription", bundle: .main),
                            systemImage: showAudioTranscript ? "captions.bubble.fill" : "captions.bubble"
                        )
                    }
                }

                Divider()

                if let story = currentStory, let group = currentGroup {
                    if isOwnStory {
                        // External share via system share sheet (Messages,
                        // Mail, other apps). Only for public stories.
                        // The link is minted on tap so the user always
                        // shares a trackable `meeshy.me/l/<token>` URL.
                        if story.isPublic {
                            Button {
                                Task { await mintAndShareStory(story.id) }
                            } label: {
                                Label(String(localized: "story.viewer.share.external", defaultValue: "Partager hors Meeshy", bundle: .main), systemImage: "square.and.arrow.up")
                            }
                            Divider()
                        }
                        Button(role: .destructive) {
                            deleteCurrentStory()
                        } label: {
                            Label(String(localized: "story.viewer.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                        }
                    } else {
                        Button {
                            selectedProfileUser = .from(storyGroup: group)
                        } label: {
                            Label(String(localized: "story.viewer.viewProfile", defaultValue: "Voir le profil", bundle: .main), systemImage: "person.fill")
                        }

                        // S5 — « enregistrer ce sticker », depuis le contenu
                        // REÇU. Le lecteur de stories est la surface où l'on
                        // rencontre le sticker d'un autre ; le menu (…) y est
                        // déjà l'endroit des actions sur la slide courante,
                        // aux côtés des trois formes de partage.
                        //
                        // Loi 4 : rien à copier, rien d'offert. La liste est
                        // vide dès que la slide ne porte aucun sticker IMAGE —
                        // un sticker emoji n'a aucune image à garder.
                        if !savableStickers.isEmpty {
                            Button {
                                HapticFeedback.light()
                                let stickers = savableStickers
                                Task { await StickerLibraryReceive.saveAndAnnounce(stickers) }
                            } label: {
                                Label(
                                    savableStickers.count == 1
                                        ? String(localized: "story.viewer.sticker.save.one",
                                                 defaultValue: "Enregistrer le sticker",
                                                 bundle: .main)
                                        : String(format: String(localized: "story.viewer.sticker.save.many",
                                                                defaultValue: "Enregistrer les %d stickers",
                                                                bundle: .main),
                                                 savableStickers.count),
                                    systemImage: "square.and.arrow.down"
                                )
                            }
                        }

                        // ── Les TROIS formes de partage (demande produit
                        // 2026-08-19) ─────────────────────────────────────────
                        //
                        // Elles n'étaient offertes que sur les stories
                        // PUBLIQUES (« Gated on `story.isPublic` … so we never
                        // expose these for FRIENDS / PRIVATE visibilities »).
                        // Ce gate était le REFLET d'une barrière serveur qui
                        // n'existe plus : `PostService.repostPost` refusait tout
                        // original non-`PUBLIC` (« Cannot repost private
                        // content »). Elle a été remplacée par la LOI
                        // D'AUDIENCE — même audience ou plus restreinte, jamais
                        // plus large — que le serveur applique désormais aux
                        // deux portes (`repostPost` ET `createPost`, 403
                        // `REPOST_AUDIENCE_WIDENING`).
                        //
                        // Garder le gate reviendrait à protéger contre une
                        // restriction abolie, tout en rendant le menu VIDE de
                        // toute forme de partage sur les stories que la
                        // nouvelle règle vise précisément. C'est la loi qui
                        // borne l'audience du résultat, plus l'appartenance au
                        // menu — exactement le raisonnement appliqué au bouton
                        // du rail (`showsRepost: !isOwnStory`).

                        // 1. Republier en post — DIRECT, un tap (arbitrage D3).
                        // Sans `visibility` : le serveur hérite de l'audience de
                        // l'original, donc jamais plus large. C'est l'ANCRAGE web
                        // (`onRepostAsPost` / `KeepOnFeedIcon`, StoryViewer.tsx) :
                        // glyphe DISTINCT du bouton du rail (:519, composeur), qui
                        // portait le même `arrow.2.squarepath` avant le premier
                        // correctif — deux permanences différentes n'ont pas le
                        // même dessin. `bookmark.fill` (premier choix) désigne
                        // déjà « Publications enregistrées » ailleurs dans l'app
                        // (SettingsView.swift:606 et 4 autres sites, constat de
                        // revue R3, 2026-08-25) : collision levée dans CE fichier,
                        // rouverte à l'échelle de l'app. `infinity` reste libre de
                        // tout sens produit concurrent et porte la permanence
                        // (story éphémère → post durable).
                        Button {
                            repostAsPostDirect()
                        } label: {
                            Label(String(localized: "story.viewer.repostAsPost", defaultValue: "Republier en post", bundle: .main), systemImage: "infinity")
                        }

                        // 2. Citer en post — ouvre le composeur de POST avec la
                        // story citée, pour ajouter d'autres contenus par-dessus.
                        Button {
                            HapticFeedback.light()
                            pauseTimer()
                            editAndRepostAsPostSource = RepostPostSourceWrapper(
                                story: story,
                                authorHandle: group.username
                            )
                        } label: {
                            Label(String(localized: "story.viewer.editAndRepostAsPost", defaultValue: "Citer en post", bundle: .main), systemImage: "square.and.pencil")
                        }

                        // 3. Partager — transmettre DANS Meeshy (conversation
                        // existante ou contact). Même feuille que le bouton
                        // « Envoyer » du rail, qui reste en place : le menu
                        // regroupe les formes, il ne retire pas l'affordance
                        // directe. Aucune garde d'audience — le rail n'en a pas
                        // (`showsForward: true`), et en inventer une ici
                        // créerait deux règles pour un seul geste.
                        Button {
                            HapticFeedback.light()
                            pauseTimer()
                            EngagementTracker.shared.recordAction(.shared, surface: .storyViewer)
                            sharedContentWrapper = SharedContentWrapper(
                                content: .story(item: story, authorName: group.username)
                            )
                        } label: {
                            Label(String(localized: "story.viewer.share.internal", defaultValue: "Partager", bundle: .main), systemImage: "paperplane.fill")
                        }

                        // Partage EXTERNE (Messages, Mail, autres apps) — reste
                        // réservé aux stories publiques : le lien `meeshy.me/l/…`
                        // est ouvrable par n'importe qui, ce qui élargirait
                        // l'audience hors de tout contrôle. C'est le seul des
                        // quatre où le gate `isPublic` dit encore quelque chose.
                        if story.isPublic {
                            Button {
                                Task { await mintAndShareStory(story.id) }
                            } label: {
                                Label(String(localized: "story.viewer.share.external", defaultValue: "Partager hors Meeshy", bundle: .main), systemImage: "square.and.arrow.up")
                            }
                        }

                        Divider()

                        Button(role: .destructive) {
                            showReportSheet = true
                        } label: {
                            Label(String(localized: "story.viewer.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le bouton porte le libellé
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.15)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel(String(localized: "story.viewer.a11y.options", defaultValue: "Options de la story", bundle: .main))

            // Close button
            Button {
                HapticFeedback.light()
                dismissViewer()
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le bouton porte le libellé
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.2)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
            .accessibilityHint(String(localized: "story.viewer.a11y.close.hint", defaultValue: "Ferme le lecteur de stories", bundle: .main))
        }
        .adaptiveOnChange(of: currentStory?.id, initial: true) { _, _ in
            savableStickers = currentStory.map { StoryStickerLibrary.savable(in: $0) } ?? []
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportMessageSheet(accentColor: currentGroup?.avatarColor ?? "FF2D55") { type, reason in
                guard let storyId = currentStory?.id else { return }
                Task {
                    do {
                        try await reportStory(storyId, type, reason)
                        DispatchQueue.main.async {
                            HapticFeedback.success()
                            showReportSheet = false
                        }
                    } catch {
                        DispatchQueue.main.async {
                            HapticFeedback.error()
                            showReportSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(item: $shareableStoryLink) { link in
            // Trackable `meeshy.me/l/<token>` URL minted in
            // `mintAndShareStory` — the author owns the analytics.
            ShareSheet(activityItems: [link.url])
        }
    }
}
