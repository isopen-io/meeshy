## Cycle 203 — une NOTE qui justifie d'enfreindre une règle du dépôt, fausse sur ses trois affirmations (#20190)

**Date** : 2026-11-21. **Base** : `dev` à `4a2c57d19`. **Issue** : #20190.

### D'où vient ce lot

Constat B7 de l'audit adversarial du cycle 202 : le lot y avait ajouté un
témoin sur `GET /conversations/:conversationId/links` **sans traverser le
sérialiseur**, donc sans pouvoir voir ce que la route sert.

### La NOTE, et ce qu'elle tenait ouvert

Le gestionnaire contournait `sendSuccess()` — le producteur UNIQUE que le
`CLAUDE.md` impose à TOUTES les routes — par un `reply.send` direct, sous cette
justification écrite sur place :

```ts
// NOTE: Cannot use sendSuccess() — response includes a top-level `isModerator`
// field that iOS SDK (ConversationLinksResponse) and web parse at root level.
// Migration to sendSuccess requires a coordinated client update (breaking change).
```

**Les trois affirmations sont fausses**, mesurées le 2026-11-21 :

| affirmation | mesure |
|---|---|
| « iOS SDK (`ConversationLinksResponse`) » | **ce type n'existe NULLE PART** dans le dépôt — ni `packages/MeeshySDK`, ni `apps/ios`, ni ailleurs |
| « iOS et le web parsent `isModerator` à la racine » | **aucun client ne le lit** : la seule occurrence du dépôt est une propriété calculée PRIVÉE d'une vue iOS sans rapport (`ParticipantsView.swift`) |
| « migrer exige une mise à jour client coordonnée (breaking change) » | **aucun client n'APPELLE cette route** : ses deux seules occurrences sont les catalogues d'adresses GÉNÉRÉS depuis `route-manifest.json` (`ConversationsEndpoint.swift`, `ApiRoutesConversations.kt`), zéro site d'appel sur les trois clients |

### Et le champ que le contournement protégeait n'atteignait aucun fil

Le schéma de réponse de la route, dix lignes plus haut dans le même fichier, ne
déclare **ni** `isModerator` **ni** `participantCount` — et
`fast-json-stringify` applique `additionalProperties: false` par défaut.
Mesuré :

```
in  : { success:true, data:[{id, linkId, …, currentUses, participantCount}], isModerator:true }
out : {"success":true,"data":[{"id":"1","linkId":"mshy_x","currentUses":3}]}
```

**Le contournement protégeait un champ que son propre schéma supprimait.** Il
n'y a donc aucun changement de contrat dans ce lot : seulement du code mort qui
part, et une route qui rejoint le producteur unique.

> **Une NOTE qui justifie d'enfreindre une règle du dépôt est une AFFIRMATION,
> et se vérifie comme telle** — au même titre qu'un compte (cycle 93), un tri
> (cycle 86 bis), un consommateur nommé (cycle 161) ou une contrainte de schéma
> (cycle 94). Celle-ci a tenu une route hors du producteur unique pendant toute
> sa vie, en nommant un type qui n'a jamais existé.

### Pourquoi personne ne l'a vue, et c'est structurel

Les quatre témoins de la route assertaient `reply._body` — **l'objet du
gestionnaire**, via une fausse `reply` — jamais le fil. L'un d'eux s'appelait
« maps currentUses to participantCount in response » et attestait une
correspondance qu'**aucun client n'a jamais reçue**.

> Un témoin posé sur l'objet du gestionnaire ne peut pas voir ce que le
> sérialiseur retire. Et quand la NOTE qui tient la dette parle justement de ce
> que les clients LISENT, le seul témoin capable de la contredire est celui qui
> traverse `app.inject()`.

### Le correctif

`sendSuccess(reply, links)`. `isModerator` **survit comme variable** : il
gouverne la SÉLECTION (`createdBy`), la seule chose qu'il décidait vraiment, et
le successeur de cette adresse sert la même information sous
`meta.viewerIsModerator` (`routes/links/user.ts`), qui la DÉCLARE.

Les quatre témoins assertent désormais ce que la route REMET, et ce que le FIL
porte est gardé par `conversation-links-deprecation.test.ts`, qui monte la vraie
route sur un vrai Fastify.

### La preuve

| mesure | résultat |
|---|---|
| le contournement remis (mutation) | **4 témoins rouges sur 14** |
| après correctif | **67/67** sur les trois suites de la route |
| cliquets de schéma de réponse (`routes/__tests__/`) + table des routes | **17 suites / 221 témoins verts** |
| `tsc --noEmit` | **0** |

Le témoin « ne porte NI `isModerator` NI `participantCount` » **passait déjà
avant le correctif** — c'est la mesure elle-même, et il faut le dire : ce n'est
pas une preuve de ROUGE, c'est un **piège armé** (patron du cycle 84). Il tombe
le jour où quelqu'un DÉCLARE l'un de ces champs, et l'oblige à décider s'il a le
droit d'être servi.

### Ce que ce lot ne fait pas

Il ne retire pas la route. Elle est dépréciée depuis le 2026-08-30 et reste
servie jusqu'à son retrait, avec ses en-têtes `Deprecation` / `Sunset` / `Link`
— c'est la règle du dépôt sur la fenêtre de retrait, et l'absence de client ne
l'abrège pas.
