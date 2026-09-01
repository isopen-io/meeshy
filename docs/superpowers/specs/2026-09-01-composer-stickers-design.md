# Les stickers du composer — gabarits, données figées, banque

> Spec de design validée le 2026-09-01. Le pilotage vit dans les issues
> GitHub (§ 8) ; ce document porte la RAISON des choix, pas leur état.

## 0. Le problème

Le composer sait poser deux natures de sticker : un **emoji** et une **image**
(`StorySticker.postMediaId`). Il ne sait pas poser une **décoration qui porte
une donnée** — une position dans un cartouche, un cœur, l'heure qu'il est.

La demande porteur (2026-09-01) :

> « Ajouter la possibilité d'ajouter des stickers de différents types (smileys,
> sticker custom, sticker de localisation, sticker d'heure, d'autres d'amour) ;
> le but est, comme pour la banque de sons, de faire sa propre banque. Établir
> comment intégrer, et avant d'aller loin, mettre des stickers de base livrés
> avec l'application. Au lieu de l'icône smiley, une icône de feuille qui se
> décolle. »

## 1. Ce qui existe déjà — mesuré au dépôt, pas supposé

| brique | où | état |
|---|---|---|
| `StorySticker` (`emoji` \| `image`) | `MeeshySDK/Models/StoryModels.swift:1194` | complet, avec `zIndex`, `baseSize`, `anchor`, fenêtre de temps |
| `StoryStickerLayer` | `MeeshyUI/Story/Canvas/Layers/` | rasterise un glyphe, cache `StoryStickerRasterizer` |
| `StoryLocationObject` | `StoryModels.swift:1351` | complet — `place`, géométrie, fenêtre de temps (#4591) |
| `StoryLocationLayer` | `MeeshyUI/Story/Canvas/Layers/` | rasterise un badge **pastille + épingle + libellé**, en dur |
| `StickerLibraryStore` | `apps/ios/.../Composer/` | banque LOCALE, 64 Mo, index sidecar, éviction LRU |
| `StickerPickerView` | `MeeshyUI/Story/` | 8 catégories d'emoji + section « Mes stickers » |
| `MeeshySceneObject` | `MeeshySDK/Models/` | somme sur les **cinq** familles (#4591) — ferme +150 cascades |
| `SoundLibraryService` | `MeeshySDK/Services/` | le patron de « sa propre banque » : `/sounds/mine` + tendances |

## 2. Les quatre décisions

### D1 — La donnée est FIGÉE à la pose

L'heure « 14:32 » et le lieu « Paris — Le Marais » sont résolus **au moment de
poser** et voyagent dans la charge. Tout lecteur voit exactement ce que l'auteur
a composé, sur les trois clients, sans appel réseau ni permission.

Le contraire — re-résoudre chez le lecteur — donnerait à chacun un contenu
différent de celui que l'auteur a vu, et ferait afficher à une story archivée
une heure sans rapport avec elle.

### D2 — La banque est LOCALE d'abord, sur le compte ensuite

`StickerLibraryStore` existe et suffit à livrer. La banque de compte
(`/stickers/mine` + `/stickers/trending`, table Prisma, service calqué sur
`SoundLibraryService`, parité web/Android) est un milestone à part — rien de ce
lot ne la bloque ni ne la préjuge.

### D3 — Les stickers livrés sont des GABARITS dessinés en code

Un emplacement de donnée exige un **gabarit** (cadre + emplacements), pas une
image plate. Dessiné en code : poids binaire nul, net à toute échelle, thème
clair/sombre. À réimplémenter sur web/Android, mais la charge déclarative rend
ce portage mécanique.

### D4 — L'icône dit « feuille qui se décolle »

Aucun glyphe Apple ne s'appelle « sticker » ni « peel » — vérifié dans
`CoreGlyphs.bundle` (noms + index de recherche, zéro correspondance).
**`rectangle.portrait.on.rectangle.portrait.angled`** : deux rectangles
portrait, celui de devant incliné. iOS 16.0 = notre plancher exact, style LIGNE
comme les huit autres portes du rail.

## 3. L'architecture — le gabarit est la brique, la FAMILLE est décidée par la donnée

```
StickerTemplate  (cadre + emplacements + repli)
         │
    ┌────┴────────────────┐
    │                     │
donnée LUE par         pas de donnée
la plateforme          structurée
(lat/lon, id POI)      (heure figée, cœurs)
    │                     │
    ▼                     ▼
StoryLocationObject    StorySticker .template
  + styleId              + templateId + slots
    │                     │
    ▼                     ▼
StoryLocationLayer     StoryStickerLayer
 (branche gabarit)      (branche gabarit)

fil : kind 'place'       kind 'sticker'
      — tous deux déjà ACTIVE_KINDS, charge permissive
```

**La ligne de partage est un principe, pas un arbitrage : une FAMILLE existe
quand la plateforme LIT la donnée ; sinon c'est un sticker avec un gabarit.**

### Pourquoi pas « tout est un sticker gabarit »

La pastille de lieu décorée deviendrait la **jumelle** de `StoryLocationObject` :
deux objets affichant un nom de lieu, deux rendus, deux chemins de repost — et
la donnée géographique (lat/lon, id POI, que la plateforme lit pour
`/posts/nearby`) n'existerait que sur l'un des deux. C'est la jumelle divergente
que le `CLAUDE.md` interdit.

### Pourquoi pas « une famille par nature »

`MeeshySceneObject` est une somme à cinq branches dont le doc-comment dit :
« une SIXIÈME famille ne compilera pas tant qu'elle n'aura pas dit sa
géométrie ». Chaque thème de palette (`time`, `love`, …) rouvrirait les +150
cascades que le #4591 vient de fermer, plus une entrée dans `ACTIVE_KINDS`
(schéma Zod partagé, contrat de refus, convertisseur v1→v3, web, Android).

Et **« amour » n'est pas une nature, c'est un thème** — on paierait une famille
entière pour un onglet de palette.

## 4. Le gabarit

```
StickerTemplate                      ← SDK, PUR : aucune I/O, aucun UIKit
  id            "location.postcard"
  family        .location | .time | .love
  slots         [Slot]               ← nom + NATURE
  fallbackEmoji "📍"                  ← ce que voit un lecteur qui ne sait pas rendre
  posedScale    1.0                  ← SON échelle de pose
  a11yLabel(slots:) -> String        ← construit À PART du texte dessiné
```

`StickerTemplateCatalog` — `enum` sans état : `all`, `template(id:)`,
`templates(family:)`. Un id inconnu rend `nil`, jamais un plantage.

### La nature d'un emplacement tranche le Prisme

- `.value` — une heure, une date, un nom de lieu. Porte une **donnée**, pas un
  discours : ne part **jamais** à la traduction.
- `.prose` — une légende écrite par l'auteur. Suit le Prisme comme
  `StoryTextObject.translations`.

**Le premier lot ne livre aucun emplacement `.prose`.** Le type existe dès le
début pour que la question soit POSÉE ; le chemin `.prose` arrive avec le
gabarit qui en aura besoin (issue de suivi N7, § 10).

### `posedScale` n'est pas `StorySticker.posedScale`

`StorySticker.posedScale = 2.2` est l'échelle à laquelle un **emoji** se pose
(un glyphe nu doit être agrandi pour être visible). Un gabarit porte déjà du
texte et de la mise en page : le poser à 2,2 le ferait déborder de la scène.
**Chaque gabarit déclare la sienne.**

## 5. Ce qui change dans le modèle — et ce qui ne change pas

| type | changement | compatibilité |
|---|---|---|
| `StoryStickerKind` | 3ᵉ cas `.template` | dérivé : `templateId` non vide ⇒ `.template`, sinon `postMediaId` ⇒ `.image`, sinon `.emoji` |
| `StorySticker` | `templateId: String = ""`, `slots: [String: String] = [:]` | décodeur manuel existant : champs absents ⇒ défauts ; `wireEmoji` sert le repli du gabarit |
| `StoryLocationObject` | `styleId: String? = nil` | `nil` ⇒ la pastille d'aujourd'hui, au pixel près |
| `MeeshySceneObject` | **rien** | aucune 6ᵉ branche, aucune cascade rouverte |
| `canvas-v3.ts` (Zod) | **rien** | `payload: z.record(z.string(), z.unknown())`, permissif par contrat |
| `storyEffectsV3.ts` | deux clés dans la charge reconstruite | pas de règle nouvelle |

**Un lecteur ancien ne casse pas** : il lit `emoji` et rend le repli du gabarit ;
un `styleId` inconnu retombe sur `location.pill`. Les deux échouent visiblement
et juste — c'est le précédent `imageFallbackEmoji`.

## 6. Le rendu — un chemin, pas deux

```
StickerTemplateRenderer.image(template:slots:metrics:) -> (UIImage, CGSize)
        ▲                                    ▲
StoryStickerLayer                     StoryLocationLayer
 (branche .template)                   (styleId ?? "location.pill")
```

Le badge codé en dur d'aujourd'hui **devient le gabarit `location.pill`** :
un remplacement, pas un ajout — donc pas de jumelle, et le témoin de
non-régression est trivial (le même lieu rend la même image).

Les deux couches posent `contents = image` : **capture de canvas, backdrop et
export AVFoundation marchent sans une ligne**, ils passent tous par
`layer.render(in:)`.

## 7. Les neuf gabarits livrés

| famille | gabarit | emplacements | forme |
|---|---|---|---|
| Lieu | `location.pill` | nom, adresse (de `SharedPlace`) | l'existant, devenu gabarit |
| | `location.postcard` | idem | cartouche carte postale, nom en gros, filet |
| | `location.ticket` | idem | étiquette perforée + épingle |
| Heure | `time.digital` | `time` (`.value`) | chiffres à segments |
| | `time.analog` | `time` | cadran, aiguilles figées |
| | `time.ribbon` | `time` | bandeau incliné |
| Amour | `love.heartFrame` | — | cœur plein, dégradé |
| | `love.doubleHeart` | — | deux cœurs entrelacés |
| | `love.since` | `date` (`.value`) | « depuis le … » |

Un fichier par famille (~300 l.), dans le budget 800-1100.

## 8. La palette — ce que la porte sticker ouvre

Contenant de l'issue **#4579** (« l'icône sticker ouvre une palette de
CONSTRUCTIONS », directive porteur 2026-08-31).

```
[ Emoji ]  [ Amour ]  [ Heure ]  [ Lieu ]  [ Mes stickers ]
```

- Chaque vignette est rendue par **le renderer qui dessinera sur la scène** —
  conforme par construction (exigence #4110).
- **Heure** : les trois gabarits pré-remplis à l'heure d'ouverture. Taper ⇒ posé,
  figé.
- **Lieu** : rangée des lieux alentour (le plus proche présélectionné) + grille
  des gabarits rendus avec ce lieu. 1 geste au cas nominal, 2 pour un autre lieu.
- **Mes stickers** : la section existante, inchangée.
- **Loi 4** : un onglet dont le fournisseur est absent (pas de permission de
  localisation, pas de magasin) n'est pas grisé — **il n'existe pas**. Les
  fournisseurs sont injectés par l'app via l'Environment, comme
  `\.storyStickerLibrary` aujourd'hui : le SDK déclare le protocole, l'app
  apporte l'horloge et `CLLocationManager`.

## 9. L'icône

`face.smiling` → `rectangle.portrait.on.rectangle.portrait.angled` à **deux**
endroits : `ComposerRailDoor.symbolName` et l'en-tête de `StickerPickerView`.

**Pas** dans `ComposerDocumentRules.swift` `case .emoji` — celui-là désigne
vraiment l'emoji du document, il garde son smiley. Une garde de source interdit
le retour du smiley sur la porte.

## 10. Découpage

| # | issue | dépend de |
|---|---|---|
| N0 | `StorySticker` et `StoryLocationObject` sortent de `StoryModels.swift` (4 571 l.) | — |
| N1 | Le registre de gabarits, le gel de la donnée, et ce que voit un lecteur ancien | N0 |
| N2 | `location.pill` devient un gabarit sans changer un pixel | N1 |
| N3 | Neuf gabarits livrés avec l'application | N1 |
| N4 | La palette ouvre cinq onglets, chaque vignette pose en ≤ 2 gestes (= #4579) | N2, N3 |
| N5 | La porte dit « feuille qui se décolle », garde contre le retour du smiley | — |
| N6 | *(milestone suivant)* La banque de stickers vit sur le compte | — |
| N7 | *(suivi)* Un emplacement de PROSE suit le Prisme | N1 |

**N0 est un préalable, pas une option** : `StoryModels.swift` fait 4 571 lignes,
quatre fois le budget, et la directive 2026-08-28 interdit d'ajouter à un
fichier hors budget — on extrait d'abord.

## 11. Les témoins

Comportement, jamais implémentation :

- **le gel** — une heure posée à T reste T une heure plus tard (horloge
  injectée). C'est LE témoin de D1.
- **la non-régression** — `location.pill` rend l'image d'avant.
- **le rang du kind** — `templateId` non vide gagne, même avec `postMediaId`
  rempli.
- **le lecteur ancien** — tout gabarit du catalogue a un `fallbackEmoji` et un
  label VoiceOver non vides. Garde d'**inventaire** (elle balaie le catalogue),
  donc elle ne se périme pas quand on ajoute un gabarit.
- **la loi 4** — taper une vignette POSE un objet ; un onglet sans fournisseur
  est absent de l'arbre d'accessibilité.
- **l'a11y** — le label VoiceOver est construit à part du texte dessiné : une
  chaîne pour l'œil ET pour VoiceOver n'en sert qu'un.

## 12. Dimensions visées

5 (accès), 6 (cohérence — une seule porte, aucune icône redondante), 7 (≤ 2
gestes), 8 (expérience), 11 (maintenabilité — aucune jumelle), 12 (la complexité
du registre se paie dans le code), 13 (complétude).

## 13. Source

Directive porteur du 2026-09-01, en suite du #4579 (2026-08-31). Briques SDK
vérifiées au dépôt à cette date.
