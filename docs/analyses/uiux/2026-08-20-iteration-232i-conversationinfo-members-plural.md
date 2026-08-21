# Iteration-232i — `conversation.info.members-count` collait un « s » latin sur toutes les langues

**Date** : 2026-08-20
**Piste** : iOS (suffixe `i`)
**Surface** : `ConversationInfoSheet.membersCountLabel` — helper extrait, catalogue converti en `variations.plural`
**Base** : `main` HEAD `13bedd98` (après merge de 231i, PR #3236 et follow-up #3237/#3240)
**Branche** : `claude/intelligent-noether-kana7q`

## Pourquoi cette surface

232i devait au départ être `unit.members` — le carry-over documenté par 231i.
Après inspection : les 4 sites (`ConversationListHelpers.swift:198,486`,
`GlobalSearchView.swift:520,670`) sont tous **gardés** par `> 2` ou par
« conversation non-directe », ce qui évite mécaniquement le singulier fautif.
Défaut réel mais dispersé et à faible impact.

En parcourant le repo pour d'autres motifs `? "s" : ""` (idiome interdit
par la routine depuis 185i), une occurrence isolée saute aux yeux :

```swift
apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift:489:
Text(String(format: String(localized: "conversation.info.members-count",
                           defaultValue: "%d membre%@", bundle: .main),
            participants.count,
            participants.count > 1 ? "s" : ""))
```

Site unique, en HAUT de la section « Membres » de la fiche conversation —
c'est la PREMIÈRE ligne de la section, lue par VoiceOver dès l'ouverture,
visible sur tout groupe. Le format `"%d membre%@"` colle un `%@` — nourri à
`"s"` ou `""` selon `count > 1`.

Collision essaim vérifiée (`list_pull_requests` : 0 PR iOS ouverte au moment
du choix — seulement 1 Android et 5 dependabot). Aucun test ne référence la
clé. Le fichier `ConversationInfoSheet.swift` a été très travaillé dans le
passé (documenté en tracking historique comme « 52 polices » à auditer) mais
CE défaut spécifique a survécu à toutes les passes.

## Le défaut

`"%d membre%@" + (count > 1 ? "s" : "")` — le « s » latin est collé à la
racine de CHAQUE langue quand `count > 1`. Trois familles de défaut se
cachaient sous une apparence FR/EN correcte :

**1. Italien : « 5 membros » au lieu de « 5 membri ».** Le pluriel italien
est en « -i », pas en « -s » : la coïncidence FR/ES/PT ne joue pas. Un
utilisateur italien voit le mauvais mot dans l'en-tête d'un groupe de 5
personnes.

**2. Allemand : « 5 Mitglieds » au lieu de « 5 Mitglieder ».** Idem : le
pluriel allemand est en « -er », pas en « -s ». « Mitglieds » n'est pas un
mot allemand ; c'est un pseudo-mot.

**3. Arabe : « 5 عضوs » — un caractère LATIN greffé sur l'écriture arabe.**
En plus de la faute visuelle, l'arabe distingue **6 formes plurielles**
(`zero` / `one` / `two` / `few` / `many` / `other`) qu'une chaîne à plat ne
pouvait pas rendre : les cas « un » (singulier), « deux » (duel), « 3–10 »,
« 11–99 » et « ≥100 » étaient tous rendus par la même forme.

Les cas FR/EN/ES/PT-BR sont grammaticalement corrects, mais uniquement par
coïncidence — la règle plurielle française « 1 → singulier, 2 → pluriel »
ne s'applique JAMAIS ici, `count > 1` mordant à la place de `count != 1`.
L'écart ne se manifeste pas pour ces langues car `count == 0` n'atteint pas
le compteur (`participants.count` sur une conversation à membre unique de
soi-même — cas de test à part). Mais la logique est fausse partout.

## Le correctif

Même idiome que 231i, sur la même famille de défaut, avec un site unique et
un catalogue à convertir :

1. **Catalogue** — la clé passe de `stringUnit` (7 locales flat, format
   `"%d membre%@"`) à `variations.plural`. Six locales latines/germaniques
   reçoivent leurs 2 formes canoniques ; l'arabe reçoit les 6 formes,
   modelées sur `message-detail.views.not-seen.count` (participant, déjà
   validé au catalogue).
