# MeeshyComposer v2 — Une seule entrée pour créer et pour éditer

> **Statut** : conception approuvée section par section, non implémentée.
> **Périmètre** : web + iOS. Android en lockstep, hors de ce document.
> **Prédécesseur** : `2026-08-20-meeshy-composer-execution-spec.md` (lots A→H,
> A/B/D/E/F et chrome C1–C8 livrés sur `main`).

---

## A. Ce que ce chantier est, et ce qu'il n'est pas

Ce n'est **pas** un nouveau projet. La spec d'exécution v1 possède une section
`F. Hors v1` déclarée « EXHAUSTIVE — un comportement ni implémenté par un lot ni
listé ici est un défaut de spec, pas une licence d'interprétation ». Ce chantier
est la **promotion d'un sous-ensemble nommé de cette liste**, plus trois lois
produit arrêtées le 2026-08-23.

| Ligne promue depuis « Hors v1 » | Devient |
|---|---|
| porte `.feedComposer` vers le host *(conditionnée à la surface « document sans scène », C4)* | lot 3 |
| surface « document sans scène » du host (I6) | lot 2 |
| Mood dans le composer unifié (S3) | lot 4 |
| porte `.reelTab` | absorbée par l'éventail (lot 1) |
| composer web complet | lot 6 |
| pont serveur `MessageAttachment`→`PostMedia` (O13) | lot 5 |
| file de publication UNIQUE (`PublishIntent`, S2) | lot 7 |

Tout le reste de `F. Hors v1` **reste hors périmètre** et garde son opposabilité.

---

## B. Les six lois

### Loi 1 — Le contrat partagé porte la loi produit, jamais les affordances

`packages/shared` ne descend que ce que les deux plateformes doivent honorer à
l'identique :

1. les portes, comme données ;
2. le format initial **et l'éventail** de chacune (loi 4) ;
3. `buildUpdatePayload(known, draft)` (loi 3).

Ne descendent **pas** : `showsSlides`, `showsTimeline`, `opensWith`,
`allowsCapture`. Le web n'a pas d'atelier ; lui faire porter ce vocabulaire
promettrait des affordances inexistantes, et un vocabulaire non honoré diverge
en silence.

### Loi 2 — L'hydratation de l'édition a deux sources

`StoryComposerViewModel+Edit.swift` (123 l.) fait déjà, pour les stories iOS,
tout ce qu'exige une édition fidèle : `editingPostId` route vers `PUT /posts/:id`,
`editingOriginalMediaIds` se diffe en `removeMediaIds`,
`editingHydratedBackgroundImage` se compare par **identité** (`===`) pour
qu'un fond inchangé ne soit jamais ré-uploadé, `editingInitialVisibility`
préserve l'audience — le tout derrière un préchargement 3-tier qui repeint le
canevas immédiatement.

Son septième champ raconte le piège déjà payé :

```swift
public internal(set) var editingKnowsDeclaredReferences = false
```

La charge utile du tray porte des mentions **amputées par construction** — le
`select` du fil écarte les mentions silencieuses. Les republier au PUT
révoquerait celles que l'auteur avait posées discrètement. Le composer se **tait**
donc sur ce champ jusqu'à ce que la lecture unitaire lui donne le jeu autoritaire
(`adoptDeclaredReferences`).

**Généralisation** : l'hydratation ouvre sur la charge de liste (immédiate,
incomplète) et se met à niveau sur la lecture unitaire (autoritaire, plus lente).
Cache-first appliqué non à l'affichage, mais à la **sûreté d'écriture**.

### Loi 3 — On n'écrit que ce qu'on sait complet et qu'on a su rendre

Deux raisons indépendantes rendent un champ non-écrivable :

1. **le composer ne l'a pas rendu** — le formulaire web n'a jamais peint le
   canevas iOS, il ne peut pas le réécrire ;
2. **le composer ne le connaît qu'amputé** — cf. loi 2.

Sanction unique : **la clé est omise du PUT**.

Ce n'est pas une invention : `UpdatePostSchema`
(`services/gateway/src/routes/posts/types.ts:329`) l'écrit déjà pour `mentions`
et `location` — « clé ABSENTE = inchangées, `[]` = plus aucune référence
déclarée, liste = remplace ». Le tri-état existe ; il lui manque une forme
générale côté client.

```ts
buildUpdatePayload(known, draft)   // packages/shared — une fonction, testée une fois
```

iOS déclare tout connu **sauf** ce que l'hydratation n'a pas confirmé ; le web
déclare connu ce que son formulaire rend, et rien d'autre. C'est ce qui permet
au web d'ouvrir une édition sans jamais effacer un canevas composé sur iOS.

