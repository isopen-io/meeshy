# Itération 273 — Analyse : l'affinité de langue du reel viewer ignore la locale appareil (Prisme rang 4)

## État courant

Quand un utilisateur ouvre le fil plein écran des reels (`PostFeedService.getReels`),
chaque candidat est classé par `reelAffinityScore` (`services/posts/reelAffinity.ts`).
L'un des signaux est **`viewerLanguage`** (poids `0.1`) : un reel écrit dans une
langue que le lecteur LIT reçoit un bonus de classement. L'ensemble des langues
du lecteur est construit par `PostFeedService.getViewerLanguages(userId)`.

## Problèmes identifiés

### 1. La descente du Prisme s'arrête au rang 3 — la locale appareil est ignorée

`getViewerLanguages` énumérait à la main les TROIS premiers rangs du Prisme et
canonicalisait via `normalizeLanguageForDedup` :

```ts
const langs = [u?.systemLanguage, u?.regionalLanguage, u?.customDestinationLanguage]
  .filter((l): l is string => !!l && l.trim() !== '')
  .map((l) => normalizeLanguageForDedup(l));
return new Set(langs);
```

Le Prisme Linguistique a QUATRE rangs (`CLAUDE.md` § Résolution de langue) :
`systemLanguage` → `regionalLanguage` → `customDestinationLanguage` →
**`deviceLocale`** (rang 4, persisté sur `User.deviceLocale`, colonne indexée).
Le `select` ne chargeait pas `deviceLocale` et la boucle ne le consultait pas.

### 2. Population la plus touchée — un lecteur SANS préférence in-app

Un nouveau compte, dont le seul signal de langue est la locale appareil (cas
NOMINAL de la règle 2 du Prisme — « la locale appareil intervient en 4e
priorité »), obtenait un ensemble `viewerLanguages` **VIDE**. Conséquence :
AUCUN reel ne recevait le bonus `W.viewerLanguage`, et son fil « Pour toi »
était classé sans le seul signal de langue disponible pour lui. Même pour un
compte AVEC préférences in-app, les reels dans sa langue d'appareil ne
remontaient pas.

### 3. Cause structurelle — un résolveur de langues du lecteur réécrit à la main

`getViewerLanguages` réimplémentait une descente que la SSOT
`resolveUserLanguagesOrdered` (`packages/shared/utils/conversation-helpers.ts`)
tient déjà — c'est elle qui porte les quatre rangs, la déduplication ordonnée et
la canonicalisation. Réécrire la boucle est exactement ce qui a produit le
même défaut sur le hook posts/commentaires web (`usePostTranslation`, corrigé
au cycle 120 : « ne consultait que le rang 1... un francophone dont le
navigateur est en anglais voyait les posts espagnols en espagnol »). Ici le
symptôme est un classement dégradé plutôt qu'un texte non traduit, mais la
racine est identique : la descente n'est pas descendue jusqu'au bout.

## Causes racines

- Le résolveur a été écrit en énumérant les rangs « connus » à l'instant T, avec
  `deviceLocale` introduite plus tard (Prisme étendu 2026-05-26) sans que ce
  site soit revisité.
- Le doc-comment de `ReelAffinityContext.viewerLanguages` figeait l'erreur en la
  DÉCRIVANT — « system + regional + custom destination » — ce qui la faisait lire
  comme un contrat volontaire plutôt que comme une descente incomplète.

## Impact métier / technique

- **Métier** : classement de reels dégradé pour toute la population dont le seul
  (ou un) signal de langue est la locale appareil — au minimum tout nouveau
  compte non encore configuré. Le signal `viewerLanguage` était inerte pour eux.
- **Technique** : dette de SSOT — une descente du Prisme dupliquée et tronquée à
  côté de `resolveUserLanguagesOrdered`.

## Évaluation du risque

- Correctif : FAIBLE. Délégation à une SSOT existante ; `resolveUserLanguagesOrdered`
  canonicalise déjà, et on repasse par `normalizeLanguageForDedup` (idempotent
  sur des codes canoniques) pour garder les clés du `Set` dans l'espace EXACT où
  `reelAffinity` compare le candidat. Best-effort : la méthode reste enveloppée
  d'un `try/catch` rendant un `Set` vide.
- Témoin : FAIBLE. Test JVM/node pur via l'API publique `getReels` (double Prisma).

## Améliorations proposées (RÉALISÉES)

1. `getViewerLanguages` charge `deviceLocale` et délègue à
   `resolveUserLanguagesOrdered(u, { deviceLocale })`.
2. Doc-comment de `ReelAffinityContext.viewerLanguages` corrigé pour nommer le
   prisme ordonné complet.
3. Deux témoins ajoutés sur `PostFeedService.getReels` :
   - un lecteur `deviceLocale: 'de-DE'` sans pref in-app fait remonter le reel
     allemand devant l'espagnol (bonus de langue via la locale appareil) ;
   - `getReels` charge bien `deviceLocale` dans son `select`.

## Bénéfices attendus

- Le signal `viewerLanguage` est vivant pour la population device-locale-only.
- Une descente du Prisme de moins réécrite à la main ; un futur rang se propage
  par la SSOT.

## Complexité d'implémentation

Faible. 1 méthode (`getViewerLanguages`) + 1 import + 1 doc-comment + 2 tests.

## Critères de validation

- Les deux nouveaux témoins passent ; RED prouvé avant le correctif (ordre
  `['r-es','r-de']` sans le fix, `['r-de','r-es']` avec).
- Les 88 témoins de `PostFeedService.test.ts` et les 54 de reelAffinity restent
  verts.
- `tsc` gateway à 0 erreur.
- Contre-épreuve : retirer `deviceLocale` du `select`, ou revenir à la boucle
  3-rangs → le témoin device-locale rougit.
