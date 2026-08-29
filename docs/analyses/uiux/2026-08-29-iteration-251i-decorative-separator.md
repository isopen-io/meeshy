# Iteration-251i — le point que VoiceOver lit à voix haute

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : fil, détail d'une publication, commentaires, reels, stories,
fiche de conversation, bulle système, invitations, affiliation
**Base** : `main` HEAD `c14593da` · **Branche** : `claude/intelligent-noether-6zxsbz`
**Précédent direct** : 250i (la cible tactile n'est pas le dessin)

---

## 1. Le suivi de 250i, et sa réponse NÉGATIVE

250i laissait une suite : *« la garde s'arrête au premier enfant du label — un
`ZStack { Circle(); Image() }` porte le même défaut et lui échappe. »*

**Mesuré : la famille élargie est VIDE.** Le balayage rend deux candidats, et
les deux sont de faux positifs, chacun pour une raison qui condamne
l'élargissement :

| candidat | pourquoi ce n'est pas un défaut | pourquoi le scanner l'a vu |
|---|---|---|
| `ThemedActionButton` (`RootViewComponents:43`) | `size: CGFloat = 46` — déjà au-dessus du minimum | le cadre passe par un PARAMÈTRE, pas un littéral |
| `MessageMoreSheet:291` | `.frame(maxWidth: .infinity, minHeight: 68)` **et** un `Text` sous le cercle | les deux tombent hors de la fenêtre de 22 lignes du scanner |

> **Deux candidats, zéro défaut, et un taux de faux positifs de 2/2.** Une garde
> qui crie au loup deux fois pour zéro prise est pire que pas de garde : elle
> apprend à ses lecteurs à l'ignorer. Le suivi (a) de 250i est donc **soldé par
> la négative** — l'élargissement ne se fera pas, et la raison est mesurée, pas
> supposée.

C'est ce résultat négatif qui a libéré la question suivante : *si le défaut de
géométrie est clos, que reste-t-il d'AUTRE qui fuit vers l'arbre
d'accessibilité ?*

---

## 2. La mesure

### 2.1 Vingt-huit points, huit muets

`Text("·")` — le point médian qui articule une rangée méta (« Marie · il y a
3 min · 🇫🇷 ») — est une ponctuation **visuelle**. VoiceOver l'annonce.

| | sites |
|---|---|
| séparateurs posés `accessibilityHidden` | **8** |
| séparateurs **lus à voix haute** | **20** |

Les vingt vivent sur les surfaces les plus denses du produit : `FeedPostCard`
(5), `PostDetailView` (6), `FeedCommentsSheet` (3), `StoryViewerView+Content`
(2), `ConversationInfoSheet` (2), plus reels, bulle d'appel, statut, invitations,
affiliation.

### 2.2 Le savoir était écrit — et n'avait voyagé que huit fois

L'un des huit sites conformes porte ceci, mot pour mot :

```swift
Text("·")
    .foregroundColor(theme.textMuted)
    .accessibilityHidden(true) // decorative separator — not announced to VoiceOver
```

La règle est connue, formulée, exacte. Elle a été appliquée **huit fois sur
vingt-huit**.

> C'est la forme, côté arbre d'accessibilité, du défaut que 250i a nommé sur la
> géométrie : **une règle appliquée à la main se répand aussi loin que la
> mémoire de celui qui la pose, jamais plus loin.** Et c'est la troisième fois
> en quatre lots qu'un savoir juste, écrit dans un commentaire, n'atteint pas
> ses autres sites (248i : le commentaire au-dessus d'un copier-coller ; 250i :
> le partage déclaré au niveau de la clé ; ici : la règle posée huit fois).
>
> **Ajouter le modificateur vingt fois aurait soldé les vingt sites du jour et
> rien du vingt-neuvième.** Une règle qu'on peut oublier de poser doit devenir
> **une chose qu'on ne peut pas écrire autrement.**

### 2.3 Deux drapeaux qui s'annoncent comme deux PAYS

Dans l'aperçu d'un commentaire du fil, trois glyphes se suivent : le drapeau
d'origine, celui de la cible, la pastille « translate ». La pastille est bien
`accessibilityHidden` ; **les deux drapeaux, non**. VoiceOver annonçait donc,
au milieu d'un aperçu : « drapeau du Royaume-Uni, drapeau de la France » — deux
PAYS, là où l'œil lit « ce commentaire a été traduit, de là vers ici ».

Même famille que le point : une affordance **visuelle** qui fuit dans l'arbre
d'accessibilité.

---

## 3. Le correctif

### 3.1 `MetaSeparator` — muet en naissant

Un composant sans aucun paramètre : `Text(glyph).accessibilityHidden(true)`.

**L'absence de paramètre est le cœur du correctif, et la première écriture
faisait l'inverse.** Un `MetaSeparator(font:color:)` posant `.font(font)` avec un
`font` nil aurait effacé le style des huit sites qui ne fixaient que la
couleur — **`.font(nil)` n'hérite pas, il REMET la police d'environnement à
nil**. Sans paramètre, les modificateurs chaînés du site s'appliquent au
composant exactement comme ils s'appliquaient au `Text` (`.font` et
`.foregroundColor` se propagent par l'environnement), et la conversion devient
un pur échange de jeton : seul `Text("·")` change.

Les **28** sites y passent — les 20 fautifs comme les 8 conformes, dont le
`.accessibilityHidden(true)` chaîné devient redondant et disparaît.

### 3.2 La paire de drapeaux s'annonce en une phrase

Les trois glyphes de l'aperçu deviennent un seul élément
(`accessibilityElement(children: .ignore)`) nommé « Traduit de English vers
Français ». Le vocabulaire vit là où 249i l'a mis :
`LanguageFlagChip.translationSummary(from:to:)`, qui partage le repli de
`flag(for:)` via `spokenName(for:)` — **l'écrit et le parlé ne peuvent plus
diverger**. Une clé neuve, `a11y.language.translated_from`, traduite dans les
sept locales (3407 → 3408 entrées).

La paire n'est **pas** interactive ici (l'appui ouvre le commentaire), donc pas
de `LanguageFlagChip` : ce composant est un CONTRÔLE, et en faire un ici
annoncerait un bouton qui n'existe pas.

