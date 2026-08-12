# Itération 146i — Analyse UI/UX iOS : `VoiceProfileManageView`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`
**Base** : `main` HEAD (`bd86317`)
**Branche** : `claude/laughing-thompson-5b696g`
**Gate** : CI `iOS Tests`

## Contexte

`VoiceProfileManageView` est l'écran de gestion du profil vocal (clonage voix pour les traductions
audio du Prisme Linguistique) : header, carte de statut, carte d'infos, toggles (clonage / profil
public), liste d'échantillons, action de suppression RGPD. Surface **fraîche** : l'écran utilise déjà
`MeeshyFont.relative` partout pour ses **libellés texte** (typo scalable OK), mais 3 `.font(.system(size:))`
subsistaient sur des **glyphes SF Symbol** — sans annotation de doctrine et surtout **sans traitement
VoiceOver**. **0 contention** : aucune des 7 PR iOS ouvertes (dont #1961 « Modernize iOS App ») ne touche
ce fichier (vérifié via `get_files` sur #1961 → MessageOverlayMenu/ConversationView/LoginView/…, pas
`VoiceProfileManageView`).

## Constat (avant 146i)

Défauts réels d'accessibilité, pas seulement cosmétiques :

1. **Bouton de fermeture (header, `xmark.circle.fill` 28)** — **aucun `.accessibilityLabel`**. VoiceOver
   annonçait le nom brut du symbole (« xmark circle fill ») au lieu d'un libellé d'action clair. **Défaut
   a11y avéré.**
2. **Héros décoratif (`person.wave.2.fill` 64, empty state)** — non masqué à VoiceOver → annonçait un
   symbole décoratif parasite avant le titre « Aucun profil vocal ».
3. **Glyphe de statut (`statusIcon` 28, carte de statut)** — non masqué → VoiceOver lisait le nom brut du
   symbole (« checkmark seal fill », « exclamationmark triangle fill »…) **en plus** du libellé texte
   `statusLabel` déjà présent (« Actif », « Échec »…) → doublon verbeux. De plus, la carte de statut n'était
   **pas groupée** : icône + libellé + description + qualité = 4 arrêts VoiceOver séparés.

## Corrections appliquées (1 fichier, 0 logique)

- **Bouton de fermeture** : ajout de `.accessibilityLabel("Fermer")` (clé `common.close` déjà utilisée
  ailleurs — aucune clé i18n neuve). Glyphe **gardé figé** `.system(size: 28)` (chrome d'en-tête, doctrine
  82i/87i) + commentaire.
- **Héros `person.wave.2.fill`** : `.accessibilityHidden(true)` (décoratif ≥40pt, doctrine 84i → taille fixe
  assumée) + commentaire.
- **Glyphe de statut** : `.font(.system(size: 28))` → `.font(MeeshyFont.relative(28))` (scale sous Dynamic
  Type pour rester harmonisé avec le libellé adjacent qui scale ; aucun cadre fixe ne le contraint) +
  `.accessibilityHidden(true)` (le sens est porté par le libellé texte → évite l'annonce redondante du nom
  du symbole). Précédent : #1974 migre les « state icons » de `MessageViewsDetailView` en Dynamic Type.
- **Carte de statut** : `.accessibilityElement(children: .combine)` → VoiceOver lit désormais un **seul**
  élément (« Actif, Votre profil vocal est prêt à l'emploi, 85%, Qualité ») au lieu de 4 arrêts. Aligné sur
  le pattern déjà en place dans `cloningToggle` / `voicePublicToggle` du même fichier.

**Pas de dépendance à la couleur seule** : les statuts se distinguent par la **forme** du symbole
(`checkmark.seal` vs `exclamationmark.triangle` vs `clock`…) ET par le libellé texte — la couleur n'est
qu'un renfort. Contrainte « never rely only on color » respectée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (`common.close` réutilisée).
  `import MeeshyUI` déjà présent → `MeeshyFont.relative` disponible.
- Le `VoiceProfileManageViewModel` (chargement, toggles, suppression) n'est **pas** touché.
- Aucun test ne référence `VoiceProfileManageView` → aucune régression de test. Gate = CI `iOS Tests`.

## Statut

**TERMINÉE** — `VoiceProfileManageView` : bouton de fermeture labellisé, héros + glyphe de statut masqués à
VoiceOver, glyphe de statut migré Dynamic Type, carte de statut groupée. Restent 2 `.system` **assumés
figés** (close 82i/87i, héros 84i), tous deux annotés + traités VoiceOver. Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `VoiceProfileManageView` — bouton fermeture `.accessibilityLabel` (défaut a11y corrigé) ; héros décoratif
  `.accessibilityHidden` (84i, figé) ; glyphe de statut → `MeeshyFont.relative(28)` + `.accessibilityHidden`
  (redondant avec le libellé) ; carte de statut `.accessibilityElement(children: .combine)`. Close glyph figé
  (82i/87i). **SOLDÉ 146i.**
