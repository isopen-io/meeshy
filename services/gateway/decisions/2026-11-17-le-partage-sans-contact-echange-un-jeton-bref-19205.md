# Le partage sans contact échange un jeton bref, signé, à usage unique (2026-11-17, #19205)

## Contexte

La planche du profil (#18857, `Sans-Contact.dc.html`, `Carte-Profil.dc.html`) propose de
rapprocher deux téléphones (NFC, QR en repli, QR seul sur le web) : « rien ne part tant que tu
n'as pas choisi », chacun coche ce qu'il donne — sa vitrine (ce que voit le Public), une demande
d'ami —, le numéro reste verrouillé « Proches seulement », puis « Sofia a reçu ta vitrine ».
La seule voie existante était l'adresse publique `/@:username`, sans intention ni accusé.

## Décision

- `POST /api/v1/me/contact-exchange` `{ offers: ('vitrine' | 'friendRequest')[] }` rend
  `{ token, expiresAt, offers, locked: ['phone'] }`. Le jeton
  `ce1.<aléa 128 bits>.<offres>.<échéance>.<HMAC tronqué>` vit 120 s, ne porte ni identifiant ni
  nom : l'aléa est la seule clé d'un rangement Redis (`contact-exchange:issuer:<aléa>`, TTL 120 s)
  qui sait qui l'a émis. Offres et échéance sont signées (clé dérivée de `JWT_SECRET`, domaine
  `meeshy/contact-exchange/v1`, comparaison en temps constant).
- `POST /api/v1/contact-exchange/:token/accept` (compte inscrit) : la PRISE atomique de l'aléa
  (`SET NX EX`) précède toute lecture — un jeton ne sert qu'une fois ; puis deux comptes
  utilisables, aucun blocage dans un sens ni dans l'autre ; la vitrine si elle était offerte, par
  `composePublicProfile` (la fiche publique telle qu'elle est servie à ce lecteur, déclarée par
  `publicProfileSchema`) ; la demande d'ami si elle était offerte, de l'émetteur vers le lecteur,
  par `envoyerDemande` (blocage, compte désactivé, demande existante, loi des crans), sous
  `privacy.allowContactRequests` du lecteur, sans l'idempotence du lecteur ; enfin
  `contact-exchange:received` `{ reader, received, receivedAt }` à la seule room de l'émetteur.
- Expiré, rejoué, contrefait, émis par un compte qui bloque le lecteur (ou bloqué par lui), parti,
  ou lu par son émetteur : le MÊME 404 `CONTACT_EXCHANGE_UNAVAILABLE`.
- Débit par compte : 10 émissions et 20 acceptations par minute.
- Le numéro n'est JAMAIS une offre : aucune loi d'accès ne l'ouvre par ce canal, la réponse le dit
  verrouillé (`locked`) et aucun champ voisin ne le porte (le sérialiseur retire ce que la vitrine
  ne déclare pas).
- **Derrière `CONTACT_EXCHANGE_ENABLED`, éteint par défaut** (`contactExchangeFlag.ts`, seul
  site) : éteintes, les deux routes répondent comme des routes absentes. Le drapeau s'allume
  après la revue `auditeur-adversarial` exigée par l'issue (jeton, rejeu, énumération).

## Données personnelles

Rien de nouveau n'est persisté au-delà de deux minutes : l'association aléa → émetteur et la prise
expirent seules ; la demande d'ami créée a déjà sa purge et son export. Aucune section d'export
n'est ajoutée ; un compte purgé entre l'émission et l'acceptation n'est plus utilisable, et le jeton
est refusé.

## Ce qui reste

- La découverte réciproque « Sofia Benali est là » AVANT le choix (étape 2 de la planche) est une
  poignée de main NFC entre appareils ; le serveur n'y intervient pas dans ce lot.
- L'étiquette NFC statique d'Android (`Hors-App`, 11) ne peut pas porter un jeton de deux minutes.
- Le numéro reste verrouillé tant qu'aucune feature de la loi d'accès ne l'ouvre dans une paire.
