## Leçon 580 — Une erreur de DÉCODAGE tombe dans le `catch` de la panne RÉSEAU, et la file se rejoue pour toujours

2026-09-11, iOS (audit de cohérence iOS ↔ passerelle).
`SettingsActionQueue` rejoue une modification de profil faite hors-ligne. Le
gestionnaire décodait la réponse en `APIResponse<MeeshyUser>` ; `PATCH /users/me`
sert `data: { user, message }`. Le décodage échouait **à tous les coups**, sur
`keyNotFound(id)`.

Ce qui rend le défaut invisible n'est pas l'échec : c'est OÙ il atterrit.

```swift
} catch {                     // 5xx, connectivité… et keyNotFound
    return false              // « garder en file, on rejouera »
}
```

La doctrine de ce `catch` est juste pour une panne réseau. Appliquée à une
erreur de FORME, elle produit : le serveur a écrit, le client croit avoir
échoué, l'action reste en file, et chaque retour en ligne la rejoue. Le seul
symptôme visible est un compteur « en attente de synchronisation » qui ne
redescend jamais — jamais une erreur.

> **Un `catch` fourre-tout classe par DÉFAUT, et son défaut encode une
> hypothèse : « ce qui a échoué est le transport ».** Devant un rejeu, demander
> *quelles autres erreurs finissent ici, et le verdict leur convient-il ?* Une
> erreur de décodage est TERMINALE au sens de la file (rejouer n'y changera
> rien) tout en étant indistinguable d'une erreur transitoire.

Parade de forme, plus solide que d'énumérer un cas de plus : **un rejeu ne doit
exiger aucune forme de réponse.** Le chemin persiste une adresse écrite par une
version possiblement antérieure de l'app ; parier sur la forme de ce qu'elle
rend est un pari sur une route qu'on ne connaît pas. `SimpleAPIResponse` —
l'enveloppe, sans son `data` — ne peut pas tomber sur un changement de route.

Le jumeau du site avait déjà la bonne forme (`OutboxDispatcher.updateProfile`,
`APIResponse<[String: AnyCodable]>`) avec, en commentaire, exactement cette
raison. **Deux sites qui font la même requête ne partagent pas pour autant ce
qu'on a appris sur elle** — chercher le jumeau fait partie du correctif.
