import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'AUDIENCE — la vue `2l`, en feuille** (#4636, directive porteur
/// 2026-08-31).
///
/// > « La vue audience existe ; au lieu du menu contextuel ce devrait être une
/// > vue plein écran ou une feuille comme en `2l` Audience — qui verra, avec la
/// > liste des types de notre application plutôt. Et à la section sélection
/// > mettre plutôt mention si mention il y a, avec précision du mode. Puis
/// > mettre une section Hashtag. »
///
/// ## Ce qu'un menu ne pouvait pas faire
///
/// La pastille du socle ouvrait un `Menu` : six entrées, un `checkmark`, rien
/// d'autre. Un menu contextuel peut lister des CHOIX ; il ne peut pas montrer
/// leurs CONSÉQUENCES — combien de personnes, qui est mentionné, sous quel
/// mode, ce qui part avec, et le fait que l'audience appartient à la
/// publication et non à une slide. Or ces conséquences sont tout ce que
/// l'écran a à dire : le choix lui-même tient en un mot.
///
/// ## Les types sont ceux de l'APPLICATION
///
/// La planche dessine « Public · Abonnés · Amis proches · Choisir des
/// personnes ». Ce sont les mots d'un autre produit. Cette feuille sert
/// `PostVisibility.composerSelectableCases` — les six modes que le backend
/// connaît (`packages/shared/prisma/schema.prisma`), filtrés par
/// `ComposerAudienceOffer` qui retire ce qu'une republication ne peut pas
/// élargir. Recopier les quatre libellés de la planche aurait produit un écran
/// juste à l'œil et faux à l'envoi.
///
/// ## Trois sections, un seul niveau du modèle
///
/// L'audience, les mentions et les hashtags appartiennent tous à la
/// PUBLICATION. C'est ce qui les met sur le même écran — et ce que la note du
/// bas dit à voix haute, parce que la question « est-ce que je perds ça en
/// changeant de format ? » naît de l'écran lui-même.
struct ComposerAudienceSheet: View {

    let offered: [PostVisibility]
    @Binding var selection: PostVisibility
    let selectedUserIds: [String]
    let references: [ComposerReference]
    let hashtags: [String]

    /// Ouvre le sélecteur de personnes pour `ONLY` / `EXCEPT`. Il vit au meuble
    /// — cette vue ne présente rien elle-même : une feuille montée sur une
    /// feuille est le défaut que `ComposerPortal` existe pour rendre
    /// irreprésentable.
    let onChooseUsers: (PostVisibility) -> Void
    let onRemoveHashtag: (String) -> Void
    let onClose: () -> Void

