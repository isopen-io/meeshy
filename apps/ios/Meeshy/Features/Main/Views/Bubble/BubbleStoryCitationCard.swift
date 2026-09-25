import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Vue `3h` (#4098) — la story répondue est CITÉE, pas APLATIE.**
///
/// > « La story répondue reste citée, pas aplatie. La vignette porte la scène
/// > telle qu'elle était et le lien vers l'original ; si elle a expiré, la
/// > citation subsiste avec sa date au lieu de disparaître. »
///
/// La donnée était là depuis longtemps — `ReplyReference` grave
/// `storyThumbnailUrl`, `storyPublishedAt`, le texte de la story et ses
/// compteurs, et `MessageModels` écrit noir sur blanc que « la citation affiche
/// le vrai aperçu et survit à l'expiration du post ». Ce qui manquait était en
/// AVAL : `BubbleQuotedReply` la rendait en carré de 38 pt sur une ligne
/// « 📷 Story · il y a 3 h · (♥ 12) », DANS la bulle. Une story est une SCÈNE
/// en portrait ; la citer sur une ligne de texte est exactement le mot que la
/// doctrine emploie — aplatie.
///
/// ### Trois décisions, écrites ici pour qu'elles ne se reperdent pas
///
/// **1. La scène est en 9:16, non recadrée.** La planche donne une carte à
/// ~0,70 de ratio ; une story est en 9:16. Recadrer trahirait la phrase de la
/// doctrine (« telle qu'elle était »), une carte un peu plus haute ne trahit
/// rien — et la conformité se juge sur la disposition, la hiérarchie, les états
/// et les gestes, jamais au pixel.
///
/// **2. Aucune inférence d'expiration.** La tentation était forte :
/// `storyPublishedAt + StoryItem.defaultExpiryInterval` est une règle pure et
/// testable. Elle est REFUSÉE. Le SDK écrit que le droit d'ouvrir une story
/// passé son heure est DÉCLARÉ par le serveur (`StoryItem.referenceAccess`,
/// « never recomputed from `expiresAt` here ») : une personne NOMMÉE dans la
/// story y accède encore. Une carte qui afficherait « expirée » sur une story
/// qu'un tap aurait ouverte serait un mensonge PIRE que le silence qu'on
/// corrige. Donc : **la carte se rend toujours, le tap tente toujours, et c'est
/// l'ÉCHEC qui se dit** — chez l'hôte (`ConversationView`), qui est le seul à
/// pouvoir constater qu'il ne trouve pas la story.
///
/// **3. La date est SUR le bandeau.** La planche ne montre que « ↩ réponse à sa
/// story » ; la doctrine exige « la citation subsiste AVEC SA DATE ». Le
/// bandeau porte donc le libellé puis la date en relatif, atténuée : au coup
/// d'œil il se lit comme la planche, et l'état que la doctrine réclame est là.
///
/// ### Ce que cette carte ne rend pas
///
/// Une **humeur** (`moodEmoji != nil`) n'a pas de scène : elle garde le rendu
/// dédié de `BubbleQuotedReply` (emoji + contenu + date). L'hôte le tranche
/// avant de monter cette vue — voir `BubbleStandardLayout.detachedStoryCitation`.
///
/// Feuille `Equatable` à `==` MANUEL : la fermeture d'ouverture n'entre pas
/// dans la comparaison (une closure n'est pas comparable), exactement comme
/// `BubbleQuotedReply`. Tout champ ajouté au rendu doit rejoindre `CardSlice`.
///
/// Gardes : `BubbleStoryCitationGuardTests`.
struct BubbleStoryCitationCard: View, Equatable {
    let reply: ReplyReference
    let isDark: Bool
    /// Accent de la conversation — la teinte du bandeau et du repli de scène.
    let accentHex: String
    /// `nil` ⇒ aucun geste n'est armé : la carte reste une carte, et le tap
    /// traverse (loi 4 — « un contrôle existe s'il a un effet »).
    var onOpen: (() -> Void)?

    /// Largeur de la carte. Une citation n'est pas la bulle : elle occupe une
    /// colonne étroite au-dessus d'elle, comme sur la planche.
    ///
    /// La MÊME que la miniature d'une image ou d'une vidéo citée (retour
    /// porteur 2026-09-25) : une constante, lue ici, jamais recopiée.
    static let cardWidth: CGFloat = QuotedReplyPresentation.citedSceneWidth

    /// Rapport de la SCÈNE — TOUJOURS 9:16 (`SceneShape.aspect`, #6896/#6904).
    static let sceneAspectRatio: CGFloat = SceneShape.aspect

    static var sceneHeight: CGFloat { (cardWidth / sceneAspectRatio).rounded() }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isDark == rhs.isDark &&
        lhs.accentHex == rhs.accentHex &&
        Self.slice(lhs.reply) == Self.slice(rhs.reply)
    }

    /// Champs effectivement LUS par le corps. Tout champ ajouté au rendu doit
    /// rejoindre cette projection — une feuille à `==` manuel qui en oublie un
    /// ne se redessine jamais quand il change.
    private struct CardSlice: Equatable {
        let messageId: String
        let previewText: String
        let thumbnailUrl: String?
        let publishedAt: Date?
        let isUnavailable: Bool
    }

    private static func slice(_ reply: ReplyReference) -> CardSlice {
        CardSlice(
            messageId: reply.messageId,
            previewText: reply.previewText,
            thumbnailUrl: reply.storyThumbnailUrl,
            publishedAt: reply.storyPublishedAt,
            isUnavailable: reply.isUnavailableStory
        )
    }

    /// **La story DISPARUE (#7895)** — ni scène à montrer ni rien à ouvrir :
    /// la carte se COMPACTE au seul bandeau, qui DIT « Story indisponible ».
    /// Même carte que le web (#7893). Le prédicat est celui du SDK
    /// (`ReplyReference.isUnavailableStory`), jamais réécrit ici.
    var isUnavailable: Bool { reply.isUnavailableStory }

    /// Le geste RÉELLEMENT armé : celui de l'hôte, sauf vers une story
    /// disparue. Trait de bouton, indice et tap le lisent tous trois — une
    /// carte qui s'annoncerait bouton sans rien ouvrir serait un contrôle qui
    /// ment (loi 4).
    private var armedOpen: (() -> Void)? {
        reply.opensQuotedTarget ? onOpen : nil
    }

    /// `true` ⇒ VoiceOver annonce un bouton. Exposé pour le témoin : c'est la
    /// seule façon de MESURER le trait sans monter la vue.
    var announcesButton: Bool { armedOpen != nil }

    // MARK: - Corps

    var body: some View {
        VStack(spacing: 0) {
            if !isUnavailable {
                scene
            }
            strip
        }
        .frame(width: Self.cardWidth)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .contentShape(Rectangle())
        .modifier(OpenGesture(action: armedOpen))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(armedOpen == nil ? [] : .isButton)
        .accessibilityHint(accessibilityHint)
    }

    // MARK: - La scène

    /// URL de la scène, ou `nil`. Vide vaut absente : le repli est le MÊME, et
    /// c'est l'état que la planche dessine (une surface hachurée, sans image).
    private var thumbnailUrlString: String? {
        guard let raw = reply.storyThumbnailUrl, !raw.isEmpty else { return nil }
        return raw
    }

    /// Le texte de la story tel qu'il a été gravé, ou « 📷 Story » quand elle
    /// n'en portait aucun — une scène sans vignette ne reste jamais muette.
    private var sceneText: String {
        reply.previewText.isEmpty ? "\u{1F4F7} \(storyWord)" : reply.previewText
    }

    private var storyWord: String {
        String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main)
    }

    /// **Le texte ne se pose QUE sur une scène SANS vignette** (retour porteur
    /// 2026-09-25). La vignette EST la scène, texte de la story compris : y
    /// peindre l'aperçu par-dessus doublait ce texte et le faisait chevaucher
    /// celui de l'image. Le libellé n'est qu'un remplaçant — comme sur le web.
    var overlaysSceneText: Bool { thumbnailUrlString == nil }

    private var unavailableLabel: String { QuotedStoryLabel.unavailable }

    private var sceneFallback: some View {
        Color(hex: reply.authorColor).opacity(isDark ? 0.32 : 0.24)
    }

    @ViewBuilder
    private var scene: some View {
        ZStack {
            if let url = thumbnailUrlString {
                CachedAsyncImage(
                    url: url,
                    targetSize: CGSize(width: Self.cardWidth, height: Self.sceneHeight)
                ) {
                    sceneFallback
                }
                .aspectRatio(contentMode: .fill)
            } else {
                sceneFallback
            }

            if overlaysSceneText {
                Text(sceneText)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(4)
                    .shadow(color: .black.opacity(0.55), radius: 3, y: 1)
                    .padding(.horizontal, 10)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(width: Self.cardWidth, height: Self.sceneHeight)
        .clipped()
    }

    // MARK: - Le bandeau

    /// « réponse à sa story ».
    ///
    /// **Une seule forme, et c'est une MESURE, pas un oubli.** La variante
    /// « à VOTRE story » — le cas le plus fréquent côté reçu, quelqu'un
    /// répondant à MA story — a été écrite puis retirée : elle n'aurait jamais
    /// pu s'afficher. Les QUATRE producteurs d'une citation de story laissent
    /// `isMe` à faux (l'un le pose littéralement `isMe: false`), et le
    /// snapshot ne porte aucune identité d'auteur — `authorName` vaut la
    /// chaîne « Story ». Le client ne PEUT donc pas dire à qui la story
    /// appartenait.
    ///
    /// Une branche qu'aucune donnée ne peut atteindre ressemble à une
    /// fonctionnalité et n'en est pas — c'est la loi 4 prise par l'autre bout.
    /// Le manque est réel et il est SUIVI : c'est le même trou qui prive la
    /// citation de story de sa porte vers le profil (« ZONE 1 », documentée
    /// dans `BubbleQuotedReply` et dans `ReplyContext.toReplyReference`).
    private var stripLabel: String {
        String(localized: "bubble.reply.story.answer", defaultValue: "réponse à sa story", bundle: .main)
    }

    private var stripTint: Color {
        isDark ? .white.opacity(0.82) : .black.opacity(0.72)
    }

    /// **La date est sur sa PROPRE ligne, et ce n'est pas un choix esthétique.**
    ///
    /// La première écriture les mettait côte à côte, la date en
    /// `layoutPriority(-1)` pour qu'elle cède le pas au libellé. Sur une carte
    /// de 132 pt, « céder le pas » signifie **disparaître** : le simulateur a
    /// rendu « ↩ réponse à sa story · ´ » — un point séparateur promettant une
    /// date réduite à un trait d'un pixel. La doctrine (« la citation subsiste
    /// AVEC SA DATE ») était satisfaite dans le code et démentie à l'écran, et
    /// aucune garde de source ne pouvait le voir : le code contenait bien
    /// `Text(date, style: .relative)`.
    ///
    /// Une ligne à soi n'a pas de largeur à négocier.
    private var strip: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(MeeshyFont.relative(9))
                    // Le libellé posé à côté DIT déjà « réponse » : le glyphe est
                    // redondant pour VoiceOver, et la carte se nomme d'un bloc.
                    .accessibilityHidden(true)

                Text(stripLabel)
                    .font(MeeshyFont.relative(10, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            if isUnavailable {
                Text(unavailableLabel)
                    .font(MeeshyFont.relative(9, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else if let date = reply.storyPublishedAt {
                // `RelativeTimeFormatter.shortString` — et non
                // `Text(date, style: .relative)`, qui rend « 11 h et 11 min »
                // là où une story se date « 11 h » partout ailleurs dans
                // l'app. C'est le formateur que `StoryItem.timeAgo` emploie :
                // la citation lit donc la MÊME date que la story elle-même
                // (dimension 6 — même chose, même mot). Une chaîne figée
                // convient ici : une citation est un instantané du passé, pas
                // un compteur.
                Text(RelativeTimeFormatter.shortString(for: date))
                    .font(MeeshyFont.relative(9))
                    .foregroundStyle(stripTint.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .foregroundStyle(stripTint)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: accentHex).opacity(isDark ? 0.28 : 0.16))
    }

    // MARK: - Accessibilité

    /// La carte est UN élément : la scène, son texte et le bandeau se lisent
    /// d'une seule phrase. Sans `children: .ignore`, VoiceOver récitait le
    /// texte de la story puis « réponse à sa story » puis la date — trois
    /// arrêts pour une seule chose à comprendre.
    var accessibilityLabel: String {
        "\(stripLabel), \(isUnavailable ? unavailableLabel : sceneText)"
    }

    private var accessibilityHint: String {
        guard armedOpen != nil else { return "" }
        return String(localized: "bubble.reply.story.open_hint", defaultValue: "Ouvre la story citée", bundle: .main)
    }
}

/// **Où la citation d'une story se pose — la règle, seule et interrogeable.**
///
/// Elle vivait comme un `guard` en cascade dans une propriété PRIVÉE d'une
/// `View` : juste, mais impossible à interroger autrement qu'en la relisant.
/// Or c'est une règle à quatre entrées, donc seize cas, dont trois seulement
/// détachent — exactement le genre de table qu'une relecture confirme et qu'un
/// témoin mesure.
///
/// `nonisolated` : arithmétique booléenne pure. La cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc l'isolation serait le
/// DÉFAUT et non une décision — et elle rendrait la règle inappelable depuis
/// tout test synchrone, ce qui la ferait recopier ailleurs. C'est ainsi qu'un
/// site unique cesse d'en être un.
nonisolated enum StoryCitationPlacement {

    /// `true` ⇒ la citation QUITTE la bulle et se rend en carte de scène.
    ///
    /// - `isStoryReply` : une citation de MESSAGE garde sa carte dans la bulle.
    /// - `hasMoodEmoji` : une **humeur** n'a pas de scène — son rendu dédié
    ///   (emoji + contenu + date) vit dans `BubbleQuotedReply`. Elle voyage
    ///   pourtant avec `isStoryReply == true`, parce que c'est ce drapeau qui
    ///   route son ENVOI (`storyReplyToId`) : sans ce second refus, toutes les
    ///   humeurs seraient devenues des cartes vides.
    /// - `visualHostsReply` / `audioHostsReply` : la citation est DÉJÀ logée
    ///   dans le conteneur unifié média ou dans le lecteur audio. Détacher là
    ///   la rendrait EN DOUBLE — une fois en scène, une fois à sa place.
    static func isDetached(isStoryReply: Bool,
                           hasMoodEmoji: Bool,
                           visualHostsReply: Bool,
                           audioHostsReply: Bool) -> Bool {
        isStoryReply
            && !hasMoodEmoji
            && !visualHostsReply
            && !audioHostsReply
    }
}

extension BubbleContent {

    /// **La citation qui QUITTE la bulle, ou `nil`** — vue `3h`, portée par le
    /// CONTENU et non par une peau (#5059).
    ///
    /// Elle vivait en `private var` dans `BubbleStandardLayout`, où son
    /// doc-comment se disait déjà « site UNIQUE de la décision » — et il l'était,
    /// pour la bulle. Les deux autres peaux ne pouvaient pas l'appeler : la
    /// rangée plate et la rivière retombaient donc sur l'aperçu PLAT, c'est-à-dire
    /// exactement le défaut que la vue `3h` nomme — *aplatie*.
    ///
    /// > Un « site unique » à portée `private` n'est unique que dans son fichier.
    /// > La question à poser à une règle qu'on déclare partagée n'est pas
    /// > « combien de fois est-elle écrite ? » mais **« qui peut l'appeler ? »** —
    /// > une règle que ses consommateurs n'atteignent pas se fait réécrire, ou
    /// > pire, se fait ignorer.
    ///
    /// Elle est posée sur `BubbleContent` parce que c'est ce que les trois peaux
    /// PARTAGENT : la bulle et la rangée plate le reçoivent tel quel, et la
    /// rivière le compose depuis la même projection.
    var detachedStoryCitation: ReplyReference? {
        storyCitation(visualHostsReply: visualHostsReply)
    }

    /// **La rangée plate (Script, Focal) n'a PAS de conteneur unifié média.**
    /// `visualHostsReply` décrit la bulle, où la grille loge la citation ; le
    /// bloc média nu de la rangée n'en loge aucune. Lire la règle de la bulle
    /// là faisait disparaître la citation de tout message MÉDIA qui répond
    /// (#7928). Seul le lecteur audio y héberge encore sa citation.
    var flatRowStoryCitation: ReplyReference? {
        storyCitation(visualHostsReply: false)
    }

    /// La rangée plate dessine elle-même la citation, sauf celle du vocal.
    var flatRowDrawsQuote: Bool {
        reply != nil && !audioHostsReply
    }

    private func storyCitation(visualHostsReply: Bool) -> ReplyReference? {
        guard let reply,
              StoryCitationPlacement.isDetached(
                isStoryReply: reply.isStory,
                hasMoodEmoji: reply.reference.moodEmoji != nil,
                visualHostsReply: visualHostsReply,
                audioHostsReply: audioHostsReply
              )
        else { return nil }
        return reply.reference
    }
}

/// **Le mot d'une story citée À PLAT** — dans la citation que loge le
/// conteneur média ou le lecteur audio, là où la carte de scène ne se détache
/// pas. « Story » ou, si elle a disparu, « Story indisponible » (#7895) : le
/// même libellé que la carte, tiré du même catalogue, pour les trois modes.
nonisolated enum QuotedStoryLabel {
    static var unavailable: String {
        String(localized: "bubble.reply.story.unavailable", defaultValue: "Story indisponible", bundle: .main)
    }

    static func text(for reply: ReplyReference) -> String {
        reply.isUnavailableStory
            ? unavailable
            : String(localized: "bubble.reply.story", defaultValue: "Story", bundle: .main)
    }
}

/// Le geste d'ouverture, ou RIEN. Un `.onTapGesture` posé inconditionnellement
/// avalerait le tap même sans gestionnaire : la carte deviendrait une cible
/// morte au lieu de laisser passer. Le modificateur n'existe donc que quand
/// l'action existe.
private struct OpenGesture: ViewModifier {
    let action: (() -> Void)?

    func body(content: Content) -> some View {
        if let action {
            content.onTapGesture {
                HapticFeedback.light()
                action()
            }
        } else {
            content
        }
    }
}