### 3.3 La garde

`MetaSeparatorSourceGuardTests` interdit les **deux graphies** du jeton dans les
sources d'app — la littérale et l'échappée (`\u{00B7}`), que trois des
vingt-huit sites écrivaient. Un scanner qui ne lirait que la première serait
vert sur trois régressions (leçon 248i). Plus une borne : il reconnaît les deux
graphies qu'il interdit, et ne prend pas le correctif pour la faute.

### 3.4 ⚠️ Renommer une chose oblige à relire ce qui la CHERCHE

`LentilleRowSourceGuardTests` contient
`XCTAssertFalse(header.contains(#"Text("·")"#))` — une garde qui interdit le
point médian dans l'entête d'une ligne de conversation.

Vérifié **avant le push** : aucun fichier `Lentille/` n'a été converti, donc
rien n'a été cassé. Mais le renommage crée un trou pour l'AVENIR — un point
ajouté demain sous son nouveau nom passerait sous cette garde restée au vert.
L'assertion cherche désormais les deux écritures.

> C'est la troisième fois en quatre lots que le même contrôle s'impose (248i :
> l'inventaire d'hôtes ; 250i : les trois `contains` de
> `ComposerSceneActivationTests`), et **la première où il est fait en amont
> plutôt qu'après un rouge**. La question à poser à tout renommage : *qui
> cherche cette chose par son ancien nom, et que fera-t-il quand il ne la
> trouvera plus ?*

---

## 4. Preuve

