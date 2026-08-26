# Lot 6 — Le composer web unifié — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le web gagne UNE entrée de publication — quatre formats, un éventail, l'édition
et le repost — servie par le contrat partagé déjà livré au lot 0. Aujourd'hui le web a
**six** surfaces d'écriture concurrentes (2 453 lignes), **onze montages** dans quatre
fichiers, **quatre** chemins de publication et **deux** stratégies de téléversement.

**Architecture:** Le meuble web est un composant React monté par les écrans (`MeeshyComposer`),
qui lit `composerOpening(door, context)` (`packages/shared/utils/composer-contract.ts:115`) et
peint UNE surface par format. Il n'y a **pas d'atelier** sur web : la loi 1 interdit d'y
descendre `showsSlides` / `opensWith` / `allowsCapture`. Le lot construit la surface NEUVE à
côté des anciennes, bascule les portes une à une, et ne retire qu'en dernier, derrière une
preuve de parité. **À chaque tâche le produit reste fonctionnel** — c'est la contrainte de
livrabilité, pas un confort.

**Tech Stack:** React/Next 15, TypeScript strict, Jest (`TZ=UTC bun run test`, 643 fichiers de
test mesurés le 2026-08-24), types et lois partagés depuis `@meeshy/shared`.

**Spec:** `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` (§E lot 6, lois B1/B3/B4/B5,
table des portes §C, « Hors v2 » §G opposable) — et la doctrine antérieure et souveraine des
planches (`planche-meeshy-composer.html`, lois 4, 9, 10).

---

## A. État des lieux — mesuré le 2026-08-24 sur ce worktree, pas cité

> ### Rév. 2 — audit adversarial du 2026-08-24, HEAD `d4a40f600`
>
> **Le lot 0 bis a MERGÉ, et il est PLUS GROS que ce plan ne le décrit.** Commit `d4a40f600`
> (« un repost visait le MAILLON et non la RACINE, et reposter un mood fabriquait un contenu détruit une
> heure plus tard »), **27 fichiers**. Quatre conséquences opposables, toutes vérifiées :
>
> 1. **La précondition dure de W8 et W9 est LEVÉE.** Le §D et l'encadré de W8 disent « NE DÉMARRE PAS
>    avant la fusion du lot 0 bis » : c'est fait, l'arbre `apps/web` est propre.
> 2. **Le périmètre du lot 0 bis dépassait `posts.service.ts` + `ReelsFeedScreen.tsx` + 4 `common.json` +
>    4 suites.** Mesuré à `git show --stat` : il a aussi touché `apps/web/components/v2/PostDetail.tsx`
>    (l'ANCRAGE `onRepostAsPost`, offert dès que la source n'est pas déjà un POST), `app/story/[postId]/page.tsx`,
>    les **quatre `components.json`** en plus des quatre `common.json`, et — côté partagé —
>    `packages/shared/utils/repost-target.ts` (**neuf**, `repostTargetId = originalRepostOfId ?? repostOfId ?? id`),
>    son ré-export dans `packages/shared/utils/index.ts`, et `Post.originalRepostOfId` dans
>    `packages/shared/types/post.ts`. **Deux suites neuves** existent qui ne sont pas dans la liste de W8 :
>    `PostsFeedScreen.storyRepost.test.tsx` et `components/v2/PostDetail.repost.test.tsx`.
>    **`components/v2/PostDetail.tsx` et les quatre `components.json` entrent donc dans les fichiers
>    POSSÉDÉS du §C** — sans quoi W8 recâblerait un repost dont il ne possède pas le site.
> 3. **Tous les numéros de ligne d'`apps/web` de ce plan ont glissé d'environ +11.** Remesuré :
>    `PostComposer` `PostsFeedScreen.tsx:804` (et non `:793`), `StoryComposer` **`:983`**,
>    `StatusComposer` **`:991`**, `AudioPostComposer` **`:998`**, `PostEditor` **`:1008`**,
>    `RepostModal` **`:1021`** ; `ReelsFeedScreen.tsx:344` ; `app/reel/[postId]/page.tsx:263` ;
>    `app/feeds/post/[postId]/page.tsx` — `PostEditor` **`:325`**, `RepostModal` **`:335`**.
>    Les `wc -l` du §A.1, eux, sont **exacts et inchangés** (605 · 743 · 531 · 230 · 114 · 230).
> 4. **Le décompte des suites à démocker est SOUS-ESTIMÉ.** Le §F piège 2 et W9 Step 2 disent « ~21 suites » :
>    la mesure rend **26** fichiers de `apps/web/__tests__` portant un
>    `jest.mock('@/components/v2/{PostComposer|StatusComposer|AudioPostComposer|RepostModal|PostEditor}'` —
>    sur 60 qui mockent quelque chose sous `@/components/v2/`. L'ancrage `PostsFeedScreen.repost.test.tsx:61-64`,
>    lui, est **exact**.

### A.1 — Les six surfaces d'écriture (le lot 6 n'en nomme que cinq)

| Fichier | `wc -l` | Annoncé §E | Montages PRODUCTION | Ce qu'il sait faire |
|---|---|---|---|---|
| `components/v2/PostComposer.tsx` | **605** | 535 ❌ | 1 — `PostsFeedScreen.tsx:793` | contenu 5 000, pool unique de 10 médias, alt par média, opt-in son, références non-INLINE, audience complète, bascule POST/RÉEL |
| `components/v2/StoryComposer.tsx` | **743** | 749 ❌ | 1 — `PostsFeedScreen.tsx:972` | 3 pools de médias, palette de fonds, 4 styles de texte, audience, **émetteur canevas v3** |
| `components/v2/AudioPostComposer.tsx` | **531** | 535 ❌ | 1 — `PostsFeedScreen.tsx:987` | MediaRecorder, 4 locales SpeechRecognition, forme d'onde, audience |
| `components/v2/StatusComposer.tsx` | **230** | 230 ✅ | 1 — `PostsFeedScreen.tsx:980` | 10 emojis, 140 caractères, références. **Aucune audience** |
| `components/v2/RepostModal.tsx` | **114** | 114 ✅ | **4** — `PostsFeedScreen.tsx:1010`, `ReelsFeedScreen.tsx:343`, `app/reel/[postId]/page.tsx:260`, `app/feeds/post/[postId]/page.tsx:323` | repost sec / citation. **Aucun format, aucune audience** |
| `components/v2/PostEditor.tsx` | **230** | **absent de la liste** ❌ | **2** — `PostsFeedScreen.tsx:997`, `app/feeds/post/[postId]/page.tsx:313` | contenu, audience nommée, retrait de médias (**mort en production**, cf. A.3) |

**Trois des cinq décomptes du §E sont faux, et la liste omet un sixième composer.** `PostEditor.tsx`
porte l'édition que le lot 6 promet (« une entrée, quatre formats, l'éventail, **l'édition** »).
Laissé debout, il subsiste comme seconde porte d'écriture — exactement le trou que le lot ferme.

