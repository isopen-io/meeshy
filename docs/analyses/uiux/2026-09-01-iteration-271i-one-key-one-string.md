# Iteration-271i — Une clé promettait cinq chaînes, et personne ne comparait deux sites

**Date** : 2026-09-01 · **Piste** : iOS (suffixe `i`)
**Surface** : `defaultValue` inline · invariant « une clé, une chaîne »
**Base** : `main` HEAD `8dd1aa26` · **Issue** : #4651
**Précédent direct** : 270i (#4364) — la carte des catalogues par cible, et son suivi nommé :
les `defaultValue` écrits en ANGLAIS dans un catalogue de langue source française

---

## 1. Ce qui a été cherché, et ce qui a été trouvé à la place

270i lègue un suivi précis : « les littéraux `defaultValue` écrits en **anglais**
dans un catalogue dont la langue source est le français — `security.verify.*`,
`comments.*.a11yLabel`, `bubble.meta.ephemeral.a11y` — s'affichent en anglais
pour les **sept** locales, francophone comprise. »

L'itération commence par REMESURER cette famille plutôt que la reprendre. Sur les
81 clés du cliquet, **douze** portent un défaut anglais. Mais en lisant les douze,
une ligne ne ressemble pas aux autres :

```
feed.media.item   default=['Media 1 of \(count)', 'Media 2 of \(count)',
                            'Media 3 of \(count)', 'Media 4 of \(count)',
                            'Media 5 of \(count)']
```

**Cinq `defaultValue` pour UNE clé.** Ce n'est plus un problème de langue.

---

## 2. Défaut 1 — le piège : une clé qui ne peut pas être traduite

`FeedPostCard+Media.swift` dispose les médias d'un post en cinq grilles (1, 2, 3,
4, 5+ éléments). Chaque tuile porte son libellé VoiceOver, et les **quatorze**
sites emploient la même clé `feed.media.item` avec, chacun, sa propre position
écrite en dur dans le `defaultValue`.

Une clé se résout à **UNE** entrée de catalogue. Il en découle, dans l'ordre :

| | |
|---|---|
| aujourd'hui | la clé est absente du catalogue ⇒ chaque site sert SON défaut ⇒ les positions sont justes, **et toutes en anglais** |
| si on applique le remède prescrit | ajouter l'entrée ⇒ **les cinq tuiles annoncent la même position** |

Le second point est ce qui fait de cette clé un piège, et non une dette : le
message d'échec du cliquet `test_untranslatedKeyBacklogDoesNotGrow` dit, mot pour
mot, *« Add the catalog entry … instead of raising the ceiling »*. Suivre cette
consigne sur cette clé aurait annoncé **« Média 1 sur 5 » sur les cinq tuiles**
d'un post — une régression VoiceOver introduite en obéissant à la garde.

> **La question qu'aucune garde ne posait** : non pas « cette clé est-elle
> traduite ? », mais **« cette clé peut-elle l'être ? »**. Une clé dont les sites
> déclarent des textes différents a déjà rompu sa promesse ; la rupture reste
> invisible jusqu'au jour où on la traduit.

### Le remède n'était pas de la traduire

`gallery.position` existe au catalogue **dans les sept locales** — « Média %1$d
sur %2$d », « الوسائط %1$d من %2$d », « Medium %1$d von %2$d »… — et deux écrans
la reconstruisaient déjà **en ligne**, chacun de son côté :

```swift
String(format: String(localized: "gallery.position", …), index + 1, attachments.count)
```

L'app possédait donc déjà, traduite, la chaîne que `feed.media.item` essayait de
dire en anglais. Le lot crée `MediaPositionLabel` — site unique — et le branche
aux **trois** écrans : grille du flux, pellicule, galerie plein écran.
`feed.media.item` disparaît du dépôt.

> **Une clé absente du catalogue a une troisième sortie, à côté de « la traduire »
> et « la laisser » : constater que l'app possède déjà la chaîne.** Elle ne coûte
> aucune traduction neuve, retire une clé au lieu d'en ajouter une, et supprime au
> passage la duplication qui l'avait rendue possible.

---

## 3. Défaut 2 — l'anglais qui REMONTE dans le catalogue

`common.done` déclarait `"OK"` à un endroit et `"Terminé"` à trois autres. La clé
étant au catalogue, elle gagne à l'exécution : rien ne se voyait, le littéral
mentait seulement sur ce que l'app affiche. C'est la forme 268i, sur un fichier
non épinglé — donc hors de portée de la garde qui la traite.

Sauf qu'en ouvrant le catalogue du **SDK** pour vérifier la valeur juste :

```json
"common.done": { "localizations": {
    "ar": { "stringUnit": { "state": "translated",  "value": "تم" } },
    "de": { "stringUnit": { "state": "needs_review","value": "Fertig" } },
    "fr": { "stringUnit": { "state": "new",         "value": "Done" } },
    …
```

**Le français vaut « Done ».** Les six autres locales sont correctes ; seule la
langue source est en anglais, en `state: "new"`.

C'est la trace mécanique du défaut, et elle change ce qu'un `defaultValue`
anglais coûte :

