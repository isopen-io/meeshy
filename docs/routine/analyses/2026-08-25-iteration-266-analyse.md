# Itération 266 — Analyse : `isPrivateIp` ne connaissait QUE l'IPv4, et laissait une adresse interne IPv6 partir vers un TIERS

## État courant

`services/gateway/src/services/GeoIPService.ts` capture la géolocalisation d'une
adresse IP via le service TIERS `ip-api.com` (palier gratuit, 45 requêtes/min).
`lookupGeoIp(ip)` court-circuite l'appel externe pour les adresses privées :

```ts
if (isPrivateIp(ip)) {
  return { ip, /* … */ location: 'Local', /* … */ };
}
// sinon : fetch('http://ip-api.com/json/${ip}')
```

`isPrivateIp` est donc la **porte** qui décide si une adresse INTERNE est
envoyée à un tiers.

Forme antérieure du garde :

```ts
function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  return false;
}
```

## Problèmes identifiés

1. **Aucune reconnaissance de l'IPv6.** Une adresse IPv6 privée franchit le
   garde comme si elle était publique :
   - loopback `::1`, non spécifiée `::` ;
   - **ULA** `fc00::/7` (`fc…` / `fd…`) — l'équivalent IPv6 du `10.0.0.0/8` ;
   - **link-local** `fe80::/10` (`fe80`–`febf`).
2. **Aucune reconnaissance des adresses IPv4-mappées** `::ffff:a.b.c.d`. Une
   adresse privée mappée (`::ffff:192.168.1.1`) n'est reconnue par aucune des
   branches IPv4 (qui testent `startsWith('192.168.')`).
3. `extractIpFromRequest` NE normalise que `::1` et `::ffff:127.0.0.1` vers
   `127.0.0.1` — les autres formes IPv6 privées arrivent intactes à
   `lookupGeoIp` (et tout appelant direct de `lookupGeoIp` contourne la
   normalisation).

## Causes racines

Le contrat de `isPrivateIp` est « adresse INTERNE → ne pas sortir ». Le garde
d'origine a été écrit pour un monde IPv4 et n'a jamais été confronté aux
familles IPv6, aujourd'hui livrées par défaut par la plupart des hébergeurs et
équilibreurs de charge. C'est la forme, à une frontière de confidentialité, de
la règle du dépôt : *une protection se mesure sur tout ce que la charge
TRANSPORTE* — ici, l'ensemble des formes d'adresse, pas la seule qu'on avait en
tête en l'écrivant. Jumelle directe de l'itération 260 (`isIpInRange` admettait
des IP hors plage) et 261 (le littéral ObjectId recopié).

## Impact métier

Une adresse IPv6 interne (ULA d'un réseau privé, link-local, ou IPv4-mappée
privée derrière un proxy émettant du `X-Forwarded-For` IPv6) envoyée à
`ip-api.com` :

- **Fuite de confidentialité** : la topologie du réseau interne (adresse IPv6)
  part vers un service tiers, dans l'URL de requête, potentiellement journalisée
  et indexée côté fournisseur.
- **Budget de débit gaspillé** : chaque appel consomme le quota de 45/min pour
  une résolution qui ne peut que rendre `fail` (ip-api ne géolocalise pas une
  adresse privée), au détriment des vraies adresses publiques à géolocaliser.

## Impact technique

Défaut latent transformé en chemin borné. Aucune valeur de retour légitime ne
change : toute adresse PUBLIQUE (IPv4 ou IPv4-mappée publique `::ffff:8.8.8.8`)
continue de passer par l'API. Le durcissement est purement additif au garde.

## Évaluation du risque

**Faible.** Une seule fonction feuille, un seul consommateur (`lookupGeoIp`, dans
le même fichier). La récursion sur l'IPv4-mappée est bornée (une seule
réécriture : `::ffff:` retiré, le reste ne rematche pas le motif mappé). Le seul
changement observable est qu'une adresse INTERNE de plus rend désormais le
placeholder `Local` (aucun `fetch`) au lieu d'un appel externe voué à l'échec —
strictement une amélioration.