### A.2 — Rien n'est commencé, et le contrat partagé attend son premier client

`grep -rn "MeeshyComposer|ComposerIntent|offeredFormats|composer-contract|buildUpdatePayload|composerOpening"`
sur `apps/web` (`--include=*.ts --include=*.tsx`) rend **zéro ligne**. Aucun embryon.

Le lot 0 est en revanche **LIVRÉ et vérifié** : `packages/shared/utils/composer-contract.ts`
porte `COMPOSER_DOORS` (`:26`), `composerOpening()` (`:115`), `repostFormats()` (`:85`),
`editFormats()` (`:94`), `plusReelIfQualifying()` (`:71`) et `buildUpdatePayload()` (`:167`).
Il n'a **aucun consommateur de production, ni web ni gateway**. Le lot 6 en est le premier.
L'import passe par la carte d'exports `./utils/*` de `packages/shared/package.json`, le même
chemin que `@meeshy/shared/utils/reel-composition` déjà consommé par `PostComposer.tsx:16`.

### A.3 — Cinq défauts mesurés que le lot referme au passage

1. **L'éditeur web ne peut pas retirer un média.** `PostEditor` accepte `media` et `postType`
   (`:20-21`), mais **aucun de ses deux montages ne les passe** — `mediaList` vaut toujours `[]`,
   la grille de pièces jointes (`:128-179`) ne se peint jamais, `isReel` est toujours faux. Et les
   deux `onSave` **laissent tomber `removeMediaIds`** : `PostsFeedScreen.tsx:601-603` et
   `app/feeds/post/[postId]/page.tsx:185-189` ne destructurent que trois champs sur quatre.
2. **Toute édition web réécrit le contenu.** `PostEditor` envoie ses quatre champs
   inconditionnellement (`:99-104`) ; `hasChanges` (`:91-95`) ne gate que le bouton. Une
   correction d'audience seule renvoie `content` — c'est précisément ce que `buildUpdatePayload`
   supprime (loi 3).
3. **Le web ne peut pas convertir POST↔RÉEL par l'édition.** `UpdatePostRequest`
   (`services/posts.service.ts:60-87`) n'a pas de champ `type`, alors que `UpdatePostSchema`
   (`services/gateway/src/routes/posts/types.ts:334`, champ `type` `:348`) l'autorise depuis
   toujours. La porte `edit` de la table §C n'a donc **aucune** représentation web.
4. **L'ancrage d'un réel est inatteignable.** `RepostModal` n'offre aucun choix de format : ses
   deux boutons sont « Repost » et « Quote ». Le viewer de story, lui, sert déjà l'éventail en
   deux boutons (`StoryViewer.tsx:1291` et `:1303`, clés `repost` / `repostAsPost`). Un réel
   reposté ne peut donc pas être ancré, alors que la loi 5 le prévoit (`repostFormats('reel')`
   rend `['reel','post']`).
5. **Tout mood web naît PUBLIC.** `StatusComposer.onPublish` (`:23`) ne porte pas de visibilité,
   et `useCreateStatusMutation` retombe sur `'PUBLIC'` (`hooks/social/use-statuses.ts:70`) — alors
   que **le fil l'accepte déjà** (`CreateStatusInput.visibility`, `:55`). La loi 10 (« l'audience
   se souvient PAR FORMAT ») n'a aucun site pour le format status côté web.

### A.4 — Deux portes de la table §C n'ont aucun site web

