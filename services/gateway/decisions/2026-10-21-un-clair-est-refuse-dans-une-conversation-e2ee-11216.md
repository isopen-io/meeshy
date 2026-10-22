## Un texte en clair est refusé dans une conversation chiffrée de bout en bout — envoi, lien anonyme et édition (2026-10-21, #11216)

**Statut** : Accepté — lot de sécurité, à faire relire par l'agent `auditeur-adversarial` avant fusion.

**Contexte** : la directive #9224 dit qu'avec E2EE « le serveur ne voit jamais le clair » et qu'« un message en clair dans une conversation chiffrée est refusé (fail-closed) ». En mode `e2ee`, `MessageProcessor.getEncryptionContext` journalisait « client should encrypt » puis laissait `saveMessage` écrire le texte en clair ; `admitMessageEdit` ne lisait aucun régime, donc toute édition remplaçait un message chiffré par du clair ; le lien de partage anonyme, qui contourne `saveMessage`, écrivait tout. Le web n'émet jamais `encryptedContent` (constat #11372).

**Mesure des clients avant la règle (#9223)** : aucun client n'émet `encryptedContent`. Le web ne chiffre pas. iOS chiffre la directe en `content` + `isEncrypted: true` + `encryptionMode: "E2EE"` — forme que `noSilentDowngrade` (`validation/encryption-envelope.ts`) refuse DÉJÀ en 400 sur REST et socket — et retombe en clair quand la session Signal manque (#8221), ou dans un groupe e2ee. C'est ce repli que la règle refuse : un ancien client iOS reçoit désormais un 400 explicite là où son texte était écrit lisible.

**Décision** :
1. **Énoncé unique** : `services/messaging/e2eePlaintextAdmission.ts` — `plaintextRefusedIn({ encryptionMode, plaintext })` (mode `e2ee`, insensible à la casse, et texte non vide), code `E2EE_PLAINTEXT_REFUSED`, phrase `E2EE_PLAINTEXT_REFUSAL_MESSAGE`.
2. **Envoi (REST + socket)** : `saveMessage` lit le régime AVANT tout traitement de liens (aucun `TrackingLink` minté pour un texte refusé) et le passe à `getEncryptionContext` — aucune lecture de plus. `MessagingService.handleMessage` traduit le refus en `{ success: false, error, code }` ; REST le sert en 400 avec son code, le socket dans l'acquittement.
3. **Lien anonyme** : même prédicat, sur `conversation.encryptionMode` ajouté au `select` déjà fait.
4. **Édition** : `ConversationEditStateRow.encryptionMode` est EXIGÉ (un transport qui l'oublie ne compile pas) ; `admitMessageEdit` refuse `end-to-end-encrypted` APRÈS la décision d'autorisation, comme la clôture — aucun oracle d'existence. Les quatre transports servent la phrase et le code.
5. **Rien n'exempte un `messageType` déclaré par le client** : les messages système de la passerelle s'écrivent par `prisma.message.create` direct ; exempter « system » ouvrirait le clair à quiconque le déclare.

**Ce qui reste admis** : un message SANS texte (pièces jointes seules) — aucune chaîne en clair n'est écrite ; les modes `server` et `hybrid`, où la passerelle chiffre elle-même.

**Alternatives rejetées** :
- *Garder le repli en clair pour les anciens clients iOS* : c'est exactement la fuite que la directive interdit, et le client croit la conversation illisible pour le serveur.
- *Refuser aussi les pièces jointes seules* : leur chiffrement est un chantier distinct (upload), et ce lot ne doit pas fermer un usage qui n'écrit aucun texte en clair.

**Conséquences** : tant que le SDK iOS n'émet pas `encryptedContent`, plus aucun TEXTE ne peut être écrit dans une conversation e2ee — l'interface web le dit (composeur remplacé par un bandeau), iOS reçoit un refus explicite. Suivis : faire émettre l'enveloppe `encryptedContent` par le SDK iOS ; chiffrement des pièces jointes en e2ee ; `getEncryptionContext` exempte encore un `messageType: 'system'` déclaré par le client en mode `server`/`hybrid`.
