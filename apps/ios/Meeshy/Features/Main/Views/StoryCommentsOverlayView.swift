import SwiftUI
import MeeshySDK
import MeeshyUI

/// Full-featured comment overlay: occupies bottom half of screen with
/// infinite scroll, reply threading (simple indentation), inline
/// UniversalComposerBar, and timer pause. All other controls except
/// the composer are hidden.
///
/// Extracted from `StoryViewerView.storyCommentsOverlay` (formerly an
/// `AnyView`) so the deeply-nested comment panel becomes its own
/// type-metadata unit instead of inflating the viewer's opaque type.
struct StoryCommentsOverlayView: View {
    let storyComments: [FeedComment]
    let storyCommentCount: Int
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    /// Pagination des réponses par fil (endpoint replies paginé à 20) — pilote
    /// le bouton « Voir plus de réponses » de chaque `StoryCommentThread`.
    var storyCommentRepliesHasMore: [String: Bool] = [:]
    let isLoadingComments: Bool
    let userLang: String
    /// Vrai quand la story consultée est expirée. Affiche une bannière au-dessus
    /// de la liste pour que les commentaires/réactions restent visibles tout en
    /// indiquant que la story n'est plus accessible (spec 2026-06-23).
    var isStoryExpired: Bool = false

    /// Commentaire ciblé par une notification : premier scroll de la liste
    /// dirigé sur lui (repli : parent de thread) au lieu du dernier commentaire.
    var targetCommentId: String? = nil
    var targetParentCommentId: String? = nil
    /// Chasse paginée fournie par le parent quand la cible n'est pas dans les
    /// pages chargées (les pages qui arrivent re-déclenchent le scroll via
    /// l'onChange sur le count).
    var huntTargetComment: (@MainActor () async -> Void)? = nil
    /// Page suivante des réponses d'un fil (commentId) — câblé sur
    /// `loadMoreStoryCommentReplies` côté StoryViewerView.
    var loadMoreStoryCommentReplies: (@MainActor (String) async -> Void)? = nil
    /// Ciblage d'une RÉPONSE : déplie le fil du parent (parentId) puis chasse
    /// les pages de réponses jusqu'à la cible (replyId). Retourne `true` si la
    /// réponse est chargée à l'issue de la chasse.
    var revealTargetReply: (@MainActor (_ parentId: String, _ replyId: String) async -> Bool)? = nil
    /// Latch — un seul ciblage par montage de l'overlay, ensuite la liste
    /// reprend le comportement historique (suivre le dernier commentaire).
    @State private var hasScrolledToTargetStoryComment = false
    @State private var hasRequestedTargetHunt = false

    @Binding var showCommentsOverlay: Bool
    /// Quand non-nil, le composer principal affiche sa reply banner ; la liste
    /// défile jusqu'au commentaire visé (la plaque mesurée, banner comprise,
    /// déplace `zone`).
    @Binding var replyingToStoryComment: FeedComment?

    /// Où la liste se pose et jusqu'où elle monte : la carte la place sur son
    /// composeur (`StoryCommentsZone`, #9893). Elle suit le clavier dans SA
    /// transaction — même courbe, même durée que le composeur.
    let zone: StoryCommentsZone.Frame

    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: @MainActor (String) async -> Void

    private var topLevelComments: [FeedComment] {
        storyComments.filter { $0.parentId == nil }
    }