- **`reelTab`** : `ReelsFeedScreen.tsx` ne monte AUCUN composer (`FeedTabs` `:287`, `RepostModal`
  `:343`, rien d'autre). Le seul chemin de création d'un réel sur web est la bascule POST/RÉEL de
  `PostComposer` (`:495-533`). Le lot 6 **crée** cette porte, il ne la migre pas.
- **`edit` d'une story ou d'un status** : `grep updateStory|editStory|updateStatus|editStatus` sur
  `components app hooks services` rend **zéro ligne**. Aucun chemin n'existe, et la contrainte
  serveur (§C) interdit d'en créer un par conversion. Rien à faire — à dire une fois.

### A.5 — Ce qui est DÉJÀ juste et qu'on hisse tel quel

- **`PostComposer` honore déjà la loi 4** : `compositionQualifies` (`:139`, `qualifiesAsReel`
  partagé), `effectivePostType` (`:142`, le repli), et la bascule n'est **rendue que si** la
  composition qualifie (`:495`) — **absente, jamais grisée**. C'est le mécanisme de l'éventail,
  déjà écrit, à généraliser aux quatre formats.
- **Les briques partagées existent** : `components/composer/{ReferencePicker,ReferenceChipRow}`,
  `hooks/composer/{useReferences,useAttachmentUpload}`, `components/v2/{AudienceUserPicker,
  publication-visibility}`, `qualifiesAsReel`. Le meuble les consomme, il ne les réécrit pas.
- **Le rendu v3 existe** : `CanvasV3Scene.tsx` (882 l.), monté par `StoryViewer.tsx` (1 591 l.).
  La loi 6 de la doctrine — « le lecteur EST l'aperçu » — **interdit** au lot 6 d'en construire un
  quatrième. Rien à faire, à dire une fois.

### A.6 — Deux corrections opposables au texte du §E

- **`storyEffectsV3.ts` n'existe PAS sous `apps/web`.** Il vit dans
  `services/gateway/src/services/posts/`. Les quatre citations web (`StoryComposer.tsx:191`,
  `CanvasV3Scene.tsx:264`, `lib/story-transforms.ts:267` et `:346`) sont des **commentaires**. Le
  composer web est le **jumeau** du convertisseur gateway, pas son client.
- **« StoryComposer porte le canevas v3 » est vrai, et trompeur si on le lit « éditeur ».**
  `buildCanvasV3(state)` (`:274-283`, un seul appelant, `:385`) **sérialise un état PLAT** —
  un fond, un style de texte, un contenu, un média, un audio (`CanvasComposerState` `:182`).
  Le fichier le dit lui-même `:206` : « l'écran web n'a pas de famille `textObjects` ». Aucun
  drag, aucun objet multiple, aucun sticker. Le bloc absorbable est net : `:145-287`, plus les
  catalogues `:57-108` — environ 190 lignes sur 743, le reste étant du chrome de dialogue.

---

## B. Les lois que ce lot câble

| Loi | Ce que le lot 6 en fait | Site |
|---|---|---|
| **1 — le contrat partagé porte la loi, jamais les affordances** | le web importe `composerOpening` et **rien d'autre** du vocabulaire d'atelier | W1 |
| **3 — on n'écrit que ce qu'on sait complet et qu'on a su rendre** | `buildUpdatePayload(known, draft)` gouverne le PUT ; le web ne déclare connu que ce que son formulaire rend — donc **jamais `mentions`, jamais `storyEffects`** | W8 |
| **4 — la porte déclare un éventail** | `ComposerFormatFan` web ; **un format non offert est ABSENT, jamais grisé** (loi 4 de la doctrine, non négociable) ; repli automatique quand la composition dé-qualifie | W2, W3, W8 |
| **5 — le repost miroite ; changer de format est l'ancrage** | l'éventail `[source, post]` sert les six surfaces de repost web ; le `targetType` par site posé par le lot 0 bis est **conservé et re-tenu**, jamais réinventé | W8 |
| **9 (doctrine) — la porte ne fixe que l'état initial** | `composerOpening` EST la forme de ce `f(format courant, seed)` | W1 |
| **10 (doctrine) — l'audience se souvient PAR FORMAT** | le mood web gagne enfin son audience et sa mémoire, miroir de `@AppStorage("lastStatusVisibility")` (`StatusComposerView.swift:28`) | W6 |

La **loi 6** (fiche de forward) et la **loi 2** (hydratation à deux sources) n'ont pas de site web
dans ce lot : la première est iOS (lot 5), la seconde suppose une lecture unitaire que le web
n'exécute pas au moment de l'édition. Dit une fois.

---

## C. Contraintes globales

- **Fichiers POSSÉDÉS** : `apps/web/components/composer/**` (neuf), `apps/web/components/v2/{PostComposer,
  StatusComposer,AudioPostComposer,RepostModal,PostEditor,StoryComposer,PostDetail,index}.tsx`
  (**`PostDetail.tsx` ajouté par l'audit du 2026-08-24** : c'est lui qui porte l'ancrage `onRepostAsPost`
  posé par le lot 0 bis, et W8 y écrit),
  `apps/web/locales/{en,es,fr,pt}/components.json` (**ajoutés pour la même raison**),
  `apps/web/components/feed/{PostsFeedScreen,ReelsFeedScreen}.tsx`,
  `apps/web/app/{feeds/post,reel,story}/[postId]/page.tsx`, `apps/web/services/posts.service.ts`,
  `apps/web/hooks/{composer,queries,social}/**`, `apps/web/lib/story-canvas-v3.ts` (neuf),
  `apps/web/locales/{en,es,fr,pt}/common.json`, et leurs tests. **Rien d'autre.**
- **Consommé, GELÉ** : `@meeshy/shared/utils/composer-contract` (lot 0),
  `@meeshy/shared/utils/reel-composition`, `@meeshy/shared/types/canvas-v3`, `CanvasV3Scene`,
  `AudienceUserPicker`, `publication-visibility`, `useReferences`, `useAttachmentUpload`.
- **Le gateway n'est PAS touché.** `UpdatePostSchema.type` autorise déjà `POST|REEL`
  (`types.ts:348`), `RepostSchema.targetType` les quatre formats (`types.ts:428`). Aucun
  changement serveur n'est requis — et s'il en fallait un, **un schéma de réponse Fastify tronque
  en silence les champs non listés** : le champ neuf devrait être ajouté au schéma de réponse, pas
  seulement au service.
- **Gate** : `cd apps/web && TZ=UTC bun run test`. Le `tsc` web **n'est pas un gate propre**
  (piège documenté au lot F, ligne 17) : ne pas s'y fier, s'appuyer sur les tests.
- **Le web teste la SOURCE de `@meeshy/shared`**, jamais `dist/` (`jest.config.js`, note D-13). Un
  test vert ne prouve donc **pas** que `dist/` est à jour : le gate final ajoute
  `cd packages/shared && bun run build`.

---

## D. Dépendances vers les autres lots

| Lot | État mesuré | Ce que ça impose au lot 6 |
|---|---|---|
| **Lot 0 — contrat partagé** | **LIVRÉ** (`composer-contract.ts`, 7 tests dans `packages/shared/__tests__/composer-contract.test.ts`) | rien à écrire ; le lot 6 en est le **premier consommateur de production** |
| **Lot 0 bis — le repost web miroite** | **MERGÉ `d4a40f600`** (27 fichiers) — les 8 sites de CARTE visent la RACINE par `repostTargetId()` (`packages/shared/utils/repost-target.ts`), la page de détail a gagné son ANCRAGE `onRepostAsPost` (`components/v2/PostDetail.tsx`), `Post.originalRepostOfId` est au contrat | **Précondition LEVÉE** (audit 2026-08-24) : W8 et W9 peuvent démarrer. Ce qui reste vrai et gouverne W8 : les suites de repost tiennent la loi 5 **par site d'appel** — leurs assertions se **reformulent** sur la surface unifiée, elles ne se suppriment pas. **Deux d'entre elles ne sont pas dans la liste de W8** (`PostsFeedScreen.storyRepost.test.tsx`, `components/v2/PostDetail.repost.test.tsx`) : les y ajouter. Et `repostTargetId()` est le **jumeau** de `RepostTargeting` iOS (`ComposerIntent.swift:351-371`) : W8 le CONSOMME, ne le réécrit pas, et toute évolution touche les deux sites |
| **Lot 1 — l'éventail (iOS)** | livré côté iOS (`ComposerFormatFan.swift`) | W2 en écrit le **miroir** web. La politique (« un éventail à une entrée ne s'affiche pas », « repli sur le premier format offert ») n'est PAS dans `packages/shared` : la loi 1 interdit d'y descendre des affordances. Miroir testé, fichier iOS nommé en commentaire ; **hisser cette politique dans shared n'est pas le lot 6** |
| **Lots 3, 4, 5, 7 (iOS)** | 3 et 0 bis **MERGÉS** (`96b707da6`, `d4a40f600`), 4/5/7 planifiés | **aucun fichier web** — pas de collision. Mais `composer-contract.ts` dit « toute évolution touche les deux sites » : si un lot iOS change la table des portes, W1 la suit dans le même geste |
| **Lot 7 — `PublishIntent`** | iOS uniquement | le lot 6 unifie la **SURFACE**, pas la **FILE**. Les quatre mutations web restent. Dette nommée en §G |

---

## E. Les tâches

Ordre **contraint par les dépendances**, pas par la taille. La règle qui le fixe est celle que le
lot 3 a payée : *« recâbler la porte la plus utilisée sans sa surface serait une régression
sèche »*. Donc : contrat → éventail → surfaces → portes de création → portes d'édition/repost →
retrait.

---

### Task W1 — Le web consomme le contrat partagé (aucune UI)

**Files:**
- Create: `apps/web/lib/composer-door.ts`
- Test: `apps/web/__tests__/lib/composer-door.test.ts`

**Interfaces** (gelé pour W2+) :

```ts
import { composerOpening, type ComposerDoor, type ComposerOpening } from '@meeshy/shared/utils/composer-contract';
import { qualifiesAsReel } from '@meeshy/shared/utils/reel-composition';

/** Le SEUL point du web qui appelle `composerOpening`. */
export function webComposerOpening(
  door: ComposerDoor,
  composition: ReadonlyArray<{ mimeType: string; duration?: number }>,
): ComposerOpening;
```

