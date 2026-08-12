# Iteration-205i — ContactsListTab: design-system dedup de l'état vide (native `EmptyStateView`)

## Contexte

`ContactsListTab` (`apps/ios/Meeshy/Features/Contacts/ContactsListTab.swift`) est
l'onglet « Contacts » du hub de contacts (`ContactsHubView`). Quand la liste d'amis
est vide (aucun contact, ou aucune correspondance de recherche), l'onglet affiche un
état vide.

Cet état vide était un **`VStack` fait-main** (l. 201-214) :

```swift
private var emptyState: some View {
    VStack(spacing: 16) {
        Spacer()
        Image(systemName: "person.2.slash")
            .font(.system(.largeTitle).weight(.light))
            .foregroundColor(theme.textMuted.opacity(0.4))
            .accessibilityHidden(true)
        Text(viewModel.searchQuery.isEmpty ? String(localized: "contacts.list.empty", …) : String(localized: "contacts.list.no-results", …))
            .font(.callout.weight(.semibold))
            .foregroundColor(theme.textMuted)
        Spacer()
    }
    .frame(maxWidth: .infinity)
}
```

## Problème (design-system — duplication / incohérence entre onglets frères)

Le hub de contacts regroupe plusieurs onglets frères. **Deux d'entre eux utilisent
déjà le composant natif réutilisable `EmptyStateView`** (`MeeshyUI/Primitives`) :

- `CallsTab.swift:75` → `EmptyStateView(icon: "phone.arrow.up.right", title:, subtitle:)`
- `BlockedTab.swift:114` → `EmptyStateView(icon: "hand.raised.slash", title:, subtitle:)`

`ContactsListTab` réimplémentait la même structure (icône décorative + titre centré)
à la main, divergeant de ses frères directs. Même dédup soldée en 178i
(`ShareLinksView`), 184i (`TrackingLinksView`), 196i (`ActiveSessionsView`),
204i (`VoiceProfileManageView`).

Gains manqués par la version fait-main :
- pas de dédup (structure répétée d'onglet en onglet — dette de maintenance) ;
- animation d'apparition (spring 0.5/0.8 + fade/offset) absente ;
- élément VoiceOver non regroupé au niveau du composant (le titre était lu seul,
  l'icône `accessibilityHidden`).

## Correctif

Remplacement du `VStack` fait-main par `EmptyStateView`, **en réutilisant les clés
i18n existantes** (`contacts.list.empty` / `contacts.list.no-results`) et en
**conservant l'icône `person.2.slash`** :

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "person.2.slash",
        title: viewModel.searchQuery.isEmpty
            ? String(localized: "contacts.list.empty", defaultValue: "Aucun contact", bundle: .main)
            : String(localized: "contacts.list.no-results", defaultValue: "Aucun resultat", bundle: .main),
        subtitle: ""
    )
}
```

`subtitle: ""` → `EmptyStateView` n'affiche pas de sous-titre (`if !subtitle.isEmpty`),
donc **le contenu visible reste exactement icône + titre** comme avant (0 texte neuf).
Le titre conserve son comportement conditionnel (liste vide vs recherche sans
résultat) inchangé.

## Portée & sûreté

- **1 fichier**, −12 / +7 lignes, 0 logique / 0 réseau / **0 clé i18n neuve** /
  0 test neuf.
- `import MeeshyUI` déjà présent (l. 4) — aligné sur `CallsTab` / `BlockedTab`.
- Header, filter chips, `contactRow`, navigation, ViewModel : **inchangés**.
- Changements cosmétiques (assumés, alignement sur les frères) : teinte icône
  `theme.textMuted.opacity(0.4)` → `Color(hex: accentColor).opacity(0.4)` avec
  `accentColor` par défaut = `brandPrimaryHex` indigo (exactement comme
  `CallsTab` / `BlockedTab`), taille icône 52pt native (scale Dynamic Type), animation
  spring gratuite.
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests`, 0
  correspondance sur `ContactsListTab` / `contacts.list`) → 0 collision avec l'essaim
  `laughing-thompson`.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Pas de toolchain Swift dans l'environnement Linux d'exécution → vérification par
  inspection + parité stricte avec l'API `EmptyStateView` déjà consommée par 2 onglets
  frères dans le même dossier.

## Statut

✅ Résolu. Ne plus re-flagger `ContactsListTab` pour la dédup de l'état vide
(soldé 205i). L'onglet est désormais structurellement identique à ses frères
`CallsTab` / `BlockedTab`.

## Pistes 206i+

- `Candidate 1` (agent) : `MeeshyShareExtension/ShareViewController.swift` l. 519-527 —
  ligne de sélection de contact à état sélectionné couleur-seule (fond bleu + checkmark
  conditionnel), sans `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`.
  Cible du Share Extension, hors app principale.
- `Candidate 3` (agent) : `MemberManagementSection.swift` l. 306-322 — autre état vide
  fait-main (`person.slash`, 28pt) remplaçable par `EmptyStateView(compact: true)`.
