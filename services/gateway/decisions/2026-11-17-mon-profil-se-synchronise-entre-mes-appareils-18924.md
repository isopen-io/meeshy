## 2026-11-17 : Mon profil se synchronise entre mes appareils — `profile:updated`, sur `user:<moi>` seulement, porte l'instantané de mes langues, de mon nom, de ma photo et de ma bannière

**Issue** : #18924 (revue des caches du 2026-11-17, #18909).

### Contexte

Changer sa langue, son nom ou sa photo sur un appareil ne se voyait pas sur les
autres. `user:updated` part vers les rooms PERSONNELLES des partenaires
(`getDistinctConversationPartnerUserIds`, `userId: { not: userId }`) et exclut
l'auteur ; sa charge est filtrée sur le profil PUBLIC (`publicProfileChanges`),
où les langues n'ont pas leur place. `announceConversationLanguageChange` est un
bus interne, pas un événement socket. Un iPhone et un Android connectés
gardaient donc le Prisme `fr` d'un compte passé en `en` sur le web jusqu'à la
prochaine lecture de `GET /me` (jusqu'à 30 min) ou une reconnexion.

### Décision

**1. Un événement NEUF, `profile:updated`, sur `user:<moi>` seulement.** Pas un
élargissement de `user:updated` : ses deux audiences (mes partenaires, mes
appareils) n'ont pas droit à la même charge, et la confondre ferait voyager mes
langues vers des tiers. Le nom suit `profile:decor-updated` (#10632), l'autre
moitié de mon profil synchronisée entre mes appareils. Un ancien client ne
l'écoute pas, et rien ne change pour lui ; `user:updated` ne perd aucun champ.

**2. Sa charge est un INSTANTANÉ, pas un delta.** Les neuf champs
(`OWN_PROFILE_FIELDS` : les trois langues du Prisme, les quatre composants du
nom, la photo, la bannière) tels que la ligne les porte après l'écriture, plus
`userId` et `updatedAt` (`User.updatedAt`, le même instant que sert `GET /me`).
Un événement perdu est réparé par le suivant ; deux événements reçus dans le
désordre, ou un événement plus ancien qu'une relecture de `GET /me`,
s'arbitrent par `updatedAt` : `ownProfileSnapshotIsStale` (`packages/shared`)
n'écarte que ce qu'il PROUVE plus ancien.

**3. La charge se compose chez l'émetteur, champ par champ, et passe par le
schéma du contrat avant de partir** (`routes/users/own-profile-sync.ts`). Une
ligne qui ne le satisfait pas ne diffuse rien : on n'invente pas l'instant sur
lequel les clients arbitrent.

**4. Seules les écritures qui touchent un champ de l'instantané diffusent** —
`PATCH /users/me` quand une langue ou un nom change, `PATCH /users/me/avatar`,
`PATCH /users/me/banner`. Une bio, une ville ou un réglage seuls ne diffusent
rien : un « rien n'a changé » enverrait mes autres appareils réconcilier un
non-événement.

**5. La diffusion est un canal LATÉRAL** : rien dans `announceOwnProfileUpdated`
ne lève, et une écriture faite ne se rapporte jamais comme un échec.

### Ce que les clients font

Chacun écoute `profile:updated`, valide la charge à sa frontière, écarte un
instantané périmé (`ownProfileSnapshotIsStale` contre le `updatedAt` du profil
tenu), puis PROJETTE les neuf champs sur la session sans relecture réseau — le
Prisme (`preferredLanguages`) se recalcule depuis les trois langues.

### Conséquences

- L'appareil qui a écrit reçoit l'écho de son écriture : c'est l'instantané
  qu'il tient déjà, appliqué sans effet.
- `socket-event-orphan-gate` porte `profile:updated` dans `SANS_LECTEUR` jusqu'à
  ce que le premier client le cite ; l'entrée en sort dans le lot qui l'écrit, et
  `socket-event-platform-parity-gate` prend le relais tant qu'un des trois manque.
- Un changement fait par l'ADMINISTRATION (`user-management.service.ts`) ne
  passe pas par ces routes et ne diffuse pas : hors du périmètre de #18924, qui
  vise les gestes du compte lui-même.
