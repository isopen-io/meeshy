# Iteration-234i — Un seul compteur de membres : 3 clés, 2 helpers jumeaux et 4 concaténations pour un libellé

**Date** : 2026-08-21
**Piste** : iOS (suffixe `i`)
**Surface** : `MembersCountLabel` (neuf) · `ForwardPickerSheet` · `ConversationInfoSheet` · `ConversationListHelpers` · `GlobalSearchView`
**Base** : `main` HEAD `3e64afaa` (après merge de 232i, PR #3241)
**Branche** : `claude/intelligent-noether-z3vjqg`

## Pourquoi cette surface

Suite n° 1 déclarée par 232i, ré-instruite après son merge. Les deux itérations
précédentes ont corrigé **le même défaut deux fois**, chacune sur sa clé :

- **231i** — `forward.members-count` gravait son pluriel (« • 1 membres »).
- **232i** — `conversation.info.members-count` collait un « s » latin (« 5 Mitglieds »).

Le correctif était juste les deux fois ; le **problème sous-jacent** ne l'était
pas : rien n'empêchait la troisième occurrence. Elle existait déjà — quatre
sites concaténaient `"\(count) " + unit.members` sans que ni 231i ni 232i ne
les touche, puisque chacune ne voyait que sa propre clé.

Collision essaim vérifiée avant de choisir la surface (`list_pull_requests`) :
0 PR iOS ouverte après le merge de #3241.

## L'inventaire

Six surfaces rendaient « N membres » par **trois mécanismes** :

| Site | Mécanisme | État |
|---|---|---|
| `ForwardPickerRow` | helper + `forward.members-count` | pluriel OK (231i), **puce gravée** |
| `ConversationInfoSheet` | helper + `conversation.info.members-count` | pluriel OK (232i), **doublon du précédent** |
| `ConversationListHelpers:198` (carte de conversation) | `memberCountDisplay + " " + unit.members` | **« 1 membres »** |
| `ConversationListHelpers:486` (libellé a11y communauté) | `"\(count) " + unit.members` | **« 1 membres »**, aucune garde |
| `GlobalSearchView:520` (résultat visible) | `"\(count) " + unit.members`, gardé `> 2` | AR faux dès N ≥ 11 |
| `GlobalSearchView:664` (libellé a11y résultat) | idem | idem |

Trois défauts distincts s'y cachaient.

### 1. La concaténation ne peut pas accorder

`"\(count) " + « membres »` colle un nombre à un **nom déjà au pluriel**. Pour
N = 1 les cinq locales latines/germaniques rendent une faute d'accord —
« 1 membres », « 1 miembros », « 1 membri », « 1 Mitglieder », « 1 membros ».

Les deux sites de `GlobalSearchView` sont gardés par `memberCount > 2` : la
faute y est **hors d'atteinte par accident**, pas corrigée. Les deux sites de
`ConversationListHelpers` n'ont pas cette garde — la carte de conversation
affiche un groupe d'un seul membre, et la carte de communauté annonce à
VoiceOver « 1 membres » pour une communauté naissante.

### 2. L'arabe n'a jamais eu qu'une forme sur six

`unit.members` vaut `أعضاء` — la forme `few` (3–10). L'arabe en distingue
**six** (`zero`/`one`/`two`/`few`/`many`/`other`). Concaténée, cette unique
forme sert tous les N : elle est grammaticalement fausse pour le singulier, le
duel, la plage 11–99 (`عضوًا`) et ≥ 100 (`عضو`). La garde `> 2` des deux sites
de recherche ne protège de rien ici — elle laisse passer 11 et au-delà.

### 3. La puce « • » vivait dans la mémoire de traduction

`forward.members-count` portait le séparateur dans ses **13 formes localisées**
(2 formes × 6 locales latines + 6 formes arabes) : `"• %d membres"`,
`"• عضو واحد"`, … Trois conséquences :

- un **glyphe de mise en page** que chaque traducteur devait reproduire à
  l'identique, sans qu'aucun test ne le vérifie ;
- la clé ne pouvait **pas servir** aux cinq autres surfaces, qui n'ont pas de
  puce — c'est la raison mécanique de l'existence du doublon de 232i ;
- la rangée du picker est un `accessibilityElement(children: .combine)` : le
  séparateur, étant DANS le texte, entre dans le libellé combiné que VoiceOver
  lit sur chaque ligne.

## Le correctif

Une seule règle, un seul site, une seule clé.

1. **`MembersCountLabel`** (neuf, `Features/Main/Components/`) — namespace `enum`
   sur le motif `PostStatAccessibility` : `text(_:capped:bundle:locale:)`.
   `bundle` et `locale` restent par PAIRE (le bundle choisit la table, le locale
   la règle plurielle).

2. **Catalogue : 3 clés → 2.** `conversation.info.members-count` est renommée
   `conversation.members-count` — le nom cesse de mentir sur sa portée, et ses
   `variations.plural` (7 locales, 6 formes en AR) sont conservées telles
   quelles. `forward.members-count` est **supprimée** : sa seule différence
   était la puce, désormais rendue par la vue. `unit.members` survit pour le
   seul cas plafonné (ci-dessous).

3. **La puce redevient de la mise en page.** `ForwardPickerRow` rend
   `Text(verbatim: "•").accessibilityHidden(true)` entre les deux libellés —
   doctrine 223i. VoiceOver lit « Groupe, 3 membres » sans intercaler le nom du
   glyphe, et la police/couleur communes sont hissées sur le `HStack` au lieu
   d'être répétées sur chaque `Text` (3 modificateurs retirés).

4. **Les quatre concaténations** appellent le helper. Les gardes produit
   existantes sont conservées : `memberCount > 2` sur les deux sites de
   recherche (ne pas afficher l'effectif d'une conversation directe) et
   `type != .direct` sur la carte.

### L'effectif plafonné — la seule concaténation qui survit, et pourquoi

Quand le serveur plafonne l'effectif pour ce lecteur, l'affichage est
« 199+ » : le `+` est un **suffixe du NOMBRE**. Aucun `%d` ne peut le porter, et
la forme correcte demanderait une `substitutions` au catalogue — un mécanisme
différent, non vérifiable sans toolchain Swift. Cette branche retombe donc sur
`unit.members` (nom au pluriel nu), ce qui reste juste puisqu'un plafond n'est
jamais atteint sous 2. Elle est **dans le helper**, à un seul endroit et
documentée, plutôt que dispersée dans les vues. Nommée en suites.

## Vérification

### ⚠️ Le vert d'une PR iOS n'exécute AUCUN test par défaut

Constat fait en surveillant cette PR, et il invalide une phrase répétée par les
pointeurs 230i à 232i (« Gate = CI iOS Tests ») :

`.github/workflows/ios.yml` résout d'abord la **portée du run** (job « Portée du
run »). Sur un event `pull_request`, l'exécution de la suite est un **opt-in par
mot-clé dans le SUJET du commit de tête** — `smoke test`, `run test` ou
`to test`, insensible à la casse. Sans mot-clé, le job se limite à
`build-for-testing` : il compile l'app **et les cibles de test**, puis saute
`test-without-building`.

