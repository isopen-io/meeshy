import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que le lecteur de story POSE au-dessus de la scène** — la légende et
/// son montage, les deux couches qui l'entourent, la transcription d'un vocal,
/// l'attribution d'une piste de bibliothèque (#4831, #4841).
///
/// Tout ce qui la concerne vit ici, y compris sa condition de montage —
/// `StoryViewerView+Canvas.swift` dépasse largement le budget de 800–1100 lignes
/// (loi 4 du milestone des 31 vues), et on n'ajoute pas à un fichier hors
/// budget : on extrait d'abord. Le canvas ne garde que l'appel.
///
/// Les deux couches qui entourent le corpus ont ceci en commun : **aucune ne
/// peint quoi que ce soit.** L'une prend un toucher, l'autre prend une mesure.
/// C'est la conséquence directe de la directive du porteur — le corpus déplié ne
/// doit plus rien assombrir, donc tout ce qui l'entoure est transparent, et son
/// EFFET est la seule chose qui prouve qu'il est là.
extension StoryCardView {

    /// **Le montage de la légende, sorti du canvas** (#4831).
    ///
    /// `StoryViewerView+Canvas.swift` porte 2 700 lignes — largement hors du
    /// budget de 800–1100 (loi 4). Le cliquet de dette (`FileSizeBudgetGuardTests`)
    /// a fait exactement son travail : il a refusé les lignes que ce lot voulait
    /// y ajouter, et l'extraction qui s'en est suivie nomme une responsabilité —
    /// **tout ce qui concerne la légende d'une story vit désormais dans un seul
    /// fichier**, son montage compris — au lieu de la diluer dans un `body` de
    /// plusieurs milliers de lignes.
    @ViewBuilder
    func captionLayer(geometry: GeometryProxy) -> some View {
        // === Description overlay (B2, #3925 — la légende de la story) ===
        //
        // La face LECTURE de la section description repliable du composer :
        // le contenu partagé du composer unifié (`slide.content`), résolu par
        // le Prisme, s'affiche par-dessus le canvas composé — comme la légende
        // d'un réel. Gaté sur `currentVoiceCaption == nil` : la transcription
        // vocale (exploration à la demande, menu « … ») prend le bas de la
        // scène quand elle est active — les deux ne se chevauchent jamais.
        //
        // **Elle était INERTE.** `Text` brut dans un cartouche noir opaque,
        // `lineLimit(4)`, et `allowsHitTesting(false)` sur tout le bloc :
        // rien ne pouvait la déplier, et le cartouche masquait la
        // composition qu'il commente. `MediaCaptionOverlay` (SDK) tient
        // désormais la règle — dix MOTS, de l'ombre plutôt qu'une boîte, et
        // le plein écran ancré au coin bas-gauche quand on déplie (#4474).
        if currentVoiceCaption == nil, let description = currentStoryDescription {
            // UNE seule mesure de la colonne, partagée par la légende et par
            // la zone qui la surplombe : c'est le repère dans lequel les
            // deux expriment leurs retraits, et il déborde le viewport.
            let captionColumn = StoryCanvasFraming.captionColumnWidth(
                viewport: geometry.size,
                ratio: readerCanvasRatio,
                scale: readerCanvasFraming.scale)
            VStack(spacing: 0) {
                // Le vide au-dessus du corpus. Au repos il ne fait que
                // pousser la légende en bas ; DÉPLIÉ il devient la zone qui
                // ramène le texte en tête (#4831).
                if isCaptionExpanded {
                    captionScrollToTopTarget(columnWidth: captionColumn,
                                             viewportWidth: geometry.size.width)
                } else {
                    Spacer(minLength: 0)
                }
                // 20 pt — le retrait des couches voisines de ce canvas (la
                // transcription vocale juste au-dessus le pose aussi). Il
                // était en dur dans la couche ; il est désormais DIT ici,
                // pour que le lecteur de réel puisse aligner la sienne sur
                // sa propre colonne (directive porteur 2026-09-01).
                MediaCaptionOverlay(caption: description, isExpanded: isCaptionExpanded,
                                    horizontalInset: 20,
                                    // Le rail d'actions occupe la bande droite
                                    // (x ≈ 318 → 386 sur un écran de 402).
                                    // Repliée la légende ne l'atteint pas ;
                                    // dépliée elle monte sous lui. Mesuré à
                                    // l'écran : texte et icônes superposés,
                                    // les deux illisibles.
                                    //
                                    // Le dégagement est RENDU au repère de
                                    // l'écran : 68 pt de colonne n'en valent
                                    // que 24 à l'écran quand le canvas
                                    // déborde de 44,7 pt de chaque côté, et
                                    // le texte repassait sous les icônes.
                                    expandedTrailingInset: CaptionExpansionSpace.railClearanceInset(
                                        columnWidth: captionColumn,
                                        viewportWidth: geometry.size.width),
                                    scrollToTopToken: captionScrollToTopToken,
                                    // **La story refuse le voile** (directive
                                    // porteur 2026-09-02). Elle a mieux : sa
                                    // scène s'efface à 0,28 et laisse remonter
                                    // le fond naturel de la slide. Le voile du
                                    // composant s'y AJOUTAIT — deux mécanismes
                                    // pour un seul effet, dont l'un venait
                                    // remplacer l'autre.
                                    dimsBackgroundWhenExpanded: false,
                                    onToggle: onCaptionExpansionToggled)
                    // **Le bord SUPÉRIEUR de la zone défilante, publié au
                    // lecteur** (#4831) — c'est lui qui sépare « geste né
                    // dans le corpus » (au défilement) de « geste né dans la
                    // story visible au-dessus » (au drag parent, qui navigue
                    // encore).
                    //
                    // Posé sur la COUCHE, jamais à l'intérieur de son
                    // défilement : ce qu'on publie doit être un cadre de
                    // LAYOUT. Une valeur pilotée par le scroll ne serait plus
                    // republiée sous iOS 18+, et la garde de point de départ
                    // travaillerait sur une mesure périmée.
                    //
                    // Uniquement DÉPLIÉE : repliée, la légende n'a pas de
                    // zone défilante, et publier son cadre ferait céder le
                    // drag parent sur toute la bande basse pour rien —
                    // `StoryReaderScrollableSurfaceTopKey` retenant le minY
                    // le plus HAUT, une mesure de trop élargit la zone
                    // interdite au lieu de la préciser.
                    .background(captionScrollableSurfaceProbe)
            }
            // **La légende tient la colonne du CANVAS, pas celle de l'hôte**
            // (#4762). Ce conteneur déborde volontairement le viewport pour
            // la pagination (mesuré : 491,3 pt à x = −44,7 sur un écran de
            // 402) ; sans cette largeur, le `frame(maxWidth: .infinity)` de
            // la légende résout celle du CONTENEUR et le texte sort des deux
            // côtés — « The latest apps » s'affichait « e latest apps ».
            .frame(width: captionColumn)
            // **La légende garde sa position** (directive porteur 2026-09-02) : elle
            // MONTE depuis là où elle est, elle ne descend pas au bas de
            // l'écran. La marge basse était annulée au dépliage — le texte
            // changeait donc de place au moment où on demandait à en voir plus.
            .padding(.bottom, topInset + 130)
            .transition(.opacity)
            // **L'invite doit recevoir le doigt** (#4762, mesuré au
            // simulateur le 2026-09-02).
            //
            // La couche de gestes (`StoryGestureOverlayView`, « Layer 6 »)
            // est montée APRÈS cette légende dans le même `ZStack` — donc
            // AU-DESSUS. Son `Color.clear.contentShape(Rectangle())` couvre
            // tout le cadre et son `DragGesture(minimumDistance: 0)`
            // reconnaît dès le touch-down : le bouton « voir plus » ne
            // recevait donc JAMAIS son tap. Mesuré : trois taps sur sa cible
            // ont fait NAVIGUER le lecteur d'une story à l'autre, sans
            // jamais déplier.
            //
            // > Un contrôle correctement rendu, correctement câblé, sous une
            // > couche qui prend tous les touchers, est un contrôle INERTE —
            // > et rien ne rougit : la couche fait exactement son travail.
            //
            // Le relèvement est SÛR parce que la légende repliée ne prend le
            // doigt QUE sur son bouton : elle ne pose aucun `contentShape`
            // sur son fond (doc de `MediaCaptionOverlay.collapsedCaption`),
            // donc la navigation continue de passer partout ailleurs.
            // Dépliée, son voile PREND les touchers — et c'est voulu : on lit.
            .zIndex(60)
        }
    }

