## Leçon — « authentifié » ne veut pas dire « a un compte » (2026-08-18)

Un invité de lien partagé rend `isAuthenticated` VRAI : `joinAnonymously` appelle
`setUser(participant)`, et `setUser` pose `isAuthenticated: !!user`. Tout garde
écrit `enabled: isAuthenticated` s'ouvre donc pour quelqu'un sans compte, et lui
fait demander des ressources que le gateway lui refuse (401 sans en-tête, 403
avec `X-Session-Token`). Gater sur l'IDENTIFIANT (`hasAccountCredential()`),
jamais sur la présence d'une identité.

Corollaire de transport : **un jeton nu ne dit pas sous quel en-tête le
présenter.** Compte = `Authorization: Bearer <JWT>` ; invité = `X-Session-Token`,
qui n'est pas un JWT — l'envoyer en Bearer fait répondre « Invalid JWT token ».
Passer un `String` repose la question à chaque site d'appel ; il a suffi d'un
site distrait (`ApiService`) pour exclure toute une population, pendant que trois
sites compensaient à la main et masquaient le trou. Le type porte donc l'en-tête
AVEC la valeur : `RequestCredential` (web), `MeeshyRequestCredential` (iOS).

### Deux réflexes de diagnostic que cette panne a payés
- **Lire l'horodatage avant de conclure.** La rafale de 401 précédait de 7
  secondes le join qui, lui, réussissait en base. Le serveur allait très bien ;
  la panne était entièrement cliente.
- **Un second lecteur du même état est la cause, pas la solution.** Mon premier
  correctif lisait `localStorage` en direct au lieu de passer par `authManager` —
  c'est-à-dire exactement la duplication qui avait produit le défaut. Le test
  existant l'a attrapé.
