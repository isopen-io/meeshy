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

**La tolérance ne vaut que pour un message d'origine.** L'expéditeur d'une copie transférée est celui qui a transféré : « diffuser » sa copie reviendrait à la retransférer, sans marque de provenance. Une source de diffusion qui porte `forwardedFromId` et dont la nature n'est pas ordinaire est donc refusée (`copy-attachments:forwarded-protected-source`), dès le premier cran — la diffusion n'écrit aucune marque, la provenance ne survivrait pas au suivant. Une source qui porte durée ET après lecture transmet sa borne (`min(durée demandée, durée source)`), comme la branche à durée.

**Les deux gestes se composent** : une requête qui porte `forwardedFromId` ET `copyAttachmentsFromMessageId` reçoit la diffusion puis l'imposition du transfert, toujours. Ajouter l'un ne retire rien à l'autre.

### Alternatives rejetées

- **Refuser la requête qui porte les deux champs** : aucun client ne l'envoie aujourd'hui, mais la composition est aussi fermée et ne crée pas de refus neuf.
- **Admettre la coexistence durée + après lecture sur tout envoi** : un client qui déclare la flamme-œil avec une durée résiduelle verrait son message décompter. Restreint au chemin de copie.
- **Garder le repli legacy pour les seules lignes sans bit après lecture** : il n'a plus de sujet vivant et reste le seul chemin par lequel une heure interne devient une durée.

### Conséquences