## Améliorations proposées (livrées)

- Reconnaître les IPv4-mappées `::ffff:a.b.c.d` en re-vérifiant l'IPv4 embarquée.
- Reconnaître les familles IPv6 privées : loopback `::1`, unspecified `::`,
  ULA `fc00::/7`, link-local `fe80::/10` (insensible à la casse).
- Extraire `isPrivateIpv4` / `isPrivateIpv6` pour la lisibilité ; ajouter le
  `radix 10` au `parseInt` du second octet.

## Bénéfices attendus

- Aucune adresse interne IPv6 ne peut plus atteindre le service tiers.
- Le budget de débit d'`ip-api.com` n'est plus consommé par des lookups privés
  voués à l'échec.
- Le contrat « adresse interne → ne pas sortir » est désormais tenu pour les
  deux familles d'adresse.

## Complexité d'implémentation

Triviale — une fonction feuille scindée en deux, aucun nouveau module, aucun
nouveau consommateur.

## Critères de validation

- [x] RED : 9 gardes IPv6/IPv4-mappée-privée tombent sur `main`
      (`lookupGeoIp` rend `null`, un `fetch` réel est tenté).
- [x] GREEN : `GeoIPService.lookup.test.ts` → 23/23, dont le témoin de
      non-régression « une IPv4-mappée PUBLIQUE passe toujours par l'API ».
- [x] Toutes les suites `GeoIPService.*` → 73/73.
- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] Suites consommatrices (services, auth, jobs) → vertes.
- [ ] Commit + push.
# Itération 266 — `DoubleRatchet.skipMessageKeys` avançait la CHAÎNE sans avancer le COMPTEUR : un seul message reçu hors ordre corrompait toute la chaîne de réception

## Protocole (démarrage)

`main` @ `8adb5995` (`feat(android): fold realtime story:updated into the open
viewer (#3496)`). Branche `claude/brave-archimedes-mu8dvk` réalignée sur
`origin/main` au départ (fast-forward, 0 avance). **Aucune PR ouverte** au
démarrage.

Environnement : Linux, Node 22.22 / bun 1.3.11 / Python 3.11 — **aucune
toolchain Swift/Xcode/Android**. Surface exécutable = TypeScript
(`packages/shared`, `services/gateway`). Parité : `bun install --ignore-scripts`
(3854 paquets), `prisma generate` + `bun run build` sur `packages/shared`. Suite
`packages/shared` verte au départ (2593 tests / 109 fichiers). Harnais jest du
gateway opérationnel (les suites `src/__tests__/unit/dma-*` s'exécutent —
elles importent le code de PRODUCTION `dma-interoperability/` sans être sous le
chemin ignoré).

