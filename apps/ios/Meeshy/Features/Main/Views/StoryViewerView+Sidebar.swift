import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView sidebar & header components
//
// Dedicated View structs extracted from StoryViewerView so the action sidebar
// and the story header no longer compose into StoryViewerView.body's opaque
// type. Real structs (vs AnyView) break the type while preserving SwiftUI
// structural identity.

// MARK: - Story Action Rail Plan

/// Plan du rail d'actions — CALCULÉ D'UN BLOC À L'ENTRÉE DU SLIDE puis FIGÉ
/// pendant toute sa lecture (directive user 2026-07-10 : « le calcul des
/// boutons à afficher doit se faire avant affichage, même contenant toutes
/// les informations de compteur — pas des apparitions en second temps »).
///
/// Toutes les entrées proviennent du payload feed déjà en main (compteurs
/// inclus) : aucune résolution réseau n'est nécessaire pour décider du set.
/// Les VALEURS de compteurs affichées sur les boutons restent vivantes
/// (realtime), mais l'APPARTENANCE d'un bouton au rail ne change jamais en
/// cours de slide — un compteur réconcilié après coup ne fait plus surgir
/// un bouton au milieu de la lecture.
///
/// `nonisolated` : rule engine pur sans état partagé (parité
/// StoryCanvasFraming / BandStateMachine) — le target app compile en
/// defaultIsolation MainActor, sans ce modificateur le bundle de tests
/// (nonisolated) ne peut ni appeler `resolve` ni lire les propriétés
/// (échec CI ios-tests 2026-07-10, exit 65 = échec de COMPILE).
nonisolated struct StoryActionRailPlan: Equatable {
    let showsReact: Bool
    let showsReply: Bool
    let showsForward: Bool
    let showsRepost: Bool
    let showsViews: Bool
    let showsExport: Bool
    let showsSound: Bool
    let showsComments: Bool
    let showsTranslations: Bool

    static func resolve(
        isOwnStory: Bool,
        canReply: Bool,
        isPublicStory: Bool,
        hasAudibleSound: Bool,
        commentCount: Int,
        hasTranslatableContent: Bool
    ) -> StoryActionRailPlan {
        StoryActionRailPlan(
            showsReact: !isOwnStory,
            showsReply: !isOwnStory && canReply,
            showsForward: true,
            // D1 (arbitrage user 2026-08-19) : la republication n'est plus
            // réservée aux stories PUBLIQUES. Une story FRIENDS se republie en
            // FRIENDS ou PRIVATE, une PRIVATE en PRIVATE — c'est la LOI
            // D'AUDIENCE (`StoryRepostAudience`, miroir du serveur) qui borne
            // le choix, plus l'appartenance au rail. Gater ici sur
            // `isPublicStory` rendait la règle inatteignable : le bouton
            // n'existait pas pour les seules stories qu'elle concerne.
            showsRepost: !isOwnStory,
            showsViews: isOwnStory,
            showsExport: isOwnStory,
            showsSound: hasAudibleSound,
            showsComments: commentCount > 0,
            // Les traductions ne sont PAS réservées aux lecteurs (changement
            // 2026-07-25) : l'auteur explore les langues de sa propre story
            // comme il choisit déjà sa langue d'export. Le Prisme est un outil
            // de lecture, pas une permission.
            showsTranslations: hasTranslatableContent
        )
    }
}

// MARK: - Export Rail Buttons (Partager / Enregistrer)

/// Résolution PURE de la paire Partager/Enregistrer du rail — extraite pour
/// être testée sans instancier de vue (Task 10, revue « le reader a perdu
/// tout accès au partage externe »).
///
/// Membership des DEUX boutons = `showsExport` (== `isOwnStory`, voir
/// `StoryActionRailPlan.resolve`) : Partager et Enregistrer apparaissent ou
/// disparaissent TOUJOURS ensemble. Seul Enregistrer bascule vers l'anneau de
/// progression pendant un job de sauvegarde — Partager reste au premier plan
/// tout du long : il doit rester atteignable jusqu'à la présentation de la
/// share sheet système, jamais relégué derrière une tâche de fond, sinon
/// cette sheet surgirait après coup alors que l'utilisateur a déjà navigué
/// ailleurs.
nonisolated struct StoryExportRailButtons: Equatable {
    let showsShareButton: Bool
    let showsSaveButton: Bool
    let showsSaveProgressRing: Bool

    static func resolve(showsExport: Bool, saveProgress: Double?) -> StoryExportRailButtons {
        StoryExportRailButtons(
            showsShareButton: showsExport,
            showsSaveButton: showsExport && saveProgress == nil,
            showsSaveProgressRing: showsExport && saveProgress != nil
        )
    }
}

// MARK: - Story Action Sidebar

