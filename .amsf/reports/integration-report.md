# Rapport d'intégration entre applications (2026-11-28)

Inventaire des contrats et de leurs témoins : `../contracts/README.md`.

| Chemin d'intégration | Vérifié comment | Statut |
|---|---|---|
| REST passerelle → web | catalogues générés + cliquets (suites `shared` et `gateway`), build web | PASS |
| REST passerelle → iOS / Android | cliquets de génération (suite `shared`) ; `android.yml --check` | PASS (cliquets) ; compilation iOS NOT VERIFIED à la tête |
| Socket.IO | sept cliquets `socket-event-*` (suite `shared`) | PASS |
| ZMQ passerelle ↔ agent | `agent-zmq-contract.test.ts` + suites des deux services | PASS |
| ZMQ passerelle ↔ traducteur | un témoin ciblé côté passerelle ; suite Python en CI | PASS partiel — pas de schéma commun (B2b) |
| Langues shared → traducteur | `translator-languages:check` | PASS |
| Politiques d'action (3 plateformes) | `action-policy-vectors:check` ; témoins Swift et Kotlin en CI | PASS (TS) |
| meeshy → andp | `andp.yml` validé hors ligne | PASS ; référence flottante (B3) |
| Bout en bout réel (clients ↔ passerelle ↔ traducteur, base réelle) | — | NOT VERIFIED : `tests/e2e` ne tourne pas en CI hors un banc vocal, et aucune pile n'a été démarrée ici |

Compatibilité ascendante : les deux lots de code de la session n'ont modifié aucune forme sur le fil.
