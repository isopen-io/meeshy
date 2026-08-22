# Cycle 86 — Le correctif du cycle 84-bis était juste, et il ne s'exécutait pas

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-761vij`
**Périmètre** : passerelle (`routes/communities.ts`, `routes/communities/search.ts`,
un module d'aide neuf) et une suite neuve

**Clients touchés** : aucun changement de code client. Une réponse REST change de
contenu — et c'est tout l'objet du lot (§4).

---

## 1. D'où vient ce cycle

Le cycle 85-bis a montré que `routes/communities/` est injoignable :
`route-registration.ts` importe `'./routes/communities'` sans extension, Node
résout LOAD_AS_FILE avant LOAD_AS_DIRECTORY, et c'est `routes/communities.ts`
qui sert. Il a gaté les trois fuites de présence du fichier LIVE et posé
`module-shadowing.test.ts` pour que le piège ne se réarme pas en silence.

Deux heures plus tard, le piège s'est refermé sur quelqu'un d'autre — avant même
que le témoin ne soit sur `main`.

**La PR #3294 (« la recherche de communautés iOS était morte », cycle 84-bis) a
corrigé `routes/communities/search.ts`.** Le module mort. Ses DEUX fichiers de
témoins — `communities-search.test.ts` et `communities/search.test.ts` —
importent eux aussi le module mort. La suite est verte, cohérente avec
elle-même, et sans le moindre effet sur la production.

## 2. Le diagnostic du cycle 84-bis est JUSTE

Rien à reprendre sur le fond. `creator: { type: 'object' }` et
`members: { items: { type: 'object' } }`, sans `properties`, ne décrivent pas un
objet libre : fast-json-stringify applique `additionalProperties: false` par
défaut et sérialise ces formes en `{}`.

Et la conséquence côté client est plus violente qu'une donnée manquante.
Vérifié sur `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift` :

```swift
public struct APICommunityUser: Codable, Sendable {
    public let id: String        // NON optionnel
    public let username: String  // NON optionnel
```

`APICommunitySearchResult.creator` est bien `APICommunityUser?` — mais une
propriété Swift optionnelle ne tolère que la clé **ABSENTE** ou **`null`**, jamais
un objet MALFORMÉ. Un `"creator": {}` présent fait donc échouer le décodage de
`APICommunitySearchResult` **en entier**, et avec lui le tableau entier. Idem
pour `members: [APICommunityMember]?` face à `[{}, {}]`.

**La recherche de communautés iOS ne renvoie donc rien du tout** — pas « des
communautés sans aperçu », rien. Et elle le fait toujours au moment où ce cycle
commence, la correction vivant dans un fichier que rien n'importe.

## 3. Ce que ce cycle fait

Il **porte** le correctif du cycle 84-bis sur la route servie, sans en changer
une décision. Trois éléments, tous repris tels quels :

1. **Les propriétés déclarées** : `creator: { ...userMinimalSchema, nullable: true }`
   et `members: { type: 'array', items: communityMemberSchema }`.
2. **Le filtre `isActive: true`** sur l'aperçu de 5 membres — sans lui, l'aperçu
   peut présenter comme membre quelqu'un qui a quitté la communauté. Défaut
   invisible tant que le schéma vidait `members[]` en `{}` ; servi dès que la
   réponse porte vraiment ses champs.
3. **Le gate de présence à régime PAR LIGNE.**

Et il **dé-duplique** plutôt que de recopier. Le résolveur de présence était une
fonction locale de `routes/communities/search.ts` ; il devient
`routes/community-member-presence.ts`, et les DEUX modules l'importent — le
mort comme le vivant.

Ce choix n'est pas cosmétique : les deux fichiers servent la même recherche, et
la consolidation à venir (cycle 85-bis §7) devra choisir un FICHIER. Elle n'aura
pas en plus à arbitrer entre deux lois de présence qui auraient divergé entre
temps.

## 4. Le régime de présence, et pourquoi il se tranche par ligne

La recherche sert `isPrivate: false` **sans aucune condition d'appartenance** :
c'est une surface de DÉCOUVERTE, donc critère STRICT par défaut. Mais une
communauté dont le lecteur EST membre prouve un lien posé des DEUX côtés, et
relève du contexte acquis.

D'où la loi, identique à celle du fil de stories (cycle 83) : le régime se
tranche par LIGNE, pas par route. Une requête groupée résout l'appartenance du
lecteur aux communautés de la page ; les membres des communautés qu'il partage
passent par `resolvePrefsOnly`, les autres par `resolveForTargets`.

**Et un membre qui prouve le lien par UNE communauté de la page le prouve pour
toutes** : masquer sa pastille sur une ligne pendant qu'elle s'affiche sur la
suivante, dans la même page, ne décrirait rien.

## 5. Ce qui change

`GET /communities/search` : `data[].creator` porte enfin ses champs
(`id`, `username`, `displayName`, `avatar`) au lieu de `{}`, et
`data[].members[]` porte l'adhésion et son profil au lieu de `[{}, …]`.
`members[].user.isOnline` est filtré selon le régime du §4. L'aperçu ne
présente plus les membres partis.

**C'est un changement de CHARGE UTILE, assumé comme tel.** Le cycle 84 l'avait
nommé en §7 : faire vivre cet aperçu fait apparaître des profils de tiers sur
une porte de découverte, et exige donc le critère strict. Le cycle 84-bis a pris
cette décision produit et l'a implémentée correctement ; ce cycle ne fait que
l'amener là où elle s'exécute.

Web : `SearchPageContent.tsx` et `communities.service.ts` ne lisent ni `creator`
ni `members` — la réponse gagne des champs qu'ils ignorent, sans rupture
(21 témoins web verts).

## 6. Témoins

**`communities-search-live.test.ts` (neuf, +8).** Il monte le module RÉELLEMENT
servi — `routes/communities.ts` — avec les VRAIS schémas, et traverse la
sérialisation réelle. Il assert :

- `creator` porte ses champs, jamais `{}` ;
- `members[]` porte l'adhésion ET le profil, jamais `[{}]` ;
- **`id` et `username` sont présents sur chaque profil servi** — le témoin
  exprimé comme le client le vit, puisque ce sont exactement les deux champs
  non optionnels dont l'absence faisait échouer la réponse entière ;
- les compteurs plats `memberCount` / `conversationCount` survivent ;
- le critère strict masque, et masque AUSSI un id que le résolveur n'a pas rendu ;
- une communauté dont le lecteur est membre bascule sur `resolvePrefsOnly` ;
- le `select` porte `where: { isActive: true }` sur l'aperçu.

**ROUGE prouvé** : 7 des 8 tombent sur le code d'avant. Le huitième (compteurs
plats) passe trivialement et borne la correction.

**Suites rejouées** : gateway **809 suites / 18 896 témoins verts**, web
`communities.service` 21 verts, `tsc --noEmit` propre.

## 7. Ce que ce cycle ne fait PAS

**Il ne consolide toujours pas `communities`.** Basculer `communities.ts` en
coquille supprimerait quatre routes de production (`/mine`, `/:id/join`,
`/leave`, `/invite`) absentes du répertoire. Inchangé depuis le cycle 85-bis, et
toujours une décision de domaine.

Mais ce cycle en réduit le coût : la loi de présence de l'aperçu est désormais
partagée, donc un seul comportement à porter au lieu de deux à réconcilier.

**Il ne touche pas aux témoins du cycle 84-bis.** Ils gardent le module mort, ce
qui reste utile le jour où il deviendra vivant. Le témoin neuf garde la route
servie. Les deux coexistent sans se contredire.

## 8. Ce qui reste ouvert

- **Consolidation `communities`** : brancher le répertoire (en y portant les
  quatre routes manquantes) OU le supprimer. Décision de domaine.
- **Convergence prefs-only** : huit sites recopiés à la main, applicateur prêt
  depuis le cycle 85-bis.
- **Les deux domaines voisins du cycle 80** : appartenance à une communauté,
  épinglage / archivage de conversation.
- **Dette d'environnement**, inchangée : `npx eslint` échoue dans ce conteneur
  (ESLint global v9 résolu à la place de celui du dépôt, qui attend un
  `.eslintrc`). C'est l'environnement, pas le diff.

## 9. La leçon

> **Un témoin qui arrive après le correctif qu'il aurait sauvé n'est pas en
> retard : il est la preuve que le piège était réel.** Le cycle 85-bis a
> documenté l'ombrage et posé sa garde. Pendant que sa PR attendait la CI,
> quelqu'un d'autre est tombé exactement dedans — bon diagnostic, bon correctif,
> bon régime de présence, mauvais fichier. Rien dans son outillage ne pouvait le
> lui dire : le module compile, ses suites sont vertes, et elles importent le
> même fichier que lui.

Et le corollaire, qui est ce que ce cycle livre vraiment :

> **Quand deux fichiers servent la même route, la dé-duplication est plus urgente
> que le choix entre eux.** On peut vivre longtemps avec un doublon dont un seul
> côté s'exécute ; on ne peut pas vivre avec deux LOIS différentes sur la même
> porte, parce que le jour où il faudra n'en garder qu'une, personne ne saura
> laquelle était la bonne. Sortir la règle partagée dans un module tiers ne
> tranche pas le doublon — mais elle garantit qu'il n'y a plus qu'une seule
> réponse à porter quand on le tranchera.