### Loi 4 — La porte déclare un éventail, pas un format

```
initialFormat:  ComposerFormat
offeredFormats: [ComposerFormat]   // contient toujours initialFormat
```

L'option **Réel** n'est offerte que si la composition qualifie —
`qualifiesAsReel` : vidéo ≥ 3 s, audio ≥ 3 s, ou ≥ 2 images. Source unique
déjà partagée : `packages/shared/utils/reel-composition.ts`, miroir SDK
`ReelComposition.qualifiesAsReel`, appliquée côté serveur par dégradation
silencieuse d'un réel non qualifiant en post.

Retirer un média qui dé-qualifie **rebascule la sélection** — jamais une
sélection pointant sur une option absente.

### Loi 5 — Le repost miroite ; changer de format est l'ancrage

> **Reposter conserve le format. Reposter dans un AUTRE format, c'est garder la
> chose pour de bon.**

L'éphémère reste éphémère (story → story, 20 h dans le tray ; status → status,
1 h). Le repost cross-format est le geste explicite d'ancrage.

Deux fichiers du gateway avaient déjà écrit cette loi en prose avant qu'elle
soit formulée — `detachReposts.ts` et `ExpiredStoriesCleanupService.ts` :
« reposter un STATUS en POST PERMANENT — le chemin `status→post` — est le geste
"je garde ça sur mon fil" ».

Toute la machinerie qui rend l'ancrage réel **existe déjà côté serveur** :

| Exigence | État |
|---|---|
| copier les octets, ne pas référencer | ✅ `repostPost` duplique médias, audio, `storyEffects` de toute source éphémère |
| aucune échéance sur l'ancre | ✅ `computeExpiresAt(POST)` → `undefined` |
| survivre au balayage de la source | ✅ `detachReposts` — le repost est **détaché**, jamais détruit |
| pouvoir demander un autre format | ✅ `targetType` au protocole (`types.ts:418`), laissé ouvert « pour un futur reposter en story » |

Le manque est **entièrement côté clients** : `targetType: .post` n'est envoyé
que depuis `StoryViewerView.swift:874` et `:1275` ; aucun client n'envoie jamais
`targetType: STORY` ; le web (`RepostModal.tsx`, 114 l.) n'offre que
repost-nu / citation, sans aucun choix de format.

### Loi 6 — La fiche de forward est le « où va ceci ? » universel

Aujourd'hui `ForwardPickerModel.swift` ne connaît que des **cibles** (des
conversations) et leur état d'envoi. Elle gagne des destinations qui ne sont pas
des conversations : **ma story · mon fil · mes réels**, gatées par la loi 4.