    /// Instagram-style top fade — older comments dissolve toward the middle
    /// of the screen as the user scrolls up. Bottom stays solid so the row
    /// touching the composer is fully legible.
    private var listFadeMask: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0.0),
                .init(color: .black.opacity(0.4), location: 0.12),
                .init(color: .black, location: 0.30),
                .init(color: .black, location: 1.0)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Instagram-style overlay: comments float above the composer with a top
    /// fade, the story behind stays visible AND interactable (no opaque
    /// background catching taps). Composer alone wears a subtle glass strip so
    /// the input is legible against any background.
    ///
    /// No global scrim behind the list — each individual `StoryCommentRowView`
    /// carries its own dark bubble for legibility (user spec 2026-05-28:
    /// « enlève le fond dégradé noir sur le composant de listing »). The
    /// `listFadeMask` keeps fading rows out at the top so older comments
    /// dissolve into the story above as the user scrolls up.
    /// Bannière « story expirée » : les commentaires/réactions restent
    /// consultables, mais on signale que la story n'est plus accessible.
    private var expiredStoryBanner: some View {
        Label {
            Text(String(localized: "story.viewer.expiredBanner", defaultValue: "Story expirée — les commentaires restent visibles", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .lineLimit(1)
        } icon: {
            Image(systemName: "clock.badge.xmark")
                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
        }
        .foregroundColor(MeeshyColors.mediaChromeSecondary)
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .background(Capsule().fill(MeeshyColors.error.opacity(0.32)))
        .padding(.bottom, MeeshySpacing.xsPlus)
        .transition(.opacity)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            if isStoryExpired {
                expiredStoryBanner
            }
            let topLevel = topLevelComments   // filtré UNE fois par rendu (3 lectures avant)
            commentsList(topLevel)
                // Les médias de TOUS les commentaires de la story (racines +
                // réponses dépliées) se feuillettent ensemble en plein écran.
                .commentMediaGallery(topLevel: topLevel, replies: storyCommentRepliesMap)
                .frame(maxHeight: zone.maxHeight)
                // Bord supérieur RÉEL de la zone défilante, remonté au viewer :
                // c'est lui qui sépare « geste né dans la liste » (au scroll) de
                // « geste né dans la story encore visible au-dessus » (au drag
                // parent, qui referme alors l'overlay). Publié ICI, sur le
                // conteneur PARENT du `ScrollView` — le mettre à l'intérieur du
                // contenu défilant asservirait la clé au scroll, et sous iOS 18+
                // `onPreferenceChange` ne re-tirerait plus.
                //
                // Mesuré AVANT le `.mask` : le dégradé de fondu efface les
                // premières rows à l'œil mais la zone reste défilante, donc
                // interdite au drag parent. Et avant le `.padding(.bottom:)`, qui
                // ne déplace pas ce bord.
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: StoryReaderScrollableSurfaceTopKey.self,
                            value: proxy.frame(in: .global).minY
                        )
                    }
                )
                .mask(listFadeMask)
                // Réserve l'espace occupé par le composer principal rendu
                // dans la canvas « Bottom area » (cf. `StoryComposerBarView`
                // à canvas line ~1078). Sans cette réservation, les derniers
                // commentaires de la liste passeraient SOUS le composer
                // (bug user 2026-05-28 « deuxième instance de composer
                // apparaît et fait disparaître l'autre »). On unifie sur
                // UN SEUL composer (le principal) et on laisse la liste
                // s'arrêter juste au-dessus.
                .padding(.bottom, zone.bottomInset)
        }
        // **CRITIQUE** : forcer la VStack à remplir toute la hauteur du
        // canvas. Sans `.frame(maxHeight: .infinity)`, le `Spacer(minLength:
        // 0)` collapse à 0pt et la liste se positionne au TOP de la VStack
        // intrinsèque (~150-200pt) qui se centre dans le canvas ZStack →
        // les commentaires apparaissent dans le tiers supérieur de l'écran
        // au lieu de juste au-dessus du composer (bug user 2026-05-28
        // « la zone de commentaire est coupé »). Auparavant `composerStrip`
        // avec son `Rectangle.ignoresSafeArea(.bottom)` étirait
        // implicitement la VStack ; maintenant il faut le déclarer.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.easeInOut(duration: 0.2), value: replyingToStoryComment?.id)
    }

    // MARK: - Comments List

    private func commentsList(_ topLevel: [FeedComment]) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    ForEach(Array(topLevel.enumerated()), id: \.element.id) { idx, comment in
                        // Separator between top-level comments — `Divider()`
                        // SwiftUI natif (1pt, white opacity ~15%) au lieu de la
                        // RoundedRectangle box autour de chaque row (user spec
                        // 2026-05-28 : « alignés et séparés par des ---- »).
                        if idx > 0 {
                            Divider()
                                .overlay(Color.white.opacity(0.28))
                                .shadow(color: .black.opacity(0.3), radius: 1)
                                .padding(.vertical, MeeshySpacing.xs)
                        }

                        StoryCommentThread(
                            comment: comment,
                            replies: storyCommentRepliesMap[comment.id] ?? [],
                            isExpanded: storyCommentExpandedThreads.contains(comment.id),
                            isLoadingReplies: storyCommentLoadingReplies.contains(comment.id),
                            userLang: userLang,
                            makeRow: makeStoryCommentRow,
                            onToggleThread: { Task { await toggleStoryCommentThread(comment.id) } },
                            hasMoreReplies: storyCommentExpandedThreads.contains(comment.id)
                                && (storyCommentRepliesHasMore[comment.id] ?? false),
                            onLoadMoreReplies: loadMoreStoryCommentReplies.map { load -> (@MainActor () async -> Void) in
                                { await load(comment.id) }
                            }
                        )
                    }

                    if isLoadingComments {
                        HStack {
                            Spacer()
                            ProgressView().tint(.white.opacity(0.6))
                            Spacer()
                        }
                        .padding(.vertical, MeeshySpacing.sm)
                    }

                    if topLevel.isEmpty && !isLoadingComments {
                        emptyPlaceholder
                    }
                }
                // **Aligned with composer's 28pt outer padding** (cf.
                // canvas line 1108). Le commentaire-row visuel commence
                // exactement au même `leading` que la rangée de saisie du
                // composer → plus de désalignement entre la liste
                // commentaires et la zone Commenter / reply banner (bug
                // user 2026-05-28). Trailing 80pt préserve le dégagement
                // sidebar (Layer 8 ~56+6=62pt depuis le bord droit).
                .padding(.leading, 28)
                .padding(.trailing, 80)
                .padding(.top, MeeshySpacing.xxl)
                .padding(.bottom, MeeshySpacing.md)
            }
            .adaptiveOnChange(of: storyComments.count) { _, _ in
                // Notification → RÉPONSE précise : le parent est chargé
                // (top-level) mais la cible n'y est pas — c'est une réponse.
                // Déplier le fil du parent + chasser ses pages de réponses via
                // la closure du parent, puis scroller sur la rangée de la
                // réponse elle-même (les ancres `.id(reply.id)` existent déjà).
                // Repli : scroll sur le parent si la chasse échoue.
                if !hasScrolledToTargetStoryComment,
                   let target = targetCommentId,
                   let parentId = targetParentCommentId, parentId != target,
                   topLevelComments.contains(where: { $0.id == parentId }),
                   !topLevelComments.contains(where: { $0.id == target }),
                   let reveal = revealTargetReply {
                    hasScrolledToTargetStoryComment = true
                    Task {
                        let found = await reveal(parentId, target)
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo(found ? target : parentId, anchor: .center)
                        }
                    }
                    return
                }
                // Notification → commentaire précis : au premier chargement où
                // la cible (ou son parent de thread) est présente, scroller
                // dessus au lieu du dernier commentaire. Une seule fois par
                // présentation ; ensuite comportement historique (suivre le
                // dernier commentaire).
                if !hasScrolledToTargetStoryComment,
                   let anchorId = [targetCommentId, targetParentCommentId]
                       .compactMap({ $0 })
                       .first(where: { id in storyComments.contains { $0.id == id } }) {
                    hasScrolledToTargetStoryComment = true
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(anchorId, anchor: .center)
                    }
                    return
                }
                // Cible hors des pages chargées : demander la chasse paginée
                // une seule fois — ses pages re-déclencheront ce onChange.
                if !hasScrolledToTargetStoryComment, !hasRequestedTargetHunt,
                   targetCommentId != nil || targetParentCommentId != nil,
                   let hunt = huntTargetComment {
                    hasRequestedTargetHunt = true
                    Task { await hunt() }
                }
                if let last = storyComments.last {
                    withAnimation(.easeOut(duration: 0.3)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .adaptiveOnChange(of: replyingToStoryComment?.id) { _, newId in
                // Bring the target into view so the user sees what they're
                // replying to even if it was off-screen.
                guard let id = newId else { return }
                withAnimation(.easeOut(duration: 0.3)) {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyPlaceholder: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "bubble.left.and.bubble.right")
                // Doctrine 84i/86i : glyphe héros décoratif de l'état vide → taille
                // figée + masqué de VoiceOver (les deux libellés ci-dessous portent
                // le sens). Le texte, lui, scale avec le Dynamic Type.
                .font(.system(size: MeeshyIconSize.xxxl))
                .foregroundColor(MeeshyColors.mediaChromeTertiary)
                .accessibilityHidden(true)
            Text(String(localized: "story.viewer.comments.empty", defaultValue: "Pas encore de commentaires", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(MeeshyColors.mediaChromeSecondary)
            Text(String(localized: "story.viewer.comments.beFirst", defaultValue: "Soyez le premier à commenter !", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundColor(MeeshyColors.mediaChromeTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.xxxl)
        .storyOverlayLegible()
    }

}
