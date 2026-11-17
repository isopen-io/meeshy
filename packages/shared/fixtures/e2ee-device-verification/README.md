# `e2ee-device-verification/` — ajout d'un appareil par code à confirmer (#18906, #19153)

Vecteurs communs du protocole de confirmation d'un appareil par code court : la COMPARAISON (engagement, code, accusé, rendus, options en carré). Spécification : `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md` (v3 : § 4 protocole, § 4.5 rendus et licence de la table, § 4.9 options, § 8 vecteurs). Décision : `services/gateway/decisions/2026-11-17-un-appareil-s-ajoute-par-un-code-a-confirmer.md`.

**Ce dossier ne porte pas encore le registre de confiance** (§ 6 de la spec, entrées signées XEdDSA par leur auteur) : son texte v3 attend la contre-relecture de l'agent `auditeur-adversarial`. Son fichier, `trust-ledger-v1.cases.json`, arrivera avec le lot 0b, produit par ce même script et tenu par le même `--check`.

## Régénérer, vérifier

```
cd packages/shared
node scripts/generate-device-verification-vectors.mjs           # régénère les trois fichiers
node scripts/generate-device-verification-vectors.mjs --check   # régénère dans un dossier temporaire et compare à l'octet (CI)
```

Sans argument, le script lit la table AMONT versée dans `upstream/` (aucun réseau) et vérifie son empreinte. Il rejoue d'abord RFC 5869 A.1 et A.3 par trois chemins (`node:crypto`, WebCrypto, HKDF recomposé sur HMAC), puis recalcule chaque engagement par deux chemins et chaque code par les trois, et s'arrête au premier écart. Il n'emploie aucune bibliothèque tierce : la comparaison n'a besoin que de SHA-256, HMAC et HKDF. **Clés de TEST seulement**, dont les graines sont des étiquettes publiques : aucune ne sert ailleurs. Le témoin de CI est `__tests__/ci/device-verification-vectors-regenerate.test.ts` : il lance `--check`, prouve qu'un octet retouché le fait échouer, et vérifie les empreintes de la table amont et du texte de licence.

Contre-vérification faite à la rédaction (scripts et journaux joints à #18906) : codes, sorties HKDF, accusés et engagements retrouvés par un SHA-256/HMAC/HKDF écrit à la main en Python, deux fois (contre-revue, puis revue de confirmation).

## Fichiers

| Fichier | Contenu |
|---|---|
| `sas-v1.vectors.json` | `primitives` (formules exactes, dont l'ordre de lecture des octets des options) ; `rfc5869` (annexe A, cas 1 et 3 : à rejouer AVANT le reste) ; `vectors` (4 nominaux : descripteurs en hexadécimal, engagement, SHA-256 de la transcription, sortie HKDF de 8 octets, code en indices, emoji, noms dans les 7 langues et chiffres, accusé, messages `request`/`accept`/`reveal` tels qu'ils voyagent) ; `properties` (un champ change ⇒ le code change : libellé, inversion des rôles) ; `negatives` (homme du milieu et un champ substitué à la fois ⇒ codes différents ; engagement qui ne s'ouvre pas ⇒ `cancel(commitment-mismatch)` ; formes refusées ⇒ `refus:unexpected-message`) ; `options` (construction déterministe des quatre options en carré du code et de l'accusé, à partir d'octets fixés) |
| `sas-emoji-v1.json` | la table des 64 symboles (`number`, `emoji`, `unicode`, `names` en fr, en, es, de, it, pt-BR, ar), sa source, son empreinte, la mention de sa modification et sa licence |
| `LICENSE-sas-emoji.txt` | le texte complet de la licence Apache-2.0, copié du dépôt amont |
| `upstream/matrix-sas-emoji.json`, `upstream/LICENSE`, `upstream/NOTICE.md` | la table amont de matrix-spec, copie conforme, avec son texte de licence et sa provenance : ce que le script lit pour produire `sas-emoji-v1.json` |

## Comment chaque plateforme les rejoue

Chaque banc lit les fichiers par chemin relatif (comme `libsignal/cross-platform.vectors.json`), rejoue d'abord `rfc5869`, puis le reste, et prouve son ROUGE en altérant un octet d'une entrée.

| Banc | Où | Ce qu'il rejoue |
|---|---|---|
| Référence TypeScript | `packages/shared/__tests__/device-verification-vectors.test.ts`, `device-verification-options.test.ts` | tout ; WebCrypto seul (`crypto.subtle`) |
| Passerelle | `services/gateway/src/services/e2ee/__tests__/` (Jest) | les messages `wire` passent les schémas Zod du relais ; chaque négatif `refus:*` y est refusé |
| SDK iOS | `MeeshySDKTests/E2EE/DeviceVerificationVectorTests`, `DeviceVerificationOptionsTests` (XCTest, ressource de bundle copiée par XcodeGen) | tout ; CryptoKit |
| Android | `:core:e2ee` `DeviceVerificationVectorsTest`, `DeviceVerificationOptionsTest` (JUnit sur JVM nue) | tout ; `MessageDigest`, `Mac("HmacSHA256")` avec un sel de 32 octets nuls |
| Web | `apps/web/src/lib/e2ee/device-verification/*.test.ts` (bun, puis Chromium, WebKit et Firefox) | tout ; WebCrypto, dont HKDF à sel vide dans les trois moteurs |

Pièges que des vecteurs tiennent (spécification § 3.3) : sel vide (RFC 5869 A.3) ; base64 laxiste (`alea-en-base64-non-canonique-refuse`, `cle-en-base64-avec-blanc-refusee`) ; demi-paire de substitution (`libelle-a-demi-paire-refuse`) ; libellé vide ou non NFC (`libelle-vide-refuse`, `libelle-non-nfc-refuse`) ; `userId` en majuscules (`userId-majuscules-refuse`, ex-vecteur 5) ; plateforme inconnue (`plateforme-inconnue-refusee`).

Un témoin par plateforme compare les 64 × 7 noms de son catalogue à `sas-emoji-v1.json` ; un autre vérifie que l'écran ou la page des licences tierces de l'application cite cette table et le texte Apache-2.0.

## Licence de la table des emoji

`sas-emoji-v1.json` est **dérivée de matrix-org/matrix-spec `data-definitions/sas-emoji.json` (SHA-256 `2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887`), Apache-2.0 ; modifiée par Meeshy le 2026-11-17 : clés renommées, sept langues retenues, métadonnées ajoutées.** La table amont elle-même est versée sans modification dans `upstream/` (voir `upstream/NOTICE.md`). Le texte complet de la licence est `LICENSE-sas-emoji.txt` (identique à `upstream/LICENSE`, le `LICENSE` du dépôt amont ; aucun fichier `NOTICE` amont relevé le 2026-11-17, à revérifier à chaque mise à jour de la table). Chaque application qui embarque les noms (iOS, Android, web) les cite dans son écran ou sa page de licences tierces, avec ce texte ; les catalogues générés portent en tête un commentaire qui renvoie ici. L'avis juridique AGPL (#11548) inclut ce composant dans son périmètre. Ce paragraphe n'est pas un avis juridique.