/// Right-side action sidebar of the story viewer. Hosts the heart / reply /
/// send / share / export / mute / comments / translate buttons. Extracted
/// from `StoryViewerView.storyActionSidebar` (formerly an `AnyView`) so its
/// ~9-button `VStack` becomes its own type-metadata unit.
struct StoryActionSidebarView: View {
    let isOwnStory: Bool
    let storyReactionCount: Int
    /// True only when the *current viewer* has personally reacted to this
    /// story — drives the heart's indigo active state. Decoupled from
    /// `storyReactionCount > 0`, which is the global count (anyone).
    let storyCurrentUserHasReacted: Bool
    /// Ticks on every reaction sent (any path). `.onChange` drives `bounceHeart()`.
    let heartBouncePulse: Int
    let quickEmojis: [String]
    let onReplyToStory: ((ReplyContext) -> Void)?
    let currentStory: StoryItem?
    let currentGroup: StoryGroup?
    let storyCommentCount: Int
    /// Impulsion dédiée à la réconciliation d'OUVERTURE de slide — voir
    /// `StoryViewerView.storyCommentCountReconciledPulse`. Distincte de
    /// `storyCommentCount` : celui-ci bouge aussi en temps réel (activité live,
    /// propre composer), cette impulsion NE bouge QUE quand
    /// `loadStoryCommentCount()` (+Content.swift) confirme un compteur plus
    /// exact que le payload d'entrée.
    let storyCommentCountReconciledPulse: Int
    /// Forward / external-share count for the Envoyer button label (user spec
    /// 2026-05-28: non-author sees counts on Réact + Comments + Envoyer).
    let storyShareCount: Int
    /// Author-only viewers count for the Vues button label.
    let storyViewCount: Int
    /// Repost-of-this-story count for the Partager button label (non-author
    /// + public stories only).
    let storyRepostCount: Int
    let isStoryCommentsEmpty: Bool
    let storyHasAudibleSound: Bool
    let storyHasTranslatableContent: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    /// Langue d'exploration en cours (`nil` = la chaine préférée de l'utilisateur
    /// s'applique, aucun override). Marque le drapeau correspondant dans le strip
    /// pour que « quelle langue je lis » soit lisible d'un coup d'œil.
    let activeLanguageCode: String?
    /// Langue effectivement affichée (résolue) — alimente le badge accolé au
    /// bouton « Abc ». Remplace l'ancien badge (EN) du coin bas-gauche
    /// (directive user 2026-07-26).
    let displayedLanguageCode: String?
    /// Prisme « Exploration » : affiche la story dans la langue choisie (override éphémère).
    let onSelectLanguageOverride: (String) -> Void

    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    /// Republication en STORY : ouvre le composeur prérempli au lieu de
    /// l'ancien repost un-tap côté serveur.
    @Binding var republishStorySource: RepostPostSourceWrapper?
    @Binding var isPresented: Bool

    /// Envoie la réaction ; le CGRect est le cadre (dans StoryScrubSpace) de la
    /// tuile d'origine du vol — nil = pop sur place depuis le cœur (tap direct).
    let triggerStoryReaction: (String, CGRect?) -> Void
    /// Vrai pendant un scrub longpress→drag sur le rail (pause le timer,
    /// neutralise la navigation du canvas).
    let onScrubStateChanged: (Bool) -> Void
    let pauseTimer: () -> Void
    let loadStoryComments: () -> Void

    /// Source de vérité des exports story → photothèque
    /// (`StoryPhotoSaveService.shared`, Task 7). `@ObservedObject` — pas
    /// une simple lecture de `StoryPhotoSaveService.shared.progress(for:)`
    /// dans `body` — est nécessaire pour que cette vue se redessine quand la
    /// progression change ; `@Published` seul ne déclenche rien sans
    /// souscription SwiftUI.
    @ObservedObject private var saveService = StoryPhotoSaveService.shared

    /// Transient scale of the heart button — driven only by `bounceHeart()`.
    @State private var heartScale: CGFloat = 1.0

    @State private var scrubHoveredLanguageIndex: Int?
    @State private var reactionTileFrames: [Int: CGRect] = [:]
    @State private var languageTileFrames: [Int: CGRect] = [:]
    @State private var isScrubbingLanguages = false

    /// Plan du rail FIGÉ à l'entrée du slide (voir `StoryActionRailPlan`).
    /// Re-résolu UNIQUEMENT au changement de story — jamais sur une mise à
    /// jour de compteur mid-slide, donc aucun bouton n'apparaît/disparaît
    /// pendant la lecture.
    @State private var frozenRailPlan: StoryActionRailPlan?

