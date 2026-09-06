import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le plein écran d'un post qui porte une SCÈNE — le canvas, pas sa matière
/// première** (directive porteur 2026-09-05).
///
/// > « Le canvas en question doit être affiché dans le poste comme c'est avec
/// > toutes les intégrations mises **et à l'affichage en plein écran ou sur le
/// > carrousel**, afficher la légende qui aura été adossée. »
///
/// ## Le défaut que cette vue ferme
///
/// Mesuré au simulateur : une publication composée d'une photo + un texte
/// « PRINTEMPS » posé dessus s'affichait correctement dans la CARTE du fil —
/// canvas 9:16, texte à sa place — et le doigt l'ouvrait sur la **photo source**
/// en 4032 × 3024, paysage, sans le texte. Deux rendus pour une même
/// publication, et c'est le grand format — celui qu'on ouvre justement pour
/// mieux voir — qui perdait ce que l'auteur avait composé.
///
/// La cause n'était pas un mauvais rendu : c'était une mauvaise QUESTION. Le
/// plein écran demandait « quels médias ce post porte-t-il ? » là où il fallait
/// demander « ce post porte-t-il une scène ? ». Un canvas n'est pas la somme de
/// ses médias — c'est un document qui les DISPOSE, et son fond n'est qu'un de
/// ses calques.
///
/// > **Une galerie feuillette de la matière ; un canvas se rejoue.** Router une
/// > scène vers une galerie de médias, c'est servir les ingrédients à la place
/// > du plat. Rien ne rougit — les médias existent, la galerie les rend bien —
/// > et pourtant l'auteur ne reconnaît pas sa publication.
///
/// ## Ce que la vue rend, et ce qu'elle délègue
///
/// Elle ne peint rien elle-même : `MeeshyScenePlayer(mode: .reader)` est le
/// moteur unique de rendu d'un canvas — le même que la carte du fil monte en
/// `.card` et que le viewer de story monte en `.reader`. Le mode décide seul du
/// chrome, de la boucle et du son ; en changer serait décider ici de ce que le
/// player décide déjà.
///
/// Le CADRE, lui, est à elle : la fermeture, l'attribution et la légende. Et la
/// légende obéit à la règle commune (`MediaCaptionOverlay`) — **repliée par
/// défaut**, dépliable, l'ombre plutôt qu'un cartouche, en poussant
/// l'attribution vers le haut plutôt qu'en l'effaçant (directive du même jour,
/// déjà appliquée au plein écran média).
struct SocialSceneFullscreenView: View {

    let post: FeedPost
    let document: CanvasV3
    let accentColor: String
    let preferredContentLanguages: [String]
    /// **La scène par laquelle on ENTRE** (directive porteur 2026-09-06) :
    /// « lorsqu'on montre la mosaïque on doit pouvoir cliquer sur n'importe
    /// quelle scène et l'afficher en plein écran ». Sans elle, les quatre
    /// tuiles d'une mosaïque menaient toutes à la première.
    let startSceneIndex: Int

    init(post: FeedPost,
         document: CanvasV3,
         accentColor: String,
         preferredContentLanguages: [String],
         startSceneIndex: Int = 0) {
        self.post = post
        self.document = document
        self.accentColor = accentColor
        self.preferredContentLanguages = preferredContentLanguages
        // Borné ICI et nulle part ailleurs : un index hors bornes ferait
        // rendre une page vide au lieu d'ouvrir la scène demandée, et le
        // pager n'a aucune page de repli.
        let borne = max(0, min(startSceneIndex, max(0, document.scenes.count - 1)))
        self.startSceneIndex = borne
        _sceneIndex = State(initialValue: borne)
        _pageCourante = State(initialValue: document.scenes.indices.contains(borne)
                              ? "\(borne)#\(document.scenes[borne].id)" : nil)
        // NB : l'identité est composée ici à la main parce qu'un `init` ne peut
        // pas appeler une méthode d'instance avant d'avoir fini d'initialiser
        // ses propriétés. La FORME est celle d'`identifiantDePage`, et le
        // témoin `test_lIdentiteDePage_estLaMemeALInitEtAuRendu` les compare.
    }

    @Environment(\.dismiss) private var dismiss

