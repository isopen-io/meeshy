## 2026-10-07 : Un contenu qui disparaît ne sort pas de Meeshy — une copie ne peut pas être moins protégée que sa source (#9572)

Directive porteur du 2026-10-07, spec `docs/superpowers/specs/2026-10-07-contenus-ephemeres-sortie-et-lecteur-video-design.md` §§ 1 et 2. **Amende** `le-transfert-d-un-contenu-ephemere-ou-a-vue-unique-refuser-d-un-cote-propager.md`, dont le principe tient (vue unique → refuser, éphémère → propager) et dont trois points tombent.

### Ce qui restait ouvert

- Une **flamme après lecture** (`EPHEMERAL_AFTER_READ`, #8302) se transférait : elle n'a pas de durée, et le repli `expiresAt − createdAt` y lisait le plafond de rétention. La copie naissait à sept jours, sans son bit.
- Une **pièce jointe en vue unique** sous un message qui ne l'est pas passait la garde, qui ne lisait que le message.
- Les **bits, le flou et la protection des pièces** de la copie venaient de la requête ; aucune règle « durée ≤ source ».

### Décision

**Une loi, dans `@meeshy/shared`** (`utils/content-exit-law.ts`). La NATURE d'un message se lit sur ses colonnes ET sur chacune de ses pièces, la plus restrictive gagne : `ordinary`, `timed-flame`, `after-read-flame`, `view-once`. Elle rend trois verdicts : transférer (avec la durée maximale), exporter, capture. `contentExitLaw` sert l'affichage des clients ; **`contentExitLawOfSource` sert l'autorisation du serveur** et exige la projection ENTIÈRE — une source absente, une colonne ou une pièce non chargée ferment (verdicts de la flamme après lecture). Une colonne sélectionnée n'est jamais `undefined` : l'absence prouve que la requête ne l'a pas lue.

**Le transfert** (`admitMessageForward` → `forwardedCopyRequest` → `exitProtectedCopy` dans `saveMessage`) :

| source | copie |
|---|---|
| ordinaire | la requête passe ; le flou de la source (message ou pièce) est imposé |
| flamme à durée | `min(durée demandée, durée source)` — absente ou invalide ⇒ celle de la source —, bits `EPHEMERAL \| EPHEMERAL_AFTER_READ`, flou de la source, `expiresAt` du client écarté |
| flamme après lecture, vue unique (message ou pièce), éphémère sans durée lisible | refusé |

La copie d'une flamme porte **durée ET après lecture** : elle est « après lecture » pour le transfert suivant, donc ne se retransfère pas. C'est la seule ligne `Message` qui porte les deux ; `ephemeralSendFields` ne garde la durée sous le bit après lecture que sur ce chemin (`durationBoundsAfterRead`). **Le premier des deux l'emporte**, et sans code neuf : les deux horloges écrivent la même colonne, `MessageStatusEntry.ephemeralExpiresAt` — la réception y pose `D(u)` (`startEphemeralCountdowns`, qui ne lit que la durée), la consommation la ramène à maintenant si elle est encore à venir (`consumeAfterReadMessages`).

**Le repli `expiresAt − createdAt` est retiré.** Depuis #7451 `expiresAt` est l'heure interne de destruction ; toute ligne sans colonne de durée y aurait donné une flamme transférable sept jours. Les lignes d'avant #7451 qui en dépendaient ont toutes expiré (palier maximal : 24 h). Un éphémère déclaré sans durée lisible est refusé.

**La dégradation en message ordinaire se dit.** Source introuvable ou illisible, corps fourni par le client : `sourceUnavailable`, et `forwardedCopyRequest` retire `forwardedFromId`. Avant, la référence restait et `copyForwardedAttachments` recopiait les pièces d'une source dont la protection n'avait pas pu être lue. Un `forwardedFromId` qui atteint `saveMessage` sans verdict (`forwardImposes` absent) lève.

**Les pièces copiées gardent leur protection** : `copiedAttachmentFields`, site unique du transfert et de la diffusion, recopie `isViewOnce`, `isBlurred`, `effectFlags`.

**La publication** (`POST /posts/from-attachment`, post, réel ou story) applique le verdict « exporter » de la loi, lue sur le message et sur toutes ses pièces.

### L'écart assumé avec la spec : la diffusion hérite, elle ne refuse pas

La spec § 2 dit que `copyAttachmentsFromMessageId` « applique le verdict exporter ». Appliqué à la lettre, il refuserait toute diffusion depuis une source protégée — or iOS rejoue sur les cibles 2..N d'un partage multi-destinataires la protection armée à l'envoi (#8303, `OutboxDispatcher+Messages.swift`) : la diffusion d'une vue unique ou d'une flamme par son propre auteur casserait pour les clients déjà distribués (#9223, rétrocompatibilité). La diffusion n'est pas une sortie : c'est le même envoi, par son auteur (contrôle de propriété), ailleurs. Elle **hérite donc au moins de la nature de sa source** (`diffusedCopyFields`) — vue unique, après lecture, durée bornée, flou — sans gagner le bit après lecture. Une source introuvable est refusée avant toute écriture.

**Les deux gestes se composent** : une requête qui porte `forwardedFromId` ET `copyAttachmentsFromMessageId` reçoit la diffusion puis l'imposition du transfert, toujours. Ajouter l'un ne retire rien à l'autre.

### Alternatives rejetées

- **Refuser la requête qui porte les deux champs** : aucun client ne l'envoie aujourd'hui, mais la composition est aussi fermée et ne crée pas de refus neuf.
- **Admettre la coexistence durée + après lecture sur tout envoi** : un client qui déclare la flamme-œil avec une durée résiduelle verrait son message décompter. Restreint au chemin de copie.
- **Garder le repli legacy pour les seules lignes sans bit après lecture** : il n'a plus de sujet vivant et reste le seul chemin par lequel une heure interne devient une durée.

### Conséquences

- Rétrocompatible : la forme de la requête ne change pas ; un client qui n'envoie pas de durée obtient celle de la source. Un ancien client qui REÇOIT une copie la lit au pire comme l'une des deux flammes ; le serveur détruit à l'échéance dans tous les cas.
- Nouveau motif de refus `ephemeral-not-forwardable` ; les anciens clients qui offrent encore « Transférer » sur une flamme après lecture reçoivent l'erreur d'envoi (#9573 retire le bouton).
- Non changé, à instruire côté clients (#9573) : `servedEphemeralExpiresAt` ne sert aucune échéance à l'EXPÉDITEUR d'une copie (branche flamme-œil), et `ephemeralPushFields` n'y pousse pas la durée.
