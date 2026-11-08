## L'un OU l'autre membre d'un tête-à-tête le rend obsolète (2026-11-02, #14653)

**Statut** : Accepté

### Contexte

`DELETE /conversations/:id/obsolete` (#14643) efface le contenu pour tous, retire
la conversation de toutes les listes et la purge sous 48 h. Sa permission était
celle de `DELETE /conversations/:id` : administrateur de la conversation (ou rôle
de plateforme équivalent). Dans un tête-à-tête, seul le créateur porte ce rang :
l'autre membre ne pouvait pas effacer un échange auquel il a pris part à égalité.

### Décision (porteur, option a)

Dans une conversation `direct`, l'un OU l'autre des deux membres peut la rendre
obsolète. Les groupes, communautés et conversations publiques gardent la règle de
l'administrateur, inchangée.

La garde est fail-closed (`mayObsoleteAsDirectMember`,
`src/routes/conversations/obsolete.ts`) — le second droit n'est ouvert qu'à :

- un appelant INSCRIT (contexte non anonyme, `registeredUser` présent) ;
- dont la participation à CETTE conversation est active (`isActive: true` dans la
  requête), de type `user`, sans `leftAt` ni `bannedAt` ;
- et dont la conversation est de type `direct` (relu depuis la participation,
  jamais depuis la requête).

Un tiers, un ancien membre, un banni ou un anonyme reçoit 403 sans écriture. La
conversation globale reste protégée en amont. Le droit d'administrateur reste
inchangé et s'additionne.

### Conséquences

- Rétrocompatible : aucune route, aucun champ ni événement ne change ; un ancien
  client qui ne propose pas l'action au second membre ne casse rien.
- Clients : l'action « Rendre obsolète » doit être proposée aux deux membres
  d'une directe (iOS, web, Android).
- Effet asymétrique accepté : l'un des deux efface l'échange pour l'autre, sans son
  accord — c'est le sens de la décision (comme « supprimer pour tous »).