**Audit anti-doublon.** Les itérations 245-265 ont traité : l'ordre des couloirs
de la Rivière (245), les résolveurs du Prisme (aperçu de liste, audio, posts,
bannière/push de notification, cadrage destinataire — cycles 118-128), les
plafonds de réaction (264), la validation de type de `decodeCursor` (265), la
fiabilité d'appel (`summarizeCallReliability`, Vague 180), la protection d'un
média cité par le sérialiseur. Côté E2EE, les cycles 96-98 ont corrigé la
symétrie X3DH (dérivation, orientation des chaînes, identifiant
d'enregistrement) et le croisement du ratchet asymétrique. **Jamais le ratchet
SYMÉTRIQUE de réception, ni le compteur après un saut de clés.** Cible fraîche.

## Sélection : **Priorité — dette de correction identifiée et NON traitée (itération 245), sur une surface E2EE sensible, désormais prouvable dans le chemin de test qui S'EXÉCUTE**

L'analyse de l'itération 245 avait nommé, en « dette identifiée », un défaut réel
de `DoubleRatchet.skipMessageKeys` — « avance la clé de chaîne mais ne met jamais
à jour `session.messageNumberReceive` » — en le différant au motif que le
sous-arbre `dma-interoperability/__tests__/` est exclu de la CI et que le réveiller
serait un lot entier à risque. **Ce lot ne réveille pas le sous-arbre exclu.** Il
prouve le défaut par un témoin placé dans `src/__tests__/unit/`, le chemin que la
CI exécute déjà et que cinq témoins `dma-*` empruntent pour exercer le même code
de production. Le correctif reste minimal et local ; aucune modification de
`jest.config.json`.

## Current state (avant correctif)

`getMessageKeyReceive(session, messageNumber)`
(`DoubleRatchet.ts`) traite un message reçu EN AVANCE
(`messageNumber > session.messageNumberReceive`) en deux temps :

```ts
this.skipMessageKeys(session, messageNumber, 'receive'); // saute 0..messageNumber-1
return this.symmetricRatchet(session, 'receive');        // consomme messageNumber
```

`skipMessageKeys` fait progresser la clé de chaîne (`chainKeyReceive`) de la
position courante jusqu'à `until`, en stockant une clé sautée à chaque pas — mais
il n'incrémente qu'une variable **LOCALE** :

```ts
let currentMessageNumber = direction === 'send' ? session.messageNumberSend : session.messageNumberReceive;
while (currentMessageNumber < until) {
  /* … stocke la clé sautée, avance chainKeyReceive … */
  currentMessageNumber++;
}
// ← ni session.messageNumberReceive ni session.messageNumberSend n'est réécrit
```

Puis `symmetricRatchet(session, 'receive')` lit `session.messageNumberReceive`
(resté à l'ancienne valeur) pour ÉTIQUETER la clé rendue et pour poser le prochain
« attendu ».

## Problems identified

Après un seul message reçu en avance (attendu 0, reçu 3) :

- `chainKeyReceive` est en position 4 (0, 1, 2, 3 consommés) — **correct** ;
- `session.messageNumberReceive` vaut **1** au lieu de **4** — la clé du message
  #3 est rendue étiquetée `messageNumber: 0`, et le compteur ne monte qu'à 1.

Le message suivant reçu **DANS L'ORDRE** (#4) est alors comparé à un attendu
périmé (1) : `4 > 1` ⇒ il retombe dans la branche « en avance », `skipMessageKeys`
re-saute de 1 à 4 en avançant `chainKeyReceive` **encore** (déjà en 4, poussé vers
8), et la clé dérivée ne correspond à rien. En production
(`SignalProtocolEngine.decryptMessage`), le déchiffrement AES-256-GCM lève sur le
tag d'authentification. **Un unique message hors ordre corrompt tout le reste de
la chaîne de réception**, et `persistSession` grave l'état désynchronisé.

Le témoin dormant `DoubleRatchet.test.ts:252` (« should handle message received
ahead of expected ») attend d'ailleurs `messageNumber === 3` là où le code rend
`0` — il tomberait s'il s'exécutait.

## Root causes

`skipMessageKeys` déplace un ÉTAT DE SESSION (la clé de chaîne) mais oublie son
COMPTEUR jumeau. Les deux décrivent la même position et doivent avancer ensemble ;
la boucle n'en avançait qu'un, l'autre dans une variable locale jamais réécrite.
`symmetricRatchet`, lui, tient l'invariant (il écrit le compteur à chaque
consommation) — ce qui masquait le défaut tant qu'aucun saut n'avait lieu :
en réception strictement ordonnée, `skipMessageKeys` n'est jamais appelé.

## Business impact

Le chiffrement de bout en bout est un différenciateur annoncé du produit. Le
défaut ne se manifeste que sur les sessions Signal (DMA) empruntant le chemin
`decryptMessage` avec au moins un message reçu hors ordre — cas normal sur un
réseau mobile (réordonnancement, reprise après coupure). Le symptôme est le PIRE
possible pour de l'E2EE : après un accroc réseau bénin, plus aucun message
n'est déchiffrable dans le sens affecté, et l'état corrompu est persisté — la
session ne se rétablit pas seule.

## Technical impact

Défaut de correction pur dans une fonction de production
(`DoubleRatchet.skipMessageKeys`), compilée (sous l'`include src/**/*` depuis le
cycle 105 bis) mais dont les témoins natifs sont hors CI. Aucune fuite, aucune
régression de sécurité au sens confidentialité — c'est une panne de disponibilité
du déchiffrement. Le correctif est deux lignes (réécriture du compteur après la
boucle), sans changement de signature ni de type.

## Risk assessment

**Faible.** La modification n'ajoute que la persistance du compteur déjà calculé,
au seul point qui l'oubliait ; elle ne touche ni la dérivation de clés, ni le
stockage des clés sautées, ni le nettoyage anti-DoS. Les 35 témoins `dma-*` et
les 234 témoins de la tranche chiffrement/signal restent verts. `tsc --noEmit`
gateway : 0 erreur.

## Proposed improvements (livrés)

1. **Correctif** : après la boucle de `skipMessageKeys`, réécrire
   `session.messageNumberSend` / `session.messageNumberReceive` à
   `currentMessageNumber` selon la direction, avec un commentaire nommant
   l'invariant (chaîne et compteur avancent ensemble) et la conséquence en aval.
2. **Témoin RED→GREEN** :
   `src/__tests__/unit/dma-double-ratchet-skip-counter.test.ts` — quatre cas dans
   le chemin de test QUI S'EXÉCUTE : étiquette du message en avance (#3 → 3),
   compteur porté à la position de chaîne (4), **message dans l'ordre qui suit un
   message en avance** (le cas de corruption, #4 attendu et non re-sauté), et
   saut côté ÉMISSION (`messageNumberSend`). Prouvés ROUGES avant (message
   suivant étiqueté `1`, `messageNumberSend` resté `0`), verts après.

## Expected benefits

- Un message reçu hors ordre n'empoisonne plus la chaîne de réception : le
  message ordonné suivant est reconnu comme attendu et déchiffré.
- Le compteur de session reflète fidèlement la position de la clé de chaîne dans
  les deux directions — invariant désormais gardé par un témoin exécuté en CI.
- Le contrat que le témoin dormant `DoubleRatchet.test.ts:252` énonçait est
  vérifié, sans réveiller le sous-arbre exclu.

## Implementation complexity

Triviale au correctif (deux affectations), non triviale à ÉTABLIR : il fallait
prouver que le chemin de test `src/__tests__/unit/` exerce le code de production
(et non le sous-arbre exclu), tracer le défaut jusqu'à son symptôme aval (le
message ORDONNÉ suivant, pas le message en avance lui-même), et confirmer que
`retrieveSkippedMessageKey` n'est PAS le point à corriger ici.

## Validation criteria

- [x] 4 témoins RED prouvés avant, GREEN après.
- [x] 6 suites `dma-*` : 35 tests verts.
- [x] Tranche chiffrement/signal (9 suites) : 234 tests verts.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] `packages/shared` : 2593 tests verts (inchangé, non touché).
- [x] Diff de production minimal (une clause de 8 lignes, aucun changement de type).

## Remaining work / dette identifiée (NON traitée ici — nommée pour la suite)

- **`getMessageKeyReceive` ne consulte JAMAIS `retrieveSkippedMessageKey`.** Les
  clés sautées sont STOCKÉES mais jamais RELUES : un message qui arrive « en
  retard » (les #0, #1, #2 réels après le #3) tombe dans la branche
  `messageNumber < expected` → `return null` → échec, alors que sa clé attend dans
  `session.skippedMessageKeys`. C'est un défaut de conception distinct (le moteur
  ne referme pas la boucle out-of-order), plus large que ce correctif de compteur,
  à instruire seul — surface E2EE, chemin de persistance de session concerné.
- **Le sous-arbre `dma-interoperability/__tests__/` reste hors CI.** Le réveiller
  reste le lot que l'itération 245 décrivait : sa réactivation peut révéler
  d'autres témoins gelés (dont `DoubleRatchet.test.ts:252`, qui passerait
  désormais au vert grâce à ce correctif). À traiter comme un lot d'infrastructure
  de test dédié, pas en passager.