> **Xcode amorce l'entrée de langue source AVEC le `defaultValue` du code.** Un
> littéral anglais ne se contente donc pas d'être servi tant que la clé est
> absente : à l'extraction, il **DEVIENT** l'entrée française, en `state: "new"`,
> et tout traducteur part ensuite de lui. Le défaut ne se répare pas en ajoutant
> l'entrée — l'entrée est déjà là, déjà fausse, et déjà traduite en six langues
> depuis une source anglaise.

À l'écran : le même bouton se lisait **« Terminé »** sur les écrans de l'app et
**« Done »** sur ceux du SDK, pour un même utilisateur francophone.

Deux autres divergences du même balayage, moins graves et tout aussi réelles :
`media.video.play` écrivait « Lire la video » (sans accent) là où le catalogue dit
« Lire la vidéo », et `story.textEditor.placeholder` promettait « Saisissez votre
texte... » quand l'app affiche « Exprimez-vous… ».

---

## 4. La garde — ce qu'aucune des existantes ne pouvait voir

Toutes les gardes de localisation comparent un site au **CATALOGUE**. Deux angles
morts en découlent, exactement :

| angle mort | pourquoi |
|---|---|
| une clé que le catalogue n'a pas | il n'y a rien en face ⇒ `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` la saute en silence |
| un écran non épinglé | cette garde ne parcourt que `fullyLocalizedScreens` ⇒ ~1090 sources hors champ |

`InlineDefaultConsistencyTests` ajoute l'axe manquant : **deux sites comparés l'un
à l'autre**, sans catalogue et sans épinglage. Sur `main` : **5 violations**.

Deux décisions de forme font toute sa valeur, et les deux visent le même risque —
**une garde qui signale un non-défaut gagne l'allowlist qui la tue** :

- **La comparaison porte sur le SQUELETTE, pas sur le littéral.** Interpolations
  réduites à un placeholder : `"Supprimer \(label)"` et
  `"Supprimer \(labelFor(attachment))"` sont la même promesse rendue par deux
  expressions — Xcode extrait les deux en `Supprimer %@`. Sans cette
  normalisation, la garde aurait signalé trois paires légitimes sur cinq.
- **Les échappements sont DÉCODÉS.** Le dépôt contient exactement la paire
  `"R\u{00E9}initialiser"` / `"Réinitialiser"` : **une seule chaîne écrite de deux
  façons**. Une garde qui la signalerait signalerait sa propre lecture du source,
  pas un défaut.
- **Le groupement se fait par (CATALOGUE, clé), pas par clé.** `share.empty` dit
  « Aucune conversation » dans l'app et « Ouvrez Meeshy une fois pour retrouver
  vos conversations ici » dans l'extension de partage : **deux bundles, deux
  catalogues, deux entrées, aucun conflit.** Le groupement naïf l'aurait signalé.

---

## 5. Défaut 3 — le scanner ENJAMBAIT les appels imbriqués

Le miroir CLI, écrit avec un `finditer` là où le scanner Swift avance un curseur,
a rendu **deux violations de plus** que la garde Swift. L'écart n'était pas une
erreur du miroir : le scanner Swift reprenait après la **fin** de l'appel qu'il
venait de mesurer, si bien qu'un appel écrit DANS l'interpolation d'un autre était
avalé tout entier.

```swift
defaultValue: "\(item.label), \(isSelected ? String(localized: "common.active",
    defaultValue: "actif", …) : String(localized: "common.inactive", …))"
```

Même angle mort que 258i, un cran plus bas : **pas un appel que le marqueur rate,
un appel que le curseur enjambe.**

258i avait dû arbitrer un dilemme — élargir le scanner RÉVÈLE des clés et fait
donc MONTER le cliquet, ce que le cliquet interdit. Ici le dilemme ne se pose
pas, et c'est une mesure qui le dit : **3 appels imbriqués dans tout le dépôt**,
dont 1 en `.module` que le cliquet ne compte pas et 2 déjà traduites. Le plafond
ne bouge pas. Les deux littéraux (`"actif"` / `"inactif"` en minuscules contre
« Actif » / « Inactif » au catalogue) disent désormais ce que l'app affiche.

> **Un miroir n'a de valeur que là où il DIVERGE.** Celui-ci était réputé fidèle
> depuis six itérations ; c'est en le voyant rendre un chiffre différent qu'on a
> su que le scanner de référence avait un trou.

---

## 6. Extraction — le fichier était fermé aux ajouts

`LocalizationConsistencyTests.swift` faisait **1203 lignes**, au-delà du budget
800–1100 du `CLAUDE.md`, qui est explicite : *« Ajouter à un fichier déjà hors
budget est interdit : on extrait d'abord, on ajoute ensuite. »*

L'extraction n'est pas qu'une affaire de taille. La garde neuve a besoin du MÊME
scanner et de la MÊME carte des catalogues :

- `LocalizedCallScanner` — le scanner et son squelettiseur ;
- `LocalizationCatalogMap` — quel catalogue sert quel fichier ;
- `LocalizedCallScannerTests` — les bornes du scanner, avec le scanner.

