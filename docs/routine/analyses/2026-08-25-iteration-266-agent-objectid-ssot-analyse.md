# Itération 266 — `services/agent` : la règle ObjectId recopiée hors du SSOT partagé

## Protocole (démarrage)
`main` @ `c4a3d517` (`feat(android/stories): fold realtime story:updated into the
tray cache (#3501)`). Branche `claude/brave-archimedes-2qemmc` alignée sur
`origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android/Python-ML → surface
testable = TypeScript. Parité : `bun install --ignore-scripts` (3854 paquets),
`npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. `services/agent` teste sous jest (ts-jest) : 296 tests verts
au départ.

**Audit anti-doublon** (5 PRs ouvertes au départ : #3497, #3498, #3500, #3502,
#3503). Aucune ne touche `services/agent/` — zéro chevauchement de fichier.
Le service `agent` était le SEUL service TypeScript exclu des passes
d'itération récentes.

## Sélection : Priorité 3 — homogénéiser un service laissé hors de la convergence SSOT déjà réalisée ailleurs

Le dépôt a DÉJÀ établi une source unique du prédicat « chaîne = ObjectId
Mongo » : `packages/shared/utils/object-id.ts` expose `OBJECT_ID_REGEX`,
`OBJECT_ID_PATTERN` (forme chaîne) et `isValidObjectId`. Son en-tête documente
le motif — la même regex « vivait recopiée sur QUATRE sites … la première qui
change casse la sémantique sans qu'aucune autre ne le sache » — et cite les
schémas de route du gateway qu'elle a consolidés. Des SSOT sœurs existent par
package : `apps/web/utils/object-id.ts`, `services/gateway/src/utils/object-id.ts`.

**`services/agent` est le seul service TypeScript qui n'a jamais rejoint cette
convergence** : il inline le littéral `/^[0-9a-fA-F]{24}$/` sur trois schémas
Zod de route et ne possède aucun `object-id.ts` local.

## Current state (avant)

| Fichier | Ligne | Forme |
|---|---|---|
| `services/agent/src/routes/config.ts` | 7 | `z.string().regex(/^[0-9a-fA-F]{24}$/).optional()` |
| `services/agent/src/routes/config.ts` | 14 | `z.string().regex(/^[0-9a-fA-F]{24}$/)` |
| `services/agent/src/routes/reading.ts` | 17 | `z.string().regex(/^[0-9a-fA-F]{24}$/)` |

De plus, **`routes/config.ts` n'avait AUCUN test** : la borne de confiance de ses
deux endpoints (`POST /api/agent/cache/invalidate`, `POST /api/agent/config/
:conversationId/stop`) — que la gateway appelle pour buster le cache et arrêter
un scan — n'était vérifiée par rien.

## Problèmes identifiés

- **Duplication du site de décision hors SSOT.** La règle ObjectId — un contrat
  de trust boundary — est recopiée à la main dans un service, alors qu'une
  source unique consommable existe (`@meeshy/shared/utils/object-id`, déjà
  importé ailleurs dans le service via `@meeshy/shared/types/socketio-events`).
- **Dérive possible.** Si la définition d'ObjectId évoluait dans le SSOT, ce
  service divergerait en silence.
- **Borne de confiance non testée** sur `config.ts`.

## Cause racine

Le service `agent` a été créé/étendu après la convergence ObjectId et n'a pas
été balayé par les passes qui ont consolidé le gateway. Un service exclu d'une
énumération de sites reste porteur de la forme que l'énumération a fermée
partout ailleurs (motif « jumelle » récurrent du dépôt).

## Impact métier / technique

- **Technique.** Faible sévérité fonctionnelle (comportement correct), dette
  d'homogénéité : le dépôt a explicitement investi pour éradiquer cette forme.
- **Produit.** Aucun changement de comportement visible (regex identique).
- **Positif net.** `config.ts` gagne une couverture de test là où il n'en avait
  aucune.

## Évaluation du risque

**Très faible.** Refactor behavior-preserving : `OBJECT_ID_REGEX` vaut
exactement `/^[0-9a-fA-F]{24}$/`. Import de module feuille (aucun cycle). Testé
avant/après. Rollback : revert d'un commit unique.

## Décision de portée : `reading.ts` reste INLINE, à dessein

`routes/reading.ts` appartient au chemin de lecture G-126, dont
`non-writing-path.test.ts` prouve que la **clôture d'imports externes est
EXACTEMENT `{zod, fastify}`** — aucun client réseau, aucune base. Importer le
SSOT y ferait rougir ce témoin (nouvelle entrée externe) et **élargirait une
surface de confiance délibérément minimale pour un gain purement cosmétique**.
La décision senior est de préserver la minimalité de la preuve : le littéral
reste, avec un commentaire qui nomme la raison et renvoie au SSOT pour les
routes sans cette contrainte. La convergence porte donc sur `config.ts`, où
aucun garde structurel ne s'y oppose et où elle est un pur bénéfice.

## Améliorations réalisées

1. `config.ts` : les deux schémas importent `OBJECT_ID_REGEX` du SSOT partagé.
2. Nouveau test `src/__tests__/config/config-route.test.ts` (10 cas) :
   - chemin heureux des deux endpoints (ObjectId valide → Redis/Prisma touchés) ;
   - rejet 400 des identifiants hors forme (trop courts, caractère non-hex,
     vide) SANS toucher Redis ni Prisma ;
   - assertion de parité `OBJECT_ID_PATTERN === '^[0-9a-fA-F]{24}$'` — témoin qui
     rougit si le SSOT et l'attente locale divergent.
3. `reading.ts` : commentaire documentant l'exception délibérée (surface G-126).

## Critères de validation

- `bunx jest --config=jest.config.json` dans `services/agent` : 296 + 10 tests
  verts. ✅
- `tsc --noEmit -p tsconfig.json` : exit 0. ✅
- Aucun littéral `/^[0-9a-fA-F]{24}$/` restant dans `services/agent/src/` hors
  de l'assertion de test intentionnelle et de la ligne `reading.ts` documentée.

## Future improvements

- `scripts/lib/embedded-reactions-to-rows.ts:16` porte encore un
  `const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/` local. C'est un script de
  maintenance one-off isolé (contexte différent d'un service à runtime) ; sa
  consolidation est un candidat de moindre priorité, à traiter si les scripts
  gagnent un accès stable au SSOT partagé.
