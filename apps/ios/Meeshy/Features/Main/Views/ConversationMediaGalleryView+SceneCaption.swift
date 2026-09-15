import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La légende d'une page SCÈNE, et sa traduction (#6709, #6504, #6280)
//
// Portée depuis `SocialSceneFullscreenView` quand la scène a rejoint la galerie.
// La légende d'une scène n'est pas celle d'une pièce jointe : elle a DEUX
// sources (`SceneCaption.Origin`) — la légende PROPRE du média de la scène, ou
// le texte du post en repli — et chacune se traduit par SA route. La rangée de
// traduction (#6504) se pose entre la légende et son invite, et l'icône ouvre LA
// feuille de traduction des messages et des audios.

/// **Tout ce qu'une page scène sait de sa publication** — un seul paramètre de
/// la galerie, `nil` hors d'un post.
///
/// Toutes les scènes d'un lot appartiennent au MÊME post : la galerie n'a donc
/// pas à résoudre un porteur par page, et le post qu'elle reçoit est celui que
/// l'hôte tient À JOUR pendant l'ouverture (traductions arrivées, #6560) — la
/// carte qui présente le plein écran est couverte, et ne relaie plus rien.
struct GallerySceneContext {
    let post: FeedPost
    let scenes: [String: GallerySceneItem]
    let captions: [String: GallerySceneCaption]
    /// Le Prisme servi au PLAYER — aux textes posés DANS la scène.
    let playerLanguages: [String]
    /// Le Prisme servi à la LÉGENDE — celui du lot, pour que la légende d'une
    /// scène et celle d'un média se résolvent par la même descente.
    let captionLanguages: [String]
}

/// **La légende d'une scène, dans la langue affichée, avec sa rangée de
/// traduction.**
///
/// Montée par la galerie avec `.id(pièce)` : la langue choisie appartient au
/// CONTENU affiché, et la scène suivante porte un autre contenu — elle ne suit
/// donc pas le lecteur d'une page à l'autre.
struct GallerySceneCaptionBlock: View {
    let post: FeedPost
    let anchor: GallerySceneCaption
    /// Le texte que le lot a servi — le repli quand la source n'est pas
    /// traduisible (aucune langue d'origine connue).
    let fallbackText: String
    let preferredLanguages: [String]
    let isExpanded: Bool
    let maxExpandedHeight: CGFloat
    let onToggle: () -> Void

    /// La langue choisie dans la rangée ou la feuille ; `nil` : la descente du
    /// Prisme.
    @State private var chosenLanguage: String?
    /// Les langues demandées depuis la feuille, pas encore arrivées.
    @State private var requestedLanguages: Set<String> = []
    @State private var translationSheetOpen = false

    private var source: CaptionTranslationSource? { anchor.source(in: post) }

    /// UNE résolution pour le texte ET le drapeau actif — deux résolutions
    /// divergeaient (#6531).
    private var displayedLanguage: String? {
        anchor.displayedLanguage(in: post,
                                 preferredLanguages: preferredLanguages,
                                 chosenLanguage: chosenLanguage)
    }

    private var caption: String {
        anchor.servedText(in: post, fallback: fallbackText, language: displayedLanguage)
    }

    private var offer: CaptionTranslationOffer {
        guard let source else { return .none }
        return CaptionTranslationOffer.resolve(
            originalLanguage: source.originalLanguage,
            translationLanguages: Array(source.translations.keys),
            activeLanguage: displayedLanguage
        )
    }

    /// La rangée posée entre la légende et « voir moins ». `nil` : rien à offrir.
    private var translationRow: AnyView? {
        let offer = offer
        guard offer != .none else { return nil }
        return AnyView(MediaCaptionTranslationRow(
            offer: offer,
            isRequesting: !requestedLanguages.isEmpty,
            onSelectLanguage: { code in
                withAnimation(.easeInOut(duration: 0.2)) { chosenLanguage = code }
            },
            onOpenTranslations: { translationSheetOpen = true }
        ))
    }