- [ ] **Step 1: Tests rouges** — la table §C, cas par cas, contre le contrat partagé (jamais contre
      une table locale) : `feedComposer` ⇒ `post` + `['post','story']`, et `['post','story','reel']`
      dès que la composition qualifie ; `storyTray` ⇒ `story` + `['story','post'](+reel)` ;
      `reelTab` ⇒ `reel` + `['reel','post']` ; `moodChip` ⇒ `status` + `['status']` ;
      `repost` d'un **post** ⇒ `['post']` (jamais deux fois), d'un **réel** ⇒ `['reel','post']`,
      d'une **story** ⇒ `['story','post']` ; `edit` d'un **réel** ⇒ `['reel','post']`, d'un
      **post** ⇒ `['post']` puis `['post','reel']` si la composition qualifie, d'une **story** ou
      d'un **status** ⇒ **aucun choix** (`[document]`). Et l'invariant : `offeredFormats` contient
      TOUJOURS `initialFormat`, pour les neuf portes.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — un fichier, aucune table locale, aucun `switch` de format dupliqué.
- [ ] **Step 4: Vert.**
- [ ] **Step 5: Garde de source POSITIVE** (`apps/web/__tests__/lib/composer-door-single-source.test.ts`)
      sur le modèle de `__tests__/focal/reading-modes-flag-single-occurrence.test.ts` (marche
      d'arbre `fs` + exclusion `node_modules/.next/dist/__tests__`) : le littéral `composerOpening(`
      apparaît dans **EXACTEMENT UN** fichier de production, `lib/composer-door.ts`.
      **Elle compte 1, elle n'assère pas une absence** — une garde qui n'assère qu'une absence
      passe au vert le jour où sa cible disparaît, en perdant sa protection.
- [ ] **Step 6: Commit.**

**DoD:** `TZ=UTC bun run test __tests__/lib/composer-door` vert. **Aucun composant modifié** —
le produit est inchangé.

---

### Task W2 — L'éventail web : un format non offert est ABSENT

**Files:**
- Create: `apps/web/components/composer/ComposerFormatFan.tsx`
- Test: `apps/web/__tests__/components/composer/composer-format-fan.test.tsx`
- Modify: `apps/web/locales/{en,es,fr,pt}/common.json` — quatre clés neuves
- Test: `apps/web/__tests__/locales/composer-i18n-keys.test.ts`

- [ ] **Step 1: Tests rouges** —
  1. un éventail à **une** entrée ne rend **RIEN** (miroir de `ComposerFormatFanPolicy.isVisible`,
     `ComposerFormatFan.swift:19-21` — cité en commentaire du composant) ;
  2. un format hors de `offeredFormats` **n'a aucun nœud dans le DOM** : `queryByRole(...)` rend
     `null`. **Interdit** : un bouton `disabled` ou `aria-disabled` — la loi 4 de la doctrine dit
     ABSENT, et une infobulle grise est une régression, pas une politesse ;
  3. **repli automatique** : la sélection courante qui quitte l'éventail rebascule sur le premier
     format offert (miroir de `EditPostSheet.swift:636-638`, « le gateway rejette (422) un RÉEL non
     qualifiant ») — et l'inverse **n'est pas vrai** : re-qualifier ne rebascule PAS vers RÉEL,
     repasser en réel reste un choix explicite de l'auteur (asymétrie délibérée,
     `EditPostSheet.swift:627-629`) ;
  4. les quatre libellés viennent de `t()`, aucune chaîne anglaise en dur.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — composant pur, `role="radiogroup"`, aucune connaissance de la
      publication. Clés `composer.format.{post,story,reel,status}` posées **SOUS la clé racine
      `"common"`** des quatre catalogues (voir §F, piège n°3).
- [ ] **Step 4: Vert.**
- [ ] **Step 5: Garde i18n** — `composer-i18n-keys.test.ts` sur le modèle **exact** de
      `__tests__/locales/lentille-i18n-keys.test.ts` : reproduire `scopeToNamespace(data,'common')`
      puis la marche `key.split('.')`, et exiger la clé **présente et non vide** dans les **quatre**
      locales. Vérifier la **présence dans le JSON**, jamais le rendu — `t(clé, repli)` rend le
      repli anglais en silence.
- [ ] **Step 6: Commit.**

**DoD:** vert ; l'éventail n'est monté nulle part. Produit inchangé.

---

### Task W3 — Le meuble, format POST/RÉEL : parité stricte avec `PostComposer`

**Files:**
- Create: `apps/web/components/composer/MeeshyComposer.tsx`, `apps/web/components/composer/ComposerDocumentSurface.tsx`
- Test: `apps/web/__tests__/components/composer/meeshy-composer-post.test.tsx`

- [ ] **Step 1: Tests rouges — l'inventaire de parité, capacité par capacité, cité à la ligne.**
      Chaque point est un test qui échoue AVANT d'être porté :
  1. contenu plafonné à 5 000, compteur au-delà de 4 500 (`PostComposer.tsx:534-541`) ;
  2. **pool unique** de 10 médias via `useAttachmentUpload({ maxAttachments: MEDIA_LIMIT })`
     (`:68`, `:122-130`) — un seul compteur, jamais la somme `selectedFiles + uploadedAttachments`
     (le double-comptage réparé à la Task 7 de W6, `:124-128`) ;
  3. alt par média via `MediaAccessibilityFields` ;
  4. `allowSoundExtraction` **TRI-ÉTAT** : absent tant que l'auteur n'a pas touché la bascule,
     `false` s'il l'a explicitement désactivée (`:104-105`, contrat `:47-54`) ;
  5. références non-INLINE via `useReferences` + `removingHandle`, payload **absent** (jamais `[]`)
     quand personne n'est référencé (`:39-40`) ;
  6. audience : `EXCEPT`/`ONLY` gatés par `isAudienceIncomplete`, jamais publiés sans liste ;
  7. `optimisticMedia` renvoyé à l'appelant, jamais au fil (`:31-38`) ;
  8. **l'éventail W2 remplace la bascule locale** (`:495-533`) : même prédicat `qualifiesAsReel`
     sur `uploadedAttachments` (`:139-141`), et `effectivePostType` (`:142`) devient le **repli**
     du fan — un RÉEL non qualifiant ne peut pas fuir vers le fil.

