# Provenance de `upstream/`

| Fichier | Source | SHA-256 | Licence |
|---|---|---|---|
| `matrix-sas-emoji.json` | matrix-org/matrix-spec, `data-definitions/sas-emoji.json` (branche principale, relevé le 2026-11-17) | `2b4defb276d61f11cb9cbfb0ba326b96a8dbd9e768e6bc53fa0f565cd598e887` | Apache-2.0 |
| `LICENSE` | matrix-org/matrix-spec, `LICENSE` (même relevé) | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` | texte de la licence Apache-2.0 |

- **Copies conformes, non modifiées** : elles sont versées pour que `scripts/generate-device-verification-vectors.mjs` produise `sas-emoji-v1.json` sans réseau, en CI ; le script vérifie l'empreinte de `matrix-sas-emoji.json` et s'arrête si elle diffère.
- Ce que Meeshy en dérive (`sas-emoji-v1.json`) porte la mention de sa modification, et `LICENSE-sas-emoji.txt` (identique à `LICENSE`).
- Aucun fichier `NOTICE` amont n'existait au relevé du 2026-11-17 ; à revérifier à chaque mise à jour de la table.
- Ce fichier n'est pas un avis juridique : l'agent `conformite-juridique` et l'avis signé de #11548 restent requis.