Le workflow le dit lui-même dans le nom du check, et c'est le seul indice visible
dans l'interface de la PR :

| Nom du check | Ce qui a réellement tourné |
|---|---|
| `Build app (app + cibles de test)` | **compilation seule** |
| `Build app + tests unitaires` | compilation **+ suite exécutée** |

Le premier run de cette PR portait le **premier** nom. Aucune des 19 assertions
n'avait été exécutée — seulement compilée. Sur `main`, en revanche, `run_tests`
est forcé à `true` : la suite tourne **après** le merge. Une garde i18n cassée
ne rougit donc pas la PR, elle rougit `main`.

C'est disqualifiant pour cette itération en particulier. Son livrable EST un jeu
d'assertions sur un mécanisme non exécutable sous Linux (`variations.plural` +
`String(format:locale:)`), et le renommage de clé touche trois cliquets qui ne
s'évaluent qu'en phase de test : `test_everyAppCatalogIdentifierKeyIsReferencedInCode`,
`test_pluralizedKeysAreRecognizedAsTranslated`, `FrenchDefaultValueRatchetTests`.
Merger sur un vert de compilation aurait déplacé le risque sur `main`.

`workflow_dispatch` force la suite mais l'API le refuse depuis cet environnement
(`403 Resource not accessible by integration`). Le mot-clé du sujet est donc la
seule voie : le commit a été amendé en `[run test]` et re-poussé.

**Le mot-clé n'a pas vocation à atteindre `main`** — aucun des 200 derniers
commits de la ligne principale n'en porte. Il vit sur la branche de travail ; le
titre du squash-merge l'omet.

### Contrôles déterministes exécutés localement

Aucune toolchain Swift sous Linux :

