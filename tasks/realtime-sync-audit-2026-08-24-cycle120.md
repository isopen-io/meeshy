# Cycle 120 — Le Prisme des POSTS était la TROISIÈME famille de résolveurs, et le web ne le descendait pas

Date : 2026-08-24
Branche : `claude/keen-hamilton-rrmnht`
Périmètre : `apps/web/hooks/use-post-translation.ts`, `apps/web/components/v2/TranslationToggle.tsx`
(+ câblage `PostCard`, `PostDetail`, `PostsFeedScreen`, page détail, page hashtag) et leurs témoins.

---

## 1. Point de départ — la question que la leçon 261 rend obligatoire

Le cycle 119 a fixé l'audio web et a laissé la leçon 261 sous sa forme la plus
opposable : devant une énumération de sites qui accompagne une règle, ne pas
demander « combien y en a-t-il ? » mais **« cette règle gouverne-t-elle un autre
TYPE DE CONTENU, et qui le résout ? »**. Le § Cohérence du Prisme répond
d'avance : « le prisme s'applique à TOUT le contenu ». Deux familles étaient
recensées (aperçu de liste, audio). La question force à en chercher une
troisième.

Elle existe : **les POSTS et COMMENTAIRES.** Trois clients la résolvent :

| famille | web | iOS | Android |
|---|---|---|---|
| posts / commentaires | `TranslationToggle` + `usePostTranslation` | `APIPost.resolveTranslation` | `LanguageResolver.preferredTranslation` |

iOS `resolveTranslation` (PostModels.swift) et Android `preferredTranslation`
(LanguageResolver.kt) **descendent tous deux la liste ordonnée** des langues du
lecteur (`preferredLanguages` / `preferredContentLanguages`). Le web ne le
faisait pas.

---

## 2. Ce que le web faisait — et la conséquence, MÉCANIQUE

Le vrai chemin de rendu des posts web est `TranslationToggle.autoResolved`, qui
recevait un **`userLanguage` unique** (le rang 1, via `usePreferredLanguage()`) :

```ts
const matching = userLanguage
  ? translations.find((t) => sameLanguage(t.languageCode, userLanguage))
  : undefined;
return matching ? { ...matching, isOriginal: false } : originalVersion;
```

Une seule langue est consultée. Si le rang 1 n'a pas de traduction, on tombe
directement sur l'original — **les rangs 2 à 4 ne sont jamais essayés**.

La règle 2 du Prisme fait entrer la **locale appareil au rang 4**. Tout lecteur
dont l'appareil n'est pas dans sa langue applicative a donc un prisme d'au moins
deux langues — cas nominal, pas cas limite. Pour lui :

| prisme | post | traduction dispo | attendu (iOS/Android) | servi web (avant) |
|---|---|---|---|---|
| `['fr','en']` | espagnol | `en` seulement | **traduction anglaise** | original espagnol |

C'est l'exemple LITTÉRAL de `/CLAUDE.md` règle 2 : « un utilisateur francophone
avec un iPhone en anglais […] la locale anglaise n'intervient que si aucune
traduction française n'est disponible ET qu'une traduction anglaise existe ». iOS
et Android servaient l'anglais ; le web servait l'original — divergence
inter-clients sur exactement le contenu que le Prisme existe pour unifier.

Le jumeau MORT de ce défaut : `usePostTranslation` (`use-post-translation.ts`),
le résolveur DOCUMENTÉ des posts, non câblé aujourd'hui mais gardé par une suite
de tests — il écrivait le même court-circuit rang 1 + un repli `regionalLanguage`
codé à la main. Piège armé au sens du cycle 84 : la première personne qui le
câble y perd les rangs 3 et 4.

---

## 3. Pourquoi les témoins ne pouvaient pas tomber

`usePostTranslation` portait des témoins de rangs 3 et 4 — mais tous passaient
`{}` comme carte de traductions : ils n'attestaient que le calcul de
`preferredLanguage`, **jamais la RECHERCHE**. C'est la forme « FIXTURE » de « un
témoin qui ne peut pas tomber » (leçon 261), déplacée d'un cran : l'assertion est
juste, le harnais est bon, et c'est le jeu de données (carte vide) qui rend la
règle de rang inobservable.