    var body: some View {
        MediaCaptionOverlay(
            caption: caption,
            isExpanded: isExpanded,
            horizontalInset: 16,
            maxExpandedHeight: maxExpandedHeight,
            // « JUSTE afficher le texte déplié avec effet ombre » — le voile du
            // composant masquerait la scène qu'on est venu regarder.
            dimsBackgroundWhenExpanded: false,
            accessory: translationRow,
            onToggle: onToggle
        ) { texte, taille in
            Text(texte)
                .font(MeeshyFont.relative(taille))
                .foregroundColor(.white)
        }
        .padding(.vertical, 8)
        // Une traduction arrivée sort sa langue de l'attente (#6504, #6280).
        .adaptiveOnChange(of: source?.translations.count ?? 0) { _, _ in
            requestedLanguages.subtract((source?.translations ?? [:]).keys.map { $0.lowercased() })
        }
        .sheet(isPresented: $translationSheetOpen) { translationSheet }
    }

    // MARK: - La feuille de traduction

    /// Les traductions du contenu affiché, dans la forme que la feuille des
    /// messages lit.
    private var displayedTranslations: [MessageTranslation] {
        guard let source else { return [] }
        return source.translations
            .map { langue, texte in
                MessageTranslation(
                    id: "\(source.target.identifiant)-\(langue)",
                    messageId: source.target.identifiant,
                    sourceLanguage: source.originalLanguage ?? "",
                    targetLanguage: langue,
                    translatedContent: texte,
                    translationModel: "nllb-200",
                    confidenceScore: nil
                )
            }
            .sorted { $0.targetLanguage < $1.targetLanguage }
    }

    /// **LA feuille de traduction des messages et des audios**, réutilisée pour
    /// le contenu affiché (directive porteur 2026-09-14). Une langue déjà
    /// traduite affiche la légende dans cette langue ; une autre demande la
    /// traduction de CE contenu par sa route — jamais la traduction locale d'un
    /// message qui n'existe pas.
    private var translationSheet: some View {
        let origine = source?.originalLanguage ?? ""
        return NavigationStack {
            ScrollView(showsIndicators: false) {
                MessageLanguageDetailView(
                    message: Message(
                        id: source?.target.identifiant ?? post.id,
                        conversationId: "",
                        content: source?.text ?? post.content,
                        originalLanguage: origine,
                        createdAt: post.timestamp,
                        senderName: post.author,
                        senderColor: post.authorColor,
                        senderAvatarURL: post.authorAvatarURL,
                        senderUserId: post.authorId
                    ),
                    contactColor: post.authorColor,
                    conversationId: "",
                    textTranslations: displayedTranslations,
                    onSelectTranslation: { traduction in
                        withAnimation(.easeInOut(duration: 0.2)) {
                            chosenLanguage = traduction?.targetLanguage ?? origine
                        }
                    },
                    translatingTextLanguages: requestedLanguages,
                    onRequestTextTranslation: { cible, _ in requestTranslation(to: cible) },
                    fetchesMessageTranslations: false
                )
                .padding(16)
            }
            .navigationTitle(String(localized: "feed.post.translation.title", defaultValue: "Langues", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) {
                        translationSheetOpen = false
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// La demande part tout de suite, par la route du contenu affiché ; la
    /// traduction revient par la socket (`post:translation-updated` ou
    /// `media:caption-translation-updated`), que l'HÔTE plie sur le post qu'il
    /// sert (#6560). En cas d'échec, la langue quitte l'attente pour qu'on
    /// puisse réessayer.
    private func requestTranslation(to cible: String) {
        guard let source else { return }
        let langue = cible.lowercased()
        requestedLanguages.insert(langue)
        Task {
            do {
                switch source.target {
                case .post(let id):
                    try await PostService.shared.requestTranslation(postId: id, targetLanguage: langue)
                case .mediaCaption(let mediaId):
                    try await PostService.shared.requestMediaCaptionTranslation(mediaId: mediaId, targetLanguage: langue)
                }
            } catch {
                requestedLanguages.remove(langue)
                FeedbackToastManager.shared.showError(
                    String(localized: "feed.post.translation.error", defaultValue: "Erreur de traduction", bundle: .main)
                )
            }
        }
    }
}