- **Catalogue** : round-trip JSON prouvé **octet pour octet identique** avant
  édition (`json.dumps(indent=2, ensure_ascii=False)` + `\n` final) — la
  première tentative, avec `separators=(',', ' : ')`, produisait un diff de
  99 000 lignes ; le diff publié est de **155 insertions / 310 suppressions**,
  soit exactement les 2 clés touchées. 3223 clés, JSON bien formé, la clé
  survivante porte ses 7 locales en `variations.plural`.
- **Grep de fermeture** : 0 référence résiduelle à `unit.members` hors du
  helper, 0 à `membersCountLabel`, 0 aux deux clés supprimées. Les 6 sites
  appellent `MembersCountLabel.text`.
- **Suite consolidée** (`MembersCountLabelTests`, 19 tests) : absorbe
  **intégralement** les régressions des deux suites qu'elle remplace (FR/EN/ES/
  IT/DE/PT singulier + pluriel, IT « 4 membri », DE « 5 Mitglieder », AR sans
  « s » latin, singulier ≠ pluriel dans toutes les locales latines) et ajoute
  les deux défauts soldés ici : `test_label_carriesNoSeparatorGlyph` (7 locales
  × 3 effectifs) et les 3 tests de la branche plafonnée.
- **Non-régression des gardes i18n** : `test_everyAppCatalogIdentifierKeyIsReferencedInCode`
  — la clé supprimée n'a plus aucune référence, la clé renommée en a une ;
  `test_pluralizedKeysAreRecognizedAsTranslated` — une entrée de moins, aucune
  nouvelle forme non traduite ; `FrenchDefaultValueRatchetTests` — aucune des
  clés touchées ne figure dans `FrenchDefaultValueDebt.json`, et la clé neuve
  a une entrée complète donc n'y entre pas. Le doc-comment du helper a été
  reformulé pour ne PAS contenir de `String(localized:` littéral, qu'un
  scanner de source lirait comme un appel réel.
- **`ForwardPickerRow` reste `Equatable`** : le helper est un namespace externe,
  aucune propriété stockée ni le `==` ne bougent — le portillon `.equatable()`
  reste aussi fin.
- **Équilibre syntaxique** des 6 fichiers Swift : 0/0/0 accolades / parenthèses
  / crochets.
- **`pbxproj`** : 2 fichiers retirés (4 entrées chacun), 2 ajoutés (4 entrées
  chacun), IDs SHA1-dérivés du nom, collision vérifiée = 0.

## Bilan

**5 fichiers prod modifiés + 1 neuf**, **2 suites de test fusionnées en 1**
(19 assertions, toutes les régressions antérieures conservées),
**1 clé catalogue supprimée + 1 renommée**, **8 entrées pbxproj**.
0 clé i18n neuve · 0 logique · 0 réseau · 0 SDK · 0 changement de layout hors
la puce du picker (qui gagne l'écart de 4 pt du `HStack` de part et d'autre).

Impact visible : « 1 membres » → « 1 membre » sur la carte de conversation et
le libellé a11y de communauté (FR/ES/IT/DE/PT-BR), formes arabes correctes sur
les 6 surfaces, et la puce du picker cesse d'entrer dans le libellé VoiceOver.

Impact structurel : le prochain compteur de membres ne peut plus naître avec sa
propre règle plurielle — il n'y a plus qu'un endroit où l'écrire.

## Suites (235i+)

1. **L'effectif plafonné mérite sa `substitutions`** — « 199+ » est le seul
   compteur qui ne passe pas par `%d`. Le catalogue sait exprimer une variation
   plurielle pilotée par un argument et rendue par un autre ; le poser demande
   une vérification en simulateur, hors de portée d'une itération sans
   toolchain.
2. **Les autres unités concaténées** — `unit.unread` (`GlobalSearchView:664`)
   a exactement la même forme de défaut (« 1 non lus ») et le même remède
   désormais disponible. `formatCount()` (`ConversationListHelpers:493`)
   fabrique « 1.5k » sans passer par un formatter de locale.
3. **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i/231i/232i,
   toujours ouvert, demande un simulateur pour arbitrer (l'avatar porte son
   propre `onMoodTap` qu'un `Button` englobant supprimerait).
4. **Frères jamais audités du lot « transfert » d'août 2026** : `MessageMoreSheet`
   (504 l.), `MessageForwardService`, `MessageForwardDetailView`,
   `ForwardPickerViewModel`, `ForwardTarget`, `ForwardPickerModel`.
5. **Reste de `ConversationInfoSheet`** — documenté « 52 polices » en héritage,
   à traiter surface par surface.