| mesure | `origin/main` | branche |
|---|---|---|
| séparateurs écrits à la main | **28** | **0** |
| copies du soulignement de puce (249i) | 0 | **0** |
| clés de langue hors source unique (249i) | 0 | **0** |
| cibles posées après leur geste (249i) | 0 | **0** |
| dessin nu faisant la cible (250i) | 0 | **0** |
| clés de catalogue orphelines | 0 | **0** |
| backlog non traduit (plafond 1545) | 121 | **121** |
| entrées du catalogue | 3407 | **3408** |

Équilibre des accolades vérifié sur les 17 fichiers touchés. Catalogue reparsé.

**Gate réel = CI `iOS Tests`**, job `Build app + tests unitaires` (`run tests`
dans le sujet du commit).

### 4.1 Les trois contrôles que les rouges de 250i ont rendus systématiques

Faits AVANT ce push, chacun parce qu'un rouge les a coûtés une fois :

1. **`@testable import Meeshy`** sur la garde neuve — elle lit des sources ET
   interroge le glyphe du composant, donc elle importe.
2. **Chaque message d'assertion porte la valeur obtenue.**
3. **Les gardes qui NOMMENT ce que je renomme ont été relues** — c'est ce qui a
   trouvé § 3.4.

Reste un doute assumé, à solder au retour de CI : `MetaSeparator()` sans
paramètre reçoit les modificateurs chaînés du site (`.font`, `.foregroundColor`)
qui, appliqués à une `View` et non à un `Text`, passent par l'environnement.
C'est le comportement documenté de SwiftUI ; il n'est vérifié ici que par
lecture.

---

## 5. Ce qui change à l'écran

**Rien.** Aucun pixel ne bouge : le point garde son glyphe, sa police et sa
couleur à chacun des 28 sites, et les deux drapeaux de l'aperçu gardent les
leurs. Ce qui change est ce que VoiceOver DIT :

| surface | avant | après |
|---|---|---|
| toute rangée méta (20 sites) | « … point … point … » | le point n'est plus annoncé |
| aperçu d'un commentaire traduit | « drapeau du Royaume-Uni, drapeau de la France » | « Traduit de English vers Français » |

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — 20 annonces parasites retirées sur les surfaces les plus denses ; une paire de drapeaux passe de deux pays à une phrase utile |
| 11 · Maintenabilité | mûre — 28 sites → 1 composant, garde de forme posée, une garde voisine rendue étanche au renommage |
| 9 · Compatibilité | mûre — clé neuve traduite dans les sept locales |
| 6 · Cohérence de positionnement | mûre — un séparateur se dit de la même façon partout, parce qu'il ne s'écrit plus qu'une fois |
| 13 · Complétude | **partielle** — la garde ne connaît que le point médian ; d'autres ponctuations décoratives (« • », « | », tirets) restent hors périmètre (§ 7.1) |

---

## 7. Suites (252i+)

1. **La garde ne connaît que le point médian.** Le balayage a cherché « • », « | »,
   « – », « — », « ⋅ » : aucun n'est employé comme séparateur décoratif
   aujourd'hui. Les ajouter à la liste interdite serait épingler une graphie
   qu'aucun site n'écrit — la leçon 272 dit de ne pas le faire. À rouvrir le
   jour où l'un d'eux apparaît.
2. **Le suivi (a) de 250i est CLOS par la négative** (§ 1) : la famille élargie
   est vide et le taux de faux positifs d'un élargissement serait de 2/2.
3. **Mesurer la rangée méta du fil en Dynamic Type XXL** (suivi 249i/250i,
   toujours ouvert — demande un simulateur).
4. Carry-over 246i–248i : les deux tables d'étiquettes du SDK et
   `MessageAttachment.durationFormatted` (hors périmètre de piste) ; le bucket
   « appelée seulement par un test » ; `FeedView` sur `likePost`/`bookmarkPost` ;
   `isProgrammaticScroll` ; les 3 copies d'`isLoadingReactions` ;
   `buildNativeMessageMenu`, découvrabilité du fil de réponses.
