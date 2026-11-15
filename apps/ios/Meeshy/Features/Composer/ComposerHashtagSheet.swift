import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le sélecteur de HASHTAGS** (#4636, directive porteur 2026-08-31 : « mettre
/// une section Hashtag, ainsi que l'outil hashtag dans la liste des outils »).
///
/// ## Ce qu'il ne fait PAS
///
/// Il ne tient aucune liste. Ce qu'on choisit ici s'écrit dans le TEXTE de la
/// publication (`ComposerHashtags.inserting`), qui reste la seule source des
/// balises — exactement comme le serveur dérive les mentions INLINE en relisant
/// les `@handle`. Une liste parallèle donnerait deux vérités : ce qu'on lit dans
/// le texte, et ce qu'on envoie.
///
/// ## Les tendances sont une SUGGESTION, jamais une condition
///
/// Elles se chargent en arrière-plan et leur absence ne bloque rien : le champ
/// de saisie suffit à poser n'importe quelle balise. Une liste vide est un état
/// NOMINAL (hors-ligne, aucune tendance), pas un chargement éternel — d'où
/// l'absence de spinner sur un écran dont le contrôle principal est déjà utile.
struct ComposerHashtagSheet: View {

    /// Les balises DÉJÀ dans le texte — servies, jamais recalculées ici : deux
    /// dérivations du même texte divergeraient au premier écart de motif.
    let current: [String]
    let trending: [APIHashtag]
    let onToggle: (String) -> Void

    @State private var saisie: String = ""
    @FocusState private var champActif: Bool

    @Environment(\.dismiss) private var dismiss
    @Environment(\.meeshySheetClose) private var hostClose

    /// **Les balises d'avant l'ouverture, retenues pour pouvoir les RENDRE**
    /// (#6134). Cette feuille écrit dans le TEXTE à chaque tap ; « Annuler » ne
    /// peut donc pas se contenter de fermer, sinon il ment.
    ///
    /// Posé une seule fois : réécrire l'instantané à chaque affichage ferait
    /// oublier le point de départ dès le premier retour de plan.
    @State private var instantane: [String]?


    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Le MÊME en-tête que la feuille Mention (#6134) — et son titre a
            // désormais sa propre clé : réutiliser le libellé de la section
            // interne faisait porter deux rôles à un seul mot, que le premier
            // ajustement de l'un aurait cassé chez l'autre.
            MeeshySheetHeader(
                title: ComposerHashtagCopy.sheetTitle,
                doneTitle: ComposerAnchoredSheetCopy.ok,
                onCancel: { annuler() },
                onDone: { valider() }
            )

            champ

            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
                    if !current.isEmpty { bloc(titre: ComposerAudienceCopy.hashtagsSection, tags: current, posees: true) }
                    if !trending.isEmpty {
                        bloc(titre: ComposerHashtagCopy.trending,
                             tags: trending.map(\.tag).filter { tag in
                                 !current.contains { $0.lowercased() == tag.lowercased() }
                             },
                             posees: false)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.xxl)
            }
        }
        .onAppear {
            instantane = instantane ?? current
            champActif = true
        }
    }

    /// **Refuser, c'est REVENIR** — et la bascule étant son propre inverse, il
    /// suffit de rejouer la différence symétrique. La règle est pure et vit
    /// chez `ComposerHashtags`, parce qu'un « Annuler » qui ne défait rien
    /// ferme quand même la feuille : seul un test de VALEUR l'attrape.
    private func annuler() {
        for tag in ComposerHashtags.togglesRestoring(current, to: instantane ?? current) {
            onToggle(tag)
        }
        fermer()
    }

    /// **UNE validation** (#13839, L3) : OK pose ce qui reste tapé, puis ferme.
    /// Le bouton « Ajouter » en était une seconde, et une saisie non validée
    /// par Retour se perdait à la fermeture.
    private func valider() {
        ajouter()
        fermer()
    }

    private func fermer() {
        MeeshySheetClose.perform(host: hostClose, system: { dismiss() })
    }

    private var champ: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Text("#")
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundStyle(MeeshyColors.hashtagColor(isDark: true))
            TextField(ComposerHashtagCopy.placeholder, text: $saisie)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($champActif)
                .foregroundStyle(.white)
                .submitLabel(.done)
                .onSubmit { ajouter() }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
            .fill(Color.white.opacity(0.07)))
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    private func ajouter() {
        guard let tag = ComposerHashtagEntry.pending(saisie, current: current) else { return }
        onToggle(tag)
        saisie = ""
        HapticFeedback.light()
    }

    @ViewBuilder
    private func bloc(titre: String, tags: [String], posees: Bool) -> some View {
        if !tags.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(titre)
                    .font(MeeshyFont.relative(9.5, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.5))
                FlowingChips(items: tags) { tag in
                    Button {
                        onToggle(tag)
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: MeeshySpacing.xsPlus) {
                            Text("#\(tag)")
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                                .foregroundStyle(posees
                                                 ? MeeshyColors.hashtagColor(isDark: true)
                                                 : .white.opacity(0.85))
                            Image(systemName: posees ? "xmark" : "plus")
                                .font(MeeshyFont.relative(9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(Color.white.opacity(posees ? 0.10 : 0.05)))
                        .overlay(Capsule().strokeBorder(
                            posees ? MeeshyColors.brandPrimary.opacity(0.4) : Color.white.opacity(0.12),
                            lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("#\(tag)")
                    .accessibilityAddTraits(posees ? [.isSelected] : [])
                }
            }
            .padding(.top, MeeshySpacing.smPlus)
        }
    }
}

/// Les mots du sélecteur. Hors du `body` — une chaîne composée dans une vue est
/// hors de portée d'un témoin, et c'est du vocabulaire produit.
extension ComposerHashtagSheet {

    /// **La feuille sait d'où viennent ses suggestions ; le meuble, non.**
    ///
    /// `MeeshyComposerHost` ne doit nommer aucun service — la garde
    /// `test_host_opensNoSecondPublicationPath` prend `PostService` pour le
    /// témoin d'un second chemin de publication, et une lecture « inoffensive »
    /// dans l'unité du meuble y ressemblerait à s'y méprendre. Le fournisseur
    /// vit donc chez le seul consommateur des tendances.
    ///
    /// L'échec est SILENCIEUX et rend une liste vide : c'est l'état nominal de
    /// la feuille (hors-ligne, aucune tendance), jamais un chargement éternel.
    static func loadTrending(limit: Int = 20) async -> [APIHashtag] {
        (try? await PostService.shared.getTrendingHashtags(limit: limit)) ?? []
    }
}

/// **La balise qu'une saisie POSERAIT** — `nil` quand il n'y a rien à poser :
/// vide, ou déjà là (la loi 4 : une validation sans effet n'en est pas une).
nonisolated enum ComposerHashtagEntry {
    static func pending(_ saisie: String, current: [String]) -> String? {
        let propre = saisie.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        guard !propre.isEmpty,
              !current.contains(where: { $0.lowercased() == propre.lowercased() }) else { return nil }
        return propre
    }
}

nonisolated enum ComposerHashtagCopy {

    static var placeholder: String {
        String(localized: "composer.hashtag.placeholder",
               defaultValue: "Ajouter un hashtag", bundle: .main)
    }

    /// Le titre de la FEUILLE — distinct du libellé de la section interne, qui
    /// nomme un bloc de contenu et non l'écran (#6134).
    static var sheetTitle: String {
        String(localized: "composer.hashtag.sheetTitle", defaultValue: "Hashtags", bundle: .main)
    }

    static var trending: String {
        String(localized: "composer.hashtag.trending", defaultValue: "TENDANCES", bundle: .main)
    }
}
