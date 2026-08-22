# Cycle 86 — Le gate existait. Il avait été écrit dans le fichier que Node ne charge pas.

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ftmofu`
**Périmètre** : passerelle (`routes/communities.ts`) et trois suites

**Clients touchés** : aucun changement de code client. Aucun nom d'événement,
aucune charge utile temps réel. Une réponse REST change de contenu — §5.

---

## 1. D'où vient ce cycle

Le cycle 80 a laissé « appartenance à une communauté » nommément ouvert ; les
cycles 82–85 ont fermé le reste. Ce cycle prend le dernier domaine, et il rend
la trouvaille la plus désagréable de la série :

**Le gate de présence de `GET /communities/:id/members` existait déjà, complet,
commenté, testé. Dans un fichier que Node ne charge pas.**

## 2. Deux implémentations, une seule montée

Le dépôt porte deux fois le domaine communauté :

| | routes | statut |
|---|---|---|
| `src/routes/communities.ts` | 16 | **monté** |
| `src/routes/communities/` (core, members, settings, search) | 13 | **masqué** |

`route-registration.ts` écrit `import { communityRoutes } from './routes/communities'`.
Les DEUX exportent `communityRoutes`. La résolution Node fait gagner le
**fichier** sur le **répertoire** — vérifié, pas déduit :

```
File '…/src/routes/communities.ts' exists - use it as a name resolution result.
======== Module name './routes/communities' was successfully resolved to '…/src/routes/communities.ts'. ========
```

(`tsc --traceResolution`.)

Tout `src/routes/communities/` est donc du code mort. **Sept fichiers de témoins
le montent ; deux montent le vrai.**

## 3. Ce que le masquage cachait : une fuite de présence VIVE

`routes/communities/members.ts` (masqué) porte le gate, avec son commentaire :

```ts
// Présence des co-membres : montrable (appartenance commune = accès déjà
// garanti), soumise aux préférences showOnlineStatus/showLastSeen.
const memberPresence = await getPresenceVisibilityService(fastify.prisma).resolvePrefsOnly(…)
```

`routes/communities.ts` (monté) : **aucune occurrence de
`PresenceVisibilityService`**. La route servie chargeait `user.isOnline` et
`user.lastActiveAt` et les rendait bruts.

Et le champ atteignait bien le fil — la vérification du cycle 84 s'applique :
`communityMemberSchema.user` vaut `userMinimalSchema`, qui **déclare**
`isOnline`. (`lastActiveAt`, lui, n'y est pas déclaré : il s'arrêtait au
sérialiseur, exactement comme au cycle 82, et pour la même non-raison.)

Quelqu'un a donc fait le travail, écrit le commentaire, posé les témoins — et
rien n'a jamais tourné.

## 4. Le régime : celui du cycle 83, pas celui du fichier mort

Le fichier masqué justifie `resolvePrefsOnly` par « appartenance commune = accès
déjà garanti ». Cette phrase suppose que le lecteur EST co-membre. La route
montée dit autre chose :

```ts
if (!hasAccess && community.isPrivate) return sendForbidden(…)
```

L'accès n'est refusé qu'aux non-membres d'une communauté **privée**. Sur une
communauté **publique**, un inconnu lit la liste complète des membres sans avoir
posé le moindre lien.

C'est **mot pour mot la situation du cycle 83** : un commentaire justifiait un
régime par une audience que la règle d'accès ne garantit pas (là, les stories
`PUBLIC` ; ici, les communautés publiques). Reprendre le gate du fichier mort
tel quel aurait donc porté sa demi-erreur avec lui.

Le régime se tranche par LECTEUR, et `hasAccess` — déjà calculé douze lignes
plus haut — le décide sans requête supplémentaire :

| lecteur | régime |
|---|---|
| membre ou créateur (`hasAccess`) | contexte acquis — `resolvePrefsOnly` |
| non-membre d'une communauté publique | **STRICT** — `resolveForTargets` |

Et le défaut d'une carte incomplète suit le régime, comme au cycle 84 : absent ⇒
montrable en prefs-only (un anonyme n'a pas de préférences), absent ⇒ masqué en
strict.

## 5. Ce qui change

`GET /communities/:id/members` : `user.isOnline` vaut `false` — et
`user.lastActiveAt` `null` avant le sérialiseur — quand la présence n'est pas
montrable. Aucun statut, aucun autre champ ne bouge.

## 6. Le témoin du cycle 84 gardait une porte fermée — corrigé ici

Le cycle 84 a conclu que `GET /communities/search` ne sert aucune présence (son
schéma déclare `creator` / `members` en `{ type: 'object' }` NU, que
fast-json-stringify rend `{}`) et a posé un témoin pour que la porte reste
gardée.

**Ce témoin monte `routes/communities/index` — le module masqué.** La conclusion
était juste (la route montée porte le même schéma nu, vérifié), mais le témoin
ne pouvait pas tomber sur le code réel.

Il est donc **reposé sur le module monté** (`communities.test.ts`), et
l'exemplaire masqué porte désormais un avertissement en tête disant qu'il est un
double sans valeur probante.

## 7. Une fixture qui aurait attesté une confidentialité fictive

En branchant le gate, `viewerFromRequest` a rendu `null` : la fixture
`mockAuthContext` du fichier de témoins live pose `type: 'registered'`, quand
`middleware/auth.ts` pose `type: 'user'` (ligne 354) — ce que `presence-gate.ts`
lit.

La production est correcte ; c'est la fixture qui était fausse. Laissée telle
quelle, elle aurait rendu un viewer `null`, donc un gate qui masque **tout**,
donc des témoins verts attestant une confidentialité que la production
n'applique pas. Corrigée, avec la raison écrite sur place.

(La prose de `services/gateway/CLAUDE.md` décrivant `type: 'registered' |
'anonymous'` est périmée sur ce point — le code fait foi.)

## 8. Témoins

**Le gate, sur le module MONTÉ** (`communities.test.ts`, +4) : masquage d'un
membre qui a coupé sa présence (fixture **en ligne** — le `mockMember` par
défaut est hors ligne et rendrait le témoin increvable), co-membre résolu par
les préférences seules, lecteur non membre résolu par le critère strict avec le
viewer de la requête, page sans membre qui n'ouvre aucune résolution.

**L'aperçu de recherche** (+1, sur le module monté) : reprise du témoin du
cycle 84, là où il garde quelque chose.

**Le masquage lui-même** (`communities-module-shadowing.test.ts`, neuf, +4) :
`require.resolve` atteste que `./routes/communities` désigne le FICHIER ; le
monolithe déclare bien la route de membres ; **le gate vit dans le module
monté** ; et les deux implémentations DIVERGENT dans les deux sens. Ce dernier
n'approuve pas la situation — il interdit de la redécouvrir par accident, et
tombera dès qu'on supprimera le monolithe, câblera le répertoire ou renommera
l'un des deux. Autant de moments où l'on VEUT être arrêté.

**ROUGE prouvé** : 3 des 4 témoins de gate tombent sur le code d'avant.

Suites rejouées : `routes/communities*` — 12 suites, 272 témoins verts.
`tsc --noEmit` propre.

## 9. Ce que ce cycle ne tranche pas

**Le sort du répertoire masqué appartient à un humain.** Les deux
implémentations ne se recouvrent pas :

- `/communities/:id/conversations/:conversationId` n'existe QUE dans le
  répertoire masqué — cet endpoint n'est donc servi nulle part ;
- le monolithe porte 4 routes que le répertoire n'a pas.

Supprimer le répertoire jette une refactorisation inachevée ; le câbler
**retirerait 4 routes vivantes** et en ajouterait une. Aucune des deux n'est
neutre, et ce n'est pas une décision d'agent de maintenance. Les faits sont
posés ici, le témoin structurel les fige, la décision reste à prendre.

**Reste ouvert par ailleurs** : la diffusion du réordonnancement de communautés
(cycle 85, lot multi-clients), la dette de duplication du collapse prefs-only
(cycle 84, neuf sites), et les deux charges utiles mortes du cycle 84.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur.

## 10. La leçon

> **Un correctif dans un fichier non chargé n'est pas un correctif — c'est un
> commentaire.** Le gate de présence des membres était écrit, motivé, couvert
> par des témoins verts, et n'a jamais protégé personne : `communities.ts` fait
> écran à `communities/`, et rien dans l'arborescence ne le dit. Sept fichiers
> de témoins entretenaient l'illusion en montant le module masqué.
>
> Le discriminant n'est pas la lecture du code, c'est la **résolution**. La
> question à poser devant deux implémentations d'un même domaine est mécanique
> et prend dix secondes : *laquelle l'`import` désigne-t-il ?* `tsc
> --traceResolution` ou `require.resolve` répondent ; l'inspection visuelle,
> jamais — les deux fichiers se ressemblent, et le mort est souvent le plus
> propre des deux, puisque c'est celui qu'on a pris le temps de refactoriser.

Et le corollaire, qui vaut pour le cycle précédent autant que pour celui-ci :

> **Le cycle 85 demandait « cette entité a-t-elle une jumelle ? ». Il faut y
> ajouter : « et laquelle est branchée ? »** Une jumelle non montée est pire
> qu'une absence : elle absorbe le travail de correction en rendant des témoins
> verts. Le cycle 84 y a laissé un témoin, et ce cycle-ci a failli y laisser son
> correctif — le gate du fichier mort portait aussi une demi-erreur de régime
> (§4), qu'un simple copier-coller aurait promue en production.