    /// La scène COURANTE d'une publication qui en porte plusieurs. Le
    /// défilement VERTICAL la déplace — « le défilement des scènes doit pouvoir
    /// se faire comme pour les réels aussi » (directive porteur 2026-09-06).
    @State private var sceneIndex: Int
    /// L'identité de la page affichée — ce que le pager canonique pilote. Elle
    /// double `sceneIndex` parce que les deux répondent à deux questions : le
    /// pager travaille par IDENTITÉ (une page peut être insérée), le reste de
    /// la vue par RANG (le compteur, la légende, le gate de lecture).
    @State private var pageCourante: String?
    /// **La lecture est une COMMANDE, jamais un état de naissance.** Les trois
    /// modes du player naissent en pause (`ScenePlayerConfig.startsPaused`) ;
    /// on la lève à l'apparition parce qu'un plein écran est une demande de
    /// voir, y compris ce qui bouge.
    @State private var isPlaying = false
    /// **Repliée par défaut** — le brief le demande explicitement pour l'espace
    /// de contenu de la légende, et c'est la même règle que partout ailleurs.
    @State private var captionExpanded = false

    /// **Le porteur de la scène.** Le document dit ce qu'il faut peindre ; il ne
    /// dit pas où vivent les pixels. Sans lui, le résolveur du player n'a aucun
    /// repli pour hydrater une adresse de média au READ, et une scène de MÉDIA
    /// se peint vide là où une scène de TEXTE se peint bien — l'exacte panne que
    /// la carte du fil a connue avant #4926.
    private var carrier: StoryItem {
        StoryItem(id: post.id,
                  content: post.content,
                  media: post.media,
                  storyEffects: post.storyEffects,
                  createdAt: post.timestamp)
    }