2. **Site d'appel** — le `String(format:)` inline devient
   `Self.membersCountLabel(participants.count)`, helper pur statique sur
   `ConversationInfoSheet`. Bundle et locale par PAIRE, signature
   `String(format:locale:_:)` pour que la locale du test choisisse
   effectivement la règle plurielle. **Un seul argument** au format
   maintenant (le `count`) — le second (`%@` pour le « s ») disparaît, ce
   qui simplifie la signature et supprime la cause du défaut par
   construction.

Il n'y a pas ici de garde `> 0` autour du compteur : la fiche « Membres »
d'une conversation directe n'est pas ouverte (l'appelant liste seulement
groupes/communautés et les direct-two-parties ne voient pas cette section),
donc le cas « 0 » ne se manifeste pas en pratique. La variation `zero`
reste néanmoins au catalogue AR (« لا أعضاء ») pour cohérence.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**. Contrôles
déterministes :

- **Test neuf** (`ConversationInfoMembersCountLabelTests`, 14 assertions) :
  couvre singulier + pluriel dans les 6 locales latines/germaniques, régresse
  EXPLICITEMENT les défauts IT et DE (« 4 membri », « 5 Mitglieder »), et
  ajoute une garde arabe qui vérifie qu'AUCUNE forme AR ne contient plus le
  « s » latin greffé.
- **Catalogue revalidé** par `json.load` (3224 clés, JSON bien formé, 7 locales
  toutes en `variations.plural` avec les bonnes formes).
- **Pbxproj patché main** pour les 4 sections requises (leçon 230i/231i :
  la CI régénère bien mais le commit sur `main` NE régénère pas ; sans les
  entrées, les runs `xcodebuild` locaux d'autres contributeurs bâtissent
  sans le fichier neuf, verrou vert par omission).
- **Grep** : `conversation.info.members-count` — 1 seul site d'appel avant
  extraction, 0 après (helper uniquement).
- **Équilibre syntaxique** des 2 fichiers Swift au tokenizer : 0/0/0.
- **Non-régression des gardes existantes** : les entrées `variations` sont
  traitées comme sentinelle `<VARIATIONS>` par `test_chaqueTraductionGardeLesMarqueursDeSaSource` —
  l'absence de `%d` dans la forme AR « one » (« عضو واحد ») ne rougit pas ;
  `test_aucuneCléTraduisibleNaDeTrou` satisfait (toutes formes translated) ;
  `test_pluralizedKeysAreRecognizedAsTranslated` a un cas de plus.

## Bilan

**1 fichier prod** (helper pur statique + call site simplifié : `+29 / -1`),
**1 fichier test neuf** (14 assertions), **1 clé convertie flat →
`variations.plural`** (7 locales), **4 entrées pbxproj**.
0 clé i18n neuve · 0 changement visuel FR/EN/ES/PT-BR pour N ≠ 1 ·
0 logique · 0 réseau · 0 SDK.

**Impact visible** :
- Italien : « membros » → « membri » (mot juste)
- Allemand : « Mitglieds » → « Mitglieder » (mot juste)
- Arabe : « عضوs » (Latin greffé) → 6 formes correctes canoniques
- FR/EN/ES/PT-BR : identique pour N ≥ 2 ; correct pour N = 1 (mais N = 1 n'est jamais atteint en pratique)

## Suites (233i+)

1. **Tap de LIGNE VoiceOver du picker de transfert** — carry-over 230i/231i
   toujours vrai sur la nouvelle géométrie, demande simulateur.
2. **`unit.members` dispersé** (`ConversationListHelpers`, `GlobalSearchView`)
   — la garde `> 2` évite le singulier fautif mais l'accord IT/DE/AR reste
   incorrect pour les groupes exactement à 3. Portée à définir : quatre
   sites, quatre helpers ou un helper partagé + rechâblage — mérite son
   itération dédiée.
3. **`ConversationInfoSheet` reste vaste** — jamais audité en profondeur
   par la routine (documenté en héritage comme « 52 polices »). Balayer
   surface par surface : les glyphes chrome, les cartes d'info, les
   sections « Épinglés / Traduction ».
4. **Frères du forward crown jamais audités** : `MessageMoreSheet` (504 l.),
   `MessageForwardService`, `MessageForwardDetailView`,
   `ForwardPickerViewModel`, `ForwardTarget`, `ForwardPickerModel`.