    /// Résolution depuis les entrées courantes. La MEMBERSHIP
    /// (`showsComments`) lit `currentStory?.commentCount` — le payload déjà
    /// en paramètre de la vue — plutôt que le miroir `@State
    /// storyCommentCount`, pour ne JAMAIS dépendre de l'ordre réel des
    /// `.onAppear` SwiftUI : `StoryActionSidebarView` est un descendant
    /// profond du viewer (Layer 8), et rien ne garantit structurellement que
    /// le `.onAppear` ancêtre qui seed `storyCommentCount` (via
    /// `startTimer()`) s'exécute avant celui-ci. Lire le payload élimine ce
    /// risque par construction. Le LABEL affiché, lui, reste sur
    /// `storyCommentCount` (compteur vivant, mis à jour en temps réel par
    /// les réconciliations post-gel) — voir `sidebarContent` plus bas.
    private var liveRailPlan: StoryActionRailPlan {
        StoryActionRailPlan.resolve(
            isOwnStory: isOwnStory,
            canReply: onReplyToStory != nil,
            isPublicStory: currentStory?.isPublic == true,
            hasAudibleSound: storyHasAudibleSound,
            commentCount: currentStory?.commentCount ?? 0,
            hasTranslatableContent: storyHasTranslatableContent
        )
    }

    private var railPlan: StoryActionRailPlan { frozenRailPlan ?? liveRailPlan }

