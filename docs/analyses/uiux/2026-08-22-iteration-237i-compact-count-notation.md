# Iteration-237i — l'abrégé « 1.5k » gravait le format anglais dans toutes les langues

**Date** : 2026-08-22
**Piste** : iOS (suffixe `i`)
**Surface** : `formatCount` (`ConversationListHelpers.swift`) → `CompactCountLabel`
**Base** : `main` HEAD `2bfaebf5` (après merge de 236i)
**Branche** : `claude/intelligent-noether-kana7q`

## Pourquoi cette surface

Carry-over **(b) du pointeur 236i**, lui-même hérité de 234i où il n'avait
jamais été traité. Le pointeur le classe deuxième par valeur, derrière
`MeeshyAppIntents.swift:272` — que j'écarte **pour la raison que le pointeur
donne lui-même** : `IntentDialog` se compose depuis `LocalizedStringResource`,
pas depuis `String(localized:)`, donc la conversion demande un compilateur pour
être vérifiée. 235i puis 236i l'ont laissée pour ce motif ; je ne vais pas la
forcer en aveugle depuis un conteneur Linux. `formatCount` n'a pas cette
contrainte : le remède est une API Foundation dont le contrat est stable et
dont les propriétés se testent sans deviner de chaîne exacte.

Vérifications préalables : **0 PR iOS ouverte** (#3326 Android, #3325 gateway).
Et — parce que 236i a payé cher la leçon inverse — j'ai vérifié que **mon 233i
a bien atterri en entier** sur `main` : les deux modifiers de production
(l. 587-588), le `static var` (l. 529), le fichier de test, et ses **4** entrées
`pbxproj`. Le pointeur 236i indiquait #3250 « reste ouverte » ; elle a mergé
depuis, et rien n'a été perdu au passage.

## Le défaut

```swift
private func formatCount(_ count: Int) -> String {
    if count >= 1000000 {
        return String(format: "%.1fM", Double(count) / 1000000.0)
    } else if count >= 1000 {
        return String(format: "%.1fk", Double(count) / 1000.0)
    }
    return "\(count)"
}
```

Deux appels : l'effectif et le nombre de conversations d'une **carte
« communauté »**, sur la liste de conversations.

`String(format:)` appelé **sans locale** ne localise rien — il formate selon la
locale POSIX. D'où deux ruptures, sur toutes les langues sauf l'anglais :

**1. Le séparateur décimal était toujours le point.** Le français écrit
« 1,5 k » : la virgule y est le séparateur décimal, et le point le séparateur
de **milliers**. « 1.5k » n'est donc pas seulement inhabituel en français — il
se lit comme un autre nombre. Même rupture en espagnol, italien, allemand et
portugais, qui emploient tous la virgule décimale. Cinq des sept locales
livrées étaient touchées.

**2. Le suffixe latin était gravé.** « k » et « M » sont des abréviations
latines. L'arabe abrège par « ألف » et « مليون » ; « 1.5k » y mêle deux
systèmes d'écriture dans un seul nombre.

À quoi s'ajoute un défaut de forme que le fait maison rendait inévitable :
`"%.1f"` **impose une décimale**, donc exactement 1000 s'affichait « 1.0k » —
une décimale nulle que personne n'écrit à la main.

## Le correctif

```swift
IntegerFormatStyle<Int>(locale: locale)
    .notation(.compactName)
    .format(count)
```

`.notation(.compactName)` rend **les deux** — séparateur et abréviation — depuis les
données CLDR de la locale, et c'est Foundation qui décide de la précision. Le
helper est extrait en `CompactCountLabel`, jumeau de `MembersCountLabel` (234i)
et `UnreadCountLabel` (236i), au même endroit et selon le même idiome : un
`enum` sans état, une fonction statique, la locale en **paramètre** plutôt qu'en
dur — sans quoi une suite jugerait la locale du simulateur, verte en local et
rouge en CI. Il n'y a pas de `bundle` ici, contrairement à ses deux frères :
aucune chaîne du catalogue n'entre dans le rendu, tout vient de CLDR.

Le `private func` disparaît : il n'était pas testable depuis le bundle de tests,
ce qui explique qu'un défaut aussi mécanique ait survécu à 234i et 236i.

## Changement visuel — assumé, et à ne pas sous-déclarer

Contrairement aux trois itérations précédentes, celle-ci **change ce qui
s'affiche**, y compris en anglais. C'est l'objet même du correctif :

| Valeur | Avant (toutes locales) | Après (en) | Après (fr) |
|---|---|---|---|
| 1 000 | `1.0k` | `1K` | `1 k` |
| 1 500 | `1.5k` | `1.5K` | `1,5 k` |
| 1 500 000 | `1.5M` | `1.5M` | `1,5 M` |
| 999 | `999` | `999` | `999` |

La casse du « K » anglais et la disparition de la décimale nulle viennent de
CLDR, pas d'un choix que je pose. Sous le millier, rien ne bouge nulle part.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**.

Le point délicat est **ce que le test a le droit d'affirmer**. Les chaînes
exactes rendues par CLDR appartiennent à Foundation et peuvent évoluer d'une
version d'iOS à l'autre : les figer produirait une suite qui rougit sur une mise
à jour d'OS sans qu'aucun défaut n'existe. La suite vérifie donc les
**propriétés** qui constituaient le défaut, et que l'ancien code violait toutes :

| Propriété testée | Ancien code | Attendu |
|---|---|---|
| le rendu dépend de la locale | non — identique partout | **oui** |
| virgule décimale en français | non — « 1.5k » | **oui** |
| aucun suffixe latin en arabe | non — « 1.5k » | **oui** |
| magnitudes distinctes | oui | oui |
| sous 1000, rendu inchangé | oui | oui |
| sous 1000, locales identiques | oui | oui |

La **première ligne est LA régression** : l'invariance à la locale *était* le
bug, donc la variance en est la preuve. `text(1500, fr) != text(1500, en)` aurait
échoué avant ce correctif et passe après — sans nommer une seule chaîne CLDR.

Contrôles déterministes complémentaires :

- **Équilibre syntaxique** des 3 fichiers Swift au tokenizer : 0 / 0 / 0.
- **`formatCount` n'a plus aucune occurrence vivante** — vérifié par
  `grep -rn --include=*.swift .` sur le **dépôt entier** cette fois (voir la
  section « Revue de merge » : la première vérification ne portait que sur
  `apps/ios`, ce qui a laissé passer le jumeau SDK).
- **8 entrées `pbxproj`** (4 pour le helper, 4 pour la suite) — sans elles, la
  suite serait *verte par omission* en local.
- Le retrait du `private func` ne laisse ni accolade orpheline ni ligne vide
  parasite (vérifié à la lecture, l. 488-494).

## Correction après CI rouge

La première rédaction du correctif n'a pas compilé, et il faut le dire :

```swift
count.formatted(.number.notation(.compact).locale(locale))   // ✗ deux erreurs
```

- `type 'BinaryInteger' has no member 'number'` — `.number` est un membre
  statique porté par une extension conditionnelle de `FormatStyle` ; à travers
  la surcharge générique `BinaryInteger.formatted(_:)` il n'a **aucune base à
  inférer**.
- `cannot infer contextual base in reference to member 'compact'` — plus
  simplement : **`.compact` n'existe pas**.
  `NumberFormatStyleConfiguration.Notation` n'offre que `.automatic`,
  `.scientific` et `.compactName`.

Les deux défauts sont **indépendants**, et le second message se lit volontiers
comme une conséquence du premier : n'en corriger qu'un aurait produit un second
rouge. La forme retenue — style **nommé et construit**, puis `format(_:)` — ne
demande aucune inférence : elle compile, ou elle ne trouve pas le symbole, et
dans ce cas l'erreur nomme le symbole.

J'avais vérifié que la notation compacte existait depuis iOS 15 et que le
plancher du projet était iOS 16 : la *disponibilité*, donc, mais pas
l'*orthographe* des cas de l'enum. Leçon consignée dans `tasks/lessons.md`.

**Ce qui n'a PAS eu à changer : la suite de tests.** Elle n'affirmait ni chaîne
CLDR ni forme d'appel — seulement que le rendu français diffère du rendu
anglais. Un test écrit sur le contrat survit à la correction de
l'implémentation.

## Revue de merge — trois constats, et ce qu'ils ont corrigé

La revue de merge (jcnm) a bloqué la PR sur trois points. Les trois étaient
justes ; deux étaient miens.

**1. Ne compilait pas.** Déjà corrigé au moment de la revue (voir la section
précédente) — la revue portait sur la tête antérieure.

**2. Correctif incomplet — et c'est le constat qui compte.** Le même
`formatCount`, copie mot pour mot, vivait aussi dans
`packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityListView.swift:314`
(`VibrantCommunityCard`, atteinte via `RootView` et `iPadRootView+Panels`).
Merger l'app seule aurait rendu **les deux cartes communauté incohérentes** :
« 1,5 k » d'un côté, « 1.5k » de l'autre.

J'avais écrit « `grep` sur le dépôt entier ». Le grep n'avait porté que sur
`apps/ios`. C'est **exactement la leçon 236i** — « un grep de fermeture part de
la CLÉ, jamais de la SURFACE » — que cette analyse citait, dans la même
itération où elle la violait.

**Correction retenue, et pourquoi elle diffère de celle proposée.** La revue
suggérait de *porter l'appel* dans le fichier SDK. Cela aurait résolu
l'incohérence en **dupliquant la règle** dans deux modules — précisément ce que
234i et 236i ont passé deux itérations à défaire. Le helper est donc **déplacé**
dans `MeeshyUI/Theme/`, `public` et `nonisolated` : c'est un moteur de règle
sans état à paramètres opaques, la case « rule engines stateless → SDK » du
tableau de placement de `packages/MeeshySDK/CLAUDE.md`. Il n'orchestre rien, ne
lit aucun singleton, ne décide d'aucune règle produit — il formate un entier.
L'app le consomme via `import MeeshyUI`, qu'elle importait déjà : **aucun site
d'appel n'a changé**. Effet de bord heureux : le `pbxproj` redevient
**identique à `main`** (les deux fichiers vivent désormais dans le package SPM),
et la suite passe en **phase 0**, qui fait partie du gate depuis 2026-07-30.

**3. Pointeur faux.** Le bloc 237i affirmait « seule occurrence résiduelle = un
doc-comment ». Faux, et la consigne « ne plus re-flagger » aurait **enterré le
jumeau** pour 238i+. Corrigé, et la leçon consignée.

### Ce que le grep refait a réellement trouvé

Six sites de plus portent le même `%.1fk` / `%.1fM` : `FeedPostCard:105-106`,
`PostDetailReachAndVisibility:15-16`, `ReelFeedCard:444-445`,
`ReelsPlayerView:1323-1324`, `ConversationDashboardView:1149-1150 / 1175-1177`.

Je ne les traite **pas** ici, et pas par prudence de façade : ils ne sont pas
byte-identiques. Le tableau de bord bascule à `>= 10_000` là où le feed bascule
à `>= 1_000` — consolider demande donc de trancher si ce seuil est
**intentionnel**, ce qui est une décision produit, pas une substitution
mécanique. Élargir la PR de cinq fichiers et d'autant de nombres visibles pour
la trancher en passant serait le mauvais arbitrage. `CompactCountLabel` est en
place pour les recevoir en 238i.

## Bilan

**2 fichiers prod modifiés** (app + SDK : les deux helpers maison
disparaissent, −16 lignes), **1 fichier prod neuf** (`CompactCountLabel`, dans
`MeeshyUI/Theme/`), **1 suite neuve** (7 tests, phase 0 `MeeshyUITests`),
**`pbxproj` identique à `main`** — les deux fichiers neufs vivent dans le
package SPM, donc aucune entrée à ajouter.
0 clé i18n neuve · 0 logique · 0 réseau · 0 SDK · **changement visuel assumé et
tabulé ci-dessus**.

## Suites (238i+)

Reprise du pointeur 236i, moins ce qui est soldé ici :

1. **`MeeshyAppIntents.swift:272`** — dernière occurrence de l'idiome
   `? "s" : ""` proscrit depuis 185i, et seule hors SwiftUI. **Demande un
   compilateur** : `IntentDialog` se compose depuis `LocalizedStringResource`.
   Deux chaînes anglaises codées en dur ⇒ 1 à 2 clés neuves + une décision sur
   la localisation des intents.
2. **La forme `one` de `accessibility.unread_count`** grave son « 1 » alors que
   la règle CLDR française range **0 ET 1** dans `one` — inatteignable derrière
   les gardes `> 0`.
3. **Relecture native des 6 formes arabes** posées en 231i/232i/236i.
4. **Effectif plafonné « 199+ »** et sa `substitutions` (carry-over 234i,
   simulateur).
5. **Tap de ligne VoiceOver du picker de transfert** — carry-over 230i→236i,
   simulateur.
6. **`InteractiveProgressBar`** (carry-over 233i) — 8 boutons au label vide,
   position portée par la seule couleur, cibles de 5–8 pt contre 44 pt HIG.
   Simulateur + arbitrage (pas de nom d'étape court dans `RegistrationStep`).
7. **Frères jamais audités du lot « transfert »** : `MessageMoreSheet` (504 l.),
   `MessageForwardService`, `MessageForwardDetailView`, `ForwardPickerViewModel`.
