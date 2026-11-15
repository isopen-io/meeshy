# Itération 288 — un cliquet garde enfin « le prisme du LECTEUR se lit par la SSOT, jamais en ligne » (web)

Suite directe du **suivi laissé ouvert par les cycles 283→286** et jamais soldé
(analyse `2026-08-30-iteration-286-stream-translation-stats-prism-rank4`,
§ « Suivi (hors périmètre) ») :

> Toujours aucun cliquet ne garde « toute liste de langues de lecteur côté web
> passe par la SSOT `getUserLanguagePreferences` / `resolveUserPreferredLanguage` ».
> Un tel garde (interdire `[user.systemLanguage, user.regionalLanguage,
> user.customDestinationLanguage]` en ligne) attraperait la réapparition du
> motif ; seule la revue de recensement le fait aujourd'hui. Suivi de méthode
> inchangé depuis le cycle 283.

## État actuel (avant ce lot)

Les cycles 285 (cache de `use-stream-translation.ts`) et 286 (compteur de
statistiques du même hook) ont retiré le DERNIER exemplaire du motif :

```ts
const userLanguages = [
  user.systemLanguage,
  user.regionalLanguage,
  user.customDestinationLanguage,
].filter(Boolean);
```

C'est le prisme du lecteur **arrêté au rang 3** : il omet la locale appareil
(rang 4, Prisme étendu 2026-05-26) et la canonicalisation/déduplication
qu'apporte la SSOT `getUserLanguagePreferences(user)`
(`apps/web/utils/user-language-preferences.ts`).

Un recensement complet mené AVANT ce lot confirme l'état sain : aucune liste de
langues du lecteur en ligne ne subsiste. Les usages directs de
`resolveUserLanguagesOrdered` hors de la SSOT (`use-contacts-v2.ts:56`,
`utils/v2/transform-conversation.ts:122`) résolvent la langue d'un AUTRE
utilisateur (contact, autre participant) — cas légitime où injecter la
`navigator.language` du navigateur COURANT serait un défaut.

## Problème identifié

Le motif est retiré, mais **rien n'empêche sa réapparition** : un correctif
pressé, un merge automatique, un nouveau hook peut réécrire la liste à la main.
La règle est documentée (`apps/web/CLAUDE.md` § Device Locale : « JAMAIS appeler
`resolveUserLanguage` directement … toujours passer par la SSOT »), mais une
règle documentée sans cliquet ne vaut que le temps d'une revue humaine — et le
symptôme d'une régression (un lecteur piloté par sa seule locale appareil dont
la traduction n'est pas comptée / pas servie) est SILENCIEUX.

## Cause racine

Un motif retiré trois cycles de suite sans le garde qui fige son absence. Le
dépôt en fait sa méthode partout ailleurs (des dizaines de « sweeps » et
cliquets côté gateway) ; ce site en divergeait.

## Impact métier

Prévention de régression sur les dimensions 10 (Utilité — statistique d'usage de
traduction) et 13 (Complétude — le prisme du lecteur descend au rang 4). Aucun
impact utilisateur direct : c'est un garde-fou de maintenabilité (dimension 11).

## Impact technique

Surface NULLE côté production : un unique fichier de test ajouté. Aucun code
d'exécution touché.

## Évaluation du risque

Très faible. Le cliquet démarre VERT (inventaire vide, prouvé par balayage de
l'arbre entier). Le détecteur vise étroitement la LISTE DE RÉSOLUTION — les trois
champs du lecteur collectés dans un littéral de tableau refermé par
`.filter(Boolean)` — et ne peut pas produire de faux positif sur :

- un tableau de DÉPENDANCES de `useMemo`/`useCallback` (pas de `.filter`) — p. ex.
  `bubble-stream-page.tsx`, dont le memo alimente `getUserLanguageChoices`, une
  fonction qui n'utilise QUE ces trois rangs ;
- `resolveUserLanguagesOrdered(otherUser, …)` (résolution d'un autre
  utilisateur) ;
- un exemple cité dans un commentaire (les commentaires sont dépouillés avant
  détection — y compris le doc-comment de CE fichier).

## Améliorations proposées (implémentées)

- `apps/web/__tests__/hooks/reader-language-ssot-guard.test.ts` : marche `fs` sur
  l'arbre source web (exclusions `node_modules`/`.next`/`__tests__`/`__mocks__`/…
  et la SSOT elle-même), inventaire gelé VIDE.
- Six témoins : prémisse non vide (>100 fichiers balayés), inventaire vide,
  **RED prouvé** (le détecteur tombe sur le motif exact retiré aux cycles
  285/286), et trois témoins négatifs qui figent les non-cibles (tableau de
  dépendances, résolution d'un autre utilisateur, exemple en commentaire).

## Bénéfices attendus

La règle « une liste de langues du lecteur passe par la SSOT » cesse de dépendre
d'une revue humaine : la réapparition du motif rend le cliquet ROUGE, en nommant
le fichier fautif. Un garde de moins tenu par la seule vigilance.

## Complexité d'implémentation

Faible : un fichier de test autonome, aucune dépendance de production, modèle
`composer-legacy-mounts-guard.test.ts`.

## Critères de validation (atteints)

- **RED prouvé** : témoin dédié — `hasReaderListAntiPattern` rend `true` sur le
  littéral exact retiré aux cycles 285/286, `false` sur les trois non-cibles.
- **GREEN** : `npx jest __tests__/hooks/reader-language-ssot-guard.test.ts` —
  6/6 verts ; l'inventaire réel balayé sur tout l'arbre est vide.
- Aucun code d'exécution modifié.

## Dimensions (roadmap treize dimensions)

**11 · Maintenabilité** (mûre : la SSOT unique du prisme du lecteur côté web est
désormais gardée par un cliquet, pas par la seule revue de recensement) —
**10 · Utilité** & **13 · Complétude** (protégées contre régression : le compteur
de statistiques et le chemin de résolution ne peuvent plus retomber au rang 3
sans faire rougir le cliquet).

## Suivi (hors périmètre)

- Le cliquet vise la forme de RÉSOLUTION (`.filter(Boolean)`), celle qu'ont
  produite les cycles 285/286. Une variante future qui compose la liste
  autrement (spread dans un `Set`, `.reduce`) lui échapperait — la revue de
  recensement reste le filet pour ces formes ; les figer coûterait un détecteur
  plus large, à faux-positifs, pour un motif qui n'a jamais existé. Décision
  assumée : garder le détecteur étroit et sûr plutôt que large et bruyant.
- Le miroir de la règle côté iOS/Android (une liste de langues du lecteur bâtie
  à la main) n'est pas gardé par ce cliquet, qui est TS-only. Suivi de parité
  inchangé.
