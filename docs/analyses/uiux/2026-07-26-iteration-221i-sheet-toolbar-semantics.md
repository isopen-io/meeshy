# Itération 221i — Sémantique des actions de feuille (`StatusComposerView`)

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift` (toolbar uniquement)
**Base** : `main` HEAD `ffef1339e`
**Numéro** : **221i**, choisi strictement supérieur aux numéros déjà revendiqués par
l'essaim (218i #2338, 219i #2336, 220i #2337/#2339/#2341/#2342).

---

## 1. Constat d'essaim — collision à huit sur la même piste

Le pointeur 217i désignait comme piste 218i-(b) la migration du dernier `NavigationView`
de l'app (`StatusComposerView:37`), débloquée par le merge de #2275. Après le merge de
#2326 (217i), **huit agents ont resynchronisé simultanément et choisi la même piste** :

| PR | Branche | `StatusComposerView` | Migration nav ? | Sémantique toolbar ? |
|---|---|---|---|---|
| #2335 | `…-a2ves5` | `2 +-` | ✅ | ❌ |
| #2336 | `…-mlmono` | `2 +-` | ✅ | ❌ |
| #2337 | `…-utn21c` | `2 +-` | ✅ | ❌ |
| #2338 | `…-6kr79r` | `2 +-` | ✅ | ❌ |
| #2339 | `…-iohhlq` | `8 +-` | ✅ (+ commentaire, + scope story export) | ❌ |
| #2340 | `…-wrdsoe` | `2 +-` | ✅ (+ sites d'appel) | ❌ |
| #2341 | `…-hvg35q` | `2 +-` | ✅ | ❌ |
| #2342 | `…-x6tws7` | `2 +-` | ✅ (+ scope partage) | ❌ |

Vérification directe : `git diff origin/main...refs/pull/N/head | grep -c cancellationAction`
retourne **0 pour les huit**.

**Conséquence assumée pour cette itération.** Le travail initialement préparé couvrait
*deux* défauts (A : conteneur de navigation ; B : placements de toolbar). La partie **A
est abandonnée** de cette branche : ajouter une neuvième copie d'un changement d'une
ligne déjà porté par huit PR ouvertes dégraderait la file au lieu de l'améliorer. Seule
la partie **B — que personne d'autre ne porte — est conservée**, ce qui rend cette
branche **complémentaire** : elle fusionne proprement avec n'importe laquelle des huit
(lignes disjointes — l. 37 pour A, l. 79-94 pour B).

## 2. Le défaut — des côtés de barre là où la sémantique existe

Le `.toolbar` de `StatusComposerView` (l. 79-89 avant correctif) déclarait ses deux
boutons par **côté de barre** :

```swift
ToolbarItem(placement: .navigationBarLeading)  { /* Fermer  */ }
ToolbarItem(placement: .navigationBarTrailing) { /* Publier */ }
```

Or les deux boutons d'une feuille ne sont pas « celui de gauche » et « celui de droite » :
ce sont une **annulation** et une **confirmation**. Les exprimer en
`.cancellationAction` / `.confirmationAction` rend les côtés au système, ce qui est
précisément ce qui fait **basculer la paire correctement en RTL**, laisse la plateforme
associer Échap / Retour aux deux rôles, et donne au commit sa proéminence native.
Les placements bruts sont de surcroît **dépréciés depuis iOS 17** au profit de
`.topBarLeading` / `.topBarTrailing`.

Ce n'est pas une invention : c'est un **défaut de cohérence**.

- **Convention majoritaire de l'app** : `.cancellationAction` = **18** usages,
  `.confirmationAction` = 4, contre 7 `.navigationBarLeading`.
- **Frère structurellement identique** : `EditPostSheet` (`Components/EditPostSheet.swift:153-174`)
  est la *même* feuille de composition — annuler + un bouton publier qui échange son
  label contre un `ProgressView` pendant l'envoi, label en `.semibold` — et expédie
  **déjà** exactement cette paire. `StatusComposerView` est la divergente.

Sur iOS la position rendue est **identique** (annulation → leading, confirmation →
trailing) : le gain est sémantique, RTL, clavier et multiplateforme, **pas visuel**. Les
deux labels portent déjà leurs modificateurs de style explicites
(`.foregroundColor(theme.textSecondary)` ; `.font(…, weight: .semibold)` +
`.foregroundStyle(brandGradient)`), qui l'emportent sur l'emphase par défaut du placement
— le rendu est donc préservé, comme le prouve le frère `EditPostSheet` déjà en production.

## 3. Ce qui n'est **pas** touché

- **Le conteneur de navigation** (l. 37) : laissé à l'une des huit PR ci-dessus.
  Cette branche **ne touche pas** `NavigationContainerMigrationTests` non plus — cet
  épinglage appartient à la PR qui portera A.
- **Aucune chaîne user-visible.** Le libellé reste `common.close` (« Fermer ») et n'est
  volontairement **pas** aligné sur le `common.cancel` du frère : changer la copie est une
  décision produit, hors périmètre d'une itération de chrome. **0 clé i18n neuve.**
- **0 constante visuelle**, 0 couleur, 0 espacement, 0 logique métier, 0 réseau.

## 4. Dette résiduelle mesurée (et désormais épinglée)

Les placements de barre dépréciés subsistent sur **10 écrans** :

`AudioPostComposerView`, `CreateShareLinkView`, `CreateTrackingLinkView`,
`EmojiPickerSheet`, `InviteFriendsSheet`, `MagicLinkView`, `MyStoriesView`,
`SecurityVerificationView`, `StoryViewerView+Content`, `VoiceProfileManageView`.

Ils ne sont **pas** réécrits en masse, et c'est délibéré : chaque cas demande un jugement
propre — l'item trailing d'une vue **poussée** (et non présentée en feuille) est souvent
un authentique item de barre et **pas** une confirmation, si bien qu'une réécriture
aveugle serait fausse. L'ensemble exact est épinglé par test pour rendre le reste du
travail visible et l'empêcher de croître.

---

## Statut de vérification

| Vérification | Résultat |
|---|---|
| Placements dépréciés dans `StatusComposerView` | **0** (étaient 2) |
| `.cancellationAction` + `.confirmationAction` présents | ✅ |
| Parité du frère de référence `EditPostSheet` | ✅ |
| Ensemble résiduel de placements dépréciés | 10 fichiers, épinglé par test |
| Chevauchement avec les 8 PR ouvertes | **0 ligne commune** (A abandonné) |
| RED prouvé contre `origin/main` `ffef1339e` | l. 80 / 86 portent les placements dépréciés |
| Équilibre accolades/parenthèses/crochets | 0 / 0 / 0 |
| Clés i18n neuves · couleurs · constantes visuelles | 0 · 0 · 0 |

**Limite déclarée** : pas de toolchain Swift sur cet environnement (Linux) — aucune
compilation ni exécution de simulateur n'a pu être faite localement. Les assertions ont
été recalculées par balayage des sources ; le gate d'autorité reste la CI **iOS Tests**
(compile Xcode 26.1.1 / run simu 18.2).

**Statut** : ✅ Défaut résolu. Ne plus re-flagger `StatusComposerView` pour ses placements
de toolbar. Le conteneur de navigation reste ouvert et appartient à l'une des huit PR.
