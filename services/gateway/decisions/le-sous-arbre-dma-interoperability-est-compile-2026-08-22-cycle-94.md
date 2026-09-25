## Le sous-arbre `dma-interoperability` est COMPILÉ (2026-08-22, cycle 94)

**Contexte**: `src/dma-interoperability/` — 3 231 lignes de production Signal Protocol (4 873 avec ses 3 suites) (X3DH, Double Ratchet, `SignalKeyManager`, `SignalProtocolEngine`, adaptateurs) — était `exclude` de `tsconfig.json`, donc hors de `bun run build` ET de `type-check`, et `testPathIgnorePatterns` l'écartait du banc. Ces deux lignes étaient les SEULES références au répertoire hors de lui-même : aucun module ne l'importe. Symptôme du silence : quatre de ses fichiers importaient `'../../../shared/prisma/client'`, chemin qui ne résout ni dans le dépôt ni dans l'image Docker.

**Décision**:
1. Le sous-arbre entre dans l'`include` de `tsconfig.json` : il compile et se type-check avec le reste de la passerelle. `tsc --noEmit` à 0 est désormais une garde sur lui.
2. Les 4 défauts d'exécution que le compilateur a révélés sont corrigés dans le même lot (X3DH construit sans dépendances, deux méthodes privées appelées dont un générateur brut sans id, paquet X3DH à la forme des colonnes `DMAEnrollment` au lieu de `PreKeyBundle`).
3. La largeur du nonce AES-GCM des deux producteurs du FIL vient de `SignalProtocolLimits.AES_GCM_IV_SIZE` (12 octets), jamais d'un littéral local.
4. Les 3 suites du sous-arbre restent ignorées par jest, et le sous-arbre reste hors de `collectCoverageFrom` — les deux ensemble, pour une raison unique : elles rendent 56 échecs sur 114 et 3 231 lignes quasi non couvertes feraient rougir la CI sous le seuil global. Les deux lignes tombent le jour où ces suites passent.

**Alternatives rejetées**:
- *Supprimer le sous-arbre* : 3 231 lignes de production que rien n'appelle, mais l'interopérabilité DMA est une obligation réglementaire européenne — une décision de feuille de route, pas un arbitrage d'hygiène de code.
- *Rallumer le banc en même temps que le compilateur* : les 56 échecs s'instruisent un par un ; les traiter sous la pression d'un lot déjà ouvert pousse à desserrer des assertions pour obtenir du vert.
- *Migrer aussi l'IV de `SignalKeyManager.encryptKey`* : son cadre est auto-porté à offsets FIXES (`iv(16)|authTag(16)|…`, lecteur codé en dur) et rien ne distingue les deux cadres dans les octets — changer l'écrivain sans versionner le lecteur rendrait illisible tout matériel de clé déjà persisté. Nonce privé, hors fil : bénéfice cosmétique contre risque sur des clés privées.

**Conséquences**: `dist/` de la passerelle porte désormais le sous-arbre compilé (fichiers inertes, aucun importateur). Toute évolution des types partagés qui casserait ce code le fait maintenant rougir en CI au lieu de dériver en silence. Suivi le plus important laissé ouvert : X3DH ne vérifie JAMAIS `signedPreKey.signature` — le lien qui rattache la pré-clé signée à la clé d'identité — donc l'accord de clés n'est pas authentifié ; la signature est désormais posée à sa place dans le paquet, prête à l'être.

---
