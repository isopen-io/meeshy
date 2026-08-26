# Cycle 92 — Toute la signalisation d'appel servait `{"success":false,"error":{}}`

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-jhuv4c`
**Périmètre** : `packages/shared/types/api-schemas.ts` (une constante),
20 fichiers de routes de la passerelle, deux témoins, un outil neuf.

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. **Les réponses d'ERREUR gagnent des champs** — voir §6, qui
est aussi la partie de ce lot qui touche un contrat.

---

## 1. D'où vient ce cycle

Le cycle 91 s'est arrêté sur une dette qu'il a nommée précisément :

> Le balayage ne détecte pas une déclaration **INCOMPLÈTE**, seulement une
> déclaration **ABSENTE**. […] Un balayage qui comparerait les `properties`
> déclarées aux clés qu'un handler construit serait un outil différent, et
> beaucoup plus ambitieux.

Il l'est — pour une charge utile de SUCCÈS, dont le producteur change à chaque
route. Il ne l'est pas pour une **erreur** : `utils/response.ts:sendError` est le
producteur unique de toutes les erreurs de la passerelle, et il pose toujours les
mêmes clés.

```
{ ...details, success: false, error, message, code, violations? }
```

**Le superset est donc connu, fixe, et vérifiable par lecture du schéma seul.**
C'est ce qui rend l'outil « beaucoup plus ambitieux » du cycle 91 tractable sur
cette famille-là, et sur elle seulement.

## 2. Ce que le balayage a trouvé

Les schémas de réponse d'erreur de `routes/`, comptés dans le FICHIER :

| population | déclarations | état |
|---|---|---|
| étalent `errorResponseSchema` | **354** | la constante ne déclarait pas `message` |
| écrits à la main, enveloppe amputée | **80** (20 fichiers) | clé absente, ou du mauvais TYPE |

**Ce compte a dérivé une fois avant d'être publié**, et la façon dont il a dérivé
mérite d'être dite. La première rédaction annonçait « 127 sites » : c'était le
nombre de triplets UNIQUES `(fichier, statut, forme)` que mon balayage de
reconnaissance rendait après déduplication — donc cinq `404` d'un même fichier
comptés pour un. Un chiffre juste, sur autre chose que ce qu'il prétendait
compter.

Le cycle 92 concurrent (`main`) a publié dans le même temps la règle qui l'attrape :
**« un compte est une AFFIRMATION, comme un tri (cycle 86 bis) : il se compte,
il ne s'hérite pas. »** Recompté contre le fichier à la base pré-correctif :
354 étalements, tous sous un bloc `response:`.

## 3. La racine : `errorResponseSchema` ne déclarait pas `message`

La constante partagée la plus utilisée du dépôt déclarait `success`, `error` et
`code`. L'enveloppe pose `message` **toujours** (`message: options?.message || error`).
Mesuré au sérialiseur :

```
in  : { success: false, error: 'Message non trouve',
        message: 'Le message a ete supprime', code: 'MESSAGE_NOT_FOUND' }
out : {"success":false,"error":"Message non trouve","code":"MESSAGE_NOT_FOUND"}
```

Le fait était **connu et documenté** dans `services/gateway/CLAUDE.md` depuis le
cycle 89, sous une réserve explicite : *« l'ajouter est un changement de contrat
sur des centaines de routes — une décision, pas une initiative »*. Un témoin le
GELAIT (`error-envelope-serialization.test.ts`, `expect(body.message).toBeUndefined()`).

§6 dit pourquoi ce cycle la tranche, et ce qu'il faut regarder si on veut la
défaire.

## 4. Le vrai défaut : `calls.ts` servait `{"success":false,"error":{}}`

C'est la trouvaille de ce cycle, et elle n'est pas de la même nature que §3.

Les **dix-neuf** schémas d'erreur de `routes/calls.ts` déclaraient :

```ts
error: {
  type: 'object',
  properties: { code: …, message: …, details: … }
}
```

quand le fichier appelle, sur chacun de ces chemins :

```ts
return sendError(reply, statusCode, errorCode, { message });   // error = CHAÎNE
```

Mesuré au sérialiseur, sur le schéma tel qu'il était :

```
in  : { success: false, error: 'NOT_A_PARTICIPANT',
        message: 'Vous ne participez pas a cet appel', code: undefined }
