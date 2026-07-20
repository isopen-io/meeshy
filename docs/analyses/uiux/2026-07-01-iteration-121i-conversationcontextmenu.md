# Itération 121i — Analyse UI/UX iOS : `ConversationContextMenuView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationContextMenuView.swift`
**Base** : `main` HEAD (`ead4451c`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le menu contextuel de message (long-press) : rangée d'emojis favoris de réaction, rangées
d'actions (répondre, copier, traduire, supprimer…) avec icône + libellé + indicateur (checkmark /
chevron), en-tête de retour de sous-menu. **0 PR ouverte iOS sur cette surface** au démarrage
(2 PR ouvertes = gateway calls #1363/#1364, disjointes) → 0 contention. Numéro **121i** (120i =
`ConversationAnimatedBackground` mergé #1360).

## Constat (avant 121i)

**7 `.font(.system(size:))`**, **toutes du texte/glyphe réactif** dans des rangées à hauteur
flexible (`minHeight: 44`) : emoji favori (22), icône + libellé de rangée d'action (17 medium /
16 regular), checkmark d'état (13 semibold), chevron de disclosure (13 semibold), chevron + titre
de l'en-tête de retour (15 semibold / 16 semibold). Aucun glyphe n'est dans un cadre de dimension
fixe (les `frame(width: 24)` sont des colonnes d'alignement, pas des cadres tap), et chaque bouton
porte déjà `.accessibilityLabel` + `.accessibilityAddTraits(.isButton)`.

*(Note : `TwoFactorSetupView` a été inspecté d'abord puis écarté — son texte est déjà en
`MeeshyFont.relative`/styles sémantiques et ses 9 glyphes héros ≥40pt sont déjà tous
`accessibilityHidden` → déjà conforme, aucune migration à faire.)*

## Corrections appliquées (1 fichier, 0 logique)

- **7/7 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : emoji favori (22), icône de rangée
  (17 medium), libellé de rangée (16), checkmark (13 semibold), chevron droit (13 semibold),
  chevron gauche de l'en-tête (15 semibold), titre de l'en-tête (16 semibold). → **surface 100 %
  Dynamic-Type-conforme** (0 `.system(size:)` restant).

Aucun gel : aucun glyphe n'est contraint dans un cadre de dimension fixe. a11y déjà exhaustive
(labels de bouton + traits) → **intacte**. Palette (`accent` déterministe, `MeeshyColors.error`
pour le destructif) déjà conforme → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Statut

**TERMINÉE** — `ConversationContextMenuView` Dynamic Type soldé (0 `.system(size:)` restant),
a11y déjà complète. Rien à re-flagger.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationContextMenuView` — 7 sites texte/glyphe → `relative`, **plus aucun `.system(size:)`** ;
  0 gel (aucun cadre fixe), a11y de bouton déjà présente. **SOLDÉ 121i.**
- `TwoFactorSetupView` — déjà conforme (texte `relative`/sémantique, 9 héros ≥40pt déjà
  `accessibilityHidden`) → **ne pas reprendre** (aucune migration à faire).