    /// La légende ADOSSÉE à la scène courante — la règle vit dans
    /// `SceneCaption`, appelée ici et par la carte du fil.
    ///
    /// **En plein écran, elle est OBLIGATOIRE** (directive porteur 2026-09-06 :
    /// « dans le feed si possible et en plein écran obligatoirement »), d'où le
    /// repli sur le texte du porteur : rien d'autre ne le rend ici, et sans lui
    /// le format qu'on ouvre POUR mieux lire est celui qui montre le moins.
    private var caption: String? {
        SceneCaption.resolve(sceneIndex: sceneIndex, in: document, post: post,
                             carrierFallback: true)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if document.scenes.count > 1 { defilement } else { scenePlayer(0) }

            chrome
        }
        // **La lecture ne s'arme que s'il y a quelque chose à jouer.** Un
        // canvas fixe n'a ni vidéo, ni son, ni animation : lever `isPlaying`
        // y ferait tourner un displayLink pour rien, et allumerait un bouton
        // pause qui ne mettrait rien en pause (loi 4).
        .onAppear {
            isPlaying = bouge
            // **Filet de sécurité du pager** — le MÊME que celui de la galerie
            // plein écran des médias, et pour la même raison : `scrollPosition`
            // n'honore pas toujours la valeur posée en `init`. Mesuré au
            // simulateur AVANT ce filet : le compteur annonçait « 2 / 3 »
            // pendant que l'écran montrait la scène 1 — la tuile tapée était
            // bien transportée, et le pager restait à sa première page.
            //
            // > Un compteur juste au-dessus d'un contenu faux est pire qu'un
            // > compteur absent : il affirme que le geste a porté.
            //
            // **Et ce filet a passé une journée INERTE** (mesuré le 2026-09-06,
            // deux scènes de couleurs distinctes) : il était gardé par
            // `if pageCourante != vise`, alors que l'`init` venait de poser
            // `vise` dans `_pageCourante`. La condition était donc TOUJOURS
            // fausse — sur le cas exact que le filet existe pour rattraper.
            //
            // > **Un filet gardé par une condition que son propre
            // > initialiseur rend fausse ne s'arme jamais.** Il compile, il se
            // > lit bien, il cite la bonne leçon — et il ne tire pas. Le
            // > symptôme est identique à son absence, ce qui l'a rendu
            // > invisible : le compteur annonçait « 2 / 2 » au-dessus de la
            // > scène 1, exactement comme avant qu'on l'écrive.
            //
            // Reposer la MÊME valeur ne produit rien non plus : `scrollPosition`
            // n'observe qu'un CHANGEMENT. On la retire donc, puis on la remet à
            // la passe suivante — la seule forme qui produise une transition
            // que le défilement puisse suivre.
            let vise = identifiantDePage(startSceneIndex)
            guard startSceneIndex > 0 else { return }
            pageCourante = nil
            DispatchQueue.main.async { pageCourante = vise }
        }
        .onDisappear { isPlaying = false }
    }

    /// **Ce document BOUGE-t-il ?** — la porte du contrôle de lecture, et la
    /// seule. Une scène cinématique est une vidéo (directive porteur
    /// 2026-09-06) ; une scène fixe est une image, et une image n'a pas de
    /// bouton play.
    private var bouge: Bool { SceneMotion.isCinematic(document) }

    /// **Les scènes se feuillettent HORIZONTALEMENT, comme les images et les
    /// vidéos** — le même geste que le carrousel du fil et que la galerie
    /// plein écran des médias.
    ///
    /// ## Ce que cette écriture remplace, et ce qu'elle a coûté
    ///
    /// La première version montait un `TabView` paginé PIVOTÉ d'un quart de
    /// tour, pour obtenir l'axe vertical des réels. Mesuré au simulateur :
    ///
    /// > **`rotationEffect` ne change PAS le cadre de layout.** Le `TabView`
    /// > gardait une boîte de 874 × 402 ; le `ZStack` parent en héritait, et
    /// > le chrome se centrait dedans — bouton Fermer à `x = −236`. Le
    /// > débordement captait de surcroît les touches par-dessus lui : après
    /// > correction du cadre, le bouton était bien à `x = 0` et **ne
    /// > répondait toujours pas**. L'utilisateur était PIÉGÉ dans le plein
    /// > écran : ni glissement, ni fermeture, sortie par le multitâche.
    ///
    /// Deux correctifs successifs sur le même hack valaient moins que sa
    /// suppression. **Un cadre de compensation est le symptôme d'un mécanisme
    /// employé à contre-emploi**, pas une solution : il redresse la géométrie
    /// et laisse le hit-test là où la rotation l'a mis.
    ///
    /// ## Pourquoi l'axe est HORIZONTAL
    ///
    /// Une directive antérieure demandait « comme pour les réels », donc
    /// vertical. Elle est tranchée par la cohérence, qui vaut ici plus qu'une
    /// analogie : la carte du fil feuillette ses scènes horizontalement, la
    /// galerie des médias aussi. Deux axes pour un même contenu selon la
    /// surface, c'est ce que l'utilisateur nomme une incohérence — et la main
    /// qui glisse ne consulte pas la surface avant de choisir son sens.
    ///
    /// `AdaptiveHorizontalPager` est le pager CANONIQUE du plein écran média
    /// (`ConversationMediaGalleryView`, `AudioFullscreenView`, le carrousel
    /// des réels) : le reprendre aligne le geste, le rebond et la vitesse sans
    /// les réécrire.
    private var defilement: some View {
        AdaptiveHorizontalPager(items: pages,
                                currentPageID: $pageCourante,
                                fillVertical: true) { _, page in
            scenePlayer(page.index)
        }
        .ignoresSafeArea()
        .adaptiveOnChange(of: pageCourante) { _, nouvelle in
            guard let index = pages.first(where: { $0.id == nouvelle })?.index else { return }
            sceneIndex = index
        }
    }

    /// Les pages du défilement. L'identité compose l'INDEX et l'id de scène :
    /// `CanvasV3(migrating:)` a gravé `"s1"` en dur pendant tout le corpus
    /// legacy, si bien qu'un document migré peut porter deux scènes homonymes
    /// — un `ForEach` sur le seul id de scène en perdrait une.
    private var pages: [PageDeScene] {
        document.scenes.indices.map {
            PageDeScene(id: identifiantDePage($0) ?? "\($0)", index: $0)
        }
    }

    /// L'identité d'une page — composée UNE fois, ici, parce que trois sites la
    /// demandent (les pages, l'init, le filet d'apparition). Recomposée à la
    /// main chez chacun, elle finirait par diverger d'un caractère, et la page
    /// visée ne serait plus trouvée : un défaut qui se lit « le pager ignore le
    /// geste » et qui n'a rien à voir avec le pager.
    private func identifiantDePage(_ index: Int) -> String? {
        guard document.scenes.indices.contains(index) else { return nil }
        return "\(index)#\(document.scenes[index].id)"
    }

    struct PageDeScene: Identifiable {
        let id: String
        let index: Int
    }

    /// **Une page ne joue que si elle est la scène COURANTE.** Les pages
    /// voisines sont montées par le pager pour que le glissement soit
    /// fluide ; les laisser jouer ferait décoder trois vidéos et sonner deux
    /// pistes à la fois.
    private func scenePlayer(_ index: Int) -> some View {
        MeeshyScenePlayer(
            document: document,
            mode: .reader,
            sceneIndex: .constant(index),
            isPlaying: .constant(isPlaying && index == sceneIndex),
            accentColorHex: accentColor,
            carrier: carrier
        )
        .preferredContentLanguages(preferredContentLanguages)
        .aspectRatio(9.0 / 16.0, contentMode: .fit)
        .ignoresSafeArea(edges: .bottom)
    }

    /// Fermeture en haut, attribution puis légende en bas — la pile est ANCRÉE
    /// EN BAS, c'est ce qui fait qu'une légende qui grandit pousse l'auteur vers
    /// le haut sans que personne n'ait à calculer de décalage.
    private var chrome: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                        .padding()
                }
                .accessibilityLabel(String(localized: "common.close",
                                           defaultValue: "Fermer", bundle: .main))
                Spacer()
                if document.scenes.count > 1 { compteurDeScene }
                if bouge { boutonDeLecture }
            }

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 8) {
                attribution
                if let caption, !caption.isEmpty {
                    MediaCaptionOverlay(
                        caption: caption,
                        isExpanded: captionExpanded,
                        horizontalInset: 16,
                        // « JUSTE afficher le texte déplié avec effet ombre » —
                        // le voile du composant masquerait la scène qu'on est
                        // venu regarder ; l'ombre du texte suffit à le détacher.
                        dimsBackgroundWhenExpanded: false,
                        onToggle: {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                captionExpanded.toggle()
                            }
                        }
                    ) { texte, taille in
                        Text(texte)
                            .font(.system(size: taille))
                            .foregroundColor(.white)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 16)
            .background(
                LinearGradient(colors: [.clear, .black.opacity(0.75)],
                               startPoint: .top, endPoint: .bottom)
            )
        }
    }

    /// **Un seul bouton, et il arrête TOUT ou poursuit TOUT** (directive
    /// porteur 2026-09-06).
    ///
    /// Il ne pilote rien lui-même : il bascule `isPlaying`, que le player
    /// descend à l'hôte canvas, dont `setPaused` gèle EN BLOC la vidéo de
    /// fond, chaque `AVPlayer` d'avant-plan, le mixeur audio (son de fond
    /// COMPRIS) et l'horloge des animations. C'est ce qui fait de ce bouton un
    /// bouton « tout » plutôt qu'un bouton « vidéo » : il n'y a pas une pause
    /// par média à composer, il n'y en a qu'une, et elle existait déjà.
    ///
    /// **Il n'apparaît que si quelque chose bouge.** Sur un canvas fixe, il
    /// mettrait en pause une image — un contrôle qui ne fait rien est pire
    /// qu'un contrôle absent (loi 4).
    private var boutonDeLecture: some View {
        Button {
            HapticFeedback.light()
            isPlaying.toggle()
        } label: {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 40, height: 40)
                .adaptiveGlass(in: Circle(), interactive: true)
                .padding()
        }
        // **L'annonce SUIT l'état** : un libellé figé ferait dire « Lecture »
        // à un bouton qui met en pause.
        .accessibilityLabel(isPlaying
            ? String(localized: "scene.fullscreen.pause",
                     defaultValue: "Tout mettre en pause", bundle: .main)
            : String(localized: "scene.fullscreen.play",
                     defaultValue: "Tout reprendre", bundle: .main))
    }

    /// Où l'on est dans la publication. Muet pour VoiceOver : le libellé de la
    /// scène le dit déjà, et le lire deux fois ferait bégayer le lecteur.
    private var compteurDeScene: some View {
        Text("\(sceneIndex + 1) / \(document.scenes.count)")
            .font(.system(size: 12, weight: .bold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(.black.opacity(0.45)))
            .contentTransition(.numericText())
            .animation(.spring(response: 0.3), value: sceneIndex)
            .accessibilityHidden(true)
    }

    private var attribution: some View {
        HStack(spacing: 10) {
            MeeshyAvatar(
                name: post.author,
                context: .messageBubble,
                accentColor: post.authorColor,
                avatarURL: post.authorAvatarURL
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(post.author)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                Text(post.timestamp.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}
