# iOS UI/UX — Iteration 227i

**Date** : 2026-07-27
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift`

**Axe** : Accessibilité VoiceOver — un bouton ne doit pas perdre son nom au
moment où il travaille
**Base** : `main` HEAD `913d8cc9`

## Le défaut

```swift
Button { … } label: {
    if isSubmittingReport {
        ProgressView()                    // ← aucun Text ici
    } else {
        Text("Envoyer le signalement")    // ← le seul Text est dans l'autre branche
    }
}
```

Pendant l'envoi, la branche rendue **ne contient aucun texte** : le bouton n'a
donc **plus aucun nom accessible**, précisément au moment où il travaille. Ce
n'est pas « un libellé imparfait », c'est **l'absence de libellé**.

La doctrine est écrite dans `StatusComposerView:258-261` :

> *The label swaps to a bare ProgressView while publishing, which leaves the
> button with no accessible name at the exact moment it is busy. Pin the name to
> the action and carry the transient/blocked states as value + hint.*

## L'inventaire, mesuré et non deviné

Balayage des 3 cibles applicatives pour les boutons dont le label se réduit à un
`ProgressView` nu :

| | Nombre |
|---|---|
| Boutons de cette forme | **19** |
| Déjà nommés explicitement (doctrine appliquée) | **12** |
| **Lacunes réelles** | **7** |

La doctrine est donc **déjà majoritaire** (12/19) ; ces 7 sont la traîne.
Premier passage rectifié : une première mesure annonçait 19 lacunes parce que la
fenêtre de recherche des modificateurs était trop courte (400 caractères) et
manquait les `.accessibilityLabel` posés plus bas. **L'inventaire publié est
celui de la seconde mesure**, fenêtre élargie et bornée au bouton suivant.

### Les 7 lacunes

| Fichier | Ligne | Traité en 227i |
|---|---|---|
| `MessageDetail/MessageReportDetailView.swift` | 63 | ✅ |
| `ReportMessageSheet.swift` | 92 | ✅ |
| `ConversationEncryptionDetailSheet.swift` | 197 | — |
| `EditPostSheet.swift` | 163 | — |
| `AudioFullscreenView.swift` | 843 | — |
| `ChangePasswordView.swift` | 226 | — |
| `FeedView+Attachments.swift` | 637 | — |

## Pourquoi ces deux-là d'abord

Les deux boutons de **signalement** sont les pires de la liste :

1. **L'action est destructrice et socialement irréversible.** Signaler un message
   engage l'utilisateur vis-à-vis d'un tiers ; se tromper de bouton ne « ne fait
   rien », cela signale.
2. **L'un des deux est un `ToolbarItem`** (`ReportMessageSheet:92`, en
   `.confirmationAction`). Un contrôle de barre d'outils sans nom est le plus
   difficile à identifier en exploration tactile : il n'a ni voisin textuel ni
   position devinable.
3. Ce sont **deux rendus de la même action** — les traiter ensemble est cohérent,
   pas un élargissement de périmètre.

## Correctif

`.accessibilityLabel(…)` épinglé sur chaque bouton, **avec la clé que le bouton
affiche déjà** (`message-detail.report.send`, `report.message.send`).

**0 clé i18n neuve, et c'est une contrainte dure ici** : `#2411` réécrit
actuellement `Localizable.xcstrings` (+2639 lignes) et `#2369` corrige le
cliquet de couverture. Introduire une clé aurait (a) collisionné avec #2411 et
(b) déplacé le compteur de dette non traduite. Réutiliser la clé visible évite
les deux **et** garantit que la voix dit exactement ce que l'écran affiche.

**0 changement visuel, 0 logique, 0 réseau.**

## Ce que 227i ne fait pas