> **DIVERGENCE ASSUMÉE — arbitrage du 2026-08-24, tranché à l'exécution de W3.**
> Ce point 8 s'écrivait comme un simple portage ; il n'en est pas un, et la revue
> adversariale l'a attrapé. `PostComposer` **naît en RÉEL** (`useState<PostType>('REEL')`,
> `:95`), ne **dégrade** que si la composition ne qualifie pas (`:142`), et **revient**
> à `'REEL'` après publication (`:299`). La surface unifiée, elle, naît du format de
> la PORTE : `feedComposer` ⇒ `post`, et le RÉEL n'arrive que par un geste explicite
> dans l'éventail.
>
> **Conséquence produit, dite en clair** : une vidéo publiée depuis le fil sans
> toucher l'éventail n'atterrit plus dans Réels par défaut. C'est un CHANGEMENT,
> pas une parité.
>
> **Pourquoi on ne porte pas le quirk** : le porter exigerait de re-semer un format
> initial *contre* `composerOpening` — précisément le fork de la table que la garde
> de W1 existe pour empêcher — et il contredirait l'asymétrie voulue de l'éventail
> (W2 point 3 : re-qualifier ne rebascule PAS vers RÉEL).
>
> **Ce que cela impose à W9 Step 3** : les trois assertions `defaults to REEL` de
> `PostComposer.reelToggle.test.tsx` (`:131`, `:174`, `:188`) sont à **REMPLACER par
> leur contre-partie assumée**, jamais à « reformuler » — elles décrivent le geste
> inverse. Seule `:217` (« switch back ») est reformulable. Cette ligne corrige la
> moitié « capacités » de la preuve de retrait, qui était invalide telle qu'écrite.
- [ ] **Step 2: Rouge.** **Step 3: Implémenter.** **Step 4: Vert.**
- [ ] **Step 5: Commit.**

**DoD:** vert ; `PostComposer.tsx` **intact et toujours monté** ; le meuble n'est monté nulle part.
Produit inchangé.

> **Pourquoi la parité est une tâche, pas une note.** Le retrait d'un composer legacy n'est
> légitime que si TOUS ses appelants sont recâblés **ET** que la surface de remplacement tient
> chacune de ses capacités. Cette tâche est la moitié « capacités » de cette preuve ; W7/W8 en sont
> la moitié « appelants ». W9 ne peut pas démarrer avant les deux.

---

### Task W4 — Le micro devient un OUTIL du format post, pas un cinquième format

**Files:**
- Create: `apps/web/components/composer/AudioCapture.tsx`
- Modify: `apps/web/components/composer/MeeshyComposer.tsx`
- Test: `apps/web/__tests__/components/composer/meeshy-composer-audio.test.tsx`

Un post audio est un **POST porteur d'un média audio** — pas un format. La table des portes §C
n'en connaît que quatre. `AudioPostComposer` est donc une **surface de capture**, et sa place dans
le meuble est la rangée d'outils du format post.

- [ ] **Step 1: Tests rouges** —
  1. la machine à quatre phases est portée telle quelle : `idle → recording → transcribing →
     preview` (`AudioPostComposer.tsx:34`), négociation de `mimeType` (`:44-57`), les **quatre**
     locales `SPEECH_RECOGNITION_LOCALES` (`:59-64`) inchangées, forme d'onde ;
  2. **une seule stratégie de téléversement** : le fichier produit entre dans le pool par
     `useAttachmentUpload`, et la surface **ne construit plus** `TusUploadService` — assertion
     portée sur la surface, pas sur l'absence globale du symbole (`PostsFeedScreen.tsx:681` est
     aujourd'hui le seul site à téléverser en deux temps) ;
  3. `originalLanguage` = `transcription.language` **quand elle est connue**, et la clé est
     **ABSENTE** sinon — jamais une langue devinée : le serveur détecte depuis le texte, plus
     fiable (règle tranchée au lot F, F7d) ;
  4. un enregistrement de **moins de 3 s** n'offre pas RÉEL dans l'éventail (`qualifiesAsReel` lit
     la durée) — la loi 4, appliquée à l'audio.
- [ ] **Step 2-5:** rouge → implémentation → vert → commit.

**DoD:** vert ; `AudioPostComposer.tsx` intact et toujours monté. Produit inchangé.

---

### Task W5 — La surface STORY : absorption, pas retrait

**Files:**
- Create: `apps/web/lib/story-canvas-v3.ts` (**déplacement** de `StoryComposer.tsx:57-108` et `:145-287`)
- Modify: `apps/web/components/v2/StoryComposer.tsx` (le corps devient `StoryComposerSurface`, le
  dialogue reste un enrobage mince), `apps/web/components/composer/MeeshyComposer.tsx`
- Test: `apps/web/__tests__/components/composer/meeshy-composer-story.test.tsx`
- Modify (suivent le symbole) : `__tests__/components/story-composer-emits-v3.test.tsx`,
  `__tests__/components/story-v3-roundtrip.test.tsx`

**§G est opposable : `StoryComposer.tsx` est ABSORBÉ, pas supprimé.** Le fichier survit ; c'est son
**corps** qui devient montable par le meuble, et son dialogue qui devient un enrobage.

