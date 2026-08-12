# iOS UI/UX — Iteration 226i

**Date** : 2026-07-27
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AffiliateCreateView.swift`
**Axe** : Accessibilité VoiceOver — état transitoire d'un bouton d'action
**Base** : `main` HEAD `68a1a33f`

## Ce que 226i fait

222i a rendu `AffiliateCreateView` accessible (champs nommés, glyphe masqué, CTA
nommé, erreur annoncée) et laissait **une** lacune documentée : pendant la
création, le CTA passe `.disabled` et son glyphe devient un `ProgressView` nu.
Un utilisateur voyant voit tourner un spinner ; un utilisateur VoiceOver
n'entend que « estompé » et **ne peut pas savoir si son appui a été pris en
compte**.

La doctrine existe déjà, écrite noir sur blanc dans `StatusComposerView:258-261` :

> *The label swaps to a bare ProgressView while publishing, which leaves the
> button with no accessible name at the exact moment it is busy. Pin the name to
> the action and carry the transient/blocked states as value + hint, as the
> create-tracking-link button does.*

Trois sites l'appliquent — `CreateTrackingLinkView:136`, `StatusComposerView:263`,
`ThreadView:231` — et `AffiliateCreateView` était le **dernier** à ne pas le
faire. 226i l'aligne :

```swift
.accessibilityValue(isCreating
    ? String(localized: "a11y.tracking.create.in-progress", defaultValue: "Création en cours", bundle: .main)
    : "")
```

**0 clé i18n neuve.** La clé est **partagée avec le bouton du jumeau tracking** :
même action (créer un lien), mêmes mots, et elle est **déjà traduite dans 7
locales** (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`). Inventer une clé
`a11y.affiliate.create.in-progress` aurait ajouté une chaîne non traduite pour
zéro gain sémantique — un test l'interdit explicitement.

**0 changement visuel.**

## ⚠️ Correction d'une piste que j'avais mal qualifiée (222i, piste 223i-a)

Le plan de 222i annonçait comme piste principale :

> *Extraire `formField(_:placeholder:text:accessibilityLabel:hint:)` en composant
> partagé entre les deux écrans « créer un lien » — c'est la suppression réelle
> de la classe de défaut.*

**C'est faux, et il ne faut pas le faire tel quel.** J'avais décrit
`CreateTrackingLinkView.formField` comme « exactement le motif que 222i vient de
réécrire à la main ». Les deux écrans partagent leur **structure** et leur
**sémantique d'accessibilité**, mais **pas leur style** :

| | `CreateTrackingLinkView.formField` | `AffiliateCreateView` |
|---|---|---|
| Police de la caption | `.caption.weight(.medium)` (système) | `MeeshyFont.relative(13, weight: .semibold)` |
| Couleur de la caption | `theme.textSecondary` | `theme.textPrimary` |
| Police du champ | héritée | `MeeshyFont.relative(14)` |
| Rayon | `10` (littéral) | `MeeshyRadius.md` (jeton) |
| Fond | aplat `Color.white/black.opacity(…)` | `theme.surfaceGradient(tint: accentColor)` |
| Bordure | aucune | `theme.border(tint: accentColor)`, 1 pt |

Unifier reviendrait donc à **changer le visuel de l'un des deux écrans** — c'est
une décision de design, pas un refactor d'accessibilité, et cette routine a pour
règle d'améliorer l'existant sans le redessiner. La piste est **reclassée** :
factoriser reste souhaitable, mais seulement après arbitrage explicite du style
retenu. Sans cet arbitrage, ne pas la tenter.

## Ce que 226i ne fait pas (et pourquoi)

**Le `.accessibilityHint` du motif de désactivation.** Quand le nom est vide, le
bouton est `.disabled` : VoiceOver dit « estompé » sans dire *pourquoi*. Les deux
siblings portent un hint pour ce cas — mais leurs clés sont **spécifiques à leur
écran** (`a11y.tracking.create.disabled.hint` = « Saisissez une URL de
destination valide… »), donc non réutilisables ici : il faudrait une chaîne
neuve du type « Saisissez un nom pour créer le lien ».

Deux raisons de ne pas l'ajouter dans cette itération :
1. Les clés a11y voisines sont traduites dans **7 locales** ; en introduire une
   qui ne le serait pas dégraderait la couverture au lieu de l'améliorer, et je
   ne peux pas produire 7 traductions de qualité de façon fiable.
2. **#2369 est en vol** : « le ratchet i18n résout chaque clé contre le catalogue
   de SON target ». Introduire une clé non couverte risque précisément de le
   faire échouer.

→ Piste 227i, à traiter **avec** la chaîne traduite.

## Test

`AffiliateCreateViewAccessibilityTests` — **étendu**, pas dupliqué (la suite du
même écran reste un seul fichier). 1 test neuf / 3 assertions :

1. `.accessibilityValue(isCreating` présent sur le CTA.
2. La clé **réutilisée** est bien `a11y.tracking.create.in-progress`.
3. **Garde négative** : aucune clé `a11y.affiliate.create.in-progress` n'est
   introduite.

**RED : 2/3 contre `main` `68a1a33f`.** La 3ᵉ est une garde négative — verte des
deux côtés par construction, et c'est son rôle : elle ne prouve pas le
correctif, elle empêche une régression future vers une clé dédiée. Je le note
plutôt que de compter 3/3.

**Non-régression 222i** vérifiée dans la foulée : 2 `TextField`, 3
`.accessibilityLabel`, 3 `.accessibilityHidden(true)`, annonce d'erreur — tout
reste en place.

## Vérification

- Pas de toolchain Swift (Linux) → assertions recalculées hors Xcode sur la
  source avant/après (`git show` pour l'état de `main`). Tokenizer accolades /
  parenthèses : **0 / 0** sur les 2 fichiers.
- Clé réutilisée : présence et traductions vérifiées **dans le catalogue**
  (`Localizable.xcstrings`, 7 locales, `fr` = « Création en cours », `en` =
  « Creating »), pas supposées.
- Collision essaim : 7 PR ouvertes, dont 4 iOS (#2370 cibles tactiles
  friend-request, #2369 ratchet i18n, #2368 réparation share-extension, #2367
  glyphes `BubbleQuotedReply`) — **aucune** ne touche `AffiliateCreateView.swift`.
- Numérotation : `226i` — 222i à 225i déjà pris (dont un **doublon** de 222i par
  un autre agent). Re-vérifié juste avant commit.

Gate = CI `iOS Tests`.

## Bilan

**1 fichier de production, +9 / −0** (dont 6 de commentaire). Le dernier bouton
d'action de l'app dont l'état occupé était muet parle désormais. 0 clé i18n, 0
couleur, 0 layout, 0 logique, 0 réseau, 0 changement visuel.

Et une piste erronée que j'avais moi-même écrite est corrigée avant que
quiconque ne l'exécute.

## Piste 227i+

1. `.accessibilityHint` du motif de désactivation sur `AffiliateCreateView` —
   **nécessite une chaîne neuve traduite en 7 locales**.
2. Factorisation du champ de formulaire entre les deux écrans « créer un lien » —
   **seulement après arbitrage du style retenu** (voir la correction ci-dessus).
3. Message d'erreur signalé par la seule couleur (WCAG 1.4.1) — ajouter un glyphe
   change le visuel, à arbitrer avec le design.