    /// **La transcription d'un vocal, l'autre texte posé sur la scène.**
    ///
    /// Elle vit à côté de la légende parce qu'elle en est l'EXCLUSIVE : le
    /// montage de la légende est gaté sur `currentVoiceCaption == nil`, et les
    /// deux occupent la même bande basse. Les lire côte à côte rend cette
    /// exclusion évidente ; séparées de cent lignes, elle se déduisait.
    @ViewBuilder
    var voiceCaptionLayer: some View {
        // === Voice caption overlay (transcription voix) ===
        if let transcription = currentVoiceCaption {
            VStack {
                Spacer()
                Text(transcription)
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.black.opacity(0.55))
                    )
                    .padding(.horizontal, 20)
                    .padding(.bottom, topInset + 130)
            }
            .allowsHitTesting(false)
            .transition(.opacity)
        }
    }

    /// **La carte d'une piste de BIBLIOTHÈQUE — une attribution, pas un
    /// contrôle.**
    ///
    /// Troisième chose que le canvas pose au-dessus de la scène et que ce
    /// fichier réunit : elle titre le morceau et crédite son auteur. Elle est
    /// `allowsHitTesting(false)` — c'est du texte, pas une action.
    @ViewBuilder
    var backgroundAudioLayer: some View {
        // === Background audio badge ===
        //
        // Le canvas ne porte plus de chip « note + onde » pour l'audio de
        // FOND (directive user 2026-07-30) : depuis que le header affiche la
        // note musicale suivie de l'onde animée, ce chip répétait la même
        // information au milieu de l'image. Les chips du canvas restent
        // réservés aux pistes FOREGROUND, qui ont chacune leur fenêtre de
        // lecture et leur mute propre (`AudioForegroundReaderOverlay`).
        //
        // Seule survit la carte d'une piste de BIBLIOTHÈQUE : elle titre le
        // morceau et crédite son auteur — une attribution que le header, qui
        // ne dit que la présence, ne porte pas.
        if let audio = currentStory?.backgroundAudio {
            VStack {
                Spacer()
                backgroundAudioBadge(audio: audio)
                    .padding(.bottom, topInset + 165)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .allowsHitTesting(false)
        }
    }

    func backgroundAudioBadge(audio: StoryBackgroundAudioEntry) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(MeeshyFont.relative(11, weight: .semibold))
            Text(audio.title)
                .font(MeeshyFont.relative(12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.tail)
            if let uploader = audio.uploaderName {
                Text("· \(uploader)")
                    .font(MeeshyFont.relative(11))
                    .opacity(0.7)
                    .lineLimit(1)
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.35)))
        )
    }

    /// **Le vide au-dessus du corpus ramène le texte en tête.**
    ///
    /// > « Quand le corpus avec défilement est ouvert, le touché du haut du
    /// > viewport doit le faire défiler tout en haut ! » — porteur, 2026-09-02
    ///
    /// C'est le geste de la barre d'état d'iOS, appliqué à la fenêtre qui occupe
    /// l'écran : après avoir descendu un long texte, on remonte d'un tap au lieu
    /// de le remonter à rebours.
    ///
    /// **Elle n'existe que DÉPLIÉE.** Repliée, cette place est un `Spacer` qui
    /// pousse la légende en bas et ne prend aucun toucher : la navigation d'une
    /// story à l'autre y passe. Monter la zone en permanence l'aurait tuée.
    ///
    /// **Et elle laisse le chrome tranquille.** La légende est montée en
    /// `zIndex(60)`, donc au-dessus de l'entête et du rail — une zone tactile
    /// pleine hauteur y aurait avalé le bouton de fermeture. Elle réserve donc
    /// la bande haute (`storyTopChromeReserve`) et la bande droite
    /// (`storyActionRailInset`), les deux mêmes nombres que le corpus lui-même
    /// évite.
    ///
    /// > Une zone tactile transparente qu'on ajoute au-dessus d'une pile ne se
    /// > voit pas ; ce qu'elle éteint, si. La question à lui poser n'est pas
    /// > « où doit-elle réagir ? » mais « que recouvre-t-elle ? ».
    @ViewBuilder
    func captionScrollToTopTarget(columnWidth: CGFloat, viewportWidth: CGFloat) -> some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(height: CaptionExpansionSpace.storyTopChromeReserve(topInset: topInset))
                .allowsHitTesting(false)

            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { captionScrollToTopToken += 1 }
                // Le retrait est RENDU au repère de l'écran : la colonne du
                // canvas déborde le viewport, et 68 pt de colonne n'y valent pas
                // 68 pt d'écran (cf. `railClearanceInset`).
                .padding(.trailing, CaptionExpansionSpace.railClearanceInset(
                    columnWidth: columnWidth, viewportWidth: viewportWidth))
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(Self.captionScrollToTopLabel)
                .accessibilityHint(Self.captionScrollToTopHint)
        }
    }

    /// **Le bord supérieur de la zone défilante, remonté au lecteur.**
    ///
    /// Sans lui, `StoryReaderDragStartZone` retombe sur son fail-safe — « tout le
    /// geste revient à la surface » — et le lecteur perdrait ses swipes sur
    /// TOUTE la hauteur de l'écran dès qu'un corpus est déplié. Le remède serait
    /// alors pire que le mal : on corrigerait « lire fait tourner la story » en
    /// « on ne peut plus tourner du tout ».
    ///
    /// Publié depuis un `background`, donc sur un cadre de LAYOUT qui ne bouge
    /// qu'au (re)positionnement de la couche — jamais depuis l'intérieur du
    /// défilement, où la valeur serait pilotée par le scroll et cesserait d'être
    /// republiée sous iOS 18+.
    @ViewBuilder
    var captionScrollableSurfaceProbe: some View {
        if isCaptionExpanded {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: StoryReaderScrollableSurfaceTopKey.self,
                    value: proxy.frame(in: .global).minY
                )
            }
        }
    }

    static var captionScrollToTopLabel: String {
        String(localized: "story.caption.scroll_to_top",
               defaultValue: "Revenir au début du texte")
    }

    static var captionScrollToTopHint: String {
        String(localized: "story.caption.scroll_to_top.hint",
               defaultValue: "Fait défiler la description jusqu'à son premier mot")
    }
}
