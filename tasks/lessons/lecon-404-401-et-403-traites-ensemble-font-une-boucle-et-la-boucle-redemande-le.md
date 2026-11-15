## Leçon 404 — 401 et 403 traités ensemble font une BOUCLE, et la boucle redemande le mot de passe à chaque tour

**Lot `/chats/:cle` de la v3.** L'écran renvoyait vers `/login` sur les deux
codes. Mesuré contre la passerelle de staging, une conversation dont on n'est
pas membre rend :

```
403 — Access denied: you are not a member of this conversation or it no longer exists
```

Le lecteur était donc renvoyé se connecter, se connectait, revenait au même fil,
était refusé de la même façon — indéfiniment, en ressaisissant son mot de passe
à chaque tour. Rien ne rougissait : chaque étape prise isolément est correcte.

> **401 dit « le JETON ne vaut plus ». 403 dit « il vaut, mais pas pour CECI ».**
> Se reconnecter répare le premier et ne peut rien pour le second. Les traiter
> ensemble transforme un refus légitime en boucle d'authentification.

Deux corollaires, tous deux vérifiés dans le même lot :

- **Le refus se dit « introuvable », pas « interdit ».** Répondre « ce fil
  existe, mais pas pour vous » renseigne qui balaie des identifiants — c'est le
  patron `resolveConsumptionTarget` (§ 5.1) déjà appliqué aux jetons de lien. Le
  témoin l'exprime par une ÉGALITÉ : `issue(403)` et `issue(404)` doivent rendre
  la même chose.
- **La confusion voyage.** Les deux autres routes du même lot
  (`lib/api/compte.ts`) la portaient déjà, sans témoin pour la dire : elles
  avaient été écrites d'un trait, `401 || 403`, parce que les deux « veulent dire
  pas autorisé ». Chercher le motif, pas seulement le site où il a mordu.

Ce que le défaut apprend sur la méthode : il n'a pas été trouvé par relecture
mais en **demandant une ressource qu'on n'a pas le droit de voir**. Un écran
protégé se teste avec trois jetons — aucun, le sien, et celui de quelqu'un
d'autre — et c'est le troisième qui parle.
