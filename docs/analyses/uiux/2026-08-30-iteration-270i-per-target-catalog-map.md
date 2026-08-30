# Iteration-270i — Le widget parlait sept langues, et la garde ne le savait pas

**Date** : 2026-08-30 · **Piste** : iOS (suffixe `i`)
**Surface** : catalogues par CIBLE · clés absentes groupées par FAMILLE
**Base** : `main` HEAD `56bc5fd9` · **Issue** : #4364
**Précédent direct** : 269i (#4330) — la réconciliation `defaultValue` soldée, `#4328` ouvert sur les clés absentes

---

## 1. Ce qui a été cherché, et ce qui a été trouvé à la place

269i lègue une liste : **29 clés absentes du catalogue**, dont le `defaultValue`
s'affiche donc en français dans les six autres locales. L'itération commence par
REMESURER cette liste plutôt que la reprendre — et le miroir Python du scanner de
`LocalizationConsistencyTests` en rend **114**, pas 29.

L'écart n'est pas une correction de 269i : les 29 étaient les clés à littéral
SIMPLE, les autres portent une interpolation et sortaient de sa fenêtre. Mais en
lisant les 114, une ligne détonne :

```
widget.presence.online        apps/ios/MeeshyWidgets/MeeshyWidgets.swift   default='Online'
liveActivity.messageStatus.read  apps/ios/MeeshyWidgets/LiveActivities.swift  default='Read'
```

Vingt-deux clés d'une même cible, toutes en anglais, toutes « absentes ». Une
surface entière non localisée ? **Non** : `apps/ios/MeeshyWidgets/Localizable.xcstrings`
existe, porte **39 clés** et les **sept locales**. Le widget est traduit depuis
toujours.

C'est la GARDE qui regardait ailleurs.

---

## 2. Défaut 1 — deux catalogues nommés sur trois

Une extension est un **bundle séparé** : un `String(localized:)` de ses sources se
résout contre le catalogue embarqué DANS elle, jamais celui de l'app hôte. La
suite tient cette table depuis 224i :

```swift
static let catalogByTargetFragment: [String: String] = [
    "/MeeshyShareExtension/": "…/MeeshyShareExtension/Localizable.xcstrings",
    "/MeeshyNotificationExtension/": "…/MeeshyNotificationExtension/Localizable.xcstrings",
]
```

Le dépôt en compte **trois**. `MeeshyWidgets` manquait.

| ce qui en découlait | mesure |
|---|---|
| clés du widget comptées contre le catalogue de l'app, où elles n'existent pas | **22** |
| dette fantôme portée par le cliquet `test_untranslatedKeyBacklogDoesNotGrow` | **22** sur 114 |
| sources du widget épinglables mais inépinglées | **2** (36 clés) |

> **Rien ne rougissait.** Une cible non mappée retombe SILENCIEUSEMENT sur le
> catalogue de l'app. Le défaut n'est pas un échec de garde : c'est une **mesure
> fausse**, qui compte une dette inexistante et interdit une protection acquise.

Et il était **invisible depuis la table** : une table ne se lit que pour les
entrées qu'elle a — une entrée absente ne se manifeste par rien. Il devient
visible depuis le **système de fichiers**, seul endroit qui connaît la liste
complète. C'est exactement ce que fait la garde neuve.

---

## 3. Défaut 2 — les trous sont les VALEURS MANQUANTES de familles traduites

Le catalogue du widget rendu à sa cible, il reste **92** clés absentes (et non
114). Groupées par famille, le motif saute :

| famille | au catalogue, 7 locales | absentes | ce que voit l'utilisateur |
|---|---|---|---|
| `a11y.delivery.*` (statut de remise) | 3 — `sent`, `delivered`, `failed` | **3** — `read`, `slow`, `sending` | VoiceOver arabe : trois états en arabe, trois en français, **dans la même phrase** |
| `sync.pill.*` | 53 | **2** — `a11y.pause`, `a11y.resume` | la pastille annonce ses 53 opérations en 7 langues et ses **deux boutons** en français |
| `reading_mode.*` | 16 | 1 — `menu.auto` | « Automatique » en français dans six locales |
| `contacts.phonebook.*` | 12 | 10 | une surface à moitié traduite |

`DeliveryStatus` a six cas ; le compositeur émet une clé par cas ; trois sont
entrées au catalogue et trois non. **Le code, lui, a l'air complet** — les six
`case` sont là, chacun avec son `String(localized:defaultValue:)`.

> **Un `defaultValue` rend invisible l'absence de sa clé** (#4328). Quand
> l'absence frappe une VALEUR d'énumération, elle rend en plus invisible le fait
> que la famille est à moitié traduite : la complétude qu'on vérifie à l'œil est
> celle du `switch`, pas celle du catalogue. **La question à poser à une clé
> absente n'est donc pas seulement « que voit l'utilisateur ? » mais « quelles
> sont ses SŒURS, et sont-elles là ? »** — c'est la question qui a rendu onze
> clés remplissables au lieu de dix.

---

## 4. Ce qui est livré

### 4.1 Onze clés au catalogue, dans les sept locales, sans un mot inventé

Dix sont copiées **verbatim** d'une entrée qui portait déjà exactement le même
français dans les sept locales :

| clé remplie | source de la copie |
|---|---|
| `a11y.delivery.read` | `bubble.delivery.read` (forme mi-phrase, cf. ci-dessous) |
| `a11y.delivery.slow` | `bubble.delivery.slow` (idem) |
| `contacts.phonebook.filter.all` | `contacts.list.filter.all` — « Tous » |
| `contacts.phonebook.invite` | `route.title.invite` — « Inviter » |
| `feed.comments.translate` | `action.translate` — « Traduire » |
| `media.policy.never.short` | `invite.expiration.never` — « Jamais » |
| `participants.add.searching` | `accessibility.searching` — « Recherche en cours » |
| `reading_mode.menu.auto` | `settings.interface_language.automatic` — « Automatique » |
| `sync.pill.a11y.pause` | `media.pauseAudio` — « Mettre en pause » |
| `sync.pill.a11y.resume` | `story.mine.failed.resume` — « Reprendre » |

La **onzième**, `a11y.delivery.sending`, n'a **pas de jumelle textuelle** : son
français est « en cours d'envoi » là où `bubble.delivery.sending` dit « Envoi en
cours ». Un balayage par ÉGALITÉ DE CHAÎNE l'aurait laissée derrière — c'est la
lecture par FAMILLE qui la rattrape.

**Sur la casse.** Les trois `a11y.delivery.*` déjà au catalogue sont en minuscule
mi-phrase là où leurs jumelles `bubble.delivery.*` sont capitalisées :
`a11y…sent` = `gesendet` / `enviado` / `inviato` quand `bubble…sent` = `Gesendet`
/ `Enviado` / `Inviato`. La transformation appliquée aux trois nouvelles est donc
**celle que le traducteur a lui-même appliquée à l'autre moitié de la même
énumération, dans les six mêmes langues** — initiale en minuscule, substantif
allemand conservé capitalisé (`langsamer Versand`), arabe inchangé (pas de casse).
Ce n'est pas une traduction produite ici : c'est une famille complétée depuis sa
propre convention, vérifiable à l'œil sur les trois entrées voisines.

**Zéro ligne de production modifiée** : les onze `defaultValue` inline étaient
déjà exactement le français retenu, donc la règle B est satisfaite sans toucher
une vue.

### 4.2 La carte, dans ses deux miroirs

`/MeeshyWidgets/` entre dans `catalogByTargetFragment` **et** dans le miroir CLI
`apps/ios/scripts/check_localization.py`, qui n'avait **aucune** notion de cible :
il mesurait les trois extensions contre le catalogue de l'app. Il passait au vert
par chance — chaque appel d'extension porte un `defaultValue`, et la direction 1
saute ces appels-là.

### 4.3 La garde qui l'aurait attrapé

`test_everyPerTargetCatalogIsMapped` lit le **système de fichiers**, pas la carte :
tout `.xcstrings` de l'arbre iOS est soit le catalogue de l'app, soit mappé. Les
**deux directions** sont vérifiées — une entrée qui pointe vers un catalogue
déplacé rendrait exactement le même repli silencieux — et chaque fragment est
**sondé** : la carte n'a de valeur que si `catalog(resolvedFor:)` s'en sert
vraiment.

> **Un témoin qui interroge la carte ne peut pas voir ce qui n'y est pas.** Il
> faut l'écrire depuis la source qui connaît l'inventaire complet — ici le disque.
> C'est la forme, appliquée à une table de configuration, de la leçon 261 : une
> énumération porte deux affirmations, « ces entrées sont justes » (vérifiable) et
> « ce sont toutes les entrées » (presque jamais vérifiée).

**Le témoin s'est trompé de critère au premier jet, et sa simulation l'a
attrapé.** Écrit sur l'EXTENSION (`.xcstrings`), il rougissait : deux cibles
expédient aussi un `InfoPlist.xcstrings`, qui n'a rien à faire dans cette carte.
Un catalogue est une **table de chaînes**, et `String(localized:)` sans argument
`table:` se résout contre `Localizable` seule ; `InfoPlist` localise des valeurs
d'`Info.plist` que le système lit directement — pas plus mappable ici qu'appelable
depuis le code. Le critère juste est donc le **nom de fichier**, pas l'extension
(mesuré au passage : aucun site du dépôt iOS ne passe `table:`). **Un témoin qui
n'a jamais été exécuté est une hypothèse** — sans chaîne Apple ici, le simuler
ligne à ligne en Python est le minimum avant de l'expédier à la CI.

### 4.4 Le cliquet et les épingles

| mesure | avant | après |
|---|---|---|
| cliquet i18n (`backlogCeiling`) | 114 | **81** |
| écrans épinglés | 240 | **246** |
| règle A / règle B sur les épinglés | 0 / 0 | **0 / 0** |
| clés du catalogue app | 3 402 | 3 413 |

−22 est de la **mesure** (le widget rendu à son catalogue), −11 du **travail**.

Les six écrans épinglés :

| écran | clés | pourquoi il était bloqué |
|---|---|---|
| `MessageAccessibilityLabelComposer.swift` | 20 | les trois `a11y.delivery.*` |
| `AddParticipantSheet.swift` | 11 | `participants.add.searching` |
| `SyncPill.swift` | 4 | `sync.pill.a11y.{pause,resume}` |
| `ReadingModeChip.swift` | 4 | `reading_mode.menu.auto` |
| `MeeshyWidgets.swift` | 25 | **rien** — la carte |
| `LiveActivities.swift` | 11 | **rien** — la carte |

Les deux derniers sont les **premières sources hors cible app** jamais épinglées.
Ils passaient les deux règles depuis toujours ; il manquait la ligne qui dit
quel catalogue les sert. **Trois des quatre autres sont des surfaces
d'accessibilité** — le trou y était parlé, pas lu, ce qui explique qu'il ait
traversé les audits visuels.

---

## 5. Preuve

Pas de chaîne d'outils Apple dans cet environnement (pas de `swift`, pas de
`xcodebuild`) : **le gate réel est la CI `iOS Tests`**. Ce qui est vérifiable ici
l'a été par un miroir Python du scanner de la suite, validé sur un point fixe
avant toute modification.

