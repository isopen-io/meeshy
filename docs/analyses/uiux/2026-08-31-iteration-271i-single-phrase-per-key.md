# Iteration-271i — Une clé portait cinq phrases, et la traduire les aurait réduites à une

**Date** : 2026-08-31 · **Piste** : iOS (suffixe `i`)
**Surface** : grille média du fil (`FeedPostCard+Media.swift`) · clés à replis divergents
**Base** : `main` HEAD `09d94823` · **Issue** : #4540
**Précédent direct** : 270i (#4364) — la carte des catalogues par cible, cliquet 114 → 81

---

## 1. Ce qui a été cherché, et le défaut qui attendait dedans

270i lègue deux suites : les **81 clés** du cliquet i18n (#4328), et parmi
elles la sous-famille des `defaultValue` écrits en **ANGLAIS** dans un catalogue
dont la langue source est le français — « ceux-là ne s'affichent pas en français
dans six locales : ils s'affichent en anglais dans les sept, francophone
comprise. C'est une famille DISTINCTE de celle de #4328, et plus grave ».

L'itération commence donc par mesurer cette famille. Douze clés. La première
ouverte est `feed.media.item`, dans la grille média du fil — et le fichier rend
un motif que « clé anglaise » ne décrit pas :

```swift
.accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 1 of \(count)", …))
.accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 2 of \(count)", …))
.accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 3 of \(count)", …))
.accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 4 of \(count)", …))
.accessibilityLabel(String(localized: "feed.media.item", defaultValue: "Media 5 of \(count)", …))
```

**Une clé, cinq phrases.** La POSITION de la tuile est gravée dans le littéral au
lieu de voyager comme argument.

---

## 2. Le défaut est ARMÉ par le travail que le cliquet demande

Un catalogue n'a qu'une valeur par clé. Tant que `feed.media.item` en est
absente, chaque site rend son propre repli : l'écran est juste, et **rien ne
révèle la collision**. Le jour où quelqu'un fait ce que le cliquet demande —
entrer la clé au catalogue avec ses sept traductions — les cinq sites tombent
sur la MÊME phrase, et VoiceOver annonce « Média 1 sur 7 » sur chacune des cinq
images de la galerie.

> **Un `defaultValue` ne masque pas seulement l'ABSENCE d'une clé (#4328) : quand
> deux sites l'écrivent différemment, il masque aussi le fait que la clé a
> plusieurs SENS.** La régression serait produite par un travail de traduction
> correct, sur une surface que le traducteur n'a pas ouverte — et le cliquet, qui
> compte des CLÉS, annonçait une dette de 1 pour cinq phrases non traduites.

Mesuré sur les 1 337 sources iOS, replis normalisés (interpolations remplacées
par un jeton) :

| clé | replis distincts | au catalogue | verdict |
|---|---|---|---|
| `feed.media.item` | **5** | **non** | le défaut — armé, pas encore tiré |
| `common.done` | 2 (`Terminé` ×3 app / `OK` ×1 SDK) | oui | repli MORT : le catalogue sert `Terminé` partout |
| `share.empty` | 2 | oui, **dans deux catalogues** | légitime — deux BUNDLES, deux catalogues |
| `conversation.view.composer.delete_attachment` | 2 littéraux, **1 phrase** | oui | `Supprimer \(label)` / `Supprimer \(labelForAttachment(…))` |
| `story.viewer.a11y.position` | 2 littéraux, **1 phrase** | oui | idem |

**Trois des cinq ne sont pas des défauts, et la façon de le voir est de comparer
des PHRASES et non des littéraux.** Un témoin écrit sur l'égalité de chaîne
aurait crié sur les deux dernières lignes — deux noms de variable pour la même
phrase — et se serait fait désarmer au premier faux positif.

---

## 3. Les deux défauts voisins, trouvés dans le même fichier

### 3.1 Deux clés anglaises dans un catalogue français

`feed.media.item` (« Media 1 of … ») et `feed.media.moreItems`
(« \(count - 5) more media items ») s'affichaient en **anglais dans les sept
locales**, francophone comprise : la sous-famille exacte que 270i avait nommée.

### 3.2 Le média UNIQUE n'avait aucun nom accessible

Un post à un seul média ouvre le plein écran depuis `imageMediaView`, qui
portait un `.onTapGesture` **et rien d'autre** : pas de `accessibilityLabel`,
pas de `.isButton`. VoiceOver annonçait une image sans dire ce qu'elle est ni
qu'on peut l'ouvrir. C'est la seule tuile média du fil dans ce cas — et elle
était invisible à tous les audits de libellé, **parce qu'il n'y avait pas de
libellé à auditer**.

> Un balayage qui cherche « les libellés fautifs » ne trouve jamais les surfaces
> qui n'en ont pas. La grille à 2–5 tuiles avait cinq libellés faux ; le média
> unique en avait zéro, et c'est le second cas qui a survécu le plus longtemps.

---

## 4. Ce qui est livré

### 4.1 La position voyage en argument

`FeedMediaAccessibility` — site unique des libellés VoiceOver de la grille, dans
le fichier même (aucun fichier de production neuf) :

| fonction | clé servie | état de la clé |
|---|---|---|
| `tileLabel(position:of:)` | `feed.media.item` | **entrée au catalogue**, 7 locales |
| `overflowLabel(total:)` | `a11y.post.media.more` | existante, 7 locales |
| `singleImageLabel()` | `a11y.post.media.image` | existante, 7 locales |
| `openHint()` | `feed.media.viewFullscreen` | existante, 7 locales |

`bundle` et `locale` sont des paramètres, pas des valeurs en dur — doctrine de
`PostStatAccessibility` : sans eux un test juge la langue du SIMULATEUR, vert en
local (fr) et rouge en CI (en).

### 4.2 Le catalogue, sans un mot inventé

`feed.media.item` = `Média %1$lld sur %2$lld` (fr) et ses six traductions. Rien
n'est traduit ici : la forme est copiée de son **jumeau structurel**
`story.viewer.a11y.position` (`Story %1$lld sur %2$lld`, sept locales, deux
entiers positionnels, substitution déjà éprouvée par
`test_uploadProgress_substitutesBothCounts`), et le NOM du média est celui que
le catalogue emploie déjà pour ce concept dans `a11y.post.media.more` :

| locale | `a11y.post.media.more` (existant) | `feed.media.item` (neuf) |
|---|---|---|
| fr | Voir les %d **médias** | **Média** %1$lld sur %2$lld |
| en | View all %d **media** | **Media** %1$lld of %2$lld |
| es | Ver los %d **archivos multimedia** | **Archivo multimedia** %1$lld de %2$lld |
| it | Vedi i %d **media** | **Media** %1$lld di %2$lld |
| de | Alle %d **Medien** ansehen | **Medium** %1$lld von %2$lld |
| pt-BR | Ver as %d **mídias** | **Mídia** %1$lld de %2$lld |
| ar | عرض **الوسائط** الـ %d | **الوسائط** %1$lld من %2$lld |

Édition **textuelle** du catalogue (un `json.load`/`json.dump` réordonnerait les
3 433 entrées d'un fichier non trié), insérée derrière son entrée sœur
`feed.media.viewFullscreen` pour garder la famille groupée : **+47 / −0**.

### 4.3 Réemploi plutôt qu'une clé de plus

La tuile « +N » sert désormais `a11y.post.media.more`. Ce n'est pas une
substitution de commodité : `PostDetailView` rend la MÊME grille avec la MÊME
affordance (ouvrir la galerie plein écran) et servait déjà cette clé. Deux
écrans, un concept, deux familles de clés — l'une traduite, l'autre anglaise.
`feed.media.moreItems` quitte le dépôt sans qu'une chaîne soit inventée.

### 4.4 Quatorze piles de modificateurs deviennent un modificateur

`feedGalleryTile(position:of:open:)` remplace, sur chacune des quatorze tuiles, la
pile `contentShape` + `onTapGesture` + `accessibilityLabel` + `accessibilityHint`
+ `accessibilityAddTraits`. Il y ajoute `.accessibilityElement(children: .ignore)`,
que la grille jumelle de `PostDetailView` posait et que celle du fil n'avait
pas : sans elle, un libellé posé sur le conteneur ne remplace pas ce que l'image
publie elle-même.

`mediaPreview` passe de **145 à 91 lignes** ; le fichier, doc-comment et helpers
compris, passe de 450 à 507 — sous le budget de 800–1100.

### 4.5 La garde

`LocalizedKeySinglePhraseGuardTests` — **dans la cible app, une clé ne porte
qu'UNE phrase.** Il normalise les replis (interpolations → `<arg>`) par un
balayage à parenthèses ÉQUILIBRÉES, parce que des expressions réelles du dépôt
en portent de l'intérieur (`\(communityLinks.reduce(0) { $0 + $1.memberCount })`).

| contrôle | résultat |
|---|---|
| sur l'état d'AVANT (`git show HEAD:…`) | **1 violation — `feed.media.item`, 5 phrases** |
| sur l'état livré | **0** |
| forme interdite reconnue (source synthétique) | ✓ 2 phrases séparées |
| forme tolérée reconnue (source synthétique) | ✓ 2 noms de variable ⇒ 1 phrase |

**Sa portée est la cible app, et c'est une décision, pas un raccourci.** Une
extension est un bundle séparé : `share.empty` sert légitimement « Aucune
conversation » dans l'app et « Ouvrez Meeshy une fois pour retrouver vos
conversations ici » dans la feuille de partage, **chacune traduite dans son
catalogue**. Élargir le témoin demande de le grouper par catalogue RÉSOLU, pas
seulement par clé — c'est écrit dans son doc-comment plutôt que laissé implicite.

### 4.6 Le scanner devient partagé, et un fichier repasse sous budget

Le second témoin avait besoin de `localizedCalls` / `isIdentifier` /
`swiftFiles`, jusqu'ici `private` dans `LocalizationConsistencyTests`. Les
recopier aurait produit **deux lectures divergentes de la même syntaxe** —
exactement ce que cette suite reproche au catalogue. Ils sortent dans
`LocalizedCallScanner`, sans une ligne réécrite ; leurs propres témoins de forme
(`test_leScannerVoitLesAppelsRepartisSurPlusieursLignes`) restent où ils sont et
continuent de les couvrir.

Effet de bord voulu : `LocalizationConsistencyTests.swift` passe de **1203 à
1069 lignes** — sous le budget de 800–1100 du `CLAUDE.md`, qui interdit d'ajouter
à un fichier hors budget avant d'en avoir extrait.

---

## 5. Preuve

Pas de chaîne d'outils Apple dans cet environnement (ni `swift`, ni
`xcodebuild`) : **le gate réel est la CI `iOS Tests`**, et il est OPT-IN — le
sujet du commit de tête doit porter « run test » pour que le job exécute
autre chose qu'une compilation. Ce qui est vérifiable ici l'a été par un miroir
Python du scanner de la suite, validé sur un POINT FIXE (le cliquet à 81) avant
toute modification.

| contrôle | résultat |
|---|---|
| le miroir reproduit le cliquet **avant** modification | **81 = 81** (valeur épinglée par 270i) |
| catalogue relu par `json.loads` après édition textuelle | ✓ 3 433 → 3 434 clés |
| les 7 locales de `feed.media.item` relues une à une | ✓ 7/7, `%1$lld` / `%2$lld` |
| diff du catalogue | **+47 / −0** — insertion pure |
| règle A (traduction) sur les **247** écrans épinglés | **0** |
| règle B (repli = source du catalogue) sur les 247 | **0** |
| cliquet après | **79** = plafond posé |
| garde de phrase unique, avant / après | **1 / 0** |
| carte des catalogues par cible (270i), deux directions | ✓ intacte |
| miroir CLI `apps/ios/scripts/check_localization.py` | ✓ directions 1 et 2 vertes |
| `feed.media.moreItems` restant dans le dépôt | 0 site de code (4 mentions en commentaire, voulues) |
| équilibre des accolades des trois fichiers Swift touchés | ✓ |

`FeedPostCard+Media.swift` devient **épinglable** et est épinglé : 246 → 247
écrans. Il passait déjà la règle A une fois `feed.media.item` au catalogue, et
la règle B par construction (un repli interpolé en est exclu — Xcode réécrit
`"… \(x)"` en `"… %@"` à l'extraction).

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | **avancée** — cinq tuiles annoncent cinq positions distinctes ; le média unique cesse d'être muet ; chaque tuile est UN élément |
| 9 · Compatibilité | **avancée** — deux clés passent de l'anglais seul aux sept locales |
| 11 · Maintenabilité | **avancée** — un site unique pour les libellés, un scanner unique pour les deux témoins, un fichier repassé sous budget |
| 13 · Complétude | **partielle** — 79 clés restent au cliquet (#4328) ; le témoin de phrase unique ne couvre que la cible app |

---

## 7. Suites

1. **#4328** — les 79 clés du cliquet. La famille anglaise identifiée par 270i
   reste ouverte pour dix clés : `security.verify.description` et
   `security.verify.howto` (un écran de SÉCURITÉ entier en anglais pour un
   francophone), `comments.comment.a11yLabel`, `comments.reply.a11yLabel`,
   `comments.load-more-replies`, `bubble.meta.ephemeral.a11y`,
   `conversation.encryption.detail.readStatusError`,
   `message-detail.send-history.attempt-count` et `attempt-number`,
   `siri.notifications.unreadCount`.
   Trois d'entre elles (`comments.load-more-replies`,
   `message-detail.send-history.attempt-count`) portent un accord PLURIEL écrit
   en code (`count == 1 ? "reply" : "replies"`) : elles demandent une entrée
   `variations.plural`, pas une chaîne plate — cf. `ExplicitPluralLabelTests` et
   la doctrine `PostStatAccessibility`.
2. **`contacts.phonebook.*`** — 10 clés, une surface entière à moitié traduite.
3. **Étendre le témoin de phrase unique aux extensions et au SDK**, groupé par
   catalogue résolu. Un cas connu l'attend : `common.done`, dont le repli SDK
   (`OK`) est mort face au `Terminé` du catalogue — bénin, mais c'est la même
   forme.
4. **#4319** — les 74 écrans à `ProgressView` sans squelette.
5. **#4298** — le cube des stories et le swipe de bulle, en arabe.
