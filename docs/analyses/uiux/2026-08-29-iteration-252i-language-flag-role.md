# Iteration-252i — la garde de 249i ne pouvait pas voir la neuvième copie

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : Fil (Focal, rangée ordinaire + rangée magnifiée), feuille de
traduction d'un post, plein écran audio, détail de transcription, inscription
**Base** : `main` HEAD `9286ce92` · **Branche** : `claude/intelligent-noether-6zxsbz`
**Issue** : #4260 · **Précédent direct** : 251i (le point qui naît muet)

---

## 1. Ce qui a mené ici — et un résultat NÉGATIF au passage

Le lot est parti d'une famille voisine : **les contrôles à deux états dont
l'état ne se dit que par l'apparence**. Mesure sur 40 bascules :

| | nombre |
|---|---|
| état exposé par un trait / une valeur | **15** |
| état exposé par un NOM qui varie (« Épingler » / « Désépingler ») | **16** |
| **muettes** | **9** |

Les 16 du milieu sont le motif **correct** des menus contextuels : un élément de
menu est une ACTION, pas un interrupteur — lui coller `.isToggle` serait faux.
Il a fallu quatre réécritures du scanner pour obtenir ces trois nombres (§ 5).

**Résultat négatif acquis, à ne pas refaire** : les *boutons à icône seule sans
nom VoiceOver* ne sont pas une famille de défauts. 102 candidats bruts, 3 après
un balayage conscient des accolades, et les 3 sont délibérés et documentés
(`.accessibilityHidden` avec l'action réexposée en `.accessibilityAction`, ou
agrégation du conteneur en `children: .ignore`). **Famille vide.**

Parmi les 9 muettes, une n'était pas une bascule ordinaire.

---

## 2. Le défaut : une NEUVIÈME copie, et une DIXIÈME

#4248 (249i) a soldé **huit** copies du drapeau-contrôle du Prisme dans
`LanguageFlagChip`, et posé une garde. `FocalRow` en portait déjà deux — la
bande de la rangée ordinaire et celle de la rangée magnifiée — et la garde ne
pouvait pas les voir.

### 2.1 Pourquoi la garde était aveugle

Elle interdit trois **formes** : le dessin du soulignement
(`RoundedRectangle(cornerRadius: 1)` + `height: 1.5`), les deux clés réservées
(`a11y.language.show` / `a11y.language.shown`), une cible posée après son geste.

`FocalRow` n'écrit **aucune** des trois. Il résout le même problème autrement :
l'état actif par `.opacity(isActive ? 1 : 0.55)` (rangée ordinaire) ou par un
fond `focusChip` (rangée magnifiée), l'étiquette par `LanguageData.info(...)?.name`
au lieu des clés.

> **Une garde bâtie sur les instances qu'on a trouvées généralise à ces
> instances, pas au concept.** Elle attrape la re-création des huit copies
> connues ; elle ne voit pas une neuvième qui résout le même problème avec
> d'autres moyens. C'est la quatrième fois en cinq lots qu'une règle juste
> reste bornée à la forme où on l'a écrite (248i le commentaire, 250i la clé
> partagée, 251i le modificateur posé 8 fois sur 28) — mais **la première où
> c'est la garde elle-même, et non le code, qui porte la limite**.

### 2.2 Les trois défauts, à l'écran

