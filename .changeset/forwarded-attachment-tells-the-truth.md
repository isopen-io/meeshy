---
"@meeshy/gateway": patch
---

Le transfert d'une pièce jointe chiffrée ne fabrique plus une copie qui ment sur ses propres octets.

**Les octets voyagent par référence, le fait qui les décrit restait derrière.** `copyForwardedAttachments` reprend `filePath` et `fileUrl` À L'IDENTIQUE : la copie et l'original désignent le MÊME blob sur disque. Quand l'original est chiffré, ce blob est du chiffré — et la copie naissait pourtant sans un seul des onze champs de chiffrement, donc avec le défaut Prisma `isEncrypted: false`, sans IV et sans tag d'authentification.

Or le gateway ne déchiffre rien : `routes/attachments/download.ts` sert les octets bruts (`createReadStream(filePath)`) et c'est le CLIENT qui déchiffre, d'après ce que la ligne DÉCLARE — `attachmentIncludes` publie `isEncrypted`, `encryptionMode`, `encryptionIv` et `encryptionAuthTag` exactement pour ça. Une copie qui annonce « clair » en pointant du chiffré fait donc rendre le CHIFFRÉ TEL QUEL comme s'il était le média, sous le `mimeType` et le nom d'origine : le client ne déchiffre pas, puisqu'on vient de lui dire qu'il n'y avait rien à déchiffrer. Transférer une photo chiffrée produisait un fichier illisible que rien, ni côté serveur ni côté client, ne signalait comme tel — `isAttachmentEncrypted()` répondait `false` sur la copie.

`originalFileSize` comptait au même titre : `fileSize` porte la taille CHIFFRÉE quand la pièce est chiffrée (`UploadProcessor`) et il EST copié, si bien que la copie annonçait la taille du chiffré comme celle du fichier, sans le `originalFileHash` qui permet de vérifier un déchiffrement.

La copie emporte désormais les onze champs qui décrivent ses octets — `isEncrypted`, `encryptionMode`, `encryptionIv`, `encryptionAuthTag`, `encryptionHmac`, `originalFileHash`, `encryptedFileHash`, `originalFileSize`, `serverKeyId`, `thumbnailEncryptionIv`, `thumbnailEncryptionAuthTag` — ainsi que `thumbHash` et `imageVariants`, déjà dérivés de ce même média, dont la perte condamnait la copie au téléchargement pleine taille pour un travail déjà fait. Une pièce jointe en clair reste en clair : la copie recopie l'ABSENCE du fait aussi fidèlement que sa présence.
