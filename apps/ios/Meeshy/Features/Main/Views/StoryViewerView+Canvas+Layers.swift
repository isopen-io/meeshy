import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Les couches du canvas

/// Les couches que la carte du lecteur empile PAR-DESSUS la scène : chips audio,
/// pastilles de lieu, chrome haut, commentaires, rail d'actions, vol de réaction
/// et sélecteurs plein écran. Chacune est un enfant du ZStack de
/// `StoryCardView.body` — elles n'en sortent que pour tenir dans le budget de
/// taille ; leur ordre d'empilement reste celui du `body`.
extension StoryCardView {

    /// Layer 6.5 — chips audio de PREMIER PLAN, au-dessus du gesture overlay.
    @ViewBuilder
    var foregroundAudioLayer: some View {
        // === Layer 6.5: Foreground audio chips ===
        // Au-dessus du gesture overlay : le tap d'un chip est consommé
        // avant d'atteindre la nav gauche/droite des slides. Masqué hors
        // de la fenêtre `startTime..startTime+duration` de chaque audio.
        // Le tap toggle le mute *per-piste* via la registry partagée
        // (`StoryReaderAudioMuteRegistry`) — la canvas applique au mixer.
        if let story = currentStory,
           let audios = story.storyEffects?.audioPlayerObjects,
           !audios.isEmpty {
            AudioForegroundReaderOverlay(
                foregroundAudios: audios,
                slideDuration: currentSlideDuration
            )
            .storyFocusFade(readerDecorationsShown)
        }
    }

    /// Layer 6.6 — cibles de tap des pastilles de lieu.
    @ViewBuilder
    var locationTapLayer: some View {
        // === Layer 6.6: Location badge tap targets ===
        // Au-dessus du gesture overlay (même règle que les chips audio) :
        // le tap d'une pastille de lieu ouvre la carte au lieu de
        // naviguer. Réplique le cadrage EXACT du canvas visible (frame
        // `canvasFitSize` + scale/offset carte, même ressort) pour que
        // les cibles tombent sur les badges dessinés par
        // `StoryLocationLayer` — la zone vient de `badgeFrame`, la mesure
        // partagée avec le rendu.
        if let story = currentStory,
           let locations = story.storyEffects?.locationObjects,
           !locations.isEmpty {
            StoryLocationReaderTapOverlay(locations: locations, onTap: { place in
                HapticFeedback.light()
                pauseTimer()
                readerFullscreenPlace = StoryReaderPlaceWrapper(place: place)
            })
            .frame(width: canvasFitSize.width, height: canvasFitSize.height)
            .scaleEffect(readerCanvasFraming.scale)
            .offset(y: readerCanvasFraming.offset.height)
            .animation(.spring(response: 0.42, dampingFraction: 0.84), value: canvasIsExpanded)
            .storyFocusFade(readerDecorationsShown)
        }
    }

    /// Layer 7 — barres de progression, en-tête, personnes nommées.
    @ViewBuilder
    var topChromeLayer: some View {
        // === Layer 7: Top UI (progress bars + header) — ABOVE gesture overlay for hit testing ===
        // min 59pt accounts for Dynamic Island when .statusBarHidden() zeroes safeAreaInsets
        VStack(spacing: 0) {
            StoryLiveProgressBars(
                clock: progressClock,
                group: currentGroup,
                currentIndex: currentStoryIndex,
                scrubber: sceneScrubber,
                onScrubStateChanged: onScrubStateChanged,
                onSeek: seekTimer
            )
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.top, topInset + 4)

            StoryHeaderView(
                currentGroup: currentGroup,
                currentStory: currentStory,
                isOwnStory: isOwnStory,
                backgroundSoundAnnouncement: backgroundSoundAnnouncement, isGlobalMuted: $isGlobalMutedBinding,
                hasAudioTranscript: storyHasAudioTranscript,
                showAudioTranscript: $showAudioTranscript,
                selectedProfileUser: $selectedProfileUser,
                showReportSheet: $showReportSheet,
                sharedContentWrapper: $sharedContentWrapper,
                showExportShareSheet: $showExportShareSheet,
                makeStoryExternalShareURL: makeStoryExternalShareURL,
                deleteCurrentStory: deleteCurrentStory,
                pauseTimer: pauseTimer,
                dismissViewer: dismissViewer,
                reportStory: reportStory,
                isFullscreenStorySession: $isFullscreenStorySession,
                chromeVisible: $chromeVisible
            )
                .padding(.top, MeeshySpacing.smPlus)

            // Les personnes que la story NOMME en mode NOTE, sous l'auteur.
            //
            // La donnée arrivait déjà jusqu'ici (`StoryItem.mentions`,
            // servie par le gateway, décodée par le SDK) mais aucune vue du
            // reader ne la lisait : une story qui nommait quelqu'un en NOTE
            // ne le montrait NULLE PART, alors que la personne nommée
            // recevait bien sa notification et ouvrait la story pour n'y
            // trouver aucune trace. Les posts, eux, l'affichaient depuis le
            // début (`FeedPostCard`, `PostDetailView`).
            //
            // La rangée fait ses propres tris et n'a besoin d'aucune garde
            // ici : SILENT n'y figure jamais (il ne se voit que par son
            // sujet, via le marqueur personnel), PINNED non plus (la
            // pastille posée sur le canevas EST déjà son affichage).
            // Vide, elle ne rend rien — pas de place réservée.
            //
            // DANS le chrome, à dessein : elle disparaît avec l'en-tête et
            // le rail quand le lecteur veut voir le contenu nu.
            ReferenceNoteRow(
                references: currentStory?.mentions ?? [],
                currentUserId: AuthManager.shared.currentUser?.id,
                accentColor: Color(hex: composerAccentColor),
                onTapReference: { selectedProfileUser = .from(reference: $0) }
            )
            .equatable()
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.xsPlus)