| | `FocalRow` | ce que #4248 a établi |
|---|---|---|
| état actif | opacité / fond de puce **seuls** | trait `.isSelected` + valeur « Affichée » (WCAG 1.4.1) |
| étiquette | le nom de la langue nu (« Français ») | « Afficher en Français » — un nom nu *ressemble à une étiquette, pas à une action* (banc de #4248, mot pour mot) |
| valeur | aucune | « Affichée » quand la langue est servie |

### 2.3 Et CINQ réponses à une seule question

« Quel drapeau pour ce code, et quoi si la langue est inconnue ? » avait **cinq**
réponses dans l'app : le code en capitales (source unique), 🌐 (quatre sites),
🎵 (le plein écran audio), la chaîne vide (l'inscription), `uppercased()` (le
composer).

`ComposerLanguageFlag` porte même, en doc-comment, la règle que #4248 avait
choisie — « code brut en capitales, jamais un bouton vide » — **redécouverte
indépendamment, sans que ni l'un ni l'autre ne sache que sa jumelle existait**.

---

## 3. Le correctif

- **Rangée ordinaire** → `LanguageFlagChip(metrics: .compact)`. La vue entière
  passe à la source unique.
- **Rangée magnifiée** → garde sa VUE (le fond `focusChip` n'existe qu'ici, et
  `LanguageFlagChip` étant un `Button`, l'adopter imbriquerait un bouton dans un
  bouton), prend le VOCABULAIRE via `.languageFlagAccessibility(code:isActive:)`.

  > **Une source unique de CONTRÔLE a deux moitiés : la vue et le vocabulaire.**
  > Sans la seconde, tout site qui garde son dessin ré-écrit trois lignes
  > d'accessibilité — et c'est exactement ainsi que les copies 9 et 10 ont
  > divergé.
- **Les deux producteurs privés disparaissent** (`FocalRow.flagEmoji`,
  `PostTranslationSheet.languageFlag`), avec les quatre autres replis maison.

### 3.1 ⚠️ La source unique doit être plus RICHE que ce qu'elle remplace

Le lot a failli livrer une régression silencieuse. `FocalRow` lisait
`LanguageData` — **78 langues** ; `LanguageFlagChip` lisait `LanguageDisplay` —
**41**. Router l'un vers l'autre aurait rendu « WO » là où la rangée montrait
🇸🇳, pour **39 langues** (wolof, yoruba, igbo, persan, ourdou, tamoul, serbe,
kinyarwanda, zoulou…), **sans qu'aucun test ne rougisse** et seulement chez les
locuteurs concernés.

> **Une source unique doit être plus riche que la plus riche des copies qu'elle
> remplace, jamais leur intersection.** La question à poser à toute
> consolidation : *que savait la copie que la source ignore ?*

`flag(for:)` et `spokenName(for:)` consultent donc les deux tables, puis
normalisent le code régional (`pt-BR` → `pt`) — la normalisation que le composer
faisait seul dans son coin. Les quatre assertions de #4248 (`fr`, `xx`, `""`,
`"   "`) sont préservées : la normalisation ne s'exerce que sur des codes
qu'aucune table n'indexe.

### 3.2 Une décision PRODUIT, isolée et laissée au porteur

Sur les **39 codes** que les deux tables partagent, elles s'accordent sur **38**
et divergent sur **un** : `pt` — 🇵🇹 pour `LanguageDisplay`, 🇧🇷 pour
`LanguageData`, et le banc du composer épingle `pt-BR` → 🇧🇷.

« Quel drapeau porte le portugais » n'est pas un détail de refactor. Le lot :
- garde `LanguageDisplay` en tête, donc **les huit surfaces de #4248 sont
  inchangées au glyphe près** ;
- laisse `ComposerLanguageFlag` sur sa table (son banc reste vert), **exemption
  NOMMÉE et motivée dans la garde** — jamais une regex discrètement étroite ;
- assume la seule conséquence : le `pt` de la rangée Focal passe de 🇧🇷 à 🇵🇹,
  ce qui **l'aligne sur les huit autres surfaces**. L'incohérence existait déjà
  — la même langue portait deux drapeaux selon l'écran ; elle n'est pas créée
  ici, elle est rendue visible et unifiée dans le sens de la source unique.

### 3.3 La garde interroge le RÔLE

Deux rôles, deux règles, chacune avec sa borne :

1. **Décider quel drapeau porte un code** — aucun site ne repose la question.
2. **Nommer un drapeau à VoiceOver** — aucun ne s'annonce par le nom nu de sa
   langue.

C'est la réponse directe au § 2.1 : une garde de forme n'aurait attrapé ni la
copie 9 (opacité) ni la copie 10 (fond de puce). Ces deux règles les attrapent
toutes les deux, et attraperont une onzième écrite encore autrement.

---

## 4. Preuve

| mesure | `origin/main` | branche |
|---|---|---|
| secondes réponses à « quel drapeau ? » | **10** | **0** |
| étiquettes au nom nu de la langue | **2** | **0** |
| copies du drapeau-contrôle hors source unique | 2 | **0** |
| producteurs privés de drapeau | 2 | **0** |
| règles de 249i / 251i | 0 | **0** |
| entrées du catalogue | 3408 | **3408** (aucune clé neuve — le vocabulaire existait) |

Équilibre des accolades vérifié sur les 7 fichiers touchés.
**Gate réel = CI `iOS Tests`**, job `Build app + tests unitaires`.

### 4.1 Le balayage que la leçon de 251i bis exigeait — fait AVANT le push

251i bis s'était soldé par un rouge parce que j'avais relu *les fichiers dont je
me souvenais* au lieu de balayer. Cette fois le `grep` est venu en premier, sur
tout `MeeshyTests` + `packages/*/Tests`, et il a rendu **quatre** bancs qui
épinglent ce que je touchais :

| banc | ce qu'il épingle | verdict |
|---|---|---|
| `ComposerLanguageFlagTests` | `label("en")` → 🇬🇧, `label("pt-BR")` → 🇧🇷 | **c'est lui qui a révélé le conflit `pt`** (§ 3.2) |
| `FocalRealtimeMatrixTests` F06 | `LanguageData.info(for: translation.originalLangCode` | vert — cette étiquette n'a pas été touchée |
| `FocalMatrixWiringGuardTests` | `plainLanguageFlags(`, `originalLanguageFlag`, les deux rappels `onSetActiveDisplayLanguage` | vert — noms et appels préservés |
| `BubbleFooterAccessibilityTests` | `LanguageFlagChip(` + `metrics: .compact` | vert — non touché |

