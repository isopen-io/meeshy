# Cycle 85 — Le jumeau corrigé portait la leçon dans son commentaire. Personne n'a ouvert le fichier d'à côté.

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ftmofu`
**Périmètre** : passerelle (`routes/community-preferences.ts`) et sa suite

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile modifiée. Une réponse REST **fait** enfin
ce qu'elle annonçait — voir §5.

---

## 1. D'où vient ce cycle

Le cycle 80 a laissé deux domaines voisins nommément ouverts, dont
« épinglage / archivage de CONVERSATION ». Ce cycle les prend.

Le domaine conversation s'est révélé **clos** — et bien clos. `UserConversationPreferences`
a un écrivain unique (`services/conversationPreferencesSync.ts`) dont l'en-tête
énonce un contrat en trois parties : persister, incrémenter `version`, diffuser
sur `user:{id}`. Le `DELETE` porte même un commentaire de quinze lignes
expliquant pourquoi il RÉINITIALISE la ligne au lieu de la supprimer (supprimer
redémarrerait la séquence de version à 1, et le premier changement d'après
serait rejeté par les autres appareils). Un cycle précédent a fait ce travail
proprement.

Le défaut était **un fichier plus loin**, sur l'entité jumelle.

## 2. Ce que `POST /user-preferences/communities/reorder` faisait

```ts
await Promise.all(updates.map(update =>
  fastify.prisma.userCommunityPreferences.updateMany({
    where: { userId, communityId: update.communityId },
    data: { orderInCategory: update.orderInCategory }
  })
));
return sendSuccess(reply, { message: 'Communities reordered successfully' });
```

`updateMany` ne touche **que les lignes existantes**. Or la ligne
`UserCommunityPreferences` n'est créée que par le `PUT` — épingler, mettre en
sourdine, archiver, renommer. **Une communauté sur laquelle l'utilisateur n'a
jamais rien réglé n'a pas de ligne.**

Le glisser-déposer d'une liste de communautés fraîches rendait donc `200` avec
« Communities reordered successfully », et ne persistait **rien**. L'ordre
revenait au chargement suivant, sans erreur, sans trace.

C'est le cas NORMAL, pas le cas limite : une liste de communautés dont
l'utilisateur a déjà réglé chaque entrée à la main est l'exception.

## 3. Le jumeau, corrigé, portait déjà la phrase

`reorderConversationPreferences` fait la même opération sur l'entité sœur. Un
cycle antérieur l'a corrigé et a laissé la raison écrite :

> - **A membership filter.** The write is an upsert, so an unscoped batch would
>   let any authenticated caller mint preference rows against arbitrary
>   conversation ids. **`updateMany` used to absorb that for the wrong reason:
>   it matched nothing, for anybody.**

La dernière phrase décrit **mot pour mot** la route communauté telle qu'elle
était encore. Le diagnostic était écrit, publié, versionné — dans le fichier
d'à côté, sur l'autre entité. Personne ne l'a rejoué là où il s'appliquait
aussi.

Et l'en-tête du module conversation, lui, énonce le principe qui aurait dû
déclencher la vérification :

> Keeping them in one function is what stops a new writer from honouring only
> part of the contract — the three deletion routes each did exactly that,
> silently.

Le mot juste est **silently**. Trois fois maintenant dans ce domaine, le défaut
est une écriture qui rend `200`.

## 4. Le correctif

`upsert` au lieu d'`updateMany`, **plus** les deux propriétés que le jumeau a
prouvées nécessaires :

- **Le filtre d'appartenance**, qui n'est pas un ornement : il est le COROLLAIRE
  de l'upsert. Sans lui, un lot non borné laisserait n'importe quel appelant
  authentifié fabriquer des lignes de préférences contre des ids arbitraires —
  exactement ce que `updateMany` empêchait par accident. On ne peut pas prendre
  la moitié du correctif du jumeau.
- **La déduplication dernier-gagnant**, sans laquelle deux entrées du même id
  dans un lot lancent deux upserts concurrents sur la même clé unique.

Un lot vide n'ouvre aucune requête ; un lot dont aucune communauté n'est celle
de l'appelant n'écrit rien et rend quand même `200` (le contrat de la route est
« applique ce qui est applicable », comme le jumeau).

## 5. Ce qui change

`POST /user-preferences/communities/reorder` **persiste** désormais l'ordre —
c'est-à-dire fait ce que sa réponse annonçait déjà. Aucun champ de réponse ne
change, aucun statut ne change.

Une conséquence de sécurité vaut d'être dite explicitement : l'ajout du filtre
d'appartenance **n'ouvre rien** ; il maintient à l'identique la propriété que
`updateMany` assurait par effet de bord, pendant que l'upsert, seul, l'aurait
retirée.

## 6. Témoins

5 neufs sur la route (`community-preferences-routes.test.ts`) : la ligne créée
quand elle n'existe pas, la communauté non-membre ignorée, le lot entièrement
étranger qui n'écrit rien, la déduplication dernier-gagnant, le lot vide qui
n'ouvre aucune requête.

**ROUGE prouvé** : 3 des 5 tombent sur le code d'avant. Les 2 restants — lot
vide, lot entièrement étranger — passent trivialement, et c'est attendu : ils
bornent la correction, ils ne détectent pas le défaut.

**Un témoin existant a été REPOINTÉ, pas affaibli.** `returns 500 on db error`
faisait rejeter `updateMany` — la méthode que la route n'appelle plus. Il serait
passé au VERT sur le chemin nominal en croyant tenir le chemin d'erreur : le
rejet porte désormais sur `upsert`. C'est la même classe de dette que le cycle
83 (un témoin qui ne peut plus tomber sous la mutation qu'il nomme), rencontrée
ici en passant.

Et il faut le dire franchement : **le témoin d'origine du réordonnancement
n'assertait que `statusCode === 200`.** Il ne pouvait pas tomber quand la route
ne persistait rien — c'est exactement ce qu'il a fait pendant toute la vie du
défaut.

Suites rejouées : `routes/community*`, `routes/communities/`,
`routes/conversation-preferences` — 13 suites, 317 témoins verts.
`tsc --noEmit` propre.

## 7. Ce que ce cycle laisse ouvert, et ne prend pas

**La diffusion manque toujours sur ce réordonnancement, et c'est un changement
de CONTRAT.** Le jumeau conversation diffuse `USER_PREFERENCES_REORDERED` ; la
route communauté ne diffuse rien, donc les autres appareils de l'utilisateur
n'apprennent jamais le nouvel ordre. Mais l'événement est **conversation-formé** :

```ts
updates: ReadonlyArray<{ conversationId: string; orderInCategory: number }>
```

et DEUX clients le décodent déjà sous cette forme (`apps/web`
`preferences-sync.service.ts`, iOS `ConversationStore.applyRemoteReorder`).
Servir la communauté demande soit un événement neuf, soit une union
discriminée — et, dans les deux cas, un lecteur côté web ET côté iOS. La règle
du dépôt est explicite : « quand on rend un champ autoritatif côté client, on
énumère TOUS les émetteurs serveur du même événement dans le même lot ». C'est
un lot multi-clients, pas un ramassage de passerelle : il est nommé ici, pas
bricolé.

**Vérifié et NON défectueux** (pour que le prochain cycle ne le rouvre pas) :
`UserCommunityPreferences` n'a **pas** de colonne `version`, et
`UserPreferencesCommunityUpdatedEventData` n'en porte pas non plus. Le `DELETE`
communauté supprime donc la ligne sans reproduire le défaut de redémarrage de
séquence que le `DELETE` conversation documente : côté communauté il n'y a pas
de séquence. C'est une différence de conception assumée, pas une asymétrie à
corriger.

**Domaine conversation : clos.** Écrivain unique, contrat en trois parties,
`DELETE` en réinitialisation, reorder diffusé.

**Restent ouverts** : l'appartenance à une communauté (l'autre domaine du cycle
80), et la dette de duplication du collapse prefs-only nommée au cycle 84 (neuf
sites).

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (ESLint global résolu à la place de celui du dépôt).

## 8. La leçon

> **Un correctif qui explique sa raison dans un commentaire n'a documenté que
> l'exemplaire qu'il touchait.** Le jumeau conversation portait la phrase exacte
> qui décrivait le défaut communauté — « `updateMany` used to absorb that for
> the wrong reason: it matched nothing, for anybody » — écrite, publiée,
> versionnée, dans le fichier d'à côté. Elle n'a rien déclenché.
>
> Le geste manquant tient en une question, à poser au moment où l'on écrit le
> commentaire et non des cycles plus tard : **cette entité a-t-elle une
> JUMELLE ?** Conversation / communauté, message / post, participant / membre —
> ce dépôt est plein de paires qui portent la même opération sur deux tables.
> Corriger l'une sans ouvrir l'autre, c'est laisser la moitié du défaut derrière
> soi avec sa propre explication posée dessus.

Et le corollaire, sur ce qui a permis au défaut de durer :

> **Un témoin qui n'assert que le code de statut atteste que la route
> RÉPOND, pas qu'elle FAIT.** `expect(res.statusCode).toBe(200)` était vert sur
> une route qui ne persistait rien, et le serait resté indéfiniment. Une
> écriture se garde sur son EFFET — la ligne écrite, l'événement émis — jamais
> sur le fait qu'elle n'a pas levé d'exception.
