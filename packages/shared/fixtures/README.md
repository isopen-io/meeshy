# Shared Fixtures

Domicile des vecteurs de test partagés (contrat Lentille/Focal, workshop `tasks/lentille-focal-workshop.md` §2.3).
Écrits par L0 (noyau TypeScript, LWS-0/1/2) — `packages/shared/`.
Lus par les 3 plateformes : shared/web (Jest, import direct), iOS (XCTest, ressource de bundle copiée par XcodeGen), Android (JUnit, ressource symlinkée par Gradle).

## `long-message/` (#8147)

- `excerpt.vectors.json` — la loi `longMessageExcerpt` (`utils/long-message.ts`) : `{ _label, input: { text }, expected: { truncated, excerpt } }`, générés en exécutant la loi TS. iOS les rejoue contre son miroir Swift.
- `focal-metrics.json` — le bloc de verre du Focal (`utils/focal-metrics.ts`, `FOCAL_METRICS`) : mêmes clés, mêmes valeurs ; iOS recopie ses constantes et les compare à ce fichier.

## `e2ee-attachment/` (#10789)

- `client-v1.vectors.json` — le format `client-v1` d'une pièce jointe chiffrée de bout en bout (celui de Signal : `IV ‖ AES-256-CBC-PKCS7 ‖ HMAC-SHA256`, remplissage de Signal, condensat SHA-256) : `{ name, key, iv, plaintext, size, paddedSize, blob, digest }`, écrits par OpenSSL (`generate-with-openssl.py`, `python3 generate-with-openssl.py > client-v1.vectors.json`) — une implémentation indépendante des deux qui les rejouent : TypeScript (`utils/e2ee-attachment-cipher.ts`, WebCrypto) et Swift (`E2EEAttachmentCipher`, CommonCrypto + CryptoKit). Le premier vecteur reprend la clé et l'IV de NIST SP 800-38A F.2.5 : ses 64 premiers octets chiffrés sont ceux de la norme. Sur divergence, c'est le VECTEUR qui a raison.

## `device-tier-vectors.json` (#11281)

- Le tier média d'un appareil (bas / moyen / haut / pro) sur des entrées NEUTRES `{ memoryGB, cores, maxFps, hwAV1, hwHEVC, lowPower, thermal }` → `tier`. Aucune puce : la détection de puce, côté iOS, ne fait que PRODUIRE ces entrées. iOS le rejoue (`DeviceMediaTierVectorTests`, loi `DeviceMediaTier.classify`) ; Android le rejoue aussi (`DeviceMediaTierVectorsTest` dans `:core:model`, même loi `DeviceMediaTier.classify`, sur JVM nue) ; la jumelle web W10 (`apps/web/src/lib/device/capability-tier.ts`) le rejouera telle quelle.
