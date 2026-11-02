## Une pièce jointe d'une conversation chiffrée de bout en bout est chiffrée sur l'appareil, à la manière de Signal (#10789)

**Contexte** : dans une conversation `e2ee`, le composeur retirait photos, fichiers et vocaux (#12918), faute
de format. Le seul chiffrement de pièce existant est celui du SERVEUR (`AttachmentEncryptionService.ts`,
clé tirée et gardée par la passerelle, aucun appelant) : il contredit le relais aveugle et n'est pas repris.
Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md` § 7.1.

**Modèle de menace** : serveur compromis en lecture (base, disque, journaux, file push) et actif (il remplace
un blob, en tronque un, le resert sous une autre pièce) ; attaquant réseau ; appareil volé verrouillé. Hors
modèle : appareil déverrouillé compromis, métadonnées (nombre de pièces d'un message, taille ARRONDIE).

**Décision — format `client-v1`**, composition publiée par Signal et reprise sans réglage maison :
- **Clé** : 64 octets aléatoires par fichier (`SecRandomCopyBytes`), les 32 premiers pour AES-256, les 32
  suivants pour HMAC-SHA256 (Signal-Android `AttachmentCipherOutputStream`, `Util.split(key, 32, 32)`).
- **Remplissage** : le clair est complété de zéros jusqu'à `max(541, ⌊1,05^⌈log(n) / log(1,05)⌉⌋)` octets
  (Signal-Android `PaddingInputStream.getPaddedSize`, Signal-iOS `Cryptography.paddedSize`). Le serveur ne
  voit que cette taille arrondie ; la taille exacte voyage dans le pointeur.
- **Blob** : `IV (16 octets aléatoires) ‖ AES-256-CBC-PKCS7(clair complété) ‖ HMAC-SHA256(IV ‖ chiffré)`.
- **Condensat** : SHA-256 du blob entier.
- **Ouverture** : condensat d'abord (comparaison en temps constant), HMAC ensuite (temps constant), et le
  déchiffrement seulement après les deux ; le clair est tronqué à la taille du pointeur, et une taille qui
  dépasse le clair déchiffré est refusée. Un condensat ou un HMAC faux ne rend RIEN (fail-closed), jamais un
  clair partiel.
- **Pointeur** (`E2EEAttachmentPointer`), DANS `E2EEContent`, donc lu par les seuls appareils destinataires :
  identifiant serveur du blob, `scheme: "client-v1"`, clé, condensat, taille exacte, type MIME, nom de
  fichier, genre (`image`, `video`, `audio`, `file`), dimensions, durée, ThumbHash, forme d'onde,
  transcription faite sur l'appareil, et, pour une vidéo, l'affiche chiffrée en blob séparé sous SA clé.
  Un `scheme` inconnu rend la pièce illisible et la bulle invite à mettre à jour, sans rien deviner.
- **Version du contenu** : un contenu qui porte des pièces s'écrit `v: 2`. Un lecteur `v: 1` ignorerait
  le champ `attachments` et perdrait la pièce EN SILENCE ; il le refuse au contraire comme version future.
  Un lecteur de cette version lit `v: 1` et `v: 2`, et range le clair d'une version future tel quel avec
  l'état « mettez à jour Meeshy » (§ 4.1 de la spec : rien ne se perd en silence, #9223).

**Primitives** : CommonCrypto (`CCCryptor`, AES-CBC-PKCS7) et CryptoKit (`HMAC<SHA256>`, `SHA256`) sur iOS ;
WebCrypto (`AES-CBC`, `HMAC`, `SHA-256`) en TypeScript (`packages/shared/utils/e2ee-attachment-cipher.ts`), pour
la passerelle de test et le web à venir (#10788). libsignal 0.105.4 n'expose pas AES-CBC (`Aes256Ctr32`,
`Aes256GcmEncryption`, `Aes256GcmSiv`, `IncrementalMac` seulement) ; Signal-iOS chiffre ses pièces par
CommonCrypto (`SignalServiceKit/Cryptography/Cryptography.swift`).

**Vecteurs** : faute de vecteurs officiels de composition (Signal n'en publie pas : ses tests chiffrent des
données aléatoires), chaque couche est rejouée sur des vecteurs officiels — NIST SP 800-38A F.2.5
(CBC-AES256), RFC 4231 cas 2 (HMAC-SHA256), FIPS 180-2 « abc » (SHA-256), les points de contrôle de
`Cryptography.paddedSize` de Signal-iOS (`CryptographyTests.test_spotCheckBucketBoundaries`) — et la
composition sur un vecteur commun (`packages/shared/utils/__vectors__/e2ee-attachment-client-v1.json`) que
Swift et TypeScript, deux implémentations indépendantes, reproduisent octet pour octet.

**Stockage local** : le blob téléchargé se garde tel quel, chiffré sous sa clé ; la clé ne vit que dans la
base scellée `e2ee.sqlite` (pointeur du contenu). Le clair d'une image ou d'un vocal se déchiffre en
mémoire ; celui d'une vidéo ou d'un document, que les lecteurs système lisent par URL, dans un dossier
`NSFileProtectionComplete` exclu de la sauvegarde, vidé après usage et au lancement (#12952).

**Alternatives rejetées** :
- *AES-256-GCM par morceaux* : aucun format publié de Signal ne le décrit pour les pièces ; le découpage
  (nonces, ordre, troncature du dernier morceau) serait une construction maison. CBC + HMAC est le format
  que Signal déploie, que WebCrypto et Node savent écrire, et que l'audit externe (#3710) connaît.
- *Clé dérivée du message libsignal* : lie la pièce au ratchet, empêche de la retransférer sans la
  rechiffrer, et n'apporte rien : la clé voyage déjà sous libsignal.
- *Vignette dans le pointeur* : une enveloppe est bornée à 64 Kio et le contenu est recopié par appareil ;
  un ThumbHash (une vingtaine d'octets) y suffit pour un affichage sans attente, et l'affiche d'une vidéo
  part en blob séparé.
- *Transcription par le serveur* : elle exigerait le clair ; le vocal se transcrit sur l'appareil
  émetteur (Speech) et sa transcription voyage dans le pointeur.

**Conséquences** : composition écrite par Meeshy à partir de primitives standard : surface de revue
cryptographique externe (#3710), comme le reste du § 9 de la spec. Ce que le serveur voit encore : qu'un
message porte N blobs, leur taille arrondie, l'heure. La passerelle : `services/gateway/decisions/2026-10-25-la-passerelle-garde-une-piece-e2ee-comme-un-blob-opaque.md`.
