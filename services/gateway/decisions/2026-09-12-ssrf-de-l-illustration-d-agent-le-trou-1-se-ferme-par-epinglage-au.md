## 2026-09-12 : SSRF de l'illustration d'agent — le trou 1 se ferme par épinglage au connect, `undici` devient une dépendance directe (#6201)

**Statut** : Accepté

**Contexte** : le trou 2 de #6201 (une seule adresse validée sur N) a été fermé
sur `dev` (`fba914e6a7`). Restait le trou 1 : `publicHttpUrl` valide un nom via
`lookup(host)` AVANT la requête, et le transport par défaut (`fetch` global —
donc `undici`, déjà présent transitivement, mais non résoluble en dépendance
directe du gateway) résout le même nom une SECONDE fois, indépendamment, au
moment d'ouvrir la connexion TCP. Un DNS contrôlé par l'attaquant, à TTL court,
peut rendre une adresse publique à la première résolution et une adresse
interne à la seconde — TOCTOU classique, sans course à gagner puisque c'est le
serveur DNS de l'attaquant qui choisit quand changer de réponse.

Trois voies avaient été mesurées par l'issue :

| voie | ferme le trou | coût |
|---|---|---|
| **`Agent` undici avec `connect: { lookup }`** | oui, proprement — la résolution qui valide EST celle qui connecte | déclarer `undici` en dépendance directe, toucher `bun.lock` |
| réécrire l'URL avec l'IP + en-tête `Host` | oui | casse le SNI TLS sans `servername`, à reconstruire à chaque saut de redirection |
| passer à `node:https` | oui | réécrit tout le transport (streaming, bornes de taille, timeouts) — coût disproportionné pour une seule garde |

**Décision** : la première voie. `node:undici` n'existe pas comme module
intégré sous Node 22 (`ERR_UNKNOWN_BUILTIN_MODULE`, vérifié) : `undici` est donc
ajouté aux `dependencies` de `services/gateway/package.json` (il était déjà
présent transitivement via `fastify`/`jsdom`/`srvx`, à une version identique —
aucune résolution nouvelle, seulement une déclaration directe et une entrée de
lockfile). Un `Agent({ connect: { lookup } })` est construit avec un
`connect.lookup` qui applique EXACTEMENT la règle de `publicHttpUrl` (« toutes
les adresses publiques », résolution vide refusée) ; cet Agent sert de
`dispatcher` au `fetch` par défaut. La validation et la connexion partagent
ainsi la MÊME résolution fraîche, prise au dernier moment possible — il n'y a
plus de fenêtre entre les deux à faire dériver.

Portée volontairement étroite : seul le `fetchImpl` PAR DÉFAUT passe par l'Agent
épinglé. Un `fetchImpl` injecté (les 42 témoins existants) contourne l'Agent
entièrement, comme avant — aucune régression sur la suite unitaire, qui
continue de tester la logique de garde sans réseau réel. Un unique Agent est
mémoïsé pour le `lookup` par défaut (une résolution pinnée par requête suffit,
pas une instance par appel) ; un `lookup` de test en obtient un dédié.

**Preuve** : `services/gateway/src/services/zmq-agent/agent-illustration.ts`
(`createConnectLookup`, `pinnedAgentFor`, `pinnedFetch`) ; le témoin qui exerce
le NIVEAU que le trou 1 exigeait (§ « épinglage au connect » du fichier de
test) — il n'injecte PAS `fetchImpl`, seulement un `lookup` qui compte ses
appels et change de réponse entre le premier (pré-validation) et le second
(résolution réelle au connect). Contre-épreuve mesurée : en repointant le
`fetchImpl` par défaut sur le `fetch` global NU (la forme d'avant ce lot), ce
même témoin ROUGIT — `lookup` n'est appelé qu'une fois, la résolution réelle
passant par le DNS système hors de portée du témoin. `npx tsc --noEmit` : 0
erreur. `bun run test` sur le fichier : 43/43 verts.

**Alternatives rejetées** : réécriture d'URL (SNI cassé) et migration vers
`node:https` (coût disproportionné pour une seule garde, documentées dans
l'issue). Aucune des deux n'a été implémentée.

**Conséquences** : `services/gateway/package.json` déclare `undici@^8.10.0` ;
`bun.lock` porte l'entrée. `pnpm-lock.yaml` n'a délibérément pas été
re-régénéré dans ce lot — le CI pnpm tourne en `--no-frozen-lockfile` (le
résout à la volée) et une régénération locale a fait dériver des entrées sans
rapport (bump de `socket.io-parser`/`ws`, ajout non lié dans `apps/web-v2`) ;
les inclure aurait élargi ce lot au-delà de sa portée. Une session qui
régénère `pnpm-lock.yaml` pour une autre raison peut porter cette entrée dans
la foulée.
