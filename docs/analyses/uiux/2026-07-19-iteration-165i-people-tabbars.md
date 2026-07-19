# Itération 165i — Analyse UI/UX iOS : barres d'onglets custom du hub *People* (état sélectionné VoiceOver)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surfaces** :
- `apps/ios/Meeshy/Features/Contacts/ContactsHubView.swift` (barre d'onglets Appels / Clavier / Contacts)
- `apps/ios/Meeshy/Features/Contacts/PeopleDiscoveryView.swift` (sous-onglets Découvrir / Demandes / Bloqués)

**Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-69z5aq`
**Gate** : CI `iOS Tests`
**Catégorie** : Accessibilité — VoiceOver (état porté par couleur seule)

## Contexte

Le hub *People* expose deux barres d'onglets **custom** (des `Button` dessinés à la main, pas un
`TabView`/`Picker` natif) :

1. `ContactsHubView.tabButton` — les 3 onglets primaires **Appels / Clavier / Contacts**.
2. `PeopleDiscoveryView.subTabButton` — les 3 sous-onglets **Découvrir / Demandes / Bloqués**.

Dans les deux cas, l'onglet actif est signalé **exclusivement par le visuel** : teinte indigo
(`MeeshyColors.indigo500`) sur le libellé/icône + un soulignement `Rectangle` de 2 pt. Aucun trait
VoiceOver ne portait cet état.

Numéro **165i** : strictement au-dessus du plus haut en vol (164i = `InviteFriendsSheet`).
Vérification préalable — le sibling direct `CallsTab.swift` (même dossier) **possède déjà**
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])` (ligne 60) : `ContactsHubView` et
`PeopleDiscoveryView` sont les deux barres d'onglets *People* qui avaient **manqué** cette parité.

## Constat (avant 165i)

- **VoiceOver ne prononce jamais quel onglet est actif.** Un utilisateur VoiceOver entend
  « Tab Contacts, bouton » / « Découvrir, bouton » — identique pour l'onglet actif et les inactifs.
  L'information « cet onglet est sélectionné » est portée **uniquement par la couleur + le
  soulignement**, ce qui viole directement la règle CLAUDE.md a11y : *« Never rely only on color to
  convey meaning »*.
- Le document interne `apps/ios/Documentation/ACCESSIBILITY_AUDIT.md` prescrit d'ailleurs
  explicitement, pour la sélection (onglets/chips/pills), le pattern
  `.accessibilityAddTraits(isSelected ? .isSelected : [])` **« partout »** — non appliqué ici.

## Corrections appliquées (2 fichiers, 0 logique, 0 changement visuel, 0 i18n)

- **`ContactsHubView.tabButton`** : ajout de
  `.accessibilityAddTraits(isSelected ? .isSelected : [])` après le `.accessibilityLabel` existant.
- **`PeopleDiscoveryView.subTabButton`** : ajout de
  `.accessibilityAddTraits(isSelected ? .isSelected : [])` après le `.accessibilityValue` existant.

VoiceOver annonce désormais « Tab Contacts, **sélectionné**, bouton » sur l'onglet actif. Le rendu
visuel (teinte + soulignement) est **strictement inchangé** — on ajoute uniquement une couche
sémantique. Pattern **identique** à celui déjà en place dans `CallsTab` / `NewConversationView` /
doctrine 106i.

## Périmètre / non-régression

- **2 fichiers**, +6 lignes purement additives (dont 2 commentaires), 0 logique, 0 mutation d'état,
  0 changement de layout/couleur/copie visible, **0 clé i18n neuve**, 0 test neuf.
- `AccessibilityTraits` étant un `OptionSet`, `isSelected ? .isSelected : []` type-check à
  l'identique de l'usage existant `CallsTab.swift:60` / `NewConversationView.swift:401`.
- **Dynamic Type déjà couvert** : les deux barres n'utilisent que des polices sémantiques
  (`.footnote` / `.caption` / `.caption2`) — 0 `.font(.system(size:))`, rien à migrer.
- Aucun test iOS ne référence ces deux vues → aucune régression de test.

## Différé (follow-up)

- **Unification** : `ContactsHubView.tabButton`, `PeopleDiscoveryView.subTabButton` et
  `CallsTab` (filtres) sont des barres d'onglets custom quasi-identiques (mêmes espacements, même
  soulignement 2 pt, même palette). Une extraction en composant partagé
  (`MeeshyUnderlineTabBar`) réduirait la duplication — **lot dédié** (refactor, risque de
  régression visuelle), hors périmètre de cette itération a11y surgicale.
- `PeopleTab.rawValue` / `DiscoveryTab.rawValue` sont des chaînes FR brutes non localisées
  (utilisées aussi pour l'affichage `Text`) — concern i18n **data-model**, hors périmètre.

## Statut

**TERMINÉE** — les deux barres d'onglets custom du hub *People* annoncent désormais l'onglet actif
à VoiceOver (`.isSelected`), à parité avec `CallsTab`. Ne plus re-flagger ces surfaces pour l'état
sélectionné VoiceOver ni pour Dynamic Type (déjà sémantique).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ContactsHubView` / `PeopleDiscoveryView` — **165i** : trait VoiceOver `.isSelected` sur l'onglet
  actif des barres custom (état auparavant porté par couleur + soulignement seuls). Parité avec
  `CallsTab`. Dynamic Type déjà sémantique. **SOLDÉ.**