- [ ] **Step 1: Tests rouges** —
  1. l'émetteur déplacé rend **exactement le même blob** sur les vecteurs existants —
     `CanvasV3Schema.safeParse(payload).success === true`, `z` reste le rang d'INSERTION
     (`:279`), l'objet de fond porte l'id littéral `bg`, le texte racine reste la seule famille
     (le web n'a pas de `textObjects`, `:206`) ;
  2. **test d'ÉQUIVALENCE — c'est la preuve de parité de la story** : pour un état identique, la
     surface montée dans le meuble et le dialogue autonome produisent le **même** `storyEffects`,
     la **même** visibilité et les **mêmes** `mediaIds` ;
  3. le format story garde ses **trois** pools (`MEDIA_LIMITS` `:57`), sa palette de fonds
     (`:69`), ses **quatre** styles de texte (`:82`) et son `defaultVisibility` ;
  4. `mentions` reste **absent** (jamais `[]`) quand aucune référence n'est déclarée.
- [ ] **Step 2-5:** rouge → déplacement + extraction du corps → vert → commit.

**DoD:** vert ; `PostsFeedScreen.tsx:972` monte **toujours** `StoryComposer` et publie toujours.
Produit inchangé.

---

### Task W6 — La surface STATUS, et l'audience qui se souvient PAR FORMAT

**Files:**
- Modify: `apps/web/components/composer/MeeshyComposer.tsx`
- Create: `apps/web/hooks/composer/useFormatAudienceMemory.ts`
- Modify: `apps/web/locales/{en,es,fr,pt}/common.json` (les clés du mood qui manquent, s'il en manque)
- Test: `apps/web/__tests__/components/composer/meeshy-composer-status.test.tsx`

- [ ] **Step 1: Tests rouges — parité** : les 10 emojis (`StatusComposer.tsx:31`), le plafond de
      140 caractères (`:32`), un mood **sans emoji ne publie pas** (parité iOS,
      `StatusComposerView.swift:257`), les références en tri-état (`:66-69`), et le geste
      « effacer » qui publie un mood vide (`handleClear`, `:74-81`) — quirk conservé tel quel.
- [ ] **Step 2: Tests rouges — le défaut mesuré** : le mood porte enfin sa visibilité jusqu'à
      `useCreateStatusMutation` (le fil l'accepte déjà, `use-statuses.ts:55`) ; et la mémoire est
      **PAR FORMAT** — choisir `FRIENDS` pour un mood ne change pas l'audience par défaut d'un post
      (loi 10 ; miroir de `@AppStorage("lastStatusVisibility")`, `StatusComposerView.swift:28`).
      Un `localStorage` indisponible (navigation privée) rend le défaut, jamais une exception.
- [ ] **Step 3-6:** rouge → implémentation → vert → commit.

> **La seule capacité AJOUTÉE par ce lot au-delà de la parité** est l'audience du mood (Step 2).
> Elle referme un défaut mesuré — *tout* mood web naît PUBLIC — pour le coût d'un sélecteur déjà
> écrit (`publication-visibility` + `AudienceUserPicker`). Si la revue la juge hors périmètre, elle
> se retire sans rien casser d'autre : aucune autre tâche n'en dépend.

**DoD:** vert ; `StatusComposer.tsx` intact et toujours monté. Produit inchangé.

---

### Task W7 — Les portes de CRÉATION basculent

**Files:**
- Modify: `apps/web/components/feed/PostsFeedScreen.tsx`, `apps/web/components/feed/ReelsFeedScreen.tsx`
- Test: `apps/web/__tests__/components/composer/composer-doors-creation.test.tsx`
- Modify (assertions **reformulées**, jamais supprimées) : `__tests__/components/feed/PostsFeedScreen.handlePublish.test.tsx`,
  `.references.test.tsx`, `.audio-publish.test.tsx`, `.storyOriginalLanguage.test.tsx`

- [ ] **Step 1: Tests rouges** —
  1. l'écran de fil monte **EXACTEMENT UN** composer de publication — garde de comptage sur le
     modèle iOS `AppInitWireupTests.swift:248`, marche d'arbre `fs`, **elle compte 1** ;
  2. les **cinq** gestes de création ouvrent le meuble avec leur porte : `onAddStory` (`:768`) →
     `storyTray`, `onAddStatus` (`:780`) → `moodChip`, le composer en ligne (`:793`) →
     `feedComposer`, le micro (`:800`) → `feedComposer` avec l'outil de capture armé, et l'onglet
     Réels → **`reelTab`, porte que le web n'avait pas** ;
  3. les quatre mutations restent **inchangées** : `createPostMutation`, `createStoryMutation`,
     `createStatusMutation` — le lot 6 unifie la SURFACE, pas la FILE ;
  4. le post audio passe désormais par **un seul** téléversement (W4) : `handleAudioPublish`
     (`:679-718`) perd sa phase TUS explicite.
- [ ] **Step 2-5:** rouge → bascule des montages → vert → commit.

**DoD:** vert ; les quatre composers legacy **existent toujours** mais ne sont plus montés sur les
écrans de fil. **Le produit publie les quatre formats par la surface neuve.**

---

### Task W8 — Les portes d'ÉDITION et de REPOST + `buildUpdatePayload`

> **Précondition SATISFAITE depuis l'audit du 2026-08-24** — le lot 0 bis a fusionné (`d4a40f600`).
> L'encadré disait « NE DÉMARRE PAS avant sa fusion » ; il se lit désormais comme une consigne de
> RELECTURE : rebaser sur `d4a40f600`, relever les assertions réelles des suites de repost (elles sont
> **six**, pas quatre — `PostsFeedScreen.storyRepost.test.tsx` et `components/v2/PostDetail.repost.test.tsx`
> sont neuves), et **conserver** `repostTargetId()` comme unique résolveur de cible.

**Files:**
- Modify: `apps/web/components/composer/MeeshyComposer.tsx`, `apps/web/services/posts.service.ts`
  (`UpdatePostRequest` gagne `type`), `apps/web/components/feed/{PostsFeedScreen,ReelsFeedScreen}.tsx`,
  `apps/web/app/feeds/post/[postId]/page.tsx`, `apps/web/app/reel/[postId]/page.tsx`,
  `apps/web/app/story/[postId]/page.tsx`
- Test: `apps/web/__tests__/components/composer/composer-door-edit.test.tsx`,
  `apps/web/__tests__/components/composer/composer-door-repost.test.tsx`
- Modify (assertions **reformulées**) : `PostsFeedScreen.repostTargetType.test.tsx`,
  `PostsFeedScreen.repost.test.tsx`, `ReelsFeedScreen.repost.test.tsx`,
  `app/feeds/post/postId-page.repost.test.tsx`, `app/reel/postId-page.repost.test.tsx`,
  `components/v2/StoryViewer.repost.test.tsx`, `components/v2/PostEditor.visibility.test.tsx`,
  `components/feed/PostsFeedScreen.editAudience.test.tsx`

- [ ] **Step 1: Tests rouges — l'ÉDITION (loi 3)** :
  1. le PUT ne porte **que** les champs déclarés connus (`buildUpdatePayload`) : une modification
     d'audience seule **n'envoie pas `content`** — défaut mesuré, `PostEditor.tsx:99-104` l'envoie
     toujours ;
  2. `mentions` n'est **JAMAIS** envoyé par une édition web (le formulaire ne rend pas le jeu
     autoritaire — loi 3, deuxième raison : envoyer `[]` détruirait toutes les références
     déclarées, ce que `UpdatePostRequest.mentions` documente déjà `:76-84`) ;
  3. `storyEffects` n'est **JAMAIS** envoyé par une édition web (loi 3, première raison : le
     formulaire n'a jamais peint le canevas) ;
  4. `removeMediaIds` **arrive enfin jusqu'au PUT** : le meuble reçoit `media` et `postType` (les
     deux montages actuels ne les passaient pas) et les deux handlers cessent de laisser tomber le
     champ (`PostsFeedScreen.tsx:601-603`, `app/feeds/post/[postId]/page.tsx:185-189`) ;
  5. **conversion POST↔RÉEL par l'édition** : `type` n'est envoyé **que s'il a changé**, l'éventail
     ne l'offre que si `qualifiesAsReel`, et retirer le dernier média d'un réel rebascule sur POST
     (`EditPostSheet.swift:636-638`). Un réel doit garder au moins un média (`PostEditor.tsx:79`) ;
  6. éditer une **story** ou un **status** n'offre **aucun** choix de format (§C ; et de toute
     façon aucune surface d'édition n'existe pour eux sur web — dit une fois).