    /// Le jeton du design system, jamais un hex local — c'est lui qui garde
    /// les mesures de contraste de la feuille vraies.
    private var tint: Color { MeeshyColors.brandPrimary }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(offered) { candidate in
                        audienceRow(candidate)
                    }
                    mentionsSection
                    hashtagsSection
                    scopeNote
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            applyBar
        }
        .background(MeeshyColors.indigo950.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }

    // MARK: - L'en-tête

    private var header: some View {
        HStack(spacing: 12) {
            Text(ComposerAudienceCopy.title)
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
        }
    }

    // MARK: - Les types de l'application

    /// **Une ligne DIT ce qu'elle fait, jamais seulement son nom.** Le
    /// sous-titre porte l'effectif là où le client le connaît, et la règle
    /// ailleurs — `ComposerAudienceSubtitle` tient la distinction, pour qu'aucun
    /// « Public (0) » ne paraisse.
    @ViewBuilder
    private func audienceRow(_ candidate: PostVisibility) -> some View {
        Button {
            selection = candidate
            HapticFeedback.light()
            // Un mode qui exige une liste ouvre son sélecteur DANS le même
            // geste : le choisir sans personne dedans laisse une audience que
            // `ComposerDocumentPublishGate` refuse, sans dire pourquoi.
            if candidate.requiresUserSelection { onChooseUsers(candidate) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: candidate.icon)
                    .font(MeeshyFont.relative(15))
                    .frame(width: 22)
                    .foregroundStyle(.white.opacity(0.65))
                VStack(alignment: .leading, spacing: 2) {
                    Text(candidate.label)
                        .font(MeeshyFont.relative(15, weight: .medium))
                        .foregroundStyle(.white)
                    Text(ComposerAudienceSubtitle.subtitle(for: candidate,
                                                           selectedCount: selectedUserIds.count))
                        .font(MeeshyFont.relative(11.5, weight: .regular))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                if candidate == selection {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(tint)
                } else if candidate.requiresUserSelection {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.35))
                } else {
                    Circle().strokeBorder(Color.white.opacity(0.22), lineWidth: 1.5)
                        .frame(width: 20, height: 20)
                }
            }
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(candidate.label)
        .accessibilityValue(ComposerAudienceSubtitle.subtitle(for: candidate,
                                                              selectedCount: selectedUserIds.count))
        .accessibilityAddTraits(candidate == selection ? [.isSelected] : [])
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
        }
    }

    // MARK: - Les mentions, avec leur mode

    /// **La section que la planche appelait « SÉLECTION ».** Elle y montrait les
    /// personnes choisies pour `ONLY` — une redite de la ligne du dessus, qui
    /// porte déjà leur compte. Ce que cet écran est seul à pouvoir dire, c'est
    /// **qui est NOMMÉ dans la publication et sous quel mode** : une mention
    /// hors de l'audience ne prévient personne, et rien d'autre ne le signale.
    @ViewBuilder
    private var mentionsSection: some View {
        if !references.isEmpty {
            sectionTitle(ComposerAudienceCopy.mentionsSection)
            VStack(alignment: .leading, spacing: 8) {
                // `ComposerReference` n'est pas `Identifiable`, et son id peut
                // manquer : le PSEUDO est la seule clé qui survive à un
                // brouillon repris — c'est la raison même pour laquelle le type
                // le rend obligatoire là où `userId` est optionnel.
                ForEach(references, id: \.username) { reference in
                    mentionRow(reference)
                }
            }
        }
    }

    @ViewBuilder
    private func mentionRow(_ reference: ComposerReference) -> some View {
        let reach = ComposerAudienceReach.resolve(mentionUserId: reference.userId,
                                                  visibility: selection,
                                                  audienceUserIds: selectedUserIds)
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 8) {
                Text("@\(reference.username)")
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundStyle(.white)
                Text(ComposerAudienceCopy.mentionMode(reference.display))
                    .font(MeeshyFont.relative(10.5, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
                Spacer(minLength: 0)
                if reach.warns {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(MeeshyFont.relative(12))
                        .foregroundStyle(MeeshyColors.warning)
                }
            }
            if reach.warns {
                Text(ComposerAudienceCopy.mentionOutsideAudience)
                    .font(MeeshyFont.relative(11, weight: .regular))
                    .foregroundStyle(MeeshyColors.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(minHeight: 44, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("@\(reference.username)")
        .accessibilityValue(reach.warns
                            ? ComposerAudienceCopy.mentionOutsideAudience
                            : ComposerAudienceCopy.mentionMode(reference.display))
    }

    // MARK: - Les hashtags

    /// Ils sont DÉRIVÉS du texte (`ComposerHashtags`), donc cette section ne
    /// peut qu'en retirer — en ajouter ici ouvrirait un second chemin vers le
    /// même fait, que le premier désaccord ferait diverger.
    @ViewBuilder
    private var hashtagsSection: some View {
        if !hashtags.isEmpty {
            sectionTitle(ComposerAudienceCopy.hashtagsSection)
            FlowingChips(items: hashtags) { tag in
                Button {
                    onRemoveHashtag(tag)
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: 6) {
                        Text("#\(tag)")
                            .font(MeeshyFont.relative(12, weight: .medium))
                            .foregroundStyle(MeeshyColors.hashtagColor(isDark: true))
                        Image(systemName: "xmark")
                            .font(MeeshyFont.relative(9, weight: .bold))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    .padding(.horizontal, 11)
                    .frame(minHeight: 32)
                    .background(Capsule().fill(Color.white.opacity(0.07)))
                    .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("#\(tag)")
                .accessibilityHint(Text("composer.audience.hashtag.remove", bundle: .main))
            }
        }
    }

    // MARK: - Le reste

    private func sectionTitle(_ texte: String) -> some View {
        Text(texte)
            .font(MeeshyFont.relative(9.5, weight: .semibold))
            .tracking(1.2)
            .foregroundStyle(.white.opacity(0.5))
            .padding(.top, 20)
            .padding(.bottom, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var scopeNote: some View {
        Text(ComposerAudienceCopy.scopeNote)
            .font(MeeshyFont.relative(12, weight: .regular))
            .foregroundStyle(.white.opacity(0.7))
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white.opacity(0.05))
            )
            .overlay(alignment: .leading) {
                Rectangle().fill(tint).frame(width: 2)
            }
            .padding(.top, 22)
    }

    /// **Le bouton NOMME ce qu'il applique** — la planche l'écrit
    /// « APPLIQUER · PUBLIC ». Un bouton qui dit seulement « OK » oblige à
    /// remonter l'écran pour savoir ce qu'on valide.
    private var applyBar: some View {
        Button {
            // La feuille se ferme par son PORTAIL, jamais par `dismiss()` : le
            // meuble possède `presentedPortal`, et une fermeture qui ne passe
            // pas par lui laisserait l'état dire « ouverte » sur un écran vide.
            onClose()
        } label: {
            Text("\(ComposerAudienceCopy.apply) · \(selection.label.uppercased())")
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundStyle(Color.black.opacity(0.85))
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 26)
        .background(Color.black.opacity(0.35))
    }
}

/// Une rangée de puces qui passe à la ligne.
///
/// **`FlowLayout` existe déjà dans l'app** (`OnboardingStepViews.swift`) — en
/// écrire un second l'a fait rougir en « invalid redeclaration », et c'était la
/// bonne rougeur : deux mises en page identiques auraient divergé au premier
/// réglage d'espacement. Ce type n'ajoute donc que le `ForEach`, qui est ce que
/// les deux sites ne partagent pas.
struct FlowingChips<Item: Hashable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        FlowLayout(spacing: 7) {
            ForEach(items, id: \.self) { content($0) }
        }
    }
}
