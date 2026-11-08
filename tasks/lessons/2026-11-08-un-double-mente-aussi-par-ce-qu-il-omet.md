# Un double mente aussi par ce qu'il OMET — et un témoin d'émission peut couvrir un 500

*2026-11-08 — #17032, cycle 148*

## Le site

`POST /conversations/:id/participants` émet ses diffusions d'adhésion, puis
rebranche les sockets de l'arrivant :

```ts
io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_JOINED, …);
await announceMemberArrival({ … });
socketManager.joinUserToConversationRoom(userId, conversationId).catch(…);
```

Le double de manager du harnais (`wireServerToFastify`,
`__tests__/unit/routes/participants.test.ts`) portait `getIO`,
`invalidateParticipantCache`, `endLiveLocationForDepartedMember` — **pas
`joinUserToConversationRoom`**. L'appel levait donc un `TypeError` synchrone
(`.catch` sur `undefined`), attrapé par le `catch` de fin de route, qui
répondait **500**.

Et le témoin était VERT. Il assertait `io.to` et `io._emit`, rien d'autre : les
émissions avaient déjà eu lieu une ligne plus haut.

## Ce que ça dit

> **La règle connue — « un double mente aussi par ce qu'il ACCEPTE » — a une
> variante par OMISSION, et elle est plus discrète.** Une méthode absente ne
> refuse rien et ne rend rien de faux : elle fait TOMBER la suite du
> gestionnaire. Tout ce qui précède l'appel manquant reste observable, tout ce
> qui le suit disparaît — et un témoin qui n'assert que ce qui précède atteste
> un gestionnaire qui lève.

Le défaut n'était visible que depuis l'ORDRE du code, et c'est un lot de
réordonnancement qui l'a révélé : en remontant l'admission dans la room AVANT
les diffusions — ce que la porte de lien écrivait déjà comme sa règle (« c'est
la première qui décide s'il recevra quoi que ce soit du fil ») — le `TypeError`
est passé devant les émissions, et quatre témoins sont tombés d'un coup.

## Deux réparations, et aucune ne remplace l'autre

1. **COMPLÉTER le double** : le manager de production porte la méthode, celui
   du harnais doit la porter aussi. Un double se construit depuis la surface
   réelle du collaborateur, pas depuis ce que le témoin du jour interroge.
2. **Faire assert le témoin sur la RÉPONSE** :
   `expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }))`.
   C'est la règle « un témoin d'écriture assert sur l'EFFET, jamais sur le
   statut » prise par l'autre bout — ici il manquait le statut, parce que
   l'effet observé était une émission placée avant la panne.

## À faire la prochaine fois

Devant un témoin d'ÉMISSION :

- demander ce que le gestionnaire fait APRÈS l'émission qu'on observe, et si le
  double le permet ;
- ajouter une assertion sur la réponse, même quand l'émission est le sujet : une
  diffusion juste au-dessus d'un gestionnaire qui lève n'est pas un succès ;
- devant tout `x.method(...).catch(...)` sur un collaborateur injecté, se
  souvenir que le `.catch` garde la PROMESSE et pas l'APPEL (§ Critical
  Gotchas) — les deux gardes sont disjointes, et c'est la seconde qui manque
  quand un double est incomplet.
