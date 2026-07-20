# iOS UI/UX — Iteration 192i

**Date** : 2026-07-20
**Surface** :
- `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
  (`viewsFilterCapsule`, `reactionFilterCapsule`)
**Axe** : VoiceOver — état sélectionné des filtres segmentés (HIG « jamais la couleur seule », WCAG 1.4.1)
**Base** : `main` HEAD

## Contexte

L'essaim iOS `laughing-thompson` est très dense — PR ouvertes jusqu'à **191i**
(#2168 `StatusBubbleOverlay`, #2164 `GlobalSearchView`, #2163
`CreateTrackingLinkView`). Numéro **192i** choisi strictement `> 191i` (plus haut
en vol). `MessageDetailSheet` **n'apparaît dans aucune PR ouverte** (scan des 18
titres via `list_pull_requests`) — surface libre, 0 collision.

## Constat — filtres segmentés sans trait `.isSelected`

`MessageDetailSheet` ne pose **aucun** `.accessibilityAddTraits(.isSelected)`.
Parmi ses contrôles à état, deux filtres capsule signalent leur segment actif
**uniquement par la couleur** (teinte accent sur le remplissage + le
premier plan), sans aucun glyphe différenciateur ni trait a11y. VoiceOver
annonçait chaque capsule à l'identique, active ou non — l'utilisateur VoiceOver
ne pouvait pas savoir quel filtre était appliqué. Violation HIG « ne jamais
transmettre un état par la seule couleur » / WCAG 1.4.1.

### A. `viewsFilterCapsule` (l.897-949)
Filtre du statut de lecture d'un message (`Reçu` / `Lu` / `Non vu` / `Écouté` /
`Vu`, `ViewsFilter`). Segment actif = `Capsule().fill(accent.opacity(0.15))` +
`stroke(accent)` + `foregroundColor(accent)`. Aucun icône ne change entre états
(`filter.icon` identique) → couleur seule.

### B. `reactionFilterCapsule` (l.1587-1609)
Filtre des réactions par emoji (`Tout` / `👍` / `❤️`…). Segment actif =
`Capsule().fill(contactColor.opacity(0.15))` + `foregroundColor(contactColor)`.
Aucun différenciateur non-couleur → couleur seule.

### Contrôles volontairement NON touchés (déjà différenciés non-couleur)
- **`reportTypeRow` (l.1781)** : coche `checkmark.circle.fill` visible quand
  sélectionné (l.1807) → état déjà transmis par un glyphe, pas seulement la
  couleur.
- **Ligne de langue du Prisme (l.585-700)** : bascule l'icône
  `checkmark.circle.fill` / `chevron.right` selon l'état → différenciateur
  non-couleur présent.

Restreindre le correctif aux deux filtres purement couleur-seule évite toute
double-annonce (coche + « sélectionné ») et garde l'itération chirurgicale,
miroir exact de la doctrine 186i (2 contrôles).

## Correctif (192i)

Sur chaque `Button` des deux filtres, après la fermeture du `label:` :

```swift
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

Miroir des frères déjà prouvés : `CallsTab.chip` (l.60),
`GlobalSearchView.tabButton` (l.218), et les deux sélecteurs soldés en 186i
(`ConversationDashboardView.periodPicker`, `ConversationInfoSheet.tabSelector`).
`isSelected` est déjà en portée dans chaque helper (`let isSelected` /
paramètre). VoiceOver annonce désormais « …, sélectionné » sur le filtre actif ;
libellés et compteurs visibles inchangés = valeur lue.

## Portée

- **1 fichier**, +2 lignes.
- **0** logique, **0** réseau, **0** changement visuel, **0** clé i18n neuve,
  **0** test neuf, **0** changement SDK.
- Gate = CI `iOS Tests`.

## Vérification

- `grep` confirme les 2 nouvelles lignes (l.949, l.1610).
- Aucun autre contrôle couleur-seule sans différenciateur non-couleur ne reste
  dans `MessageDetailSheet` (audit des 8 sites `isSelected`).

## Reste à faire (piste 193i+)

- Autres sheets à filtres capsule couleur-seule non encore audités
  (`ReportMessageSheet`, `LanguagePickerSheet`) — vérifier collision essaim
  avant.
- **⚠️ NE PLUS re-flagger** `MessageDetailSheet.viewsFilterCapsule` ni
  `reactionFilterCapsule` : état sélectionné VoiceOver soldé 192i.