    /// Quick pop on the heart button that confirms the reaction landed —
    /// ticked at the ARRIVAL of the reaction flight (`StoryReactionFlightView.onArrived`),
    /// not at send time.
    private func bounceHeart() {
        withAnimation(.spring(response: 0.22, dampingFraction: 0.45)) {
            heartScale = 1.35
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.16) {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.55)) {
                heartScale = 1.0
            }
        }
    }

    /// Tap simple sur le cœur = la barre de réactions s'ouvre (directive user
    /// 2026-08-20 : « enlever le longpress sur la réaction, simple touché
    /// affiche la barre ») ; retap = fermeture. Plus AUCUN geste séquencé sur
    /// ce bouton — la sélection se fait au tap sur une tuile de la barre
    /// (`EmojiReactionPicker.onReact`).
    private func toggleReactionBar() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
            showEmojiStrip.toggle()
        }
    }

    /// Longpress (0.25 s) → la barre de langues surgit → drag continu SANS
    /// lever le doigt : survol des tuiles (×1.35 rebond via highlightedIndex),
    /// sélection au relâchement (« + » = liste complète ; hors barre = barre
    /// posée). Posé en `.highPriorityGesture` sur le bouton : un tap court
    /// (< 0.25 s) fait échouer le longpress et laisse le Button réagir
    /// normalement ; un longpress capture la séquence — le canvas ne voit rien,
    /// le swipe de navigation est donc structurellement neutralisé.
    /// Ouvre la barre au moment où le longpress est ACQUIS. Appelé des cas
    /// `.first(true)` ET `.second(true, _)` : en pratique SwiftUI ne livre
    /// souvent JAMAIS `.first(true)` — la séquence saute directement à
    /// `.second(true, nil)` quand le longpress aboutit (prouvé au log HID
    /// 2026-08-11 : premier onChanged = `second(true, nil)`). Ne traiter que
    /// `.first(true)` laissait la barre fermée à jamais.
    private func beginLanguageScrubIfNeeded() {
        guard !isScrubbingLanguages else { return }
        isScrubbingLanguages = true
        onScrubStateChanged(true)
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showLanguageOptions = true
        }
    }

    private var languageScrubGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.25)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(StoryScrubSpace.name)))
            .onChanged { value in
                switch value {
                case .first(true):
                    beginLanguageScrubIfNeeded()
                case .second(true, let drag):
                    beginLanguageScrubIfNeeded()
                    guard let drag else { return }
                    let hovered = StoryScrubSelectionResolver.hoveredIndex(
                        tileFrames: languageTileFrames,
                        point: drag.location,
                        verticalTolerance: 16)
                    if hovered != scrubHoveredLanguageIndex { HapticFeedback.light() }
                    scrubHoveredLanguageIndex = hovered
                default:
                    break
                }
            }
            .onEnded { _ in
                let hovered = scrubHoveredLanguageIndex
                isScrubbingLanguages = false
                onScrubStateChanged(false)
                scrubHoveredLanguageIndex = nil
                switch StoryScrubSelectionResolver.release(hoveredIndex: hovered, tileCount: availableTranslationLanguages.count) {
                case .select(let index):
                    onSelectLanguageOverride(availableTranslationLanguages[index].id)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions = false
                    }
                case .expand:
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions = false
                        showFullLanguagePicker = true
                    }
                case .keepOpen:
                    break
                }
            }
    }

    var body: some View {
        // On small iPhones (SE/mini) the 6–7 stacked action buttons can
        // exceed the available canvas height between header and composer.
        // `ViewThatFits` picks the natural VStack when it fits; otherwise
        // it falls back to a vertically-scrollable strip so every action
        // controller stays reachable. The parent (StoryCardView) bounds
        // `maxHeight` to the safe canvas-content slot so ViewThatFits has
        // a real constraint to evaluate against.
        //
        // Densité resserrée (directive user 2026-07-10 « rapprocher les FABs,
        // on y voit trop d'espace ») : spacing 8/6 au lieu de 20/14 — le rail
        // retrouve la compacité TikTok/IG, chaque action reste ≥ 44pt de zone
        // tappable via le padding du bouton.
        ViewThatFits(in: .vertical) {
            sidebarContent(spacing: 8)
            sidebarContent(spacing: 6)
            ScrollView(.vertical, showsIndicators: false) {
                sidebarContent(spacing: 6)
                    .padding(.vertical, 4)
            }
        }
        // Plan figé posé à l'apparition puis re-résolu au CHANGEMENT de slide
        // uniquement — les mises à jour de compteurs mid-slide ne re-déclenchent
        // jamais la composition du rail (directive 2026-07-10).
        .onAppear {
            if frozenRailPlan == nil { frozenRailPlan = liveRailPlan }
        }
        .adaptiveOnChange(of: currentStory?.id) { _, _ in
            frozenRailPlan = liveRailPlan
        }
        // La présence d'une piste audio dans une vidéo est établie par un probe
        // ASYNCHRONE (`AVURLAsset.loadTracks`) qui conclut souvent après le gel :
        // le rail restait alors sans bouton son sur une story qui en a un
        // (constaté 2026-07-25, probe `tracks=1` arrivé ~1 s trop tard).
        // Transition à sens unique « silencieux → sonore » : un bouton peut
        // apparaître quand la donnée arrive, jamais disparaître en cours de
        // lecture — la directive 2026-07-10 (pas de rail qui clignote) tient.
        .adaptiveOnChange(of: storyHasAudibleSound) { wasAudible, isAudible in
            guard !wasAudible, isAudible else { return }
            frozenRailPlan = liveRailPlan
        }
        // Réconciliation du compteur de commentaires — MÊME contrat que le
        // probe audio juste au-dessus, pour le MÊME symptôme : un thread de
        // commentaires bien réel restait invisible pour toute la lecture
        // d'un slide ouvert NORMALEMENT (tray, profil, feed…), car
        // `liveRailPlan` fige la membership sur `currentStory?.commentCount`
        // — le payload du tray, potentiellement périmé jusqu'à 72 h (cache
        // stories). Le chemin notification est déjà couvert en amont
        // (`StoryViewModel.refreshFromCachedPostIfAvailable` +
        // `StoryViewerContainer.isGroupReadyToPresent`, qui rafraîchissent le
        // payload AVANT le premier montage) ; celui-ci couvre tous les
        // autres points d'entrée, où aucun postId de notification n'est
        // connu et où ce verrou ne s'applique jamais.
        //
        // `storyCommentCountReconciledPulse` ne tique QUE sur la
        // réconciliation d'ouverture de `loadStoryCommentCount()`
        // (+Content.swift : cache commentaires local, puis — si toujours à
        // 0 — une requête réseau bornée ~400 ms) : ni `sendComment` (propre
        // composer), ni le socket `comment:added` reçu pendant la lecture
        // (`applyStoryCommentAdded` +Content.swift,
        // `StoryViewModel.applyStoryCommentCountDelta`) ne l'incrémentent —
        // ces derniers restent volontairement hors du gel (directive
        // 2026-07-10 : jamais de bouton qui surgit en cours de lecture).
        // Transition à sens unique comme le probe audio : ne fait
        // qu'apparaître, jamais disparaître.
        .adaptiveOnChange(of: storyCommentCountReconciledPulse) { _, _ in
            guard !railPlan.showsComments else { return }
            frozenRailPlan = StoryActionRailPlan.resolve(
                isOwnStory: isOwnStory,
                canReply: onReplyToStory != nil,
                isPublicStory: currentStory?.isPublic == true,
                hasAudibleSound: storyHasAudibleSound,
                commentCount: storyCommentCount,
                hasTranslatableContent: storyHasTranslatableContent
            )
        }
    }

    @ViewBuilder
    private func sidebarContent(spacing: CGFloat) -> some View {
        VStack(spacing: spacing) {
            // 1. Reaction (heart) — primary action, brand-colored when active
            if railPlan.showsReact {
                StoryActionButton(
                    icon: "heart.fill",
                    label: storyReactionCount > 0 ? "\(storyReactionCount)" : String(localized: "story.viewer.action.react", defaultValue: "Réagir", bundle: .main),
                    isActive: showEmojiStrip || storyCurrentUserHasReacted,
                    activeColor: MeeshyColors.indigo500,
                    activeGlow: MeeshyColors.indigo500,
                    accentOutline: storyCurrentUserHasReacted ? "heart" : nil,
                    accentOutlineColor: Color(hex: currentGroup?.avatarColor ?? "FF2D55")
                ) {
                    // Tap simple = la barre s'ouvre (directive user 2026-08-20).
                    // L'émoji part au tap sur une tuile de la barre — plus de
                    // ❤️ envoyé à l'aveugle, plus de longpress.
                    toggleReactionBar()
                }
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: StoryHeartFrameKey.self,
                            value: proxy.frame(in: .named(StoryScrubSpace.name))
                        )
                    }
                )
                .scaleEffect(heartScale)
                // Bounce on every reaction that LANDS — via the quick strip
                // or the full-screen picker — since heartBouncePulse
                // ticks at the flight's arrival (+Canvas.swift Layer 9), the
                // single impact seam regardless of origin.
                .adaptiveOnChange(of: heartBouncePulse) { _, _ in
                    bounceHeart()
                }
                .overlay(alignment: .trailing) {
                    if showEmojiStrip {
                        EmojiReactionPicker(
                            quickEmojis: quickEmojis,
                            style: .dark,
                            onReact: { emoji in
                                let index = quickEmojis.firstIndex(of: emoji)
                                triggerStoryReaction(emoji, index.flatMap { reactionTileFrames[$0] })
                            },
                            onDismiss: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                }
                            },
                            onExpandFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                    showFullEmojiPicker = true
                                }
                            },
                            highlightedIndex: nil,
                            scrubFrameSpace: StoryScrubSpace.name,
                            onTileFrames: { reactionTileFrames = $0 }
                        )
                        .fixedSize()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .offset(x: -56)
                    }
                }
                .zIndex(10)
            }

            // 2. Reply privately (opens DM with story context)
            if railPlan.showsReply {
                StoryActionButton(
                    icon: "arrowshape.turn.up.left.fill",
                    label: String(localized: "story.viewer.action.reply", defaultValue: "Répondre", bundle: .main)
                ) {
                    HapticFeedback.light()
                    guard let story = currentStory, let group = currentGroup else { return }
                    EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)
                    let preview = story.content?.prefix(80).description ?? "Story"
                    let thumbUrl = story.media.first?.thumbnailUrl ?? story.media.first?.url
                    onReplyToStory?(.story(
                        storyId: story.id,
                        authorId: group.id,
                        authorName: group.username,
                        preview: preview,
                        publishedAt: story.createdAt,
                        reactionCount: storyReactionCount > 0 ? storyReactionCount : nil,
                        commentCount: storyCommentCount > 0 ? storyCommentCount : nil,
                        thumbnailUrl: thumbUrl
                    ))
                    isPresented = false
                }
            }

            // 3. Forward (send to someone) — label = count when > 0
            // (user spec 2026-05-28: « Compteur des react et des commentaires,
            // envoyer uniquement » pour le non-auteur).
            StoryActionButton(
                icon: "paperplane.fill",
                label: storyShareCount > 0 ? "\(storyShareCount)" : String(localized: "story.viewer.action.send", defaultValue: "Envoyer", bundle: .main)
            ) {
                HapticFeedback.light()
                pauseTimer()
                if let story = currentStory, let group = currentGroup {
                    EngagementTracker.shared.recordAction(.shared, surface: .storyViewer)
                    sharedContentWrapper = SharedContentWrapper(content: .story(item: story, authorName: group.username))
                }
            }

            // 4. Republier la story — non-auteur, TOUTE audience (D1,
            // 2026-08-19). La mention « story publique » qui figurait ici
            // décrivait le gate `isPublicStory` retiré de `railPlan` : c'est
            // désormais la loi d'audience qui borne le RÉSULTAT
            // (`StoryRepostAudience`), plus l'appartenance au rail.
            // Réintroduit 2026-06-18 après finalisation du flux serveur : route
            // via le snapshot de repost (`PostService.repost`). Le gateway
            // duplique le média + l'audio source et copie storyEffects dans le
            // repost, self-contenu, lié via repostOfId — ce qui remplace
            // l'ancien chemin composer qui produisait une story VIDE (il forçait
            // repostOfId: nil et ne dupliquait jamais le média source).
            // Le repost ainsi créé est un POST, pas une story : cette ligne a
            // longtemps annoncé `targetType .story`, ce que le bouton ne fait
            // plus depuis qu'il ouvre le composeur (`.post` explicite, cf.
            // `StoryViewerView`).
            if railPlan.showsRepost {
                StoryActionButton(
                    icon: "arrow.2.squarepath",
                    label: storyRepostCount > 0 ? "\(storyRepostCount)" : String(localized: "story.viewer.action.repost", defaultValue: "Republier", bundle: .main)
                ) {
                    // Republication : ouvre le COMPOSEUR prérempli au lieu de
                    // republier d'un tap côté serveur.
                    //
                    // L'ancien chemin appelait `PostService.repost` directement :
                    // la story repartait à l'identique, sans possibilité d'ajouter
                    // du texte ni de choisir l'audience — et son libellé annonçait
                    // « Partager », ce qui achevait la confusion. La demande
                    // produit (2026-08-19) est explicite : « ça ouvre la story
                    // composeur permettant d'ajouter plus du texte ».
                    //
                    // Le composeur porte la chaîne de repost (`repostOfId`) et un
                    // badge d'attribution VERROUILLÉ ; son sélecteur d'audience est
                    // plafonné par `StoryRepostAudience`. La présentation vit dans
                    // `StoryViewerView` (`republishStorySource`).
                    guard let story = currentStory, let group = currentGroup else { return }
                    HapticFeedback.light()
                    pauseTimer()
                    republishStorySource = RepostPostSourceWrapper(
                        story: story,
                        authorHandle: group.username
                    )
                }
            } else if railPlan.showsViews {
                StoryActionButton(
                    icon: "eye.fill",
                    label: storyViewCount > 0 ? "\(storyViewCount)" : String(localized: "story.viewer.action.views", defaultValue: "Vues", bundle: .main)
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showViewersSheet = true
                }
            }

            // Author-only Partager + Enregistrer — deux actions DISTINCTES
            // (Task 10, revue Task 7 : le rail avait perdu tout accès au
            // partage externe en passant l'ancien bouton « Exporter » par
            // `StoryPhotoSaveService`, silencieusement, sous une icône et un
            // libellé de partage). Alignées sur la ligne « Mes stories » :
            //
            //   Partager    → sheet `StoryExportShareSheet` (choix de langue)
            //                 → `UIActivityViewController` (WhatsApp, Messages,
            //                 AirDrop, Photos…). Reste au PREMIER PLAN — une
            //                 sheet modale, jamais une tâche de fond, sinon
            //                 elle surgirait après coup alors que l'utilisateur
            //                 a déjà navigué ailleurs.
            //   Enregistrer → `StoryPhotoSaveService.shared.save(story:)`,
            //                 EXACTEMENT comme sur la ligne « Mes stories »
            //                 (Task 7) : même source de vérité, donc un export
            //                 lancé ici apparaît aussi dans la liste et
            //                 réciproquement. Tant qu'un job est en vol pour
            //                 cette story, ce bouton (lui seul) devient
            //                 l'anneau de progression et son tap annule.
            //
            // NEVER uploads to the Meeshy backend (stories publish RAW, see
            // CLAUDE.md "Story Architecture").
            //
            // Membership des DEUX boutons = `railPlan.showsExport` SEUL,
            // jamais `currentStory` — même patron que Reply (L276) et Repost
            // (L322) : `currentStory` n'est déballé que DANS les closures, pas
            // pour décider si un bouton existe. Conditionner l'existence sur
            // `let story = currentStory` romprait l'invariant documenté plus
            // haut (L160-164) : un bouton ne doit jamais apparaître/disparaître
            // en cours de lecture — seul le rail figé à l'entrée du slide en
            // décide. `currentStory` n'a aucune raison structurelle de
            // s'aligner sur ce figement (revue Task 7, finding Important).
            //
            // Résolution PURE extraite dans `StoryExportRailButtons` (testée
            // par `StoryViewerExportRailTests`) : Partager reste vrai que la
            // sauvegarde soit ou non en vol, seul Enregistrer bascule vers
            // l'anneau.
            let exportSaveProgress = railPlan.showsExport
                ? currentStory.flatMap { saveService.progress(for: $0.id) }
                : nil
            let exportRailButtons = StoryExportRailButtons.resolve(
                showsExport: railPlan.showsExport,
                saveProgress: exportSaveProgress
            )
            // MÊME booléen pour le rendu de l'anneau et pour `.disabled` : sur
            // des `Shape` à couleur explicite, `.disabled` seul ne change
            // strictement rien à l'écran (cf. `StorySaveProgressRing.appearance`).
            let exportIsCancellable = currentStory.map { saveService.isCancellable(storyId: $0.id) } ?? false

            if exportRailButtons.showsShareButton {
                StoryActionButton(
                    icon: "square.and.arrow.up.fill",
                    label: String(localized: "story.viewer.action.share", defaultValue: "Partager", bundle: .main)
                ) {
                    HapticFeedback.light()
                    // Sheet MODALE : on pause tout de suite (comme Envoyer /
                    // Vues / Éditer-et-republier) — `resumeTimer()` est déjà
                    // câblé sur `onDismiss` de cette sheet (StoryViewerView).
                    pauseTimer()
                    showExportShareSheet = true
                }
            }

            if exportRailButtons.showsSaveProgressRing, let progress = exportSaveProgress {
                // Même job, même source de vérité que la ligne « Mes
                // stories » : un export lancé depuis l'une des deux
                // surfaces progresse sur les deux.
                Button {
                    HapticFeedback.light()
                    guard let story = currentStory else { return }
                    saveService.cancel(storyId: story.id)
                } label: {
                    StorySaveProgressRing(progress: progress, tint: MeeshyColors.indigo400,
                                          diameter: 32, isCancellable: exportIsCancellable)
                }
                .buttonStyle(.plain)
                // Le tap cesse d'être actif dès que l'écriture photothèque a
                // commencé : `PHPhotoLibrary.performChanges` n'est pas
                // annulable (cf. `StoryPhotoSaveService.isCancellable`). Le
                // rail suit la MÊME règle que la ligne « Mes stories », sinon
                // les deux surfaces divergeraient sur le même job.
                .disabled(!exportIsCancellable)
                // Contrairement à la ligne « Mes stories »
                // (`.accessibilityElement(children: .ignore)`, libellé
                // composé au niveau de la LIGNE), ce bouton n'est enfant
                // d'AUCUN élément fusionné ici : il doit porter lui-même
                // son libellé et sa valeur, sinon VoiceOver n'annoncerait
                // que son contenu visuel brut (un nombre nu).
                .accessibilityLabel(String(localized: "story.mine.save.cancel.a11y",
                                           defaultValue: "Annuler l'enregistrement", bundle: .main))
                .accessibilityValue(Text(String(
                    localized: "story.mine.save.progress.a11y",
                    defaultValue: "Enregistrement \(StorySaveProgressRing.percent(progress)) %", bundle: .main)))
            } else if exportRailButtons.showsSaveButton {
                StoryActionButton(
                    icon: "square.and.arrow.down.fill",
                    label: String(localized: "story.viewer.action.save", defaultValue: "Enregistrer", bundle: .main)
                ) {
                    HapticFeedback.light()
                    guard let story = currentStory else { return }
                    saveService.save(story: story)
                }
            }

            // 4. Mute/Unmute — only shown when the story has genuinely audible
            // sound (voice note, background audio, or a video carrying a real
            // audio track). Silent videos keep the button hidden.
            if railPlan.showsSound {
                StoryActionButton(
                    icon: isGlobalMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                    label: isGlobalMuted
                        ? String(localized: "story.viewer.action.mute", defaultValue: "Muet", bundle: .main)
                        : String(localized: "story.viewer.action.sound", defaultValue: "Son", bundle: .main),
                    isActive: !isGlobalMuted,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: isGlobalMuted ? nil : MeeshyColors.indigo400
                ) {
                    // VoiceOver active un Button par son ACTION d'accessibilité,
                    // il ne synthétise pas de `TapGesture` — laisser ce closure
                    // vide rendait le mute inatteignable au lecteur d'écran :
                    // le bouton était annoncé, focalisable, et le double-tap ne
                    // faisait rien. Les deux chemins appellent donc le même
                    // toggle. Pas de double déclenchement : un tap réel est
                    // capté par le `highPriorityGesture` (qui gagne sur le tap
                    // interne du Button), et une activation VoiceOver ne passe
                    // que par ce closure.
                    toggleGlobalMute()
                }
                .highPriorityGesture(
                    // Le geste haute priorité reste nécessaire : sans lui, les
                    // gestes parents du reader avalent le tap (cf. régression
                    // « drags lents mangés par les Buttons »).
                    TapGesture().onEnded { toggleGlobalMute() }
                )
            }

            // 5. Comments toggle — visible UNIQUEMENT quand au moins un
            // commentaire existe sur la story (pour TOUS, auteur inclus). Sous
            // la sidebar, la zone d'écriture en bas permet déjà de laisser le
            // premier commentaire, donc un bouton à 0 ne serait que du bruit
            // visuel (user spec 2026-05-28 + 2026-06-23 : ne pas afficher
            // l'icône commentaire si aucun commentaire n'est laissé).
            // MEMBERSHIP FIGÉE À L'ENTRÉE DU SLIDE (directive 2026-07-10) : la
            // réconciliation `loadStoryCommentCount()` (+Content) met toujours
            // le COMPTEUR à jour (label + prochains slides), mais ne fait plus
            // APPARAÎTRE ce bouton en cours de lecture — le set est décidé
            // avant affichage, depuis le payload feed.
            if railPlan.showsComments {
                StoryActionButton(
                    icon: "bubble.left.fill",
                    label: "\(storyCommentCount)",
                    isActive: showCommentsOverlay,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: showCommentsOverlay ? MeeshyColors.indigo400 : nil
                ) {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showCommentsOverlay.toggle()
                    }
                    if showCommentsOverlay && isStoryCommentsEmpty {
                        loadStoryComments()
                    }
                }
            }

            // 6. Traductions — ouvre la BARRE RAPIDE horizontale des langues
            //    prêtes (directive user 2026-07-26). Le tap toggle
            //    `showLanguageOptions` ; la barre (rendue au-dessus du composer)
            //    porte les langues prêtes + un « + » à droite qui ouvre la
            //    liste complète (`showFullLanguagePicker`). Un badge accolé
            //    montre la langue courante — il remplace le badge (EN) qui était
            //    ancré en bas-gauche du canvas.
            if railPlan.showsTranslations {
                StoryActionButton(
                    icon: "textformat.abc",
                    label: String(localized: "story.viewer.action.translations", defaultValue: "Traductions", bundle: .main),
                    isActive: showLanguageOptions || showFullLanguagePicker,
                    activeColor: MeeshyColors.indigo400,
                    activeGlow: MeeshyColors.indigo400,
                    handlesTapViaGesture: true
                ) {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showLanguageOptions.toggle()
                    }
                }
                .highPriorityGesture(languageScrubGesture)
                .overlay(alignment: .topLeading) {
                    if let code = displayedLanguageCode, !code.isEmpty {
                        Text(code.uppercased())
                            .font(MeeshyFont.relative(9, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(MeeshyColors.indigo500))
                            .overlay(Capsule().stroke(Color.white.opacity(0.5), lineWidth: 0.5))
                            .offset(x: -12, y: -2)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                }
                // Barre rapide des langues — surgit À GAUCHE du bouton, EXACTEMENT
                // comme le strip de réactions au-dessus (même overlay trailing,
                // même transition scale-depuis-trailing, même offset -56). Défile
                // horizontalement si la liste dépasse ; le « + » ouvre la liste
                // complète (directive user 2026-07-26).
                .overlay(alignment: .trailing) {
                    if showLanguageOptions {
                        StoryLanguageQuickBar(
                            languages: availableTranslationLanguages,
                            activeLanguageCode: activeLanguageCode ?? displayedLanguageCode,
                            onSelect: { lang in
                                onSelectLanguageOverride(lang)
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showLanguageOptions = false
                                }
                            },
                            onOpenFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showLanguageOptions = false
                                    showFullLanguagePicker = true
                                }
                            },
                            highlightedIndex: scrubHoveredLanguageIndex,
                            scrubFrameSpace: StoryScrubSpace.name,
                            onTileFrames: { languageTileFrames = $0 }
                        )
                        // Présentée comme la barre de réaction (L292) : `.fixedSize()`
                        // pour que la pilule ÉPOUSE son contenu, jamais une largeur
                        // fixe vide (directive user 2026-07-26 : même taille que la
                        // barre de réaction). Le cap/défilement éventuel est géré
                        // À L'INTÉRIEUR de StoryLanguageQuickBar quand la liste est longue.
                        .fixedSize()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .offset(x: -56)
                    }
                }
                .zIndex(10)
            }
        }
    }

    /// Bascule le mute global du reader et prévient le canvas.
    ///
    /// Extrait pour que l'action du `Button` (chemin VoiceOver) et le
    /// `highPriorityGesture` (chemin tactile) partagent exactement le même
    /// comportement — la divergence entre les deux était la cause du mute
    /// inatteignable au lecteur d'écran.
    private func toggleGlobalMute() {
        HapticFeedback.light()
        isGlobalMutedBinding.toggle()
        NotificationCenter.default.post(
            name: isGlobalMutedBinding ? .storyComposerMuteCanvas : .storyComposerUnmuteCanvas,
            object: nil
        )
    }

}

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

                            if let story = currentStory {
                                HStack(spacing: 4) {
                                    // Horloge accolée à l'HEURE DE PUBLICATION —
                                    // elle qualifie la date affichée, elle ne parle
                                    // plus d'expiration. Le compte à rebours
                                    // « Expire dans Xh » a été retiré du header
                                    // (directive user 2026-07-30) : la durée de vie
                                    // d'une story est une constante produit, pas une
                                    // information à relire à chaque slide.
                                    Image(systemName: "clock")
                                        .font(MeeshyFont.relative(9, weight: .semibold))
                                        .foregroundColor(.white.opacity(0.6))
                                        .accessibilityHidden(true)

                                    Text(story.timeAgo)
                                        .font(MeeshyFont.relative(12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))

                                    // Annonce du fond (B3.3-5) : résolveur
                                    // unique — `BackgroundSoundBadge` rend
                                    // EmptyView sans piste (B3.5), sinon note
                                    // PUIS onde (piste ORIGINALE, directive
                                    // user 2026-07-30) ou marquee crédit
                                    // (bibliothèque, directive user
                                    // 2026-08-02). Même vue que la carte de
                                    // post et le plein écran réel (E1, « un
                                    // résolveur, trois surfaces »). Accent
                                    // FIXE (pas `group.avatarColor`) : le
                                    // header se pose sur un média arbitraire
                                    // (photo/vidéo), comme l'horloge et
                                    // l'heure voisines — non-régression du
                                    // blanc pré-E1.
                                    BackgroundSoundBadge(
                                        announcement: backgroundSoundAnnouncement,
                                        accentHex: BackgroundSoundBadge.overMediaAccentHex
                                    )
                                    .equatable()
                                }
                            }
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
                        // portait le même `arrow.2.squarepath` avant ce correctif —
                        // deux permanences différentes n'ont pas le même dessin.
                        Button {
                            repostAsPostDirect()
                        } label: {
                            Label(String(localized: "story.viewer.repostAsPost", defaultValue: "Republier en post", bundle: .main), systemImage: "bookmark.fill")
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