out : {"success":false,"error":{}}
```

**Une clé déclarée du mauvais type n'est pas supprimée : elle est COERCÉE.** Et
une chaîne coercée en objet ne garde rien. Toute la surface de signalisation
d'appel — `NOT_A_PARTICIPANT`, `CALL_ALREADY_ACTIVE`, `NO_ACTIVE_CALL`,
`PERMISSION_DENIED` — servait donc ses erreurs sans code, sans message, et sans
rien qu'un client puisse distinguer d'un autre échec. Un appel qui échoue, sur
les trois clients, ne pouvait dire que « ça n'a pas marché ».

### Pourquoi aucun outil ne le voyait

Le balayage frère (`response-schema-sweep`) signalait, sur ce fichier, une seule
ligne : `calls.ts|details|400`. C'est le `details` **imbriqué** dans le mauvais
objet — la feuille. La racine, `error` lui-même, portait des `properties` : elle
n'était donc pas « nue », donc invisible.

> **Le balayage voyait la feuille et jamais la racine.** Un an d'inventaire gelé
> nommait ce fichier sans que personne y lise autre chose qu'une dette de
> détail.

C'est la **troisième forme** de la famille, après la clé absente (cycle 89) et la
clé écrite contre l'autre producteur (cycle 91) — et la seule qui se cache
derrière une déclaration d'apparence complète.

## 5. L'outil

`routes/__tests__/error-schema-sweep.ts`, gardé par son test. Il confronte chaque
schéma de statut ≥ 400 au producteur unique, sur **deux** critères :

- `missing` — une clé de l'enveloppe que le schéma ne déclare pas ⇒ supprimée ;
- `mistyped` — une clé déclarée d'un type que `sendError` ne pose pas ⇒ coercée.

Il tient pour complets un étalement de constante partagée et un
`additionalProperties: true`, ignore les statuts de succès, et dépouille les
commentaires (sans quoi il retrouve les commentaires des cycles précédents au
lieu des défauts — leçon du cycle 87).

**Son inventaire est VIDE, pas gelé.** Contrairement au balayage frère, il n'y a
pas de dette d'erreur légitime à porter : la forme juste est toujours la même
constante. Une entrée qui apparaît est un défaut, sans arbitrage.

Détail de mise au point qui vaut d'être noté : les deux balayages ont dû devenir
**conscients des chaînes**. Une `description` d'OpenAPI porte volontiers une
virgule (`'Forbidden - Anonymous users cannot end calls, or the requester…'`), et
un compteur d'accolades naïf la prend pour de la structure.

## 6. Ce qui change dans les réponses — et la décision qu'il porte

- **`calls.ts` (19 sites)** : `error` cesse d'être un objet vide et porte le code
  d'erreur ; `message` et `code` cessent d'être supprimés. C'est une réparation
  pure, aucun arbitrage.
- **Les 80 sites écrits à la main (20 fichiers)** : ramenés sur
  `errorResponseSchema`, en **conservant** ce qu'ils déclaraient de propre — le
  `retryAfter` d'un 429, le `suggestedNickname` d'un 409 (celui-là même que
  `utils/response.ts` cite en exemple de l'étalement de `details`), le
  `nextChangeAllowedAt`, les `description` spécifiques. Dix sites y déclaraient
  `{ success, message }` sans `error` : ils gagnent `error` et `code`.
- **Les 354 déclarations qui étalent la constante** : gagnent `message`.

**La décision.** `services/gateway/CLAUDE.md` réservait l'ajout de `message`
comme « une décision, pas une initiative ». Ce qui la tranche ici n'est pas un
avis sur son utilité, c'est une **dépendance** : ramener les 80 sites sur la
constante partagée l'exige. Dix d'entre eux servaient déjà leur phrase par un
`message` déclaré à la main ; les consolider sur une constante muette sur
`message` aurait échangé une troncature contre une autre.

Et le texte n'était pas décoratif : **138 appels d’erreur du dépôt (sur 1440) passent un
`message` DISTINCT de l'`error`**, et `apps/web/services/api.service.ts:239` le
lit EN PREMIER (`data.message || data.error`). Sur `calls.ts`, `error` porte le
CODE et `message` la phrase : le client affichait le code.

**Ce qu'il faut regarder si on veut défaire ce choix** : le seul changement
observable côté client est qu'un `message` distinct s'affiche désormais à la
place de l'`error` sur les routes qui en passent un. Aucune réponse ne PERD de
champ, sur aucune des 434 déclarations.

## 7. Témoins

`error-schema-sweep.test.ts` — 12 témoins : deux sur les constantes partagées
(elles déclarent le producteur), un cliquet à inventaire vide, neuf sur les
discriminations de l'outil, dont la forme exacte de `calls.ts` et le piège
symétrique (« ne pas prendre le `type` d'une propriété IMBRIQUÉE pour celui de
la clé »).

`error-envelope-serialization.test.ts` — le bloc qui GELAIT le défaut de §3
assert désormais la réparation, et gagne deux témoins à travers le vrai
sérialiseur : la phrase lisible quand elle diffère du code, et **la coercition
elle-même** (`{ success: false, error: {} }`), gardée comme forme fautive.

**ROUGE prouvé** avant correction : 3 témoins tombaient (les deux constantes, le
cliquet avec ses 80 sites dont les 19 `~error` de `calls.ts`).

### Le piège que la mise au point a tendu

Le helper `serve()` de `error-envelope-serialization.test.ts` fixe la réponse au
statut **400**. Les deux témoins neufs, écrits en `403` par mimétisme avec
`calls.ts`, ne traversaient donc AUCUN schéma : l'un est tombé — révélant le
problème — et **l'autre passait, pour la mauvaise raison**. Repointés en 400.

> Un témoin de sérialisation qui n'atteint pas le sérialiseur est vert et vide.
> C'est la même famille que « `statusCode` n'est pas une observation de la charge
> utile » (cycle 86), rencontrée par le bout du STATUT plutôt que celui du corps.

## 8. Coût

Nul à l'exécution : aucune requête, aucun chemin de code, aucun handler touché.
Les schémas de réponse sont compilés une fois au démarrage. Le diff des routes
est net de **-318 lignes** (472 supprimées, 154 ajoutées) — vingt fichiers
cessent de recopier une enveloppe.

## 8 bis. Collision avec le cycle 91 bis — et ce qu'elle prouve

Pendant que ce cycle travaillait, une session concurrente (`main`, PR #3322,
« la connexion 2FA était morte, et le balayage ne pouvait pas la voir ») a
touché `calls.ts`. Elle a atteint **le même diagnostic et écrit le même
correctif** sur le seul 400 que l'inventaire gelé nommait :

```ts
// … `sendError` rend `error` en STRING à la RACINE … `error` sortait en `{}`
400: { description: '…', ...errorResponseSchema },
```

Deux sessions sans contact ont donc trouvé la même coercition en partant de deux
bouts opposés — elle du cliquet des objets nus, ce cycle du producteur. C'est une
confirmation indépendante, et le conflit de fusion s'est réduit à une
`description` (la sienne, plus riche, est retenue).

**Mais elle voyait la FEUILLE.** Le cliquet nommait `calls.ts|details|400` : un
site, sur le `details` imbriqué. La racine — `error` déclaré objet — vivait sur
les **dix-neuf** schémas du fichier, et sur vingt fichiers de plus. Le
correctif concurrent en a réparé **un**.

> Deux outils qui cherchent l'ABSENCE et deux sessions qui les suivent
> convergent sur le site que l'outil DÉSIGNE, pas sur la famille dont il fait
> partie. C'est l'argument le plus net pour outiller la question du PRODUCTEUR :
> elle seule rend l'étendue visible.

Fusion manuelle, trois conflits (`calls.ts`, l'inventaire gelé,
`services/gateway/CLAUDE.md`), résolus en gardant l'état le plus avancé des deux
côtés : l'inventaire tombe à UNE ligne (`messages.ts|sender|200`) — leur cycle a
aussi réparé `links/admin.ts|creator|200` et retiré
`users/profile.ts|permissions|200`.

## 9. Ce que ce cycle laisse ouvert

**Balayage frère : UNE ligne restante** après fusion avec le cycle 91 bis (§8 bis)
— `messages.ts|sender|200`, dette de FORME seulement (cycle 88).

**Reconnaissance faite pour le cycle suivant** (`messages.ts|sender|200`), pour
qu'il parte informé — c'est le lot que le cycle 91 désignait, et qui reste le
plus gros :

- Le schéma de `GET /messages/:messageId` décrit le MESSAGE au premier niveau
  quand `sendSuccess` répond `{ success, data }`. **Toutes ses déclarations sont
  donc inertes** ; `success` et `data` traversent par son
  `additionalProperties: true`. Vérifié à nouveau ce cycle.
- L'aligner sur l'enveloppe est faisable **sans troncature** en portant
  `additionalProperties: true` à CHAQUE niveau d'objet — c'est ce qui protège
  aujourd'hui, et rien n'oblige à le retirer pour déclarer le reste.
- Le piège à ne pas répéter : le `sender: { type: 'object' }` nu qu'il porte ne
  vide rien aujourd'hui **parce que la déclaration est inerte**. Le rendre
  effectif sans lui donner de `properties` le viderait — c'est-à-dire créerait le
  défaut que le balayage croit y voir.

Dettes reconduites : le balayage ignore l'enveloppe (cycle 88) et
`packages/shared` (cycle 89) ; `npx eslint` échoue dans ce conteneur (cycle 79).
Et `translatedAudios` a toujours deux formes de producteur qui se contredisent
(cycle 91 §4).

## 10. La leçon

> **Une clé déclarée du mauvais TYPE est coercée, pas supprimée — et une
> déclaration complète peut être entièrement fausse.** Les dix-neuf schémas de
> `calls.ts` portaient `success` et `error` : présence parfaite, contenu nul.
> Vérifier qu'un schéma déclare les bonnes clés ne dit rien tant qu'on n'a pas
> vérifié qu'il leur donne le bon type contre son producteur.

Et le corollaire, sur ce qui rend un outil possible :

> **Ce qui rend une vérification tractable, c'est l'UNICITÉ du producteur.** Le
> cycle 91 a jugé « beaucoup plus ambitieux » un outil comparant les clés
> déclarées aux clés construites, et il avait raison pour les charges utiles de
> succès — autant de producteurs que de routes. Les erreurs n'en ont qu'un. La
> bonne question devant une famille de défauts n'est pas « peut-on l'outiller ? »
> mais « cette famille a-t-elle un producteur unique ? » — et il faut la poser
> famille par famille, parce que la réponse change.