> **Deux copies de la carte des catalogues rejoueraient le défaut de 270i entre
> fichiers au lieu de dedans** : une cible non nommée retombe SILENCIEUSEMENT sur
> le catalogue de l'app, donc une copie périmée mesure faux sans jamais rougir.

Après : **1068 lignes**, dans le budget.

---

## 7. Mesures

| | avant | après |
|---|---|---|
| clés déclarant deux chaînes différentes | **5** | **0** |
| cliquet i18n (`backlogCeiling`) | 81 | **79** |
| écrans épinglés | 246 | **248** |
| clés gardées sur les épinglés | 2 761 | **2 828** |
| règle A / règle B sur les épinglés | 0 / 0 | **0 / 0** |
| clés du catalogue app | 3 433 | **3 434** |
| sites construisant « Média n sur N » | 3 (dont 1 sous une clé fausse) | **1** |
| `LocalizationConsistencyTests.swift` | 1 203 lignes | **1 068** |

Vérification (aucune chaîne de compilation Swift dans cet environnement Linux —
les trois directions du miroir CLI et un miroir Python fidèle du scanner tiennent
lieu de mesure locale ; XCTest tranche en CI) :

```
$ python3 apps/ios/scripts/check_localization.py
✓ DIRECTION 1 — every used identifier key resolves in `en` (no raw render)
✓ DIRECTION 2 — every app-catalog identifier key is referenced in code
✓ DIRECTION 3 — every key says the same thing at every call site
```

RED prouvé avant GREEN : le même miroir, lancé sur `main` non modifié, rend les
**5** violations et le cliquet à **81**.

---

## 8. Ce qui reste, et pourquoi ce lot n'y touche pas

**Dix `defaultValue` restent écrits en ANGLAIS** dans un catalogue français —
c'est le suivi de 270i, réduit de douze à dix par ce lot :

| clé | ce que lit un francophone |
|---|---|
| `security.verify.description` | *Messages with X are end-to-end encrypted.* |
| `security.verify.howto` | *To verify, compare this number…* |
| `comments.comment.a11yLabel` · `comments.reply.a11yLabel` | *…, comment. / …, reply.* (VoiceOver) |
| `bubble.meta.ephemeral.a11y` | *Ephemeral message, expires in …* |
| `conversation.encryption.detail.readStatusError` | *Unable to read status: …* |
| `message-detail.send-history.attempt-number` · `attempt-count` | *Attempt N* · *N attempts* |
| `comments.load-more-replies` | *View N more replies* |
| `siri.notifications.unreadCount` | *N Unread* |

**Elles ne se « réconcilient » pas, et c'est le point à retenir du lot :**

> Les 186 littéraux réconciliés en 269i étaient sûrs à corriger parce que leur clé
> était AU catalogue — le littéral était **mort**, l'édition ne changeait rien à ce
> qui s'affiche. Ici la clé est **ABSENTE**, donc le littéral est **VIVANT** :
> passer « Attempt 3 » à « Tentative 3 » ne corrige pas le défaut, il le
> **DÉPLACE** — l'anglophone lirait du français. **Entrée et littéral doivent
> atterrir ENSEMBLE**, ce qui demande une traduction neuve en six langues dont
> l'arabe. C'est la décision portée par #4328, pas un oubli.

Trois d'entre elles (`attempt-count`, `load-more-replies`, `unreadCount`) sont en
outre des **pluriels**, et une clé plurielle ne peut pas satisfaire la règle B
(#4329) : leur écran resterait inépinglable.

`security.verify.*` mérite d'être nommée en tête : c'est un écran de **sécurité**,
et il parle anglais à tout le monde.

---

## 9. Leçons

1. **La question à poser à une clé n'est pas seulement « est-elle traduite ? »
   mais « PEUT-elle l'être ? »** Une clé dont les sites déclarent des textes
   différents a déjà rompu sa promesse ; la rupture est invisible jusqu'à la
   traduction, et c'est alors la garde elle-même qui la déclenche.
2. **Un `defaultValue` anglais ne fait pas que s'afficher : il REMONTE.** Xcode
   amorce l'entrée de langue source avec lui. Le mauvais littéral devient la
   mauvaise entrée française, en `state: "new"`, et les six traductions en
   descendent.
3. **Une garde qui signale un non-défaut gagne l'allowlist qui la tue.** Squelette
   plutôt que littéral, échappements décodés, groupement par catalogue : trois
   décisions dont la seule fonction est de ne rien signaler qui n'en soit pas un.
4. **Un miroir n'a de valeur que là où il DIVERGE.** Le miroir CLI rendait deux
   violations de plus que la garde Swift : ce n'était pas son erreur, c'était le
   trou du scanner de référence.
5. **Une clé absente a une troisième sortie : constater que l'app possède déjà la
   chaîne.** Elle ne coûte aucune traduction, retire une clé plutôt que d'en
   ajouter une, et supprime la duplication qui avait rendu le défaut possible.
6. **Réconcilier un littéral est sûr quand il est MORT, et change ce qui s'affiche
   quand il est VIVANT.** La clé au catalogue ou non décide laquelle des deux
   situations on a — et 269i ne valait que pour la première.
