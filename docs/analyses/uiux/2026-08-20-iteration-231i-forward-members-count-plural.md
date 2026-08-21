# Iteration-231i — `forward.members-count` gravait sa règle plurielle : « • 1 membres »

**Date** : 2026-08-20
**Piste** : iOS (suffixe `i`)
**Surface** : `ForwardPickerRow.membersCountLabel` — helper extrait, catalogue converti en `variations.plural`
**Base** : `main` HEAD `65af14d5` (après merge de 230i, PR #3223)
**Branche** : `claude/intelligent-noether-kana7q`

## Pourquoi cette surface

Carry-over déclaré par la note de 230i, ré-instruit après le merge : la clé
survit intacte à la restructuration du picker (Volet A.8, `dcfb4ec3`) —
`ForwardPickerRow` est toujours la rangée, `memberCount: Int` toujours sa
propriété, l'appel toujours au même endroit. Collision essaim vérifiée
(`list_pull_requests` : 0 PR iOS ouverte — seulement 5 dependabot).

## Le défaut

```swift
if memberCount > 0 {
    Text(String(format: String(localized: "forward.members-count",
                               defaultValue: "\u{2022} %d membres",
                               bundle: .main), memberCount))
```

La règle plurielle française — « 1 membre » (singulier) vs « 3 membres »
(pluriel) — est **gravée dans la chaîne du catalogue** :

```
fr: "• %d membres"
en: "• %d members"
de: "• %d Mitglieder"
es: "• %d miembros"
it: "• %d membri"
pt-BR: "• %d membros"
ar: "• %d أعضاء"
```

Trois conséquences distinctes :

1. **Français / espagnol / italien : accord faux pour N = 1.** Les trois
   rangent l'unité dans le **singulier**. Une conversation à un seul
   participant lit « • 1 membres », « • 1 miembros », « • 1 membri ». Un
   `memberCount > 0` protège seulement du zéro : le singulier reste défaut de
   rendu.

2. **Allemand : accord faux pour N = 1.** « Mitglieder » est le pluriel
   ; le singulier est « Mitglied ». « • 1 Mitglieder » est incorrect.

3. **Arabe : rendu impossible à corriger par une chaîne à plat.** L'arabe
   distingue **6 formes plurielles** (zero / one / two / few / many / other) ;
   `"• %d أعضاء"` n'en couvre qu'une seule. Les cas « un membre »
   (singulier), « deux membres » (duel), « 3–10 » (petit pluriel), « 11–99 »
   et « ≥100 » sont tous rendus par la même forme, généralement grammaticalement
   incorrecte pour au moins quatre d'entre eux.

Le libellé est le plus **répété** de l'écran : la rangée du picker est un
`accessibilityElement(children: .combine)`, donc VoiceOver le lit sur chaque
ligne du groupe. Un utilisateur AR entend la faute autant de fois qu'il y a
de conversations dans la liste.

## Le correctif

Un site unique dans le code, un défaut au catalogue : on corrige au
catalogue et on retire la règle plurielle du site d'appel.

1. **Catalogue** — la clé passe de `stringUnit` à `variations.plural` dans
   les 7 locales. FR / EN / ES / IT / DE / PT-BR reçoivent leurs deux formes
   naturelles ; AR reçoit les **six** formes (idiome documenté par les 12
   autres entrées `variations.plural` du catalogue, dont
   `message-detail.views.not-seen.count` qui est structurellement identique —
   compteur de personnes précédé d'un %d).

2. **Site d'appel** — le `String(format: String(localized: …), memberCount)`
   inline devient `Self.membersCountLabel(memberCount)`, helper pur statique
   sur `ForwardPickerRow`. C'est l'**idiome `PostStatAccessibility`**
   ratifié par 5 tests unitaires depuis 2026 : `bundle` et `locale` en
   paramètres pour la testabilité, `bundle` par défaut `.main`, `locale`
   par défaut `.current`. La signature `String(format:locale:_:)` (plutôt
   que `String(format:_:)`) est ce qui laisse la locale du test choisir la
   règle plurielle — sans elle, un simulateur français rendait « 1 like » là
   où le test attendait « 1 j'aime ».

3. **`memberCount > 0`** — conservé au site d'appel. On veut « rien » pour
   0, pas « • 0 membre », qui serait un bruit visuel gratuit. La variation
   `zero` reste au catalogue pour AR (où « aucun membre » a une forme
   grammaticale propre) : elle ne sera atteinte que si un jour un
   `memberCount > 0` disparaît, auquel cas AR sera correctement servi par
   défaut.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**. Contrôles
déterministes :

- **Catalogue** revalidé par `json.load` (3224 clés, JSON bien formé, 7 locales
  toutes en `variations.plural`, avec les bonnes formes par locale).
- **Test neuf** (`ForwardPickerMembersCountLabelTests`, 11 tests) : couvre le
  singulier ET le pluriel dans les 6 locales latines / germanique, régresse
  explicitement le défaut FR par `XCTAssertEqual(try label(1, in: "fr"), "• 1 membre")`
  (le défaut original produisait « • 1 membres »), assertion globale
  « singulier ≠ pluriel dans TOUTES les locales » comme garde de la
  `variations.plural` elle-même.
- **`pbxproj` mis à jour** : le test neuf est ajouté aux 4 sections
  (`PBXBuildFile`, `PBXFileReference`, group children « Components/ »,
  MeeshyTests sources phase) — leçon apprise de 230i, où le follow-up
  `65af14d5` a dû patcher la main manuellement parce que la CI régénère
  bien le pbxproj mais le commit sur `main` NE le régénère pas, laissant les
  runs xcodebuild locaux d'autres contributeurs bâtir sans mes fichiers.
- **`ForwardPickerRow`** reste `Equatable` — le helper est static, ne touche
  pas les propriétés stockées ni le `==`.
- **Grep** : `forward.members-count` — 1 seul site d'appel avant, 0 après
  extraction (uniquement dans le helper lui-même).
- **Absence de régression sur les gardes existantes** :
  `test_chaqueTraductionGardeLesMarqueursDeSaSource` ignore les entrées à
  `variations` (sentinelle `<VARIATIONS>`) donc l'absence de `%d` dans la
  forme AR « one » (« • عضو واحد ») ne rougit pas ;
  `test_aucuneCléTraduisibleNaDeTrou` est satisfait — toutes les formes ont
  `state: translated` et une valeur non-vide ;
  `test_pluralizedKeysAreRecognizedAsTranslated` a un cas de plus (7 formes
  AR + 2 formes pour les 6 autres locales, toutes translated).

## Bilan

**1 fichier prod** (helper statique + call site : +32 lignes / -1),
**1 fichier test neuf** (11 assertions), **1 clé catalogue convertie**
(flat → `variations.plural` en 7 locales), **4 entrées pbxproj**.
0 clé i18n neuve · 0 changement visuel pour N ≥ 2 · 0 logique · 0 réseau · 0 SDK.

Impact visible : « • 1 membres » → « • 1 membre » dans le picker, en FR/ES/IT/DE, plus 4 formes AR correctes désormais atteignables.

## Suites (232i+)

Les frères jamais audités du même lot d'août 2026 restent ouverts :

1. **Le tap de LIGNE du picker n'est pas exposé à VoiceOver** — carry-over
   ré-instruit de 230i, toujours vrai sur la nouvelle géométrie
   `.contentShape` + `.onTapGesture` (l'avatar `MeeshyAvatar` porte son
   `onMoodTap` ; un `Button` englobant l'engloutirait). Demande simulateur
   pour arbitrer.
2. **`MessageMoreSheet` (504 l.), `ForwardPickerModel`, `MessageActionResolver`,
   `MessageForwardService`, `MessageForwardDetailView`, `ForwardPickerViewModel`,
   `ForwardTarget`** — toute la couronne restructurée par Volet A.8, jamais
   auditée par la routine.
3. **Autres compteurs de personnes graveurs de pluriel** — grep
   `\\(.*count.*membre\\|member\\|personne\\|people` : `ParticipantsView.swift:229`
   utilise déjà `_singular`/`_plural` séparés (moins idéal que
   `variations.plural` mais fonctionnel) ; `ConversationListHelpers.swift:198,486`
   et `GlobalSearchView.swift:520,670` concatènent l'unité — même famille
   de défaut mais dispersée.
