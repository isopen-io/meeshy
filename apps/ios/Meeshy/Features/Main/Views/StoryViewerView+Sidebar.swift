import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView sidebar
//
// Dedicated View structs extracted from StoryViewerView so the action sidebar
// no longer composes into StoryViewerView.body's opaque type. Real structs
// (vs AnyView) break the type while preserving SwiftUI structural identity.
//
// L'EN-TÊTE vit chez lui depuis #4084 : `StoryViewerView+Header.swift`. Ce
// fichier portait les deux vues pour 1 368 lignes, hors du budget 800–1100 ;
// une garde qui cherchait l'en-tête ici doit désormais nommer l'autre fichier.

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
