# Iteration-176i — BlockedTab empty-state → design-system `EmptyStateView`

**Date**: 2026-07-20
**Surface**: `apps/ios/Meeshy/Features/Contacts/BlockedTab.swift`
**Type**: Design-system reuse + accessibilité + user guidance (unification de deux
états vides jumeaux)

## Contexte

Meeshy possède **deux écrans « utilisateurs bloqués »** qui affichent la même
information :

- `BlockedUsersView` (écran plein, Réglages) — utilise déjà le primitive
  design-system `EmptyStateView` (icône accent, sous-titre d'orientation,
  apparition animée, VoiceOver groupé).
- `BlockedTab` (onglet de la liste de contacts) — réimplémentait à la main un
  `VStack` custom pour son état vide.

### État vide custom de `BlockedTab` (avant)

```swift
private var emptyState: some View {
    VStack(spacing: 16) {
        Spacer()
        Image(systemName: "hand.raised.slash")
            .font(.system(.largeTitle).weight(.light))
            .foregroundColor(theme.textMuted.opacity(0.4))
            .accessibilityHidden(true)
        Text(String(localized: "contacts.blocked.empty", ...))   // titre seul
            .font(.callout.weight(.semibold))
            .foregroundColor(theme.textMuted)
        Spacer()
    }
    .frame(maxWidth: .infinity)
}
```

### Problèmes

1. **Incohérence design-system** : deux états vides pour la **même donnée**
   (utilisateurs bloqués) rendus différemment — icône différente, couleur
   différente (gris muet vs accent indigo), pas de sous-titre côté onglet, pas
   d'animation d'apparition. Le repo fournit `EmptyStateView`
   (`MeeshyUI/Primitives/`), déjà adopté par 11 écrans dont le jumeau
   `BlockedUsersView`. `BlockedTab` dupliquait à la main ce que ce composant
   fournit.
2. **Guidage utilisateur manquant** : le `VStack` custom n'affichait qu'un titre
   (« Aucun utilisateur bloqué ») sans expliquer *quand* la liste se remplit.
   `EmptyStateView` porte un sous-titre d'orientation, réduisant la charge
   cognitive.
3. **VoiceOver non groupé / non labellisé** : l'icône était masquée et le titre
   restait un `Text` isolé, sans regroupement ni label combiné.
   `EmptyStateView` groupe nativement (`accessibilityElement(children: .combine)`
   + `accessibilityLabel("\(title). \(subtitle)")`).
4. **Icône moins juste** : `hand.raised.slash` (« bloquer ») pour un état *vide*
   (personne n'est bloqué) est contre-intuitif. Le jumeau `BlockedUsersView`
   utilise `person.crop.circle.badge.checkmark` — sémantiquement « tout va bien,
   personne bloqué ».

## Décision

Remplacer le `VStack` custom de `BlockedTab.emptyState` par `EmptyStateView`,
en **alignant l'icône et le pattern sur le jumeau `BlockedUsersView`** :

```swift
private var emptyState: some View {
    EmptyStateView(
        icon: "person.crop.circle.badge.checkmark",
        title: String(localized: "contacts.blocked.empty",
                      defaultValue: "Aucun utilisateur bloque", bundle: .main),
        subtitle: String(localized: "contacts.blocked.empty.subtitle",
                         defaultValue: "Les utilisateurs que vous bloquez apparaitront ici",
                         bundle: .main)
    )
}
```

- **Réduction de duplication** : un composant partagé au lieu d'un `VStack`
  maison ; cohérence visuelle entre les deux écrans « utilisateurs bloqués ».
- **User guidance** : sous-titre d'orientation ajouté.
- **VoiceOver** : titre + sous-titre groupés et labellisés par le composant.
- **HIG / identité** : icône accent indigo, apparition animée (spring), touch
  cohérent avec le reste de l'app.
- **i18n** : titre réutilise la clé existante `contacts.blocked.empty` ; un seul
  sous-titre neuf `contacts.blocked.empty.subtitle` (inline `defaultValue`,
  convention du repo — auto-extrait dans le string catalog au build, comme
  toutes les autres clés `*.empty.subtitle`). Namespace `contacts` préservé
  (pas de couplage caché sur les clés `blocked.users.*` de l'autre écran).

### Ce qui N'est PAS touché (préservé à dessein)

- Les rangées `blockedRow` : avatar, structure VoiceOver (`.combine`), boutons
  « Débloquer », animation staggerée, alertes de confirmation → **inchangées**.
- Le `ViewModel`, le chargement (`loadBlocked`), le branchement loading/liste.
- La propriété `theme` (toujours utilisée par `blockedRow`).

## Verification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu 18.2).
- 1 fichier, 0 logique / 0 réseau / 0 nouveau composant.
- Aucun test n'assère le contenu du `VStack` emptyState (état interne de vue) →
  0 régression de suite. `EmptyStateView` est déjà couvert par les suites
  existantes de `BlockedUsersView` et des 11 autres consommateurs.

## Statut

- [x] Analyse
- [x] Implémentation
- [ ] Push / PR
