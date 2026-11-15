# Iteration-249i — la puce de langue : huit copies, et chacune n'avait raison que sur un tiers du contrôle

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : pied de bulle de message, carte du fil, détail d'une publication,
son repartage, commentaires d'une publication (×2), commentaire de story (×2),
rangée méta d'un reel
**Base** : `main` HEAD `b1eeb470` · **Branche** : `claude/intelligent-noether-6zxsbz`
**Précédent direct** : 248i (`MediaKindLabel`, neuf tables d'étiquettes → une)

---

## 1. Le point de départ

248i a soldé neuf tables « nature du média → étiquette » et laissé une règle en
héritage : *une énumération de sites porte deux affirmations, et la seconde — « ce
sont les sites où la règle s'applique » — n'est presque jamais vérifiée.* La
question posée cette fois n'était donc pas « quelle surface est fausse ? » mais
**« quel CONTRÔLE le dépôt recopie-t-il ? »**.

Le balayage des cibles tactiles inférieures à 44 pt a rendu 52 candidats, dont
l'écrasante majorité sont des glyphes décoratifs à l'intérieur d'une rangée. Une
seule forme revenait, à l'identique, dans cinq fichiers :

```swift
VStack(spacing: 1) {
    Text(display?.flag ?? "?")
        .font(isActive ? .caption : .caption2)
    if isActive {
        RoundedRectangle(cornerRadius: 1)
            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
            .frame(width: 10, height: 1.5)
    }
}
```

C'est **la puce de langue** — le geste par lequel le Prisme Linguistique promet
à l'utilisateur de « voir l'original ou explorer d'autres langues ». Le contrôle
le plus fréquemment rendu du produit : il apparaît sous chaque bulle traduite.

---

## 2. La mesure

### 2.1 Huit copies, dix puces

| # | site | contrôle | cible tactile | nom lu | état lu |
|---|---|---|---|---|---|
| 1 | `BubbleFooter.footerFlagPill` (bulle) | `Button` + `contentShape` **dans** le label | 22 pt, réellement servie | nom de langue seul | trait `.isSelected` |
| 2-3 | `FeedCommentsSheet` (orig + cible) | `onTapGesture` | `meeshyTapTarget(44)` **après** le geste | ✅ | ✅ |
| 4 | `PostDetailView` (publication) | `onTapGesture` | `meeshyTapTarget(44)` **après** le geste | ✅ | ✅ |
| 5 | `PostDetailView` (repartage) | `onTapGesture` | — | ❌ **aucun** | ❌ |
| 6 | `FeedPostCard` (fil) | `onTapGesture` | — | ✅ | ❌ |
| 7-8 | `StoryViewerView+Content` (orig + cible) | `onTapGesture` | — | ❌ **aucun** | ❌ |
| 9 | `ReelsPlayerView` | `Button` + `contentShape` | — | nom de langue seul | ❌ |

Mesure automatisée sur `origin/main`, rejouée sur la branche :

| forme | `origin/main` | branche |
|---|---|---|
| soulignement de puce dessiné hors d'une source unique | **8** | **0** |
| clés d'accessibilité de langue citées hors d'une source unique | **8** | **0** |
| `.meeshyTapTarget` posé APRÈS le `.onTapGesture` qu'il agrandit | **4** | **0** |

> **Aucune des huit n'était complètement fausse ; chacune n'avait raison que sur
> un tiers du contrôle.** C'est ce qui les a tenues hors des revues : une surface
> qui figure déjà dans la colonne des sites conformes ne se rouvre pas.

### 2.2 Ce qui a le plus de valeur dans ce tableau : la ligne 1

La copie du **pied de bulle** est la plus ancienne, la plus utilisée — et la
seule à avoir raison sur le CONTRÔLE et sur la CIBLE. Son doc-comment expliquait
déjà, en huit lignes, pourquoi un `onTapGesture` ne marcherait pas là
(`BubbleSwipeContainer` pose un `LongPressGesture(0.35)` sur la bulle et avale le
tap) et pourquoi le `contentShape` doit vivre **dans** le label.

**Rien de ce qu'elle savait n'avait voyagé vers les sept autres.** Le savoir
était écrit, daté, argumenté — et enfermé dans la fonction qui l'appliquait.

### 2.3 Un agrandissement de cible posé du mauvais côté du geste

Deux des huit copies — celles qui passaient pour conformes — écrivent :

```swift
VStack { … }
    .onTapGesture { handleFlagTap(code) }
    .accessibilityValue(…)
    .meeshyTapTarget(44)          // frame(minWidth:44,minHeight:44) + contentShape
```

`contentShape` définit la zone sensible **de la vue à laquelle il s'applique**.
L'idiome SwiftUI l'écrit donc AVANT `onTapGesture` — jamais après, où il
agrandit une vue qui ne porte plus le geste. Ici, le 44 est du bon côté de la
revue et du mauvais côté de l'idiome.

> **Un modificateur qui DÉCLARE une cible ne la fait pas respecter.** La question
> à poser n'est pas « la cible est-elle posée ? » mais **« s'applique-t-elle à la
> vue qui porte le geste ? »** — c'est la forme, côté interaction, de la règle
> que le `CLAUDE.md` énonce pour les gardes de confidentialité (cycle 124).
>
> Et le correctif ne consiste pas à réordonner : il consiste à **ne plus se poser
> la question**. La zone sensible d'un `Button` EST le cadre de son label ; il n'y
> a plus d'ordre à respecter.

### 2.4 Ce que l'utilisateur vivait

| surface | avant | après |
|---|---|---|
| drapeaux du fil, du repartage, d'une story, d'un reel | cible ≈ 16 × 14 pt (~224 pt²) | 44 × 44 (fil, détail) ou 32 × 32 (story, reel) |
| VoiceOver, repartage et story | *« drapeau de la France, image »* | « Afficher en Français · Affichée » |
| VoiceOver, fil et reel | « Afficher en Français » / « Français », **sans état** | + « Affichée » + trait `.isSelected` |
| pastille « translate », repartage et story | lue comme un élément sans nom | retirée de l'arbre (décorative) |
| lieu d'un appui manqué | rien ne se passe | — |

La langue **actuellement lue** ne se distinguait, sur six des huit copies, que
par un corps de police 12 au lieu de 10 et un soulignement de 1,5 pt teinté :
**WCAG 1.4.1**, exactement le défaut que 242i a nommé sur la barre d'étapes de
l'inscription.

### 2.5 Deux familles de clés au contenu identique — la rechute de 248i

| clé | fr | clé jumelle | fr |
|---|---|---|---|
| `a11y.post.show_language` | Afficher en %@ | `a11y.comment.show_language` | Afficher en %@ |
| `a11y.post.language_shown` | Affichée | `a11y.comment.language_shown` | Affichée |

**Vérifié par parse : identiques dans les sept locales.** Quatre entrées pour
deux notions — le motif exact d'`attachment.label.*` ↔ `attachment.kind.*`, un
lot plus tard, sur un autre vocabulaire.

Et une cinquième écriture, `feed.post.flag.a11y`, **absente du catalogue** : son
`defaultValue` interpolé (`"Afficher en \(display?.name ?? code)"`) servait donc
du français à toutes les interfaces, sans qu'aucun cliquet ne rougisse — le
même angle mort que 248i a documenté (`FrenchDefaultValueRatchetTests` n'inspecte
que la forme qu'il nomme).

---

## 3. Le correctif

### 3.1 `LanguageFlagChip` — un contrôle, trois registres

`Meeshy/Features/Main/Components/LanguageFlagChip.swift`.

Ce qui ne varie JAMAIS : un `Button` natif (traits, clavier complet, pointeur
iPad, styles), son cadre et son `contentShape` **dans** le label, le nom
« Afficher en %@ » avec le nom NATIF de la langue, la valeur « Affichée » sur la
puce active, le trait `.isSelected`, le repli de drapeau, le retour haptique.

Ce qui suit la surface — et seulement cela :

| registre | typographie | cible | où |
|---|---|---|---|
| `.standard` | `.caption` / `.caption2` | **44 pt** (HIG) | fil, détail, repartage, commentaires |
| `.compact` | `.caption` / `.caption2` | 22 pt | pied de bulle |
| `.overlay` | `MeeshyFont.relative(12/10)` | 32 pt | commentaire de story, reel |

**Les deux écarts aux 44 pt sont des décisions, pas des oublis, et ils sont
écrits** : le pied de bulle est la rangée la plus dense du produit (élargir
grandirait chaque bulle traduite) ; les superpositions flottent sur une vidéo
dont le tap pilote la lecture, et l'entête d'un commentaire de story empile ses
lignes — 44 pt y coûteraient 30 pt PAR commentaire.

**Ce qu'on ne fait pas pour gagner ces points** : élargir par un `padding`
négatif. Deux puces espacées de 4 pt verraient leurs zones sensibles se
CHEVAUCHER, et une frappe imprécise changerait la langue lue pour une **autre**
que celle visée — pire que le défaut corrigé, qui ne faisait rien.

### 3.2 `TranslationsBadge` — l'action décide de l'accessibilité

La pastille « translate » existait sous deux formes que le dépôt mélangeait : sur
une publication elle OUVRE la liste des langues ; ailleurs elle ne fait
qu'annoncer « ce contenu est traduit », doublant les drapeaux voisins. Deux des
copies décoratives oubliaient `accessibilityHidden` — VoiceOver s'arrêtait sur
une image sans nom au milieu d'un entête.

La forme le dit maintenant : **pas d'action ⇒ pas d'élément d'accessibilité**,
et l'action apporte avec elle sa cible, son nom et son indice.

### 3.3 Le vocabulaire

- `a11y.post.show_language` → **`a11y.language.show`**, `a11y.post.language_shown`
  → **`a11y.language.shown`** (les sept traductions reprises verbatim). *Une clé
  au nom d'un écran ne peut pas être réutilisée sans mentir* — doctrine 248i,
  `starred.messages.unknown_user` → `common.unknown_user`.
- Jumelles `a11y.comment.*` **retirées**, `feed.post.translate.a11y` **retirée**
  (le badge sert `a11y.post.translations` + son indice, la paire label/hint que
  la HIG demande), `feed.post.flag.a11y` disparue du code.
- Catalogue **3409 → 3406** entrées ; **backlog non traduit 122 → 121**.

**Le balayage préalable a porté sur TOUS les `sourceRoots` du cliquet**, SDK
compris — la règle que 248i a payée : *« cette clé n'a plus de consommateur » est
une affirmation sur le DÉPÔT, pas sur le répertoire qu'on édite.* Aucune des cinq
clés retirées n'était lue hors de `apps/ios/Meeshy`.

### 3.4 Les gardes

`MeeshyTests/Unit/Guards/LanguageFlagChipSourceGuardTests.swift`, par la FORME :

1. **Aucun soulignement de puce** dessiné hors de la source unique.
2. **Les clés `a11y.language.*` ne se citent que depuis la source unique.**
3. **Aucun `.meeshyTapTarget` posé après le `.onTapGesture` qu'il agrandit** —
   nulle part dans l'app, pas seulement sur les surfaces soldées ici.

Plus deux bornes : le scanner reconnaît la forme qu'il interdit (sans quoi il
serait vert faute de voir), et la source unique cite bien ses deux clés.

`MeeshyTests/Unit/Components/LanguageFlagChipTests.swift` juge le vocabulaire
dans les six locales que le banc peut atteindre (idiome `bundle` + `locale` par
PAIRE), les trois replis de drapeau et les trois cibles.

### 3.5 Une garde qui SUIT son hôte

`BubbleFooterAccessibilityTests` verrouillait le trait `.isSelected` **dans**
`footerFlagPill`. La règle a DÉMÉNAGÉ dans `LanguageFlagChip` : la garde
vérifie désormais les deux moitiés — le pied de bulle DÉLÈGUE, la source unique
ANNONCE. Se contenter d'exiger la délégation l'aurait rendue verte le jour où la
source unique perdrait le trait, c'est-à-dire **sur la régression exacte qu'elle
prétend interdire** (leçon 248i : un inventaire d'hôtes suit l'hôte, il ne se
raccourcit pas).

---

## 4. Preuve

Aucune toolchain Swift ici. Les trois règles de la garde neuve et les deux
cliquets i18n qui gouvernent ce lot ont été **répliqués fidèlement** en Python et
exécutés sur les deux arbres (`origin/main` extrait par `git archive`) :

| mesure | `origin/main` | branche |
|---|---|---|
| copies du soulignement de puce | **8** | **0** |
| clés d'accessibilité de langue hors source unique | **8** | **0** |
| cibles tactiles posées après leur geste | **4** | **0** |
| clés de catalogue orphelines (`…IsReferencedInCode`) | 0 | **0** |
| backlog non traduit (plafond 1545) | 122 | **121** |
| entrées du catalogue | 3409 | **3406** |

Le catalogue reparse en JSON valide ; le diff est **94 ajoutées / 235 retirées**
en `--diff-algorithm=histogram` — deux blocs ajoutés, cinq retirés, l'ordre des
entrées préservé (l'édition est textuelle : un `json.dump` réordonnerait les
3406 entrées).

Équilibre des accolades vérifié sur les dix fichiers touchés.

**Gate réel = CI `iOS Tests`** (compile Xcode 26.1.1, run simulateur iOS 18.2).
Le mot-clé `run tests` est dans le sujet du commit : sans lui, le job iOS d'une
PR s'appelle `Build app (app + cibles de test)` et ne prouve QUE la compile
(leçon 248i — **le nom du check est le discriminant, pas sa couleur**).

### 4.1 Trois doutes assumés, à SOLDER au retour de CI

Publiés ici pour qu'une itération suivante ne les re-porte pas comme risques
(leçon 247i) :

1. **`.accessibilityAddTraits(isActive ? .isSelected : [])`** — le ternaire entre
   `AccessibilityTraits` et un littéral de tableau vide. La forme existe déjà
   dans `InteractiveProgressBar` (242i), donc elle compile ; ce qui reste à
   vérifier est qu'elle compile aussi **sur un `Button`**, dont les traits sont
   déjà posés par SwiftUI.
2. **`Font` comparé par `XCTAssertNotEqual`** dans `LanguageFlagChipTests` —
   `Font` est `Hashable`, mais deux `MeeshyFont.relative(12)` / `relative(10)`
   doivent bien rendre des valeurs DISTINCTES pour que le test ait un sens.
3. **`metrics.flagFont(isActive:).weight(.medium)`** dans `TranslationsBadge` —
   `Font.weight(_:)` s'applique à un `Font` déjà construit par
   `MeeshyFont.relative`, pas seulement à un style système.

---

## 5. Ce qui change à l'écran

**Rien de la disposition en français sur six des huit surfaces** : mêmes
drapeaux, même soulignement, mêmes couleurs. Ce qui change :

| surface | avant | après |
|---|---|---|
| rangée méta du fil | 32 pt de haut | **44 pt** (cibles HIG) |
| rangée méta du détail / repartage | 44 pt déclarés, ~16 pt servis | **44 pt servis** |
| entête d'un commentaire de story | ~14 pt | **32 pt** |
| rangée méta d'un reel | ~16 pt | **32 pt** |
| pied de bulle | 22 pt | **22 pt** (inchangé) |
| soulignement du repartage | 8 pt de large | 10 pt (comme les sept autres) |
| drapeau d'une langue hors catalogue | « ? » sur six puces | son code — « JA » |
| appui sur une puce | vibration sur cinq surfaces | vibration sur les huit |

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — nom d'action + état énoncé + trait `.isSelected` sur les huit surfaces ; les deux pastilles décoratives sortent de l'arbre ; cibles portées de ~224 pt² à 1024–1936 pt² là où la rangée l'héberge |
| 6 · Cohérence de positionnement | mûre — même geste, même contrôle, même annonce, du fil au pied de bulle |
| 7 · Facilité d'usage | mûre — une frappe imprécise n'échoue plus (et ne peut pas atteindre la puce voisine : aucune zone ne se chevauche) |
| 11 · Maintenabilité | mûre — 8 copies → 1, 5 clés → 2, trois gardes de forme |
| 12 · Simplicité d'usage | mûre — la complexité (registres, replis, vocabulaire) est payée dans le code |
| 9 · Compatibilité | **partielle** — Dynamic Type gagné sur les deux puces des commentaires (`.system(size:)` figé → `.caption`), non mesuré aux tailles d'accessibilité XXL sur la rangée du fil (§ 7.1) |
| 13 · Complétude | **partielle** — la paire de drapeaux de l'aperçu de commentaire dans `FeedPostCard` reste non interactive et non nommée (§ 7.2) |

---

## 7. Suites (250i+)

1. **Mesurer la rangée méta du fil aux tailles Dynamic Type d'accessibilité.**
   Quatre puces de 44 pt + horodatage + séparateurs + statistiques de portée
   (auteur seulement) tiennent sur un écran compact en taille nominale ; en XXL,
   SwiftUI compressera l'horodatage. Le remède, s'il faut : faire passer les
   drapeaux à la ligne plutôt que réduire la cible.
2. **`FeedPostCard`, aperçu d'un commentaire** (`:1364`) : la paire de drapeaux
   y est purement indicative, sans `accessibilityHidden` ni libellé groupé —
   VoiceOver y lit deux emojis de pays. Ce n'est pas la puce (aucun appui),
   donc hors de la famille soldée ici, mais c'est le même vocabulaire mal servi.
3. **Le SDK porte deux tables d'étiquettes de média** (carry-over 248i, hors
   périmètre de piste) et `MessageAttachment.durationFormatted` grave encore
   `String(format: "%d:%02d")`.
4. Carry-over 246i/247i, inchangés : (a) classer le bucket « appelée seulement
   par un test » ; (b) recâbler `FeedView` sur `likePost`/`bookmarkPost` ;
   (c) `isProgrammaticScroll` ; (d) les 3 copies d'`isLoadingReactions` ;
   (e) `buildNativeMessageMenu`, découvrabilité du fil de réponses, cibles
   tactiles 44 pt d'`InteractiveProgressBar` — **cette dernière est désormais
   la seule cible sub-44 connue qui ne soit pas une décision documentée** : les
   huit boutons d'étape de l'inscription font 5 à 8 pt de haut.
