# Itération 142i — Analyse UI/UX iOS : `FriendRequestListView`

**Date** : 2026-07-15
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift`
**Base** : `main` HEAD (`424bfed`)
**Branche** : `claude/laughing-thompson-f7d2yn`
**Gate** : CI `iOS Tests`

## Contexte

`FriendRequestListView` est l'écran plein d'affichage des demandes d'amis reçues (liste de rangées
avatar + nom + pseudo + message/intention + ancienneté, avec deux boutons ronds Accepter / Refuser). Surface
**fraîche** jamais balayée par la piste. Contrairement aux itérations 127i→141i, la typographie y est
**déjà entièrement Dynamic Type** (`.font(.body/.headline/.subheadline/.caption/.caption2/.footnote)` —
polices sémantiques qui scalent) ; la seule `.font(.system(size:))` est l'icône héros décorative de l'état
vide (`person.2.slash`, 48pt light, ≥40pt → figée par doctrine). **Le vrai déficit ici n'est pas
typographique mais VoiceOver-structurel.**

## Constat (avant 142i)

1. **Icône héros d'état vide annoncée comme du bruit** — `Image(systemName: "person.2.slash")` sans
   `.accessibilityHidden(true)` : VoiceOver la focalise et annonce le nom du symbole avant le titre. Le sens
   (« Aucune demande ») est déjà porté par le titre + sous-titre → l'icône est purement décorative.
2. **Titre d'écran non traité comme en-tête** — `Text("Demandes d'amis")` sans
   `.accessibilityAddTraits(.isHeader)` : le rotor VoiceOver « En-têtes » ne le liste pas, l'utilisateur
   ne peut pas sauter directement au titre de l'écran.
3. **Rangée fragmentée en 4 focus VoiceOver** — le `VStack` textuel (nom, `@pseudo`, message/intention,
   ancienneté) expose 4 éléments focalisables distincts. L'utilisateur VoiceOver doit swiper 4 fois pour
   parcourir l'identité d'un seul expéditeur avant d'atteindre les boutons d'action.

## Corrections appliquées (1 fichier, 0 logique)

- **État vide** : icône `person.2.slash` → `.accessibilityHidden(true)` + commentaire de gel doctrine
  (≥40pt, décorative). Le `VStack` de l'état vide → `.accessibilityElement(children: .combine)` : titre +
  sous-titre lus en une seule annonce cohérente.
- **En-tête** : titre d'écran → `.accessibilityAddTraits(.isHeader)` → navigable au rotor « En-têtes »
  (parité avec `AboutView`, `AffiliateView`).
- **Rangée** : le `VStack` textuel → `.accessibilityElement(children: .combine)` : nom + pseudo + intention +
  ancienneté lus en **une seule annonce** au lieu de 4 focus séparés. Les boutons **Accepter** / **Refuser**
  restent des éléments actionnables distincts (déjà `.accessibilityLabel`isés) — le regroupement ne touche
  que le bloc textuel, pas les affordances.

Aucune police modifiée (l'icône reste figée par doctrine, tout le reste est déjà sémantique). **0 clé i18n
neuve** : le regroupement réutilise les libellés localisés existants.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI` déjà
  présent. Le `FriendRequestListViewModel` (chargement, respond) n'est **pas** touché.
- Aucun test ne référence `FriendRequestListView` → aucune régression de test.
- Palette (`theme.textPrimary/textMuted/textSecondary`, gradient succès pour Accepter) déjà tokenisée → non
  touchée. Boutons d'action déjà labellisés (`friends.requests.accept/decline`) → intacts.

## Statut

**TERMINÉE** — `FriendRequestListView` soldée côté VoiceOver-structure : état vide masqué + regroupé, titre
en-tête, rangée regroupée en une annonce. Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `FriendRequestListView` — typographie déjà 100 % Dynamic Type (0 conversion) ; icône héros d'état vide
  figée + `.accessibilityHidden` ; état vide regroupé (`children: .combine`) ; titre `.isHeader` ; rangée
  textuelle regroupée (`children: .combine`, boutons d'action laissés distincts). **SOLDÉ 142i.**