- Rétrocompatible : la forme de la requête ne change pas ; un client qui n'envoie pas de durée obtient celle de la source. Un ancien client qui REÇOIT une copie la lit au pire comme l'une des deux flammes ; le serveur détruit à l'échéance dans tous les cas.
- Nouveau motif de refus `ephemeral-not-forwardable` ; les anciens clients qui offrent encore « Transférer » sur une flamme après lecture reçoivent l'erreur d'envoi (#9573 retire le bouton).
- L'EXPÉDITEUR d'une copie reçoit une échéance et le push porte la durée : voir l'amendement ci-dessous (#9588).

### Amendement du 2026-10-07 — après l'audit adversarial (#9587, #9588, #9589)

**Le critère de fin, reformulé.** « Aucune requête ne produit une copie moins protégée que sa source » vaut pour les copies **par référence** que le serveur fabrique lui-même : transfert (`forwardedFromId`), diffusion (`copyAttachmentsFromMessageId`), re-lien d'une pièce (`attachmentIds`). Le serveur ne peut pas empêcher un client modifié de renvoyer en message ordinaire, par un téléversement neuf, ce qu'il a légitimement reçu et affiché : ce contenu-là est sorti par l'écran, pas par Meeshy.

**Une pièce déjà attachée ne se ré-attache pas (#9587).** L'identité (`uploadedBy`) ne suffit pas à admettre une pièce : celle d'une copie naît sous l'identité de qui transfère, et un auteur possède toujours ses pièces envoyées. L'admission des deux transports (`admitMessageAttachments`, `admitLoadedMessageAttachments`) ET l'écriture (`associateAttachmentsToMessage`) exigent une pièce libre — `messageId` nul **ou absent du document**, les deux états existent sur MongoDB (`unsetOrNull`). Le réessai du même envoi reste admis : la pièce est déjà sur le message de ce `clientMessageId`, dans cette conversation. Le lien n'**ajoute** que de la protection : ni `false` ni zéro écrit, les bits composés par OU pièce par pièce. Non fait ici : l'identité posée à la copie (`uploadedBy: senderId`), qui touche la suppression, l'export RGPD et la purge de compte — #9601.

**La durée de vie d'une copie (#9588) — le choix.** La copie d'une flamme porte durée ET après lecture, et « le premier des deux l'emporte » **pour tout le monde**, expéditeur compris :

| qui | son échéance | servie par |
|---|---|---|
| destinataire | réception + durée, ou sa consommation si elle vient avant | `MessageStatusEntry.ephemeralExpiresAt`, inchangé |
| expéditeur | **envoi + durée**, ou plus tôt quand tous ont consommé | `boundedCopySenderDeadline` (`@meeshy/shared`) : liste, `message:countdown-started`, fichiers par identifiant |
| personne n'a reçu | destruction à **envoi + durée + 1 h** (la grâce de balayage existante), plus à sept jours | `ephemeralDestructionAt`, écrit par `ephemeralSendFields` |

Le décompte par destinataire part toujours de la RÉCEPTION : celui qui reçoit dans la fenêtre garde sa durée entière, et sa réception repousse la destruction (`startEphemeralCountdowns`) sans repousser l'échéance de l'expéditeur. **Ce que le choix coûte, et qu'on assume** : un destinataire hors ligne plus longtemps que durée + 1 h ne verra jamais la copie. La directive #7451 (« ne décompter qu'à la réception ») lui gardait sept jours ; pour une copie, « le premier des deux » et « ne survit pas chez son expéditeur » passent devant, parce que la route de fichiers par chemin n'a pas d'identité et suit la destruction globale — tant qu'elle était à sept jours, celui qui transférait là où personne ne lit gardait l'URL une semaine. Une URL signée par lecteur (#9600) permettrait de rendre ce plafond aux destinataires tardifs. Le push porte la durée de la copie (`ephemeralPushFields`).

Reste hors de cette borne exacte : quatre appelants de `servedEphemeralExpiresAt` ne remettent pas encore l'heure d'envoi et retombent sur la destruction moins la grâce — « envoi + durée » tant que personne n'a reçu, le dernier décompte sinon (#9602).

**Les octets partagés (#9588).** Le transfert recopie `filePath` sans dupliquer le fichier, servi tant qu'un porteur vit. La borne ci-dessus ramène la fenêtre de la copie à la sienne ; la source garde la sienne. **Option non retenue pour l'instant : dupliquer les octets à la copie** (un fichier par copie, effacé avec elle) — elle découple entièrement les deux vies et supprime le cas « l'URL connue des destinataires de la source répond encore tant que la copie vit », au prix du stockage, d'une écriture disque sur le chemin d'envoi et des dérivés (miniature, variantes, pistes traduites) à recopier ou régénérer. À reprendre avec #9600.

**Une piste traduite sans pièce est refusée (#9588).** `translated/<id>_…` n'accueille que des pistes de pièces jointes de message : une clé de cette forme dont la ligne ne résout plus rend `gone`, au lieu du régime d'un fichier ordinaire (cache d'un an). Coût assumé : la copie encore vivante d'un vocal ORDINAIRE dont la ligne source est supprimée perd sa piste traduite et retombe sur l'audio d'origine — retrouver ses copies demanderait un index sur `forwardedFromAttachmentId`, ou des pistes re-clés à la copie.

**La durée portée avant une diffusion survit (#9588).** Une source flamme-œil ajoute le bit après lecture ; la durée qu'une réponse contaminée (ou une flamme à durée déclarée) portait devient sa borne (`durationBoundsAfterRead`) au lieu de tomber. Exception gardée : une requête qui porte DÉJÀ le bit après lecture est la flamme-œil qu'un client rejoue sur chaque cible (#8303), sa durée résiduelle ne décompte pas.

**L'échéance d'un lecteur ferme le fichier là où il est connu (#9589).** `readerStillReadsBytes` (`services/attachments/readerAttachmentLifecycle.ts`) : décompte fini, flamme après lecture consommée, vue unique ouverte depuis plus que son sursis de cinq minutes, « envoi + durée » pour l'expéditeur d'une copie — 404 sur l'original, la miniature, le détail et les traductions par identifiant. Coupure à l'échéance même, sans l'heure de grâce du service des messages. Lecture CIBLÉE (la ligne de ce lecteur pour ce message, jamais une tranche plafonnée), qui remonte quand elle échoue. La route par chemin, sans identité, garde son contrat : le choix (URL signée par lecteur, ou limite acceptée) est la décision produit #9600.

**Transitoire (A5).** Les copies nées AVANT le lot #9572 ne portent ni le bit après lecture ni la borne : elles restent retransférables comme des flammes à durée jusqu'à leur expiration (palier maximal : 24 h après réception, sept jours si personne ne reçoit). Aucune migration : elles s'éteignent seules.