`TranslationToggle` n'avait aucun témoin exerçant un rang > 1 : ses tests
existants passent tous un `userLanguage` unique et une seule traduction.

---

## 4. Le correctif

**`usePostTranslation`** — descendre le prisme ordonné (`resolveUserLanguagesOrdered`),
la langue d'origine gagnant à son rang :

```ts
for (const language of orderedLanguages) {
  if (original && original === language) return null;   // original à son rang
  const match = entries.find(([code, e]) => code.trim().toLowerCase() === language && e?.text);
  if (match) return match[1];
}
return null;
```

**`TranslationToggle`** — prop additive `preferredLanguages?: string[]` ; quand
elle est fournie, `autoResolved` descend la liste ; sinon comportement historique
à une langue (`[userLanguage]`). Rétrocompatible : les appelants non câblés et
leurs témoins ne changent pas.

**Câblage** (nouveau hook `usePreferredLanguages()`, prisme ordonné + fallback
rang 5) sur la surface POSTS : `PostsFeedScreen`, page hashtag → `PostCard` ;
page détail → `PostDetail` (contenu + repost).

Trois points non cosmétiques, tous alignés sur iOS/Android :
- **Comparaison insensible à la casse des DEUX côtés** — les prefs sortent
  minusculées de `resolveUserLanguagesOrdered`, les clés viennent du pipeline de
  traduction (non normalisées à l'écriture).
- **La langue d'origine gagne à son RANG, jamais en court-circuit** (règle 3) —
  gelé dans les deux directions (gagne au rang 1, perd au rang 2).
- **Fallback rang 5** — `resolveUserLanguagesOrdered` ne porte pas le `'fr'` de
  `resolveUserLanguage` ; on le rétablit pour rester en phase avec le rang 5 TS
  et le repli `["fr"]` d'Android.

---

## 5. Vérifié / non vérifié — la distinction est la mesure

- [x] **ROUGE prouvé** — `usePostTranslation` : 3 échecs (rang 3, rang 4, casse),
      les 2 témoins de rang 1 restant verts (ils coïncident avec le
      court-circuit).
- [x] **ROUGE prouvé** — `TranslationToggle` : 3 échecs sur les nouveaux témoins
      de rang.
- [x] **ROUGE prouvé par MUTATION** — retirer la garde « original à son rang » de
      `TranslationToggle` fait tomber exactement 1 témoin (`gagner à son rang`) ;
      remettre la boucle au rang 1 dans `usePostTranslation` fait tomber
      exactement les rangs 3/4.
- [x] **93/93 suites web vertes** (`v2`, `feed`, `app`, `hooks/use-post-translation`),
      774 tests — dont les 29 fichiers dont le mock `use-post-translation` a été
      étendu pour déclarer `usePreferredLanguages`.
- [x] **Cliquet de dette de types INCHANGÉ : 1199** — mesuré `EXIT=0` sur
      `origin/main` clean AVANT toute édition (le glissement 1196→1199 depuis le
      cycle 119 vient de commits `main` intermédiaires, pas de ce lot) ; 0 erreur
      dans les fichiers de production touchés.

---

## 6. Reste ouvert — nommé, avec sa raison

- [ ] **Web COMMENTAIRES / STORIES / STATUS pas encore conscients du rang.**
      `CommentList`→`CommentItem`, `StoryViewer`, `StatusBar` reçoivent encore un
      `userLanguage` unique. Corrects (rang 1) mais pas rang-conscients. Même
      patron de câblage (`usePreferredLanguages()` → prop `preferredLanguages`) ;
      non fait ici pour borner le rayon de ce lot au posts (l'arbre de
      commentaires — list → replies → thread → item — est une surface large à
      revalider). Piège armé DÉSAMORCÉ côté résolveur (`TranslationToggle` sait
      descendre le prisme) ; il ne reste qu'à lui passer la liste.
- [ ] **iOS ne DÉCLARE pas encore `capturedInApp` à l'envoi** (hérité du cycle
      précédent) — Swift non compilable ici.
- [ ] Les suivis Android hérités (widgets d'écran d'accueil, octet NUL de
      `ConversationListViewModel.kt`) — inchangés.
