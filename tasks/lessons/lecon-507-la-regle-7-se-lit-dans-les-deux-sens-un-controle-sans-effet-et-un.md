## Leçon 507 — La règle 7 se lit dans les DEUX sens : un contrôle sans effet, et un écran sans contrôle qui y mène

**Le fait.** La v3 web sert `/contacts`, `/search`, `/notifications` et `/settings` — quatre écrans
livrés, testés, budgétés, chacun avec ses gates verts et son issue fermée. Mesuré sur `dev`
(`fd772e3a26`), en comptant les `href` réellement rendus : **zéro lien entrant, pour les quatre.**
On ne pouvait y arriver qu'en tapant l'adresse. `/settings` posait même `retour: '/chats'` — une
sortie vers un écran qui n'avait jamais eu son entrée.

Rien n'était cassé, et c'est le fond de l'affaire : chaque lot avait tenu son critère de fin, qui
disait ce que l'écran REND, jamais d'où l'on y VIENT. La navigation, elle, était une ligne de la
matrice (`sheet:member`) que personne n'avait prise, et qui portait pourtant son critère écrit :
« Remplace la barre d'onglets absente de la planche ».

> **La charte règle 7 — « un contrôle existe s'il a un effet » — a une réciproque que rien ne
> gardait : un écran n'existe que si un contrôle y mène.** Les deux moitiés produisent le même
> symptôme pour l'utilisateur (une fonction inatteignable) et se cherchent par des chemins
> opposés : la première en partant du bouton, la seconde en partant de la ROUTE. Un dépôt qui ne
> compte que les boutons morts ne voit jamais les écrans orphelins.

**Le témoin qui l'attrape ne juge aucun écran.** Il oppose deux sources qui ne se parlent pas : les
`app/**/route.ts` présents sur le disque, et les destinations que la navigation rend. Une liste de
routes écrite à la main en face d'une liste de liens écrite à la main serait une jumelle — elle
passerait au vert le jour où la route disparaît. Le compte à surveiller est simple et se pose à
CHAQUE écran neuf : *combien de liens entrants, et depuis où ?*

**Corollaire de méthode, payé dans le même lot.** Deux témoins gardaient « l'écran ne rend aucun
rond flottant » en portant leur raison écrite : « la v3 ne sert aujourd'hui ni compte ni réglages ».
La règle qu'ils défendaient (règle 6 — un rond est un `<a href>` vers une route SERVIE, jamais une
cible inerte) était juste ; c'est sa PRÉMISSE qui avait cessé de l'être, sans que personne relise la
phrase. **Devant un témoin qu'un lot fait rougir, lire d'abord son doc-comment : s'il énonce un
FAIT du dépôt plutôt qu'une règle, vérifier ce fait avant de toucher au code.** Un témoin dont la
prémisse a bougé ne se supprime pas — il se retourne vers la règle qu'il tenait.

Sites : `apps/web-v3/lib/contenu/espace.ts`, `apps/web-v3/app/connecte/espace-{vue,feuille}.ts`,
`apps/web-v3/__tests__/espace-membre.test.ts` (l'opposition disque ⇄ destinations),
`apps/web-v3/e2e/visual/v3-espace-membre.spec.ts`. Issue #5093.

---