            Spacer()
        }
        // Width strict — même rationale que le sidebar Layer 8 : le
        // UIViewRepresentable du canvas expanse le ZStack parent ce qui
        // fait sortir le bouton « Fermer » (xmark) du header hors écran
        // (mesuré x=391 r=427 sur viewport 402pt avant ce fix, 2026-05-27).
        .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
        .clipped()
        // Glissement vers le HAUT à la disparition + fondu. Le `.offset`
        // négatif fait sortir progress bars + header de l'écran ; on
        // ajoute une opacity 0 pour que l'élément reste totalement
        // invisible lorsqu'il est positionné juste en dehors du safe area
        // (sinon un sliver pixelé peut traîner sur certaines tailles).
        .offset(y: chromeVisible ? 0 : -(topInset + 120))
        .storyFocusFade(readerChromeShown)
        .animation(.spring(response: 0.32, dampingFraction: 0.78), value: chromeVisible)
        .environment(\.colorScheme, readerChromeScheme)
    }

    /// Layer 7.5 — overlay flottant des commentaires.
    @ViewBuilder
    var commentsOverlayLayer: some View {
        // === Layer 7.5: Floating comments overlay (Instagram-style) ===
        // Rendered BEFORE the sidebar / composer / reaction flight blocks so
        // SwiftUI ZStack z-orders it BENEATH the story controls — user
        // can still tap React / Reply / mute / settings while comments
        // are visible. Background story stays interactable (tap to pause,
        // long-press) through the overlay's transparent surface.
        if showCommentsOverlay {
            makeCommentsOverlay().placed(commentsZoneReading(geometry: geometry)).equatable()
                // Le UIViewRepresentable du canvas expanse le ZStack parent
                // au-delà du viewport (même cause que Layer 7 header et
                // Layer 8 sidebar, cf. note ligne ~1024). Sans contrainte de
                // largeur, l'overlay hérite de cette largeur trop grande et,
                // le ZStack étant centré, ses rows (padding leading 28)
                // démarrent à un x négatif → la ligne de commentaire sort du
                // viewport à gauche (bug user 2026-06-08). On le borne à
                // geometry.size.width + clipped comme ses voisins.
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
                .clipped()
                .transition(.opacity)
                // Même scheme que le header/sidebar (Layer 7/8) : sans lui
                // le texte des réponses restait blanc fixe, illisible sur un
                // fond de story clair/blanc — seul un halo protégeait
                // jusqu'ici, insuffisant sur un fond proche du blanc pur
                // (capture user 2026-08-11).
                .environment(\.colorScheme, readerChromeScheme)
        }
    }

    /// Layer 8 — rail d'actions, à droite.
    @ViewBuilder
    var actionRailLayer: some View {
        // === Layer 8: Right action sidebar — centered vertically, right side ===
        // The sidebar is bounded between the header strip (top) and the
        // composer strip (bottom) so its action buttons never slide
        // off-screen on small iPhones (SE, mini). The sidebar itself
        // ships a `ViewThatFits` fallback that switches to a vertical
        // scroller when the bounded height is still too small for the
        // full button stack.
        let topReserved: CGFloat = topInset + 100   // progress bars + header
        let bottomReserved: CGFloat = geometry.safeAreaInsets.bottom + (isOwnStory ? 56 : 96)
        let sidebarMaxHeight = max(180, geometry.size.height - topReserved - bottomReserved)
        HStack {
            Spacer()
            StoryActionSidebarView(
                isOwnStory: isOwnStory,
                // Largeur RÉELLE du viewport (le ZStack parent la dépasse —
                // cf. la note du Layer 8) : la barre de réactions s'y borne
                // pour DÉFILER au lieu de sortir par la gauche.
                viewportWidth: geometry.size.width,
                storyReactionCount: storyReactionCount,
                storyCurrentUserHasReacted: storyCurrentUserHasReacted,
                heartBouncePulse: heartBouncePulse,
                quickEmojis: quickEmojis,
                onReplyToStory: onReplyToStory,
                currentStory: currentStory,
                currentGroup: currentGroup,
                storyCommentCount: storyCommentCount,
                storyCommentCountReconciledPulse: storyCommentCountReconciledPulse,
                storyShareCount: storyShareCount,
                storyViewCount: storyViewCount,
                storyRepostCount: storyRepostCount,
                isStoryCommentsEmpty: isStoryCommentsEmpty,
                storyHasAudibleSound: storyHasAudibleSound,
                storyHasTranslatableContent: storyHasTranslatableContent,
                isGlobalMuted: isGlobalMuted,
                availableTranslationLanguages: availableTranslationLanguages,
                activeLanguageCode: activeLanguageCode,
                displayedLanguageCode: resolvedViewerLanguage,
                onSelectLanguageOverride: onSelectLanguageOverride,
                showEmojiStrip: $showEmojiStrip,
                showFullEmojiPicker: $showFullEmojiPicker,
                showCommentsOverlay: $showCommentsOverlay,
                showLanguageOptions: $showLanguageOptions,
                showFullLanguagePicker: $showFullLanguagePicker,
                showViewersSheet: $showViewersSheet,
                isGlobalMutedBinding: $isGlobalMutedBinding,
                sharedContentWrapper: $sharedContentWrapper,
                isPresented: $isPresented,
                reactionStripOwnsDrag: $reactionStripOwnsDrag,
                triggerStoryReaction: triggerStoryReaction,
                onScrubStateChanged: onScrubStateChanged,
                pauseTimer: pauseTimer,
                loadStoryComments: loadStoryComments
            )
                .frame(maxHeight: sidebarMaxHeight)
                // 16pt clears the iPhone Pro rounded-corner radius at the
                // sidebar's vertical position (mid-screen). 6pt was
                // visibly too tight — button labels « React », « Répondre »,
                // « Envoyer », « Son » were clipped on the right
                // (bug user 2026-05-28 « les elements sortent du viewport »).
                .padding(.trailing, MeeshySpacing.lg)
        }
        .padding(.top, topReserved)
        .padding(.bottom, bottomReserved)
        // Width strict + clipped — sur iPhone 16 Pro le UIViewRepresentable
        // du canvas expanse le ZStack parent à ~491pt (cf. canvasFitSize
        // doc). Le sidebar à right edge tombait alors hors écran. Cap
        // dur du HStack à `geometry.size.width` + clip pour empêcher
        // tout débordement (bug 2026-05-27). Le Spacer + l'alignement
        // .trailing dans le HStack interne suffisent pour pousser le
        // sidebar VStack au bord droit visible.
        // `.bottomTrailing` (2026-07-10) : le rail s'ancre au BAS de sa
        // bande utile (juste au-dessus du composer) au lieu d'être centré
        // verticalement — les actions restent « à portée de pouce » et le
        // vide perçu au-dessus du composer disparaît (IMG_0984).
        .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottomTrailing)
        .clipped()
        // Glissement vers la DROITE à la disparition + fondu. L'offset
        // de 110pt couvre largement la largeur du chip (max 48pt) + son
        // padding-trailing (6pt) + un peu de marge pour les écrans sans
        // bord arrondi. Hit-testing désactivé en plus de l'opacité 0 pour
        // éviter qu'un tap fantôme atterrisse sur un bouton invisible.
        .offset(x: chromeVisible ? 0 : 110)
        .storyFocusFade(readerChromeShown)
        .environment(\.colorScheme, readerChromeScheme)
        // **Le rail passe AU-DESSUS du corpus déplié** (#4831).
        //
        // La légende est montée en `zIndex(60)` pour recevoir son tap (elle
        // vivait sous la couche de gestes, #4762) ; le rail, déclaré plus
        // bas mais sans `zIndex`, se retrouvait DESSOUS. Or le corpus
        // déplié est une `ScrollView` en `frame(maxWidth: .infinity)` :
        // elle prend les touchers sur toute la colonne, y compris la bande
        // du rail — dont le texte s'écarte pourtant soigneusement
        // (`expandedTrailingInset`). Mesuré au simulateur : Send, Vues,
        // Partager, Enregistrer et Traductions restaient PARFAITEMENT
        // VISIBLES et ne répondaient plus.
        //
        // > Écarter un TEXTE d'un voisin ne lui rend pas ses touchers. La
        // > vue qui les prend n'est pas celle qu'on voit : c'est son
        // > conteneur, et lui n'a pas de retrait. Un contrôle visible et
        // > inerte est pire qu'un contrôle caché — rien n'indique pourquoi
        // > il ne répond pas.
        .zIndex(70)
    }

    /// Layer 9 — réaction en vol (tuile agrandie → cœur, ≤ 1 s).
    @ViewBuilder
    var reactionFlightLayer: some View {
        // === Layer 9: Reaction flight (tuile agrandie → cœur, ≤ 1 s) ===
        if let flight = reactionFlight {
            StoryReactionFlightView(
                flight: flight,
                target: heartFrame,
                onArrived: { heartBouncePulse += 1 },
                onFinished: { reactionFlight = nil }
            )
            .storyFocusFade(readerDecorationsShown)
            // Identité PAR VOL : sans elle, une deuxième réaction envoyée
            // dans les 750ms de la première ne fait que muter la vue déjà
            // montée (structural identity) — `@State progress` reste à 1,
            // `onAppear` ne re-tique jamais (aucun mouvement, aucun
            // rebond), et l'`asyncAfter` du premier vol efface l'overlay
            // en avance (revue fix round 1, 2026-08-11).
            .id(flight.id)
            // Même garde que les autres calques flottants (header, rail,
            // composer, pickers plein écran) : le canvas gonfle le ZStack
            // parent au-delà du viewport, un calque non borné s'y étale
            // avant de se faire rogner par le `.clipped()` final
            // (StoryOverlayWidthPinGuardTests).
            .frame(maxWidth: geometry.size.width)
            .zIndex(50)
        }
    }

    /// Sélecteur d'emojis complet — RÉACTIONS seulement (envoi par l'API).
    @ViewBuilder
    var fullEmojiPickerLayer: some View {
        // Full emoji picker — REACTIONS ONLY (sends via API)
        if showFullEmojiPicker {
            EmojiFullPickerSheet(
                style: .dark,
                onReact: { emoji in
                    triggerStoryReaction(emoji, nil)
                },
                onDismiss: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFullEmojiPicker = false
                    }
                }
            )
            // Borné au viewport RÉEL, jamais `.infinity` : le canvas gonfle
            // la largeur intrinsèque du ZStack parent au-delà de l'écran
            // (~480 pt vs 402 pt sur iPhone 16 Pro), et un calque non borné
            // s'y étale avant de se faire rogner aux deux bords par le
            // `.clipped()` final. Même pin que le header, le rail et le
            // composer.
            .frame(maxWidth: geometry.size.width)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .zIndex(100)
        }
    }

    /// Layer 10 — explorateur de langues complet (Prisme).
    @ViewBuilder
    var fullLanguagePickerLayer: some View {
        // === Layer 10: Explorateur de langues complet (Prisme) — remplace
        // l'ancien `LanguagePickerSheet` mal intégré au liquid glass et sans
        // dark/light (directive user 2026-07-26). Reprend le visuel de la
        // liste extraite de la vue de conversation : contenu de la langue
        // COURANTE en tête + liste avec aperçu, retraduire et « Traduire »
        // on-demand. La story reste visible derrière. ===
        if showFullLanguagePicker, let story = currentStory {
            StoryLanguageDetailView(
                story: story,
                activeLanguageCode: activeLanguageCode,
                onSelectLanguage: { code in
                    LanguageUsageTracker.recordUsage(languageId: code)
                    // Prisme « Exploration » : override prépendu à la chaine ;
                    // le reader se re-rend dès l'arrivée de la traduction.
                    onSelectLanguageOverride(code)
                },
                onTranslate: { code, force in
                    Task {
                        await StoryInteractionService().requestTranslation(
                            storyId: story.id,
                            targetLanguage: code,
                            force: force
                        )
                    }
                },
                onDismiss: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFullLanguagePicker = false
                    }
                }
            )
            // Idem : sans ce pin, la feuille remplissait les ~480 pt du
            // ZStack gonflé par le canvas et perdait ~39 pt de chaque côté
            // sous le `.clipped()` — titre amputé à gauche, boutons
            // « Traduire » coupés à droite (bug user 2026-07-27).
            .frame(maxWidth: geometry.size.width)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .zIndex(150)
        }
        // La barre rapide des langues (`showLanguageOptions`) est rendue dans
        // le rail, À GAUCHE du bouton « Abc » (comme le strip de réactions) —
        // voir `StoryViewerView+Sidebar`. Plus d'overlay bas-de-composer ici.
    }
}
