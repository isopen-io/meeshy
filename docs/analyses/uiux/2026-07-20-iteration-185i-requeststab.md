# iOS UI/UX — Iteration 185i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Contacts/RequestsTab.swift`
**Axes** : i18n (filtres shipped en littéraux FR) + VoiceOver selected-state (WCAG 1.4.1)
**Base** : `main` HEAD `fc69612`

## Contexte

`RequestsTab` (onglet « Demandes » du hub People — reçues / envoyées) est
par ailleurs mûr : rangées `.accessibilityElement(children: .combine)`,
boutons accepter/refuser/annuler labellisés, touch targets 44×44, fonts
sémantiques. Deux lacunes restaient sur le **sélecteur de filtre en pilules**,
toutes deux auto-contenues (1 fichier, 0 logique).

## Constats

### A. `RequestFilter.rawValue` shippé comme label visible + a11y (i18n)

`enum RequestFilter` (`ContactsShared.swift:54-57`) porte des rawValue en
**littéraux français bruts non accentués** — `"Recues"` / `"Envoyees"`. Ces
rawValue servaient **directement** de texte de pilule (`Text(filter.rawValue)`)
**et** de composant du label VoiceOver (`String(format: … , filter.rawValue,
count)`). Conséquence : deux strings non localisées shipped à l'écran, et un
défaut d'accent (« Recues » au lieu de « Reçues »). Même classe de défaut que
`PeopleTab.rawValue` traité en 176i (`ContactsHubView`).

### B. Filtre sélectionné signalé par la seule couleur (WCAG 1.4.1)

Le filtre actif se distinguait uniquement par **couleur** (texte blanc + fill
capsule indigo500 vs texte indigo500 + contour). Le `Button` de pilule ne
portait **aucun** `.accessibilityAddTraits(.isSelected)` → VoiceOver annonçait
« Reçues, 3 demandes » à l'identique qu'il soit actif ou non. Violation HIG
« jamais la couleur seule pour un état », même doctrine que 149i / 155i / 163i /
176i / 177i / 178i.

## Correctifs (185i)

1. **Helper `filterTitle(_:)` localisé** — nouveau helper privé retournant
   `String(localized: "contacts.requests.filter.{received,sent}", defaultValue:
   "Reçues"/"Envoyées", bundle: .main)`. `RequestFilter.rawValue` **reste** la
   clé stable d'identité / persistance (`.tag`, comparaisons) ; `filterTitle`
   devient l'**unique** surface shipped-à-l'écran (pilule + label a11y). Défauts
   FR **correctement accentués** (correction du défaut d'accent). Parité exacte
   avec le `tabTitle(_:)` posé en 176i pour `ContactsHubView`.

2. **Trait `.isSelected`** — `.accessibilityAddTraits(isSelected ? [.isSelected]
   : [])` ajouté sur le `Button` de pilule (état « sélectionné » annoncé et
   localisé par iOS, 0 clé neuve). Le `Button` conserve son trait `.isButton`
   natif ; on n'utilise pas `.combine` (fausserait le bouton). Introduction d'un
   `let isSelected = activeFilter == filter` qui déduplique aussi les 4
   comparaisons `activeFilter == filter` du corps de la pilule.

## Portée

- **1 fichier** (`RequestsTab.swift`), 0 logique / 0 réseau / 0 test neuf /
  0 changement de layout.
- **2 clés i18n inline** (`defaultValue`, 0 xcstrings).
- **`ContactsShared.swift` NON touché** — évite toute collision avec l'essaim
  `PeopleDiscoveryView` en vol (#2129 / #2115 / #2114, même famille d'enums).
  `RequestFilter` inchangé (rawValue = clé stable).
- Rangées `receivedRow` / `sentRow`, empty state, ViewModel, navigation
  **inchangés**.

## Vérification

- Équilibre accolades/parenthèses/crochets vérifié (53/53, 207/207, 3/3).
- Aucun test ne référence `RequestsTab` / `RequestFilter` /
  `contacts.requests.filter` (grep vide) → 0 régression de test.
- `list_pull_requests` : aucune PR ouverte ne touche `RequestsTab.swift`.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode) → **gate = CI
  `iOS Tests`**.

## NE PLUS re-flagger

`RequestsTab` filter pills : i18n (helper `filterTitle`) + selected-state
(`.isSelected`) soldés 185i. Fonts déjà sémantiques (0 Dynamic Type), rangées
a11y complètes.

## Restant (piste 186i+)

- `RequestsTab.emptyState` : `VStack` custom (`Image .system(.largeTitle)` +
  `Text`) réimplémentant `AdaptiveContentUnavailableView` — même dédup que
  175i / 176i (vérifier collision avec BlockedTab empty-state en vol #2111).
- `ContactFilter.rawValue` (`ContactsShared.swift:46-52`, 5 littéraux FR) : même
  i18n dans `ContactsListTab`, une fois l'essaim `ContactsShared`/`ContactsListTab`
  retombé.
