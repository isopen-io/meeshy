# Iteration-235i — VoiceOver énonçait « %lld messages non lus » sur chaque rangée non lue

**Date** : 2026-08-21
**Piste** : iOS (suffixe `i`)
**Surface** : `ThemedConversationRow` · `LentilleConversationRow` · clé `accessibility.unread_messages`
**Base** : `main` HEAD `c886b8b5` (après merge de 234i, PR #3251)
**Branche** : `claude/intelligent-noether-z3vjqg` (re-lancée fraîche — la précédente était mergée)

## Pourquoi cette surface

Suite n° 1 déclarée par 234i : « `unit.unread` — forme de défaut identique
(« 1 non lus »), remède désormais disponible ». En instruisant la famille
complète des compteurs de non-lus plutôt que le seul site nommé, un défaut
d'une autre nature — et bien plus grave — est apparu.

Collision essaim vérifiée avant de choisir (`list_pull_requests`) : une seule
PR iOS ouverte, #3250 (`OnboardingAnimations.swift`), **0 fichier commun**.
Numéro : plus haute itération mergée = **234i** ; #3250 tient 233i ; 235i est
strictement au-dessus et libre.

## Le défaut

Les deux rangées de conversation posaient, quand `unreadCount > 0` :

```swift
.accessibilityValue(conversation.userState.unreadCount > 0
    ? String(localized: "accessibility.unread_messages", bundle: .main)
    : "")
```

**Sans `String(format:)`.** Or la valeur du catalogue contient un `%lld` dans
les **7 locales** :

```
fr: "%lld messages non lus"      en: "%lld unread messages"
de: "%lld ungelesene Nachrichten" es: "%lld mensajes no leídos"
it: "%lld messaggi non letti"     pt-BR: "%lld mensagens não lidas"
ar: "%lld رسائل غير مقروءة"
```

Le spécificateur n'était donc **jamais substitué**. VoiceOver énonçait la
chaîne brute — spécificateur compris — sur **chaque rangée non lue de la
liste de conversations**, c'est-à-dire l'écran d'accueil de l'application.

Ce n'est pas un accord grammatical imparfait comme en 231i/232i/234i : c'est
un **artefact de format lu à voix haute**. Un utilisateur VoiceOver entend
« pour cent l l d messages non lus » autant de fois qu'il a de conversations
non lues.

### Le compte, lui, était déjà annoncé — correctement

`conversationAccessibilityLabel` (même fichier, l. 290-291) fait :

```swift
if conversation.userState.unreadCount > 0 {
    parts.append(String(format: String(localized: "accessibility.unread_count", bundle: .main),
                        conversation.userState.unreadCount))
}
```

`accessibility.unread_count` est, elle, une **vraie clé `variations.plural`**
(« 1 message non lu » / « %d messages non lus », 6 formes en AR) et elle est
appelée **avec** `String(format:)`. Le même fichier contenait donc les deux
versions du même geste : l'une juste, l'autre cassée.

La valeur était par conséquent **doublement fautive** : cassée *et* redondante.

### Les deux rangées, pas une

`LentilleConversationRow.accessibilityLabel` (l. 181-185) **dérive** de
`ThemedConversationRow.conversationAccessibilityLabel` :

```swift
let base = ThemedConversationRow(conversation: conversation,
                                 preferredContentLanguages: preferredContentLanguages)
    .conversationAccessibilityLabel
```

Elle héritait donc du compte correct dans son libellé **et** recopiait la
valeur cassée. Le défaut vivait aux deux endroits sous la même forme.

## Le correctif

**La valeur est retirée**, elle n'est pas réparée.

Lui passer son argument (`String(format:…, unreadCount)`) aurait produit une
annonce correcte mais **redondante** : le libellé porte déjà le compte,
pluralisé. VoiceOver lit le libellé PUIS la valeur — l'utilisateur entendrait
deux fois la même information.

Et sur le fond, `accessibilityValue` est réservé à l'**état** d'un contrôle,
pas à une donnée que le nom porte déjà (HIG « Nom, rôle, valeur »). Le compte
appartient au nom, où il est déjà.

`accessibility.unread_messages` devient **morte** → retirée du catalogue,
sinon `test_everyAppCatalogIdentifierKeyIsReferencedInCode` rougirait (même
geste qu'en 230i pour `forward.this-conversation`).

## Vérification

Aucune toolchain Swift sous Linux — le gate est la CI, **avec la suite
réellement exécutée** (`[run test]` au sujet du commit ; cf. la correction de
doctrine consignée en 234i : sans ce mot-clé, le job compile sans exécuter).

- **Suite neuve** (`ConversationRowUnreadAnnouncementTests`, 4 tests) :
  - `test_label_neverLeaksAFormatSpecifier` — **régression du défaut** :
    aucun de `%lld` / `%d` / `%@` / `%1$@` / `%ld` ne doit apparaître dans
    l'annonce, pour 6 effectifs (0, 1, 2, 3, 11, 199) ;
  - `test_label_stillAnnouncesTheUnreadCount` — garde que le retrait de la
    valeur **n'a pas perdu** l'information (elle vient du libellé) ;
  - `test_label_addsTheUnreadSegmentOnlyWhenThereAreUnread` — le segment
    reste conditionnel ;
  - `test_neitherRowCarriesAnUnreadAccessibilityValue` — garde de source sur
    les **deux** fichiers.
- **Assertions indépendantes de la locale** : le simulateur CI tourne en
  anglais, le poste de dev souvent en français, et la clé du compte est
  pluralisée par le catalogue. Comparer une chaîne française rendrait le test
  vert en local et rouge en CI (piège documenté par `PostStatAccessibility`).
  Les assertions portent sur la présence du **nombre** et l'absence de
  **spécificateur** — vraies dans toutes les langues.
- **Piège évité, constaté sur soi-même** : la garde de source cherche la forme
  **citée** `"accessibility.unread_messages"`, pas le nom nu. Les deux fichiers
  de production mentionnent la clé **en prose** (entre accents graves) pour
  expliquer le défaut retiré ; une garde sur le nom nu aurait rougi sur son
  propre commentaire. Vérifié par `grep` : 0 occurrence citée en production.
- **Périmètre des gardes i18n** : `LocalizationConsistencyTests.sourceRoots`
  n'inclut **pas** `apps/ios/MeeshyTests` — les mentions de la clé dans la
  suite neuve ne sont pas scannées ; et l'extracteur ne reconnaît que les
  appels `String(localized:)`, pas une containment de chaîne.
- **Catalogue** : round-trip JSON prouvé **octet pour octet identique AVANT**
  édition (leçon 234i) ; diff = **47 suppressions**, soit exactement l'entrée
  retirée. 3222 clés. `accessibility.unread_count` (la sœur correcte) intacte.
- **Équilibre syntaxique** des 3 fichiers Swift : 0 / 0 / 0.
- **`pbxproj`** : 4 entrées pour la suite neuve, IDs SHA1-dérivés, collision
  vérifiée = 0.

## Bilan

**2 fichiers prod** (−4 lignes de code, +12 de commentaire expliquant le
pourquoi), **1 suite neuve** (4 tests), **1 clé morte retirée**,
**4 entrées pbxproj**.
0 clé i18n neuve · 0 changement visuel · 0 logique · 0 réseau · 0 SDK.

Impact : VoiceOver cesse d'énoncer un spécificateur de format sur l'écran
d'accueil, et cesse de répéter un compte déjà annoncé.

## Suites (236i+)

Le balayage de la famille « non-lus » laisse trois défauts **du même genre que
231i/232i/234i** — le pluriel gravé — sur des clés à plat encore appelées avec
`String(format:)`, donc correctes en apparence mais fausses à N = 1 :

1. **`a11y.notifications.unread_count`** (`RootView:2053`) —
   « %d notifications non lues » : à 1, « 1 notifications non lues » en FR, et
   AR n'a qu'une de ses six formes. Le libellé de la cloche de notifications,
   atteignable à N = 1 de façon triviale.
2. **`conversation.scroll-to-bottom.a11y-unread`**
   (`ConversationView+ScrollIndicators.swift:89`) — « %d messages non lus »,
   même défaut, sur le bouton de retour en bas de conversation.
3. **`MeeshyAppIntents.swift:272`** — `"You have \(unreadCount) unread
   message\(unreadCount == 1 ? "" : "s")"` : chaîne **codée en dur en anglais**,
   jamais localisée, et portant l'idiome `? "s" : ""` proscrit depuis 185i.
   C'est un dialogue Siri : le corriger demande une clé neuve et une décision
   sur la localisation des intents (hors périmètre d'un simple accord).

Les deux clés déjà correctes de la famille — `accessibility.unread_count` et
`a11y.back.with_unread` — sont en `variations.plural` : **ne pas les
re-flagger**, elles montrent la forme à viser pour les trois ci-dessus.

Reste par ailleurs, hérité de 234i : effectif plafonné (« 199+ ») et sa
`substitutions` ; `formatCount()` (`ConversationListHelpers:493`) qui fabrique
« 1.5k » sans formatter de locale ; le tap de ligne VoiceOver du picker de
transfert (simulateur) ; la couronne du transfert jamais auditée.
