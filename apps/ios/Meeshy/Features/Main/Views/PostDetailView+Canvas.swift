import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le canvas de la page détail — vue `2h` du document composer.**
///
/// Extrait de `PostDetailView.swift` (#4086) : le fichier portait 2 572 lignes,
/// bien au-delà du budget de 800–1100 et dans la dette héritée, où la loi 4 de
/// `BOUCLE.md` interdit d'ajouter. Le canvas est une responsabilité entière :
/// ce qu'on rend, ce qu'on affiche à défaut, et le suivi de visibilité qui met
/// la lecture en pause hors écran.
///
/// Ce que la vue `2h` établit, et que ce fichier porte :
///
/// > « Le bouton n'existe que si un canvas est réellement rendu. Un post sans
/// > scène ne montre ni muet ni badge — la porte du bouton est le même
/// > prédicat que celui du rendu, jamais une seconde condition recopiée. »
///
/// La règle vit dans `BackgroundSoundBadge.canvasHasContent(_:)` et les TROIS
/// consommateurs la consultent : les deux rendus ci-dessous et la porte du
/// bouton muet dans `actionsBar`. Aucun ne la réécrit.
///
/// **La scène se voit entière, au rapport de ce qu'elle montre** (#6696,
/// #6697). Le cadre ne vient plus d'un `.aspectRatio(9.0 / 16.0)` littéral sans
/// borne de hauteur : son rapport est celui de `SceneFraming`, sa taille celle
/// de `PostDetailSceneFraming`, que la page nourrit de ce qu'elle mesure — sa
/// zone de défilement et le haut de la scène au repos.
extension PostDetailView {

    // MARK: - Story Canvas (inline reader)

