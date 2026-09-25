## Leçon 55 — une émission qui ÉNUMÈRE `adapter.rooms` (ou lit `connectedUsers`/`socketToUser`) ne voit QUE le nœud local ; sur un déploiement multi-nœud (Redis adapter) elle perd silencieusement tous les destinataires connectés à un autre nœud (routine messaging, Vague 36, 2026-07-10)

`_emitMessageNewByLanguage` (présent en DEUX exemplaires : `MessageHandler.ts` chemin WS `message:send`,
et `MeeshySocketIOManager.ts` chemin REST/ZMQ + rediffusion des traductions) construisait le fan-out
`message:new` en énumérant `this.io.sockets.adapter.rooms.get(room)` puis en résolvant la langue de chaque
socket via les maps mémoire `connectedUsers`/`socketToUser`, avant d'émettre `io.to(socketId)` par groupe de
langue. Les trois sources — `adapter.rooms`, `connectedUsers`, `socketToUser` — ne contiennent QUE les
sockets du nœud courant. Sur la topologie horizontale documentée (100k+ msg/s via le Socket.IO Redis
adapter), un destinataire connecté à un AUTRE nœud gateway n'apparaît dans aucune des trois → il n'était
jamais énuméré, jamais émis, et le early-return `if (!socketIds || socketIds.size === 0) return;` court-
circuitait même l'envoi lorsque le nœud émetteur (celui de l'expéditeur) n'avait aucun socket local dans la
room. Résultat : sous `SOCKET_LANG_FILTER=true` en multi-nœud, `message:new` n'atteignait plus les
destinataires distants EN TEMPS RÉEL (récupérés seulement au prochain `/sync` ou refetch). Les chemins NON
filtrés (`io.to(room).emit(...)` / `.except(ROOMS.user(sender))`) n'avaient PAS le bug car le Redis adapter
propage `io.to(room)` à tout le cluster — seul le chemin filtré, qui énumère manuellement, régressait une
diffusion cross-node-correcte en diffusion locale-seulement.

**Signature du bug** : un raccourci/optimisation remplace un `io.to(room).emit(...)` (adapter-propagé,
cluster-wide) par une énumération manuelle de `adapter.rooms` / une lecture des maps de présence en mémoire,
pour émettre socket-par-socket. Toute décision de livraison bâtie sur ces structures est intrinsèquement
locale au nœud. Le bug est INVISIBLE en test unitaire mono-process et en dev mono-nœud — il n'apparaît qu'en
production multi-réplica.

**Règle réutilisable** : `adapter.rooms.get(room)`, `connectedUsers`, `socketToUser`, `userSockets` sont
des vues LOCALES au nœud. Dès qu'une émission dépend d'elles pour décider QUI reçoit, elle doit conserver un
filet cluster-wide pour les destinataires non-locaux : diffuser le payload complet via `io.to(room)`
(adapter-propagé) en `.except([...socketsLocaux, sender])` — les sockets locaux reçoivent la version
optimisée/trimmée, les sockets distants reçoivent le payload complet, chacun exactement une fois ; sur un
seul nœud l'except couvre toute la room et la diffusion cross-node ne touche personne (comportement
inchangé). Ne JAMAIS placer un tel calcul local-seulement AVANT un early-return qui suppriment aussi la
diffusion distante. Corollaire de duplication (SSoT) : ce helper existait en deux copies divergentes (une
via le helper pur `groupSocketsByLanguage`, l'autre en grouping inline) — le même bug logique devait être
corrigé aux DEUX sites ; un audit d'un seul fichier (ici `MessageHandler.ts`) aurait laissé le chemin
REST/ZMQ (le plus emprunté : tout envoi REST + toute rediffusion post-traduction) toujours cassé.