Ce n'est pas une dixième porte : c'est un **second point d'entrée** de
`.conversationMedia` — même graine (un média + son message d'origine), même
éventail.

---

## C. La table des portes

| Porte | Ouvre sur | Éventail offert |
|---|---|---|
| `storyTray` | story | story · post · réel\* |
| `feedComposer` | post | post · story · réel\* |
| `reelTab` | réel | réel · post |
| `moodChip` | status | status |
| `repost(source)` | **format de la source** | source · **post** (l'ancrage, loi 5) |
| `edit(document)` | **format du document** | post · réel\* si le document est l'un des deux ; **aucun choix** s'il est story ou status — voir contrainte ci-dessous |
| `draft` / `share` | transitoire | selon le document chargé |
| `conversationMedia` | **story** | story · post · réel\* |
| `forward(média)` | **story** | story · post · réel\* |

\* si `qualifiesAsReel`.

**Deux portes doivent PORTER leur format**, elles ne peuvent pas le deviner :
`.repost(ofPostId:)` et `.edit(postId:)` ne transportent aujourd'hui qu'un id.
L'appelant connaît pourtant le format à coût nul — on tape « reposter » ou
« modifier » sur une carte déjà rendue.

**Contrainte serveur sur `edit`** : `UpdatePostSchema` n'autorise que
`type: 'POST' | 'REEL'`. Convertir une story ou un status **par l'édition** est
donc hors de portée sans changement gateway — et c'est cohérent : changer le
format d'un contenu publié est le rôle du **repost** (loi 5), pas de l'édition.

---

## D. Ce qui existe déjà et qu'on hisse

Le chantier réutilise plus qu'il ne crée.

| Mécanisme éprouvé | Où | Ce qu'on en fait |
|---|---|---|
| éventail gaté + repli automatique | `EditPostSheet.swift:120-122, 297-308, 478-479` | monte dans `ComposerProfile` (loi 4) |
| « n'envoyer que ce qui a changé » | `EditPostSheet.swift:490` — `typeChanged ? selectedType : nil` | devient `buildUpdatePayload` (loi 3) |
| hydratation d'édition 7 champs | `StoryComposerViewModel+Edit.swift` | se généralise aux posts et réels (loi 2) |
| `qualifiesAsReel` | `packages/shared/utils/reel-composition.ts` + miroir SDK | consommé tel quel |
| snapshot + `detachReposts` + `targetType` | gateway | consommés tels quels (loi 5) |
| les 9 profils | `ComposerIntent.swift` + 447 l. de tests | étendus, pas réécrits |

---

## E. Les lots

Ordre contraint par les dépendances, pas par la taille.

### Lot 0 — Le contrat partagé *(démarre en premier)*
`packages/shared` : les portes, `initialFormat` + `offeredFormats`,
`buildUpdatePayload(known, draft)`. `ComposerIntent.swift` devient le **miroir**
du contrat, et cesse d'en être la source. **DoD** : la fonction testée une fois, les deux
plateformes compilent contre elle.

### Lot 1 — L'éventail
`ComposerProfile` gagne `offeredFormats` ; le sélecteur de format monte dans le
host MeeshyComposer, gaté par `qualifiesAsReel`, avec le repli automatique
d'`EditPostSheet`. `.repost` et `.edit` portent désormais leur format.
**DoD** : `.reelTab` cesse d'être conditionnée à un onglet Réels — l'éventail EST
le point d'entrée.

### Lot 2 — La surface « document sans scène » (I6)
Le host absorbe ce que `FeedComposerSheet` (`FeedView+Attachments.swift:765`,
3 appelants) sait faire : clavier sur `content`, rangée
photo·caméra·emoji·document·lieu·micro, envoi durable offline.
**Condition bloquante du lot 3** — la spec v1 l'a explicitement posée comme telle.

### Lot 3 — La porte la plus utilisée
`.feedComposer` cesse de router (`routesToLegacy: nil`). **Ne démarre qu'après
le lot 2** : recâbler la porte la plus utilisée sans sa surface serait une
régression sèche.

### Lot 4 — Mood (S3) et repost
`.moodChip` et `.repost` cessent de router. La loi 5 est câblée : le format
miroite, l'ancrage cross-format devient un choix explicite de l'éventail, et le
client envoie enfin `targetType`.
**Retrait** : `StatusComposerView.swift` (361 l.), `UnifiedPostComposer.swift`
(739 l., 1 seul appelant).

### Lot 5 — Média reçu et forward (O13)
`.conversationMedia` câblée ; la fiche de forward gagne ses trois destinations
(loi 6). Le pont serveur `MessageAttachment`→`PostMedia` remplace le re-upload
local de v1.

### Lot 6 — Web
Le composer web complet : une entrée, quatre formats, l'éventail, l'édition.
**Retrait** : `PostComposer.tsx` (535 l.), `StatusComposer.tsx` (230 l.),
`AudioPostComposer.tsx` (535 l.), `RepostModal.tsx` (114 l.).
`StoryComposer.tsx` (749 l.) est absorbé, pas retiré — il porte le canevas v3.

### Lot 7 — File de publication unique (`PublishIntent`, S2)
Un seul chemin de publication pour les quatre formats, offline compris.
**Retrait** : `EditPostSheet.swift` (498 l.), dernier legacy.

---

## F. Compatibilité — les anciens POSTs et RÉELs restent affichables

Non négociable, et déjà largement tenu.

- **Aucune migration de masse.** Le convertisseur v1→v3 reste le chemin, à la
  lecture (`storyEffectsV3.ts`) comme au rendu (`CanvasV3Migration.swift`).
- **Un document v1 rouvert dans le composer migre en v3 à la sauvegarde**, et
  seulement là — décision antérieure, maintenue.
- **`carrierAspect` est livré** (2026-08-22) : le ratio du porteur v1 est
  journalisé sur la scène v3, ce qui rend le letterbox **inversible** et le
  round-trip fidèle. Sans lui, rouvrir un post v1 recadrait définitivement ses
  ancres.
- **La négociation `X-Canvas-Caps: 3`** protège les clients du passé : le
  gateway leur sert la sentinelle plutôt qu'un canevas qu'ils ne savent pas
  peindre.

---

## G. Hors v2 — dit une fois, opposable

Tout ce que `F. Hors v1` de la spec du 2026-08-20 liste et que la section A ne
promeut pas explicitement. S'y ajoute :

- **la conversion de format par l'ÉDITION** au-delà de POST↔REEL — c'est le rôle
  du repost (loi 5) ;
- **Android** — lockstep, équipe Android, hors de ce document ;
- **le retrait de `StoryComposer.tsx`** — absorbé, pas supprimé.