    /// **Le point de décision UNIQUE : rendre, ou dire qu'il n'y a rien.**
    ///
    /// Les deux chemins qui rendent un canvas dans le détail — la story
    /// native et la republication de story — passent par ici. C'est ce qui
    /// interdit la divergence que la vue `2h` nomme : avant ce lot, le chemin
    /// natif portait la garde d'absence de contenu et le chemin republication
    /// n'en avait AUCUNE, si bien qu'une story republiée dont la source est
    /// expirée ou sans asset rendait un rectangle NOIR — là où la même story,
    /// native, affichait « Story indisponible ».
    ///
    /// La règle n'est pas écrite ici : elle vit dans
    /// `BackgroundSoundBadge.canvasHasContent(_:)`, que la porte du bouton
    /// muet consulte aussi. Trois consommateurs, une règle.
    ///
    /// `renderedItem` est HISSÉ par l'appelant (`postDetailContent`) et
    /// partagé avec cette porte (correctif revue mineur #8) : jamais
    /// reconstruit ici, où le panneau réévalue à chaque frame de scroll via
    /// `storyCanvasVisible`.
    ///
    /// `onOpen` : ce que le doigt fait sur la scène. `nil` pour la
    /// republication, dont le plein écran partagé ne connaît que le post
    /// extérieur.
    @ViewBuilder
    func storyCanvasOrPlaceholder(renderedItem: StoryItem,
                                  onOpen: (() -> Void)? = nil,
                                  @ViewBuilder reader: () -> StoryReaderRepresentable) -> some View {
        if BackgroundSoundBadge.canvasHasContent(renderedItem) {
            storyCanvasContainer(reader(), renderedItem: renderedItem, onOpen: onOpen)
        } else {
            HStack(spacing: 6) {
                Image(systemName: "sparkles.rectangle.stack")
                Text(String(localized: "feed.post.detail.story_unavailable", defaultValue: "Story indisponible", bundle: .main))
            }
            .font(.footnote)
            .foregroundColor(theme.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
        }
    }

    /// **La trace du son de fond, au-dessus de la scène** (#5602).
    ///
    /// Montée par les DEUX chemins de `storyCanvasSection` — mosaïque et
    /// mono-scène — parce qu'un post à plusieurs scènes emporte son fond comme
    /// un autre, et qu'une trace qui ne paraîtrait que sur l'un des deux serait
    /// pire qu'absente : elle ferait croire que l'autre ne joue rien.
    ///
    /// L'existence est celle du badge (`backgroundTrace(of:)`) : pas de piste
    /// ⇒ rien, et la scène reprend toute la hauteur.
    @ViewBuilder
    func sceneSoundHeader(_ renderedItem: StoryItem) -> some View {
        PostSceneSoundHeader(
            trace: BackgroundSoundBadge.backgroundTrace(of: renderedItem.storyEffects),
            isPaused: isCanvasPaused,
            accentHex: accentColor,
            onTogglePlayback: { isCanvasPaused.toggle() }
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    /// Le chemin NATIF. Le lecteur est construit sur `renderedItem` plutôt que
    /// de laisser `StoryReaderRepresentable(feedPost:)` reconvertir le même
    /// `FeedPost` : une seconde conversion par évaluation de body, et surtout
    /// deux valeurs qui pourraient diverger si la cascade de repli changeait
    /// d'un côté sans l'autre (post-revue 2026-07-13).
    @ViewBuilder
    func storyCanvasSection(_ post: FeedPost, renderedItem: StoryItem) -> some View {
        sceneSoundHeader(renderedItem)
        // **Les dispositions de scène valent AUSSI sur la page détail**
        // (directive porteur 2026-09-06). Le détail rendait `sceneIndex: 0` par
        // l'hôte reader : un post de dix scènes n'en montrait qu'une, et les
        // neuf autres n'étaient atteignables par aucun geste — le défaut même
        // que la mosaïque a corrigé dans le FIL, resté entier ici.
        if let document = post.storyEffects?.canvasV3, document.scenes.count > 1 {
            trackingDetailScene(
                PostSceneMosaic(
                    post: post,
                    document: document,
                    accentColor: accentColor,
                    preferredContentLanguages:
                        AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
                    // **Le détail JOUE — c'est la même règle que le canvas
                    // mono-scène juste en dessous.** Il n'y a qu'une publication à
                    // l'écran, donc aucune élection à arbitrer : ce qui gouverne
                    // est la visibilité et l'appel en cours, comme pour le reader.
                    isActive: !StoryDetailPlaybackPolicy.isPaused(visible: storyCanvasVisible,
                                                                  callActive: isCallActive,
                                                                  viewerPaused: isCanvasPaused),
                    // **L'hôte DIT qu'il est le détail, et c'est ce qui ouvre le
                    // son** (#5593). `isActive` ne gouverne que la PAUSE : la
                    // mosaïque montait son player en `mode: .card`, dont
                    // `ScenePlayerConfig` VERROUILLE le muet (#4084). Le son de
                    // fond d'un post à plusieurs scènes ne se jouait donc jamais
                    // dans le détail, et le bouton muet de la barre d'actions
                    // n'atteignait aucun lecteur sur ce chemin — pendant que les
                    // deux autres (mono-scène ci-dessous, republication) passaient
                    // bien `mute: isCanvasMuted`. Le commentaire qui vivait ici
                    // AFFIRMAIT que le son s'activait : il décrivait l'intention,
                    // pas le câblage.
                    host: .detail,
                    isMuted: isCanvasMuted,
                    // **La boîte des scènes tient au-dessus du composer**
                    // (#6696), pastilles comprises — même loi que la mono-scène.
                    maxBoxHeight: detailMosaicMaxBoxHeight(document),
                    onTapScene: { openDetailScene(at: $0) }
                )
            )
            .padding(.horizontal, 16)
            .padding(.top, 8)
        } else {
            storyCanvasOrPlaceholder(renderedItem: renderedItem,
                                     onOpen: { openDetailScene(at: 0) }) {
                StoryReaderRepresentable(
                    story: renderedItem,
                    preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                    mute: isCanvasMuted,
                    isPaused: StoryDetailPlaybackPolicy.isPaused(visible: storyCanvasVisible,
                                                                callActive: isCallActive,
                                                                viewerPaused: isCanvasPaused)
                )
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    /// **Toucher la scène du détail ouvre le plein écran, comme depuis le fil**
    /// (#6696).
    ///
    /// Par l'ENTRÉE PARTAGÉE — `.socialMediaGallery(...)`, montée par le `body`
    /// —, jamais par un écran nommé ici : c'est elle qui sait où une scène de
    /// post s'ouvre, et le détail suit sans rien réécrire le jour où cette
    /// destination change (#6709). La mosaïque passait déjà par elle ; la
    /// mono-scène n'avait aucun geste.
    func openDetailScene(at index: Int) {
        detailSceneIndex = index
        fullscreenMediaId = nil
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    /// Shared canvas wrapper for BOTH the native story and the STORY-repost paths
    /// (RF3): identical sizing + the visibility tracking that updates
    /// `storyCanvasVisible`. Extracting it guarantees the off-screen pause wiring
    /// can't exist on one path and be missing on the other (which would leak
    /// audio on the repost path).
    ///
    /// **La taille borne une LARGEUR, jamais une hauteur** (#6696). Dans une
    /// pile défilante, un `frame(maxHeight:)` ne propose aucune hauteur : il
    /// agrandit son cadre autour d'un contenu qui déborde. La largeur maximale
    /// que rend la loi est celle à laquelle la scène, à son rapport, tient dans
    /// la hauteur permise — et un hôte plus étroit (la republication, dans sa
    /// carte) la resserre encore sans jamais la faire déborder.
    ///
    /// Le rognage arrondi se pose sur la SCÈNE, avant tout cadre plein largeur :
    /// posé après, il arrondissait la colonne et laissait carrés les bords d'une
    /// scène plus étroite qu'elle.
    func storyCanvasContainer(_ reader: StoryReaderRepresentable,
                              renderedItem: StoryItem,
                              onOpen: (() -> Void)? = nil) -> some View {
        let ratio = PostDetailSceneFraming.ratio(of: renderedItem.storyEffects)
        let taille = PostDetailSceneFraming.sceneSize(ratio: ratio, measures: sceneMeasures)
        return trackingDetailScene(
            reader
                .aspectRatio(ratio, contentMode: .fit)
                .frame(maxWidth: taille?.width ?? PostDetailSceneFraming.maxWidth)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        )
        .detailSceneOpening(onOpen)
        .frame(maxWidth: .infinity, alignment: .center)
    }

    /// La hauteur laissée à la boîte de la mosaïque : celle que la loi rend à
    /// son rapport, moins ce que le carrousel pose sous elle.
    func detailMosaicMaxBoxHeight(_ document: CanvasV3) -> CGFloat? {
        PostDetailSceneFraming.sceneSize(ratio: PostSceneMosaic.boxAspect(document: document),
                                         measures: sceneMeasures)
            .map { max(0, $0.height - PostSceneMosaic.accessoryHeight(document: document)) }
    }

    /// **Le suivi d'une scène du détail** — sa visibilité (pause hors écran) et
    /// le haut qu'elle occupe au repos, que la loi de taille consomme. Posé sur
    /// les deux chemins, mono-scène et mosaïque.
    ///
    /// **Mesuré par `onGeometryChange`, jamais par une préférence** (#6708).
    /// Monté dans le détail, le couple `GeometryReader` + `onPreferenceChange`
    /// ne délivrait QUE la valeur par défaut : un cadre `.zero` ici, une zone de
    /// défilement `.zero` dans `PostDetailView`. La loi de taille rendait alors
    /// `nil`, aucune borne n'atteignait la scène, et une scène 9:16 prenait
    /// 370 × 658 pt sous le composer. Relevé par sondes sur le témoin hébergé
    /// `PostDetailSceneFramingTests` : la loi était juste, sa mesure n'arrivait
    /// jamais.
    ///
    /// L'action suit le défilement : chaque écriture est gardée, pour qu'une
    /// valeur inchangée n'invalide pas le détail à chaque image.
    func trackingDetailScene<Scene: View>(_ scene: Scene) -> some View {
        scene
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.scrollSpace)) } action: { frame in
                let h = sceneMeasures.viewport.height > 0 ? sceneMeasures.viewport.height : frame.maxY + 1
                let visible = StoryCanvasVisibility.isVisible(canvasFrame: frame, viewportHeight: h)
                if visible != storyCanvasVisible { storyCanvasVisible = visible }
                let relevees = sceneMeasures.recordingSceneTop(frame.minY,
                                                               scrollOffset: headerScrollRelay.offset)
                if relevees != sceneMeasures { sceneMeasures = relevees }
            }
    }
}

private extension View {

    /// Le geste et son pendant VoiceOver, SEULEMENT là où ils mènent quelque
    /// part (loi 4).
    @ViewBuilder
    func detailSceneOpening(_ onOpen: (() -> Void)?) -> some View {
        if let onOpen {
            contentShape(RoundedRectangle(cornerRadius: 12))
                .onTapGesture(perform: onOpen)
                .accessibilityAction(named: Text(String(localized: "a11y.post.media.open.hint",
                                                        defaultValue: "Ouvrir en plein écran",
                                                        bundle: .main)),
                                     onOpen)
        } else {
            self
        }
    }
}