- [ ] **Step 2: Tests rouges — le REPOST (loi 5)** :
  1. les **six** surfaces de repost convergent sur la porte `repost(sourceFormat)` : les quatre
     montages de `RepostModal` et les deux boutons du viewer de story (`StoryViewer.tsx:1291`,
     `:1303`) ;
  2. `targetType` reste envoyé **par site**, avec le format de la **carte agie** — les assertions
     des quatre suites du lot 0 bis sont **portées telles quelles** sur la nouvelle surface. Le
     commentaire posé par le lot 0 bis dans `posts.service.ts` (« ce sont les tests par site
     d'appel qui tiennent la loi ») **doit suivre le correctif** : après W8 il n'y a plus qu'un
     site, et un commentaire qui énonce un invariant plus large que ce que le code tient devient
     la loi lue par la session suivante ;
  3. **un repost de RÉEL offre enfin l'ancrage** `['reel','post']` — inatteignable aujourd'hui ;
     un repost de **post** n'offre **pas** l'option deux fois (`repostFormats` `:86`) ;
  4. la citation porte la même loi que le repost sec (même `targetType`).
- [ ] **Step 3-6:** rouge → implémentation → vert → commit.

**DoD:** vert ; les six composers legacy existent mais ne sont plus montés **nulle part**. Le
produit édite et reposte par la surface neuve.

---

### Task W9 — Le RETRAIT, derrière la preuve de parité — et le P0

> **Préconditions opposables, toutes vérifiables :** W3–W6 verts (les capacités sont tenues),
> W7–W8 verts (tous les appelants sont recâblés), le test d'équivalence de W5 vert, lot 0 bis
> fusionné.

**Files:**
- Delete: `apps/web/components/v2/{PostComposer,StatusComposer,AudioPostComposer,RepostModal,PostEditor}.tsx`
- Modify: `apps/web/components/v2/index.ts` — **six paires** `export` valeur + type, contiguës
  (`:158-159`, `:161-162`, `:164-165`, `:167-168`, `:190-191`) : faciles à manquer si l'on ne
  retire que les fichiers
- Modify: les **26** suites dont un `jest.mock('@/components/v2/X', …)` pointe un chemin supprimé (compte de l'audit 2026-08-24 ; ce plan écrivait « ~21 »)
- Modify: `docs/product/planche-meeshy-composer.html` (P0)

- [ ] **Step 1: Garde de source AVANT suppression** — aucun fichier de production de `apps/web`
      n'importe l'un des cinq modules (marche d'arbre, `__tests__` exclu). **Elle compte 0 sur un
      ensemble énuméré de cinq chemins** : la formuler comme « aucun import » sur un motif large la
      rendrait verte pour la mauvaise raison le jour où les modules disparaissent.
- [ ] **Step 2: Retirer les `jest.mock` par CHEMIN, suite par suite** — **26 suites** mesurées à l'audit du 2026-08-24 (et non « ~21 ») :
      `__tests__/components/feed/PostsFeedScreen.repost.test.tsx:61-64` monte quatre `jest.mock`
      nommant les modules. Supprimer un module fait échouer ces suites **à la collecte**
      (« Cannot find module »), pas à l'assertion. **Ne jamais supprimer une suite pour la faire
      taire** : retirer la ligne de mock, garder les assertions.
- [ ] **Step 3: Re-tenir les gardes NÉGATIVES avant de perdre leur cible.** Inventaire :
      `PostComposer.reelToggle.test.tsx` (le format non qualifiant est ABSENT),
      `SoundExtractionCollection.PostComposer.test.tsx` (le tri-état de l'opt-in),
      `MediaAltCollection.PostComposer.test.tsx` (l'alt par média),
      `PostComposer.mediaCapDoubleCount.test.tsx` (le double-comptage du plafond),
      `PostComposerReferences.test.tsx` (le payload absent, jamais `[]`),
      `audio-post-composer-audience.test.tsx`, `PostEditor.visibility.test.tsx`.
      Chacune est **reformulée sur la surface unifiée**, jamais supprimée avec son composant : une
      garde négative privée de sa cible **passe au vert en perdant sa protection**.
- [ ] **Step 4: Supprimer les cinq fichiers + les six paires du barrel.** `StoryComposer.tsx`
      **NE PART PAS** (§G, opposable).
- [ ] **Step 5: Relire les commentaires orphelins** laissés par les fichiers retirés et par le lot
      0 bis — un commentaire qui survit à son correctif devient la loi lue par la suivante.
- [ ] **Step 6: P0** — mettre à jour **camembert ET matrice** des planches **dans le MÊME commit
      que le gate** (règle de maintenance héritée, §A bis). Le compte se lit **au moment du gate** :
      **remesuré à l'audit du 2026-08-24 : la planche est à la rév. 22 (2026-08-24), elle est modifiée
      NON COMMITTÉE dans l'arbre, et elle se CONTREDIT — arc et centre à `62 / 70` (l. 278-281) contre
      « 57 tâches (81,4 %) » à la puce verte (l. 287), rév. 17 « INCHANGÉ : 57/70 » contre rév. 22
      « INCHANGÉ à 62/70 ».** Ni le « 57/70 (rév. 18) » qu'écrivait ce plan ni le « 50/65, rév. 10 » de la
      conception v2 ne peuvent être repris tels quels : réconcilier, ou dire laquelle fait foi, dans le
      commit du gate. Ne pas inventer un second décompte parallèle.
- [ ] **Step 7: Commit.**

**DoD:** gate §H vert ; `git status` montre les cinq suppressions et aucun fichier neuf oublié
(rappel dépôt : `gitignore` masque des répertoires — tout fichier neuf DOIT apparaître avant commit).

---

## F. Les pièges nommés

1. **Une garde NÉGATIVE dont la cible disparaît passe au VERT en perdant sa protection.**
   Sept suites web protègent des comportements de `PostComposer`/`PostEditor` (§W9 Step 3), sur les **26**
   qui mockent ces modules par chemin. Elles
   se **reformulent** sur la surface neuve. La question à se poser à chaque garde : *« rougirait-elle
   si on réintroduisait l'interdit ? »*
2. **`jest.mock('@/components/v2/X', factory)` mocke par CHEMIN.** Supprimer le module casse
   **26** suites **à la collecte**, indépendamment de leurs assertions (mesuré à l'audit du 2026-08-24 ;
   ancrage exact :
   `PostsFeedScreen.repost.test.tsx:61-64`). Le retrait est donc un geste de test avant d'être un
   geste de code.
3. **`common.json` a une clé racine `common`, et `useI18n('common')` DESCEND dedans.** Une clé
   neuve posée à la racine du fichier est **injoignable** — c'est exactement le défaut que
   `__tests__/locales/lentille-i18n-keys.test.ts` documente pour `lentille`. Aggravant : la
   signature `t(key, paramsOrFallback?: Record | string)` (`hooks/use-i18n.ts`) autorise un repli
   inline, massivement utilisé (`PostsFeedScreen.tsx:463`), qui rend l'anglais **en silence**.
   **Une garde i18n vérifie la PRÉSENCE dans les quatre JSON, jamais le rendu.**
4. **Le web est localisé en QUATRE langues** (`en`, `es`, `fr`, `pt`) — toute clé neuve dans
   **tous** les catalogues. Et `lib/i18n.ts:24` / `:35` acceptent `'zh'` alors qu'aucun catalogue
   `zh` n'existe : défaut antérieur, hors périmètre, **à ne pas propager** dans les clés neuves.
5. **Deux chaînes anglaises en dur à ne pas transporter :** `RepostModal.tsx` en porte six
   (`:45`, `:59`, `:70`, `:87`, `:103`, `:106`) pour un seul `t()` (`:78`) ; `PostEditor.tsx` en
   porte huit (dont `:110`, `:125`, `:130`, `:157`, `:207`, `:214`, `:222`). Leur absorption est
   **aussi** une correction de localisation, pas un simple déplacement.
6. **Un schéma de réponse Fastify tronque en silence les champs non listés.** Le lot 6 ne touche
   pas le gateway ; si une tâche en venait à le faire, le champ neuf doit figurer dans le schéma de
   **réponse**, sans quoi il disparaît sans erreur.
7. **Le web teste la SOURCE de `@meeshy/shared`, jamais `dist/`** (`jest.config.js`, note D-13).
   Vert en test ≠ `dist/` à jour. D'où `cd packages/shared && bun run build` au gate.
8. **Le `tsc` web n'est pas un gate propre** (piège documenté au lot F, ligne 17). S'appuyer sur
   les tests.
9. **L'arbre de travail est PARTAGÉ et SALE.** Deux workflows tiennent `services/posts.service.ts`,
   `components/feed/ReelsFeedScreen.tsx`, les quatre `common.json` et quatre suites de repost.
   **Jamais `git add -A`** — committer par chemins explicites ; jamais `commit --amend` ; ne jamais
   `git checkout HEAD --` sur un fichier tenu par un voisin.
10. **Un commentaire qui énonce un invariant PLUS LARGE que son correctif devient la loi lue par
    la suivante.** Deux sites concernés ici : le commentaire de `RepostRequest.targetType` posé par
    le lot 0 bis (« ce sont les tests par site d'appel qui tiennent la loi » — après W8 il n'y a
    plus qu'un site), et les commentaires de doctrine des composers retirés.
11. **Le retrait n'est légitime que sous double preuve** — appelants recâblés **et** capacités
    tenues. C'est pourquoi W9 est neuvième et non première, et pourquoi W3/W5 portent des tests
    d'inventaire et d'équivalence plutôt qu'une revue à l'œil.

---

## G. Ce que le lot 6 NE fait PAS — dit une fois, opposable (§G du design v2)

- **Il ne retire pas `StoryComposer.tsx`** — « absorbé, pas supprimé », §G, ligne opposable.
- **Il ne touche pas au gateway.** `UpdatePostSchema.type` (`POST|REEL`, `types.ts:348`) et
  `RepostSchema.targetType` (quatre formats, `types.ts:428`) suffisent déjà.
- **Il n'unifie pas la FILE de publication web.** Les quatre mutations restent (`createPost`,
  `createStory`, `createStatus`, `repost`). `PublishIntent` est le **lot 7**, et le lot 7 est iOS :
  **son miroir web n'est planifié nulle part — dette NOMMÉE**, à porter au P0.
- **Il ne crée pas d'édition de story ni de status sur web.** Aucune n'existe (grep : 0 site), et
  la conversion par l'édition est hors de portée serveur (§C) — c'est le rôle du repost (loi 5).
- **Il ne construit aucun aperçu.** Loi 6 de la doctrine : le lecteur EST l'aperçu ; `CanvasV3Scene`
  (882 l.) et `StoryViewer` (1 591 l.) sont hors périmètre de retrait comme de refonte.
- **Il ne déduplique pas les deux enregistreurs audio du web** — `hooks/composer/useAudioRecorder.ts`
  (composer de MESSAGES) et la machine `MediaRecorder` d'`AudioPostComposer` (`:44-57`) coexistent.
  Dette VISIBLE, ligne P0 dédiée, pas une tâche.
- **Il ne hisse pas la politique d'éventail dans `packages/shared`** — la loi 1 interdit d'y
  descendre des affordances. Miroir testé côté web, fichier iOS nommé en commentaire.
- **Il ne porte pas Android** — mis de côté par directive du 2026-08-23, lot H suspendu.
- **Il ne corrige pas le `'zh'` sans catalogue** de `lib/i18n.ts` — antérieur, hors périmètre.

Tout le reste de « Hors v1 » (spec du 2026-08-20, §F) garde son opposabilité.

---

## H. Le gate de sortie

```bash
cd /Users/smpceo/Documents/v2_meeshy-composer/apps/web && TZ=UTC bun run test
cd /Users/smpceo/Documents/v2_meeshy-composer/packages/shared && bun run build
```

**Ce que ça doit rendre :** la suite web **complète** verte — **zéro rouge**, aucune suite
« skipped » née de ce lot. Le dépôt comptait **643 fichiers de test web** le 2026-08-24 ; ce nombre
bouge, **le critère est zéro rouge, pas un compte**. Le `build` de `packages/shared` prouve que
`@meeshy/shared/utils/composer-contract` compile dans `dist/` pour `next build` — les tests, eux,
lisent la source et ne le prouvent pas.

Pendant le TDD, chaque tâche se joue seule :
`cd apps/web && TZ=UTC bun run test __tests__/components/composer`.

**Merge :** après le lot 0 bis (collision de fichiers, §D). Indépendant des lots 3, 4, 5 et 7, qui
n'ont aucun fichier web — sauf si l'un d'eux modifie `packages/shared/utils/composer-contract.ts`,
auquel cas W1 le suit dans le même geste (« toute évolution touche les deux sites »,
`composer-contract.ts:12-13`).

---

## I. Ce que cette sonde n'a PAS vérifié — à ouvrir avant d'écrire le code

Honnêteté de mesure : ce qui suit est **non vérifié**, et doit l'être par la tâche concernée.

- Le **corps** de `PostComposer.tsx` (`:145-470`), d'`AudioPostComposer.tsx` (`:100-531`) et de
  `StatusComposer.tsx` (`:80-230`) n'a pas été lu intégralement. L'inventaire de parité de W3/W4/W6
  est bâti sur les **props, les payloads, les constantes et les blocs cités** — il peut manquer un
  comportement. **Chaque tâche relit son composant en entier avant d'écrire ses tests rouges.**
- Le **contenu** des ~21 suites qui mockent les composers n'a été lu que pour `PostsFeedScreen.repost.test.tsx`.
  Ce qui rougirait exactement au retrait de chaque module reste à établir suite par suite (W9 Step 2).
- `CanvasV3Scene.tsx`, `StoryViewer.tsx` et `lib/story-transforms.ts` sont **mesurés, non ouverts**.
  Ils sont déclarés hors périmètre sur la foi de leur rôle (rendu et transformation), pas d'une
  lecture.
- Les **six suites de repost du lot 0 bis** (quatre modifiées + deux neuves, `PostsFeedScreen.storyRepost.test.tsx` et `components/v2/PostDetail.repost.test.tsx`) n'ont pas été lues : leurs assertions exactes,
  que W8 doit reporter, restent à relever au moment de la fusion.
- **Aucun test n'a été exécuté** (interdit à la sonde). Toutes les affirmations de couverture sont
  des lectures de source et des comptes de fichiers, jamais des mesures d'exécution.
