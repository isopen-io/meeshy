# Iteration-236i — Un seul compteur de non-lus : 4 clés, 3 mécanismes, 3 accords faux

**Date** : 2026-08-22
**Piste** : iOS (suffixe `i`)
**Surface** : `UnreadCountLabel` (neuf) · `ThemedConversationRow` · `ConversationView+ScrollIndicators` · `GlobalSearchView` · `RootView`
**Base** : `main` HEAD `5d1d85b1` (après merge de 235i, PR #3257)
**Branche** : `claude/intelligent-noether-aymk2j`

## Pourquoi cette surface

Suite n° 1 déclarée par 235i, elle-même suite n° 2 de 234i. Le motif est
maintenant explicite dans le pointeur de tracking : **la famille « non-lus » est
la dernière à porter des graveurs de pluriel**, et 235i les avait nommés un par
un sans les instruire.

C'est exactement la situation que 234i avait décrite pour les membres : 231i et
232i y avaient corrigé **le même défaut deux fois**, chacune sur sa clé, sans
retirer la cause. Le remède qui a marché — une clé, un helper, un site de rendu
— existe désormais (`MembersCountLabel`) et se transpose tel quel.

Collision essaim vérifiée avant de choisir (`list_pull_requests`) : après merge
de #3257, **0 PR iOS ouverte partageant un fichier**. #3250 (233i) touche
`OnboardingAnimations.swift`, #3288 la pile d'appels — aucun fichier commun.
Numéro : plus haute itération mergée = **235i** (#3257) ; 236i strictement
au-dessus.

## L'inventaire

Cinq clés rendaient « N non lus » par **trois mécanismes** :

| Clé | Site | Mécanisme | État |
|---|---|---|---|
| `accessibility.unread_count` | `ThemedConversationRow:294` | `variations.plural` + `String(format:)` | **juste** |
| `a11y.back.with_unread` | `ConversationHelperViews:130` | `variations.plural` + `String(format:)` | **juste** (porte en plus « Retour, ») |
| `conversation.scroll-to-bottom.a11y-unread` | `ConversationView+ScrollIndicators:89` | clé **à plat** + `String(format:)` | « 1 messages non lus » |
| `unit.unread` | `GlobalSearchView:664` | **concaténation** `"\(count) " + adjectif` | « 1 non lus » |
| `a11y.notifications.unread_count` | `RootView:2070` | clé **à plat** + `String(format:)` | « 1 notifications non lues » |

Trois défauts distincts s'y cachaient.

### 1. Le doublon exact — la clé du bouton de défilement

`conversation.scroll-to-bottom.a11y-unread` n'était pas une variante : dans les
**7 locales**, sa valeur était **mot pour mot** la forme `other` de
`accessibility.unread_count`.

```
scroll-to-bottom.a11y-unread   fr: "%d messages non lus"
accessibility.unread_count     fr: other → "%d messages non lus"   ← identique
                               fr: one   → "1 message non lu"      ← ce qui manquait
```

La différence entière tenait à ce qui n'était **pas** copié : la forme `one`, et
les cinq formes arabes autres que `few`. Un traducteur maintenait donc deux
entrées pour une phrase, dont l'une amputée de son accord — sur le bouton de
retour en bas de conversation, atteignable à N = 1 dès qu'un seul message arrive
pendant qu'on remonte le fil.

### 2. La concaténation ne peut pas accorder

`GlobalSearchView` composait `"\(result.unreadCount) " + unit.unread`, où
`unit.unread` vaut l'**adjectif nu au pluriel** (« non lus », « unread »,
« ungelesen »). Même défaut de fond qu'en 234i, et sans la garde `> 2` qui y
masquait le singulier : ici la garde est `> 0`, donc **N = 1 est le premier cas
atteint** — « 1 non lus » dans le libellé VoiceOver de chaque résultat de
conversation d'une recherche globale.

L'entrée portait par ailleurs `extractionState: "stale"` : le catalogue signalait
déjà qu'elle n'avait plus de raison d'être.

Et l'arabe n'en recevait qu'une forme sur six — `غير مقروءة` — servie
indistinctement au singulier, au duel, à la plage 11–99 et au-delà de 100.

### 3. L'autre nom compté, resté à plat

`a11y.notifications.unread_count` porte le libellé de la **cloche de
notifications** — élément permanent de l'écran d'accueil. À plat
(« %d notifications non lues »), il rend « 1 notifications non lues » dès la
première notification, dans les cinq locales latines et germaniques, et ne sert
à l'arabe qu'une forme sur six.

## Le correctif

Une règle plurielle par **nom compté**, une clé, un site de rendu.

1. **`UnreadCountLabel`** (neuf, `Features/Main/Components/`) — jumeau de
   `MembersCountLabel` (234i), même namespace `enum`, même paire
   `bundle`/`locale`. Deux fonctions : `messages(_:)` et `notifications(_:)`.

   **Deux fonctions, et non une paramétrée par le nom** : « message » et
   « notification » n'ont pas le même genre en français, en espagnol, en italien
   ni en portugais, et l'accord de « non lu » suit ce genre. Une clé par nom
   compté est la seule forme qui laisse le **catalogue** porter cet accord au
   lieu de le regraver dans du code. Un test verrouille cette séparation.

2. **Catalogue : 5 clés → 3.**
   - `conversation.scroll-to-bottom.a11y-unread` **supprimée** — doublon exact,
     amputé de son accord ;
   - `unit.unread` **supprimée** — le dernier adjectif nu de la famille ;
   - `a11y.notifications.unread_count` **convertie** à plat →
     `variations.plural` (2 formes dans les 6 locales latines/germaniques,
     **6 formes en arabe**, structure calquée sur `accessibility.unread_count`) ;
   - `accessibility.unread_count` **intacte** — c'est elle qui survit et que le
     helper sert ;
   - `a11y.back.with_unread` **intacte** — déjà correcte, et ce n'est pas un
     doublon : elle porte le préfixe « Retour, » propre au bouton de retour
     (235i l'avait déjà signalée « à ne pas re-flagger »).

3. **Les quatre sites** appellent le helper. Les gardes produit existantes sont
   conservées à l'identique (`unreadCount > 0` partout) : aucun changement de
   quand le libellé apparaît, seulement de ce qu'il dit.

### Ce qui n'est PAS fait, et pourquoi

**`MeeshyAppIntents.swift:272`** — `"You have \(unreadCount) unread
message\(unreadCount == 1 ? "" : "s")"`, chaîne codée en dur en anglais portant
l'idiome `? "s" : ""` proscrit depuis 185i. Nommée par 235i, **délibérément
laissée** ici : c'est un dialogue Siri, et `IntentDialog` se compose depuis un
`LocalizedStringResource`, **pas** depuis `String(localized:)`. Y brancher un
`String` calculé demande d'arbitrer un mécanisme de localisation différent, non
vérifiable sans toolchain Swift — et un échec de compile y coûterait le cycle CI
entier de l'itération. La forme du défaut est connue et documentée ; le remède
demande un compilateur, pas une décision.

**La forme `one` grave son « 1 ».** `accessibility.unread_count` écrit
« 1 message non lu » là où « %d message non lu » serait plus juste : la règle
CLDR française range **0 ET 1** dans la catégorie `one`, donc un compteur à zéro
rendrait « 1 message non lu ». Le cas est **inatteignable** — les quatre sites
sont gardés par `> 0` — et corriger une clé déjà correcte pour un cas mort
serait de l'élargissement de périmètre. Nommé en suites.

## Vérification

Aucune toolchain Swift sous Linux. Le gate réel est la CI **avec la suite
réellement exécutée** — `[run test]` au sujet du commit (doctrine établie en
234i : sans ce mot-clé, `ios.yml` compile les cibles de test sans les exécuter,
et le nom du check l'atteste : `Build app + tests unitaires` = suite exécutée,
`Build app (app + cibles de test)` = compilation seule).

### Contrôles déterministes exécutés localement

- **Catalogue** : round-trip JSON prouvé **octet pour octet identique AVANT**
  édition (`json.dumps(indent=2, ensure_ascii=False)` + `\n` final ; le variant
  `sort_keys=True` produit un fichier de même longueur mais réordonné — le
  vérifier était le point de la leçon 234i). Diff publié =
  **129 insertions / 115 suppressions**, soit exactement les 3 clés touchées.
  3270 → 3268 clés. La clé convertie porte ses 7 locales en `variations.plural`,
  les 2 clés survivantes de la famille sont inchangées.
- **Grep de fermeture** : 0 référence résiduelle aux 2 clés supprimées, 0 à
  `unreadUnit`, et les 4 sites appellent bien le helper.
- **Suite neuve** (`UnreadCountLabelTests`, 23 tests) :
  - régressions d'accord sur les **deux** noms comptés, FR/EN/ES/IT/DE/PT-BR ;
  - `test_singularAndPluralDifferInEveryLatinLocale` — verrou général : une
    locale qui perdrait sa `variations.plural` retombe sur une forme unique ;
  - `test_messagesAndNotificationsAreDistinctLabels` — interdit la fusion des
    deux clés en une, qui regraverait l'accord de genre dans le code ;
  - `test_arabicDistinguishesItsPluralCategories` — singulier ≠ duel ≠ 3–10,
    sur les deux noms : le défaut arabe que la forme à plat rendait invisible ;
  - `test_arabicCarriesNoLatinLetter` — aucune lettre latine greffée (défaut
    232i, que la concaténation de `unit.unread` rendait à nouveau possible) ;
  - `test_labels_neverLeakAFormatSpecifier` — garde héritée de 235i, 7 locales
    × 6 effectifs × 5 spécificateurs ;
  - 2 gardes de source : les 4 sites passent par le helper, et la concaténation
    ne revient pas.
- **Piège 235i traité** : les gardes de source cherchent la forme **CITÉE** des
  clés retirées. Le helper et le bouton de défilement les mentionnent en prose
  (entre accents graves) pour expliquer le défaut soldé — une garde sur le nom
  nu aurait rougi sur son propre commentaire. Vérifié par grep : 0 occurrence
  citée en production.
- **Assertions indépendantes du poste** : `bundle` et `locale` sont fixés par
  PAIRE à chaque appel (le bundle choisit la table, le locale la règle
  plurielle). Le simulateur CI tourne en anglais, le poste de dev souvent en
  français — fixer l'un sans l'autre rendrait la suite verte ici et rouge là.
  Aucune assertion sur un chiffre rendu en arabe (le système de numération y
  varie), seulement sur des différences entre formes.
- **Non-régression des gardes i18n** :
  `test_everyAppCatalogIdentifierKeyIsReferencedInCode` — les 2 clés supprimées
  n'ont plus aucune référence, les 2 survivantes en ont une chacune dans le
  helper ; `test_pluralizedKeysAreRecognizedAsTranslated` — la clé convertie
  rejoint les entrées plurielles, toutes ses formes en état `translated` ;
  `test_untranslatedKeyBacklogDoesNotGrow` — plafond `≤`, deux clés en moins ne
  peuvent que le servir ; `FrenchDefaultValueRatchetTests` — le cliquet ne
  flague que les clés à `defaultValue` français **absentes** du catalogue ; les
  deux clés servies par le helper y sont présentes. Aucun des 4 fichiers touchés
  n'est un « écran épinglé » (`fullyLocalizedScreens`).
- **Équilibre syntaxique** des 6 fichiers Swift : 0/0/0 accolades / parenthèses
  / crochets, commentaires et littéraux retirés.
- **`pbxproj`** : 8 entrées (2 fichiers × 4 sections), IDs SHA1-dérivés du nom,
  collision vérifiée = 0 contre les 24-hex existants. Le projet est piloté par
  **XcodeGen** (`project.yml`, globbing récursif sur `Meeshy/` et
  `MeeshyTests/`) et la CI régénère avant de builder : ces entrées relèvent de
  l'exception documentée par `apps/ios/CLAUDE.md` — « les lignes qui AJOUTENT la
  référence d'un fichier neuf sont le correctif, pas du churn ». Elles gardent
  Xcode en local aligné sans lequel une suite neuve est **verte par omission**.

### Traductions arabes

Les 6 formes de `a11y.notifications.unread_count` sont **calquées
morphologiquement** sur l'entrée sœur `accessibility.unread_count` (رسالة →
إشعار, féminin → masculin, accord de `غير مقروء` suivi). Elles sont
structurellement correctes ; une relecture par un locuteur natif reste
souhaitable et est nommée en suites — l'alternative était de laisser une seule
forme servir les six catégories, ce qui est faux par construction.

## Le cinquième site — découvert par la CI, et il rendait `main` ROUGE

Le premier run de cette PR a échoué sur **1 test / 7309** (7303 passés) :

```
LocalizationConsistencyTests/test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage()
  [APP] accessibility.unread_messages  (LentilleFocusCard.swift)
```

La clé incriminée n'est pas des miennes : c'est celle que **235i a retirée du
catalogue**. Elle avait **trois** porteurs, 235i n'en a corrigé que deux
(`ThemedConversationRow`, `LentilleConversationRow`). Le troisième —
`LentilleFocusCard.unreadBadge:260` — est resté à référencer une clé qui
n'existe plus.

### Pourquoi la CI de 235i était verte

Elle a tourné le 2026-08-21 à 10:20 contre la base `c886b8b5`. Entre ce run et
son merge (2026-08-22, 04:2x), `main` a avancé et `LentilleFocusCard` est entrée
dans le périmètre. GitHub n'a pas re-testé la branche contre la base neuve : les
deux côtés étaient verts **séparément**, faux **ensemble**. Conflit sémantique
de merge — invisible à `git`, qui ne voit aucun conflit textuel.

**Conséquence directe : `main` est rouge.** Le run iOS de `5d1d85b1` (le merge de
235i) conclut `failure` sur exactement cette assertion. Ce n'est donc pas
« l'échec d'une PR », c'est la ligne principale cassée — et cette PR la répare.

### Le correctif, et pourquoi il tombe dans ce périmètre

`unreadBadge` portait `.accessibilityLabel(String(localized:
"accessibility.unread_messages"))` — **le défaut exact de 235i** (un `%lld`
jamais substitué, énoncé tel quel par VoiceOver) sur une troisième surface. Le
site rejoint donc le helper comme les quatre autres :

```swift
.accessibilityLabel(UnreadCountLabel.messages(conversation.userState.unreadCount))
```

Le libellé annonce l'effectif **réel** et non le « 99+ » affiché : le plafond est
une contrainte de largeur du badge, pas une donnée. C'est aussi ce que fait déjà
`ThemedConversationRow`.

`test_everyUnreadCounterGoesThroughTheLabel` gagne ce cinquième site **et** la
clé de 235i dans sa liste de formes citées interdites — c'est la garde qui aurait
attrapé l'orpheline.

### La leçon

Une clé retirée du catalogue doit être grepée sur **tout** `apps/ios`, pas sur
les fichiers que l'itération a ouverts. 235i a corrigé deux rangées de
conversation et raisonné « les deux rangées » ; le badge d'une carte de focus
n'est pas une rangée, et il portait la même clé. Le grep de fermeture doit
partir de la CLÉ, jamais de la surface.

## Bilan

**4 fichiers prod modifiés + 1 neuf**, **1 suite neuve** (23 assertions),
**2 clés catalogue supprimées + 1 convertie**, **8 entrées pbxproj**.
0 clé i18n neuve · 0 changement visuel · 0 logique · 0 réseau · 0 SDK.

Impact visible : « 1 messages non lus » → « 1 message non lu » sur le bouton de
retour en bas de conversation ; « 1 non lus » → « 1 message non lu » dans la
recherche globale ; « 1 notifications non lues » → « 1 notification non lue » sur
la cloche ; formes arabes correctes sur les quatre surfaces.

Impact structurel : la famille « non-lus » n'a plus de graveur de pluriel dans
l'app SwiftUI. Le prochain compteur ne peut plus naître avec sa propre règle —
il n'y a plus qu'un endroit où l'écrire, et un test qui interdit d'y fusionner
deux noms de genres différents.

## Suites (237i+)

1. **`MeeshyAppIntents.swift:272`** — la dernière occurrence de la famille, et
   la seule hors SwiftUI. Demande un compilateur : `IntentDialog` se compose
   depuis `LocalizedStringResource`, pas depuis `String(localized:)`. Deux
   chaînes anglaises codées en dur (`"You have no unread messages"` et celle au
   `? "s" : ""`), donc 1 à 2 clés neuves + une décision sur la localisation des
   intents.
2. **`formatCount()`** (`ConversationListHelpers:493`) — carry-over 234i, jamais
   traité : fabrique « 1.5k » / « 2.3M » avec `String(format: "%.1fk")`, donc un
   **séparateur décimal anglais** dans toutes les locales (« 1.5k » là où le
   français écrit « 1,5 k ») et un suffixe latin en arabe. Le remède natif est
   `.formatted(.number.notation(.compact))` (iOS 15+), qui rend la locale ET la
   notation.
3. **La forme `one` qui grave son « 1 »** — voir « Ce qui n'est PAS fait ».
   Inatteignable derrière les gardes `> 0` ; à solder si un compteur de non-lus
   devait un jour s'afficher à zéro.
4. **Relecture native des 6 formes arabes** posées ici.
5. **L'effectif plafonné (« 199+ ») et sa `substitutions`** — carry-over 234i,
   demande un simulateur.
6. **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i→234i,
   toujours ouvert, demande un simulateur.
7. **Frères jamais audités du lot « transfert »** : `MessageMoreSheet` (504 l.),
   `MessageForwardService`, `MessageForwardDetailView`, `ForwardPickerViewModel`.
