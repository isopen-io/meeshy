# Itération 155i — VoiceOver `MessageReactionsDetailView` (iOS)

**Date** : 2026-07-17
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift`
**Type** : accessibilité (VoiceOver / regroupement / état non-couleur) — 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Contexte

`MessageReactionsDetailView` est l'onglet « Réactions » du détail d'un message : une rangée
horizontale de capsules de filtre (Toutes / par emoji) + la liste des utilisateurs ayant réagi +
un état vide. C'est le **jumeau structurel** de `MessageViewsDetailView` (traité en 144i, PR #1974) :
même patron capsule-filtre + rangée-utilisateur. Surface **jamais analysée** auparavant (0 mention
dans `docs/analyses/uiux`), **aucune PR ouverte** dessus.

La typographie est **déjà entièrement sémantique** (`.subheadline` / `.caption` / `.title3` /
`.caption2` / `.footnote`) → **aucune dette Dynamic Type**, aucun `.font(.system(size:))` à migrer.
Le seul `.font(.system(size: 28))` est le glyphe décoratif d'état vide (identique au jumeau
`MessageViewsDetailView.emptyStateView` — conservé tel quel pour cohérence). C'est donc une itération
**purement VoiceOver** (même nature que 144i / 153i).

## Lacunes VoiceOver réelles comblées

1. **Capsule de filtre — état sélectionné signalé par la seule couleur** (violation HIG « never rely
   on color to convey meaning »). Un utilisateur VoiceOver ne pouvait pas savoir quel filtre d'emoji
   était actif. → `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` sur le `Button` :
   VoiceOver annonce désormais « sélectionné » sur la capsule active. Le libellé combiné du bouton
   (emoji + compteur) était déjà lu correctement.

2. **Rangée d'utilisateur — 4 arrêts VoiceOver séparés** (avatar, nom, emoji, date lus un par un, avec
   duplication avatar/nom). → `.accessibilityHidden(true)` sur `MeeshyAvatar` (le nom textuel juste
   à côté le duplique) + `.accessibilityElement(children: .combine)` sur la `HStack` : un seul arrêt
   « Alice, 😀, il y a 2 h ». Aucun libellé neuf — le `combine` réutilise les `Text` déjà localisés.

3. **Glyphe d'état vide `face.smiling` exposé à VoiceOver** (décoratif, redondant avec le texte
   « Aucune réaction »). → `.accessibilityHidden(true)` sur l'icône + `.accessibilityElement(children:
   .combine)` sur la `VStack` d'état vide (un seul arrêt porteur de sens).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 appel réseau touché (`loadReactionDetails`,
  `filteredReactionUsers` inchangés), 0 test neuf, 0 clé i18n neuve.
- Palette (`Color(hex: contactColor)`, `theme.*`) déjà conforme → non touchée.
- Aucun test ne référence `MessageReactionsDetailView` → aucune régression de test.
- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).

## Statut

**TERMINÉE** — `MessageReactionsDetailView` VoiceOver soldé : capsule de filtre `.isSelected`
(état non-couleur comblé), rangée utilisateur regroupée (`combine` + avatar masqué), état vide
regroupé + glyphe masqué. Typographie déjà sémantique (aucune migration). Ne plus re-flagger cette
surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageReactionsDetailView` — capsule filtre `.accessibilityAddTraits(.isSelected)` conditionnel
  (état auparavant couleur-only) ; rangée utilisateur `.accessibilityElement(children: .combine)` +
  avatar `.accessibilityHidden` ; état vide `combine` + glyphe `face.smiling` masqué ; fonts déjà
  sémantiques (0 migration Dynamic Type) ; jumeau de `MessageViewsDetailView` (144i). **SOLDÉ 155i.**
