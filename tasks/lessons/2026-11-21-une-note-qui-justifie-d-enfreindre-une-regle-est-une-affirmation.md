## Une NOTE qui justifie d'enfreindre une règle du dépôt est une AFFIRMATION

**Date** : 2026-11-21. **Lot** : #20190 (cycle 203 de la routine temps réel).
**Famille** : cycle 86 bis (un tri), 93 (un compte), 94 (une contrainte de
schéma), 161 (un consommateur nommé).

**Le constat**

`GET /conversations/:conversationId/links` contournait `sendSuccess()` — le
producteur UNIQUE que le `CLAUDE.md` impose à toutes les routes — par un
`reply.send` direct, sous cette note écrite sur place :

```ts
// NOTE: Cannot use sendSuccess() — response includes a top-level `isModerator`
// field that iOS SDK (ConversationLinksResponse) and web parse at root level.
// Migration to sendSuccess requires a coordinated client update (breaking change).
```

Trois affirmations, **toutes fausses** : le type `ConversationLinksResponse`
n'existe nulle part dans le dépôt ; aucun client ne lit `isModerator` de cette
route ; et **aucun client n'appelle cette route** — ses deux seules occurrences
sont les catalogues d'adresses générés depuis `route-manifest.json`.

Et le champ que le contournement existait pour préserver n'atteignait aucun
fil : le schéma de réponse, dix lignes plus haut dans le même fichier, ne le
déclare pas, et `fast-json-stringify` applique `additionalProperties: false`
par défaut. **Le contournement protégeait un champ que son propre schéma
supprimait.**

**La règle**

> Le dépôt sait déjà qu'un tri, un compte, un consommateur nommé et une
> contrainte de schéma sont des affirmations à vérifier. **Une note qui dit
> « on ne peut pas appliquer la règle ici » en est une aussi** — et c'est la
> plus coûteuse de la famille, parce qu'elle ne décrit pas seulement l'état :
> elle DISPENSE. Personne ne relit une dispense ; on la respecte.

Les marqueurs qui doivent déclencher la vérification, tous présents ici :

1. **Elle NOMME un consommateur** (« iOS SDK (`ConversationLinksResponse`) »).
   Un nom de type se cherche en une commande. S'il n'existe pas, la note ne
   décrit rien.
2. **Elle qualifie le correctif de « breaking change »** sans dire pour QUI.
   La question se répond en comptant les sites d'APPEL, pas les entrées de
   catalogue — un chemin présent dans un catalogue généré n'est pas un appelant.
3. **Elle parle de ce que les clients LISENT** alors qu'aucun témoin de la route
   ne traverse la sérialisation. Les quatre témoins assertaient `reply._body`,
   l'objet du gestionnaire : le seul endroit d'où la note est INVÉRIFIABLE.

**Le lien avec la famille des témoins**

C'est la troisième fois que le dépôt mesure la même mécanique : un témoin posé
sur l'objet du gestionnaire ne peut pas voir ce que le sérialiseur retire. Ici
l'un d'eux s'appelait « maps currentUses to participantCount in response » et
attestait une correspondance qu'aucun client n'a jamais reçue.

> Quand une dette est tenue par une note qui parle de ce que les clients
> lisent, **le seul témoin capable de la contredire est celui qui traverse
> `app.inject()`** — et c'est précisément celui que la route n'avait pas.

**Détail**

`tasks/realtime-sync-audit-2026-11-21-cycle203-20190.md`.