**La valeur d'état occupé** (`.accessibilityValue` « Envoi en cours »). J'ai
cherché une clé réutilisable et **écarté celle qui semblait convenir** :
`a11y.feed.compose.publish.uploading` est traduite dans les 7 locales, mais elle
dit `en` = « Uploading » et `de` = « Wird hochgeladen » — du **téléversement de
fichier**, pas de l'envoi d'un signalement. La réutiliser aurait envoyé un mot
faux aux utilisateurs anglophones et germanophones pour économiser une clé.
Une valeur correcte exige une chaîne neuve traduite en 7 locales → **à faire
quand le catalogue n'est plus en cours de réécriture** (piste 228i).

Le défaut principal — **l'absence totale de nom** — est strictement plus grave
que l'absence de valeur, et il est corrigé ici sans toucher au catalogue.

## Test

`apps/ios/MeeshyTests/Unit/Views/ReportSubmitButtonAccessibilityTests.swift`
(neuf) — 4 tests / 8 assertions, sur la source **commentaires retirés** (les
doc-comments nomment les modificateurs testés).

1. + 2. Chaque bouton porte son `.accessibilityLabel` avec **sa** clé.
3. **Preuve du « 0 clé neuve »** : chaque clé apparaît **exactement deux fois**
   (rendu + nom). Une troisième occurrence ou une clé forgée casserait le compte.
   Plus deux gardes négatives contre des clés `a11y.*` dédiées.
4. **Garde de prémisse** : le label se réduit bien encore à un `ProgressView` nu.
   Si une édition future donne un `Text` à la branche occupée, le bouton n'est
   plus anonyme et **la prémisse de cette suite doit être réexaminée** plutôt que
   de rester vraie par accident.

**RED : 4/8** contre `main` `913d8cc9` (les 2 assertions de libellé + les 2 de
comptage de clé). Les 4 autres — 2 gardes négatives, 2 gardes de prémisse — sont
**vertes des deux côtés par construction** : elles protègent l'avenir, elles ne
prouvent pas le correctif. Compté ainsi plutôt que d'annoncer 8/8.

## Vérification

- Pas de toolchain Swift (Linux) → assertions recalculées hors Xcode sur la
  source avant/après (`git show` pour l'état de `main`). Tokenizer accolades /
  parenthèses des 3 fichiers : **0 / 0**.
- Sémantique des locales de la clé écartée **vérifiée dans le catalogue**, locale
  par locale — c'est ce contrôle qui a évité de livrer « Uploading » sur un envoi
  de signalement.
- Collision essaim : 3 PR ouvertes (#2411 catalogue i18n + tests, #2370
  `FriendRequestListView`, #2369 tests i18n) — **aucune** ne touche les deux
  fichiers de 227i.
- Numérotation : `227i` revérifié via `ls docs/analyses/uiux/` **juste avant le
  commit** (règle posée après la collision 218i ; un autre agent occupe déjà 226i
  en parallèle du mien).
- Fichier de test neuf → `xcodegen generate`, **0 édition de `project.pbxproj`**.

Gate = CI `iOS Tests`.

## Bilan

**2 fichiers de production, +12 / −0** (dont 9 de commentaire). Les deux boutons
de signalement gardent leur nom pendant l'envoi. 0 clé i18n, 0 couleur, 0
layout, 0 logique, 0 réseau, 0 changement visuel.

Et un inventaire mesuré de 7 lacunes restantes, publié pour que les itérations
suivantes n'aient pas à le refaire.

## Piste 228i+

1. Les **5 lacunes restantes** du tableau ci-dessus, une ou deux par itération.
2. `.accessibilityValue` d'état occupé sur les boutons de signalement — **exige
   une chaîne neuve traduite** ; à faire quand `Localizable.xcstrings` n'est plus
   en cours de réécriture par #2411.
3. Hérité de 226i : hint de désactivation d'`AffiliateCreateView` (même
   contrainte de catalogue) ; factorisation du champ des 2 écrans « créer un
   lien » **uniquement après arbitrage du style** (correction consignée en 226i).