> **Le balayage n'a pas seulement évité un rouge : il a trouvé le conflit `pt`,
> qu'aucune lecture du code de production ne montrait.** Un banc qui épingle une
> valeur documente une décision que le code seul ne porte pas.

### 4.2 Deux erreurs attrapées à la relecture, avant le push

1. **`?? ""` sur un non-optionnel.** `AudioFullscreenSource.originalLanguage` est
   `String` ; l'ancien appel compilait parce que `from(code:)` prend un `String?`
   et que Swift promeut. Mon repli explicite, lui, ne compile pas.
2. **Isolation.** `ComposerLanguageFlag` est `nonisolated` ; l'app compile sous
   `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. Le vocabulaire (`flag`,
   `spokenName`, `rawName`) est donc explicitement `nonisolated` — ce sont des
   fonctions pures sur des chaînes, la marque est correcte dans les deux cas.

---

## 5. Ce que la MESURE a coûté, et ce qu'elle enseigne

Quatre scanners avant un nombre publiable :

| passe | instrument | rendu | pourquoi c'était faux |
|---|---|---|---|
| 1 | fenêtre de 12 lignes | 102 | ne voyait pas les `Text` du label |
| 2 | fenêtre de 300 caractères | 20 | **avalée par les commentaires** — `LanguageFlagChip`, conforme, ressortait fautif |
| 3 | marcheur ligne à ligne | 59 → 13 | cassait sur un argument ternaire multi-lignes ; déclarait MUETTES les 4 bascules d'appel, qui sont correctes |
| 4 | marcheur à parenthèses équilibrées | **40 / 15 / 16 / 9** | — |

> **Un compteur n'est pas une mesure tant qu'on n'a pas vérifié qu'il rate ce
> qu'il doit rater.** Les trois premiers nombres étaient publiables d'apparence,
> et faux. Ce qui les a démasqués n'est jamais un raisonnement : c'est d'avoir
> cherché, dans les résultats, un site dont je SAVAIS le verdict —
> `LanguageFlagChip` pour la passe 2, les boutons muet/haut-parleur pour la
> passe 3. **Toute mesure doit inclure un témoin dont on connaît la réponse.**

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — deux bandes de drapeaux passent de « Français » à « Afficher en Français » + état lu ; 39 langues gagnent un nom prononçable |
| 6 · Cohérence de positionnement | mûre — le drapeau-contrôle se dit pareil sur les dix surfaces ; le `pt` de Focal rejoint les huit autres |
| 11 · Maintenabilité | mûre — 2 copies → 0, 2 producteurs privés → 0, 10 replis → 1, garde de RÔLE |
| 13 · Complétude | **partielle** — le conflit `pt` reste une décision produit ouverte (§ 3.2), et le SDK garde ses propres replis (§ 7) |

---

## 7. Suites (253i+)

1. **Décision produit : quel drapeau porte le portugais ?** 🇵🇹 (`LanguageDisplay`)
   ou 🇧🇷 (`LanguageData`). Tant qu'elle n'est pas prise, `ComposerLanguageFlag`
   garde sa table et l'exemption nommée reste dans la garde. **À ouvrir en issue
   `décision-produit`.**
2. **Les deux tables doivent fusionner.** 41 vs 78 langues, un désaccord de
   drapeau, treize désaccords de NOM (ar, ja, ko, ru, zh, hi, th, el, he, bg,
   bn, uk, am). Tant qu'elles coexistent, tout site choisit implicitement une
   sémantique en choisissant une table.
3. **Le SDK garde cinq replis maison** (`CountryPicker`, `UserIdentityBar`,
   `VoiceRecordingView`, `AudioPlayerView`, `VideoEditorCaptionsPanel`) — hors
   périmètre de piste, comme les carry-overs 246i–248i.
4. **Les 8 autres bascules muettes** (§ 1) : `showEffectsToolbar`,
   `showColorPalette`, `isArchived`, `isPinned`/`isMuted` hors menu,
   `isLiked` de story, `isPostBookmarked`, `showAudioTranscript`, la recherche
   de la liste. Chacune veut son remède : trait `.isToggle` pour les
   interrupteurs, nom qui varie pour les éléments de menu.
5. Carry-over : mesurer la rangée méta du fil en Dynamic Type XXL (249i–251i,
   demande un simulateur) ; `FeedView` sur `likePost`/`bookmarkPost` ;
   `isProgrammaticScroll` ; les 3 copies d'`isLoadingReactions`.