| contrôle | résultat |
|---|---|
| le miroir reproduit le cliquet **avant** modification | **114 = 114** (valeur épinglée par 258i) |
| catalogue relu par `json.loads` après édition textuelle | ✓ 3 402 → 3 413 clés |
| les 11 entrées relues locale par locale = valeurs voulues | ✓ 77/77 |
| diff du catalogue | **+517 / −0** — insertions pures, aucune entrée existante touchée |
| règle A sur les **246** écrans épinglés | **0** |
| règle B sur les **246** écrans épinglés | **0** |
| cliquet après | **81** = plafond posé |
| miroir CLI `check_localization.py` | ✓ directions 1 et 2 vertes |

L'édition du catalogue est **textuelle** : un `json.load`/`json.dump`
réordonnerait les 3 402 entrées (le fichier n'est PAS trié — l'ordre d'Xcode
comporte des dizaines d'inversions locales, et une clé `""` que `sort_keys`
remonterait en tête). Chaque bloc est inséré derrière une entrée SŒUR, ce qui
garde les familles groupées.

---

## 6. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | **avancée** — le statut de remise se dit en sept langues ; trois des quatre écrans débloqués sont des surfaces VoiceOver |
| 9 · Compatibilité | **avancée** — 11 clés passent de 1 à 7 locales ; le widget cesse d'être compté comme non traduit |
| 11 · Maintenabilité | **mûre sur ce point** — la carte des catalogues est complète et gardée dans les deux sens, dans ses deux miroirs |
| 13 · Complétude | **partielle** — 81 clés restent au cliquet (#4328) |

---

## 7. Suites

1. **#4328** — les 81 clés du cliquet. Deux sous-familles s'en détachent et
   méritent d'être traitées séparément :
   - `contacts.phonebook.*` (10 clés) — une surface entière à moitié traduite ;
   - les `defaultValue` écrits en **ANGLAIS** dans un catalogue de langue source
     française (`security.verify.description`, `comments.comment.a11yLabel`,
     `bubble.meta.ephemeral.a11y`, `feed.media.item`…). Ceux-là ne s'affichent pas
     en français dans six locales : ils s'affichent en **anglais dans les sept**,
     francophone comprise. C'est une famille DISTINCTE de celle de #4328, et plus
     grave.
2. **#4329** — la règle B et les clés plurielles : trois écrans restent
   inépinglables par construction.
3. **#4319** — les 74 écrans à `ProgressView` sans squelette.
4. **#4298** — le cube des stories et le swipe de bulle, en arabe.
