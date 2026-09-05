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

    @Environment(\.dismiss) private var dismiss

    /// La scène COURANTE d'une publication qui en porte plusieurs — c'est le
    /// « carrousel » de la directive. Le player en tient l'index ; le glissement
    /// horizontal le déplace, comme dans le viewer de story.
    @State private var sceneIndex = 0
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

    /// La légende ADOSSÉE à la scène — résolue par le MÊME juge que les trois
    /// autres surfaces sociales (`SocialMediaCaption`), jamais par une seconde
    /// lecture des mêmes champs.
    private var caption: String? {
        SocialMediaCaption
            .map(for: post.media, carrierText: post.displayContent)[sceneMediaId ?? ""]
    }

    /// Le média que la scène MONTRE — celui dont la légende décrit le contenu.
    private var sceneMediaId: String? {
        post.media.first { $0.type == .image || $0.type == .video }?.id
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            MeeshyScenePlayer(
                document: document,
                mode: .reader,
                sceneIndex: $sceneIndex,
                isPlaying: $isPlaying,
                accentColorHex: accentColor,
                carrier: carrier
            )
            .preferredContentLanguages(preferredContentLanguages)
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            .ignoresSafeArea(edges: .bottom)

            chrome
        }
        .onAppear { isPlaying = true }
        .onDisappear { isPlaying = false }
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
