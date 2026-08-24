# Analyse — Itération 260 : `isIpInRange` admettait des IP HORS plage (allow-list sur-permissive)

## Protocole (démarrage)

`main` @ `f11c5136` (dernier commit : `Merge PR #3473 — Cycle 125 : la langue de
CADRAGE d'un destinataire NOMMÉ était élue au rang 1`). Branche
`claude/brave-archimedes-vd5x92` réalignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3854 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. Baselines vertes : shared `conversation-helpers` (101 tests),
gateway `etag` (39 tests), gateway `anonymous*` (55 tests).

**Audit anti-doublon** (9 PRs ouvertes au départ). Le gros du travail récent
(itérations 250-262, cycles 118-125) porte sur le **Prisme Linguistique**, la
**SSOT ObjectId** et la **résolution de langue des notifications** — espace
saturé, plusieurs PRs concurrentes (#3475, #3478, #3474, #3471…). Ce lot est
**orthogonal** : contrôle d'accès IPv4, aucun chevauchement avec la langue,
l'ObjectId ou les notifications.

## Sélection : **Priorité 1 — un défaut de correction dans un contrôle d'accès**

Le harnais gateway réduit sans relâche la dette de Prisme et de SSOT. Le reste du
dépôt est remarquablement poli (des dizaines d'utilitaires portent des invariants
gelés par témoins). L'outlier net est `routes/anonymous.ts` : un helper
`isIpInRange` inline, non testé, qui garde l'accès anonyme aux liens de partage.

## Current state (avant correctif)

`routes/anonymous.ts:68-84`, appliqué en `:328-332` — quand un
`ConversationShareLink` porte `allowedIpRanges`, un visiteur anonyme n'entre que
si son IP tombe dans l'une des plages :

```ts
function isIpInRange(ip: string, range: string): boolean {
  if (range.includes('/')) {
    const [networkIp, prefixLength] = range.split('/');
    return ip.startsWith(networkIp.split('.').slice(0, Math.floor(parseInt(prefixLength) / 8)).join('.'));
  } else if (range.includes('-')) {
    const [startIp, endIp] = range.split('-');
    return ip >= startIp && ip <= endIp;   // comparaison LEXICOGRAPHIQUE de chaînes
  } else {
    return ip === range;
  }
}
```

```ts
// :328
if (shareLink.allowedIpRanges.length > 0) {
  const isIpAllowed = shareLink.allowedIpRanges.some(range => isIpInRange(clientIP, range));
  if (!isIpAllowed) return sendForbidden(reply, 'Acces non autorise depuis votre adresse IP');
}
```

## Problems identified

C'est une **allow-list** : le sens DANGEREUX de l'erreur est la PERMISSIVITÉ
(admettre une IP hors plage). Trois défauts distincts, deux sur-permissifs :

1. **CIDR sans frontière d'octet.** `192.168.1.0/24` → préfixe de chaîne
   `"192.168.1"` → `"192.168.10.5".startsWith("192.168.1")` est `true`. Un `/24`
   admet donc aussi `192.168.1x.x` et `192.168.1xx.x` — ~10× le bloc visé.
   **(sur-permissif — faille d'accès)**
2. **Préfixe non aligné sur l'octet silencieusement élargi.** `Math.floor(prefix/8)`
   tronque `/25`, `/20`, `/12` au `/8` inférieur : un `/25` (128 hôtes) est
   appliqué comme un `/24` (256) ou plus large. **(sur-permissif)**
3. **Plage `a-b` comparée lexicographiquement.** `"192.168.1.9" <= "192.168.1.10"`
   est `false` (`'9' > '1'`), donc `192.168.1.1-192.168.1.100` REJETTE `.9`,
   `.19`, `.90`… **(fail-closed — l'erreur miroir, refus d'IP légitimes)**

## Root causes

Le commentaire l'avoue — « Implementation simplifiee - en production utiliser une
librairie dediee ». Un helper posé en placeholder, jamais testé, jamais repris.
La comparaison de chaînes « marche » sur les cas où le préfixe s'aligne par
chance sur un octet et où les derniers octets ont le même nombre de chiffres —
assez pour paraître correcte à la lecture rapide.

## Business impact

Un opérateur qui restreint un lien de partage à `192.168.1.0/24` croit fermer
l'accès à un bloc de 256 adresses ; il l'ouvre en réalité à ~2560. Un `/25`
« moitié de bloc » n'existe pas — il est traité comme le bloc entier. À l'inverse,
une plage `a-b` refuse des visiteurs parfaitement légitimes selon la position
lexicographique de leur dernier octet. Le contrôle d'accès promis n'est appliqué
correctement dans AUCUNE des trois formes.

## Technical impact

- **Nouveau module feuille** `services/gateway/src/utils/ip-range.ts` :
  `parseIpv4(ip): number | null` + `isIpInRange(ip, range): boolean`. Comparaison
  d'ENTIERS uint32, jamais de chaînes ; masque `(0xffffffff << (32 - prefix)) >>> 0`.
- **Fail-closed sur entrée malformée** : octet > 255, préfixe hors [0,32], IPv6
  non mappée, `x-forwarded-for` multi-valeur ⇒ `false`. Bon défaut pour une
  allow-list.
- **Tolérance IPv4-mappé-IPv6** (`::ffff:192.168.1.1`) : Node place parfois cette
  forme dans `request.ip` derrière un proxy — sans elle, un visiteur légitime
  serait refusé. `parseIpv4` la normalise.
- `routes/anonymous.ts` importe le helper ; la copie inline buggée est supprimée.

## Risk assessment

**Faible.** Changement purement local (un module feuille sans dépendance + un
import). Le seul comportement qui change est celui du prédicat, et il change vers
le CORRECT dans les trois formes. 55 témoins existants d'`anonymous*` restent
verts ; 13 nouveaux témoins gèlent le prédicat, dont chaque assertion de sécurité
tombe contre l'ancienne implémentation (RED prouvé).

## Proposed improvements — RÉALISÉ

- [x] Module `ip-range.ts` avec matching numérique correct des trois formes.
- [x] 13 témoins (`ip-range.test.ts`) — CIDR (bloc voisin, `/25`, `/32`, `/0`),
      plage `a-b` (octets lexicographiquement « après »), exacte, fail-closed.
- [x] `anonymous.ts` rebranché ; copie inline supprimée.

## Expected benefits

Le contrôle d'accès par IP des liens de partage anonymes devient CORRECT dans les
trois formes qu'il documente. Un invariant de sécurité passe de « inline, non
testé, faux » à « module unique, gelé par témoins ».

## Implementation complexity

**Basse.** ~90 lignes de module + ~85 lignes de test. Une suppression de 17
lignes inline + un import dans `anonymous.ts`.

## Validation criteria

- [x] `tsc --noEmit` gateway → 0 erreur.
- [x] `ip-range.test.ts` → 13/13 verts.
- [x] RED prouvé : les 5 assertions de sécurité clés échouent contre l'ancienne
      logique (script de contrôle hors dépôt).
- [x] `anonymous.test` + `anonymous-extended` + `anonymous-username-namespace` →
      55/55 verts.

## Améliorations futures (hors périmètre)

- **`clientIP` multi-valeur.** `routes/anonymous.ts:250` construit
  `clientIP = request.ip || x-forwarded-for || '127.0.0.1'`. Derrière un proxy,
  `x-forwarded-for` peut être `"a, b, c"` — que `parseIpv4` refuse désormais
  (fail-closed). `request.ip` est essayé en premier, donc le cas nominal est sain ;
  normaliser explicitement le premier hop resterait un durcissement propre.
- **IPv6.** Les plages configurées sont IPv4. Un visiteur en IPv6 pur est
  refusé (fail-closed). Le support IPv6 des allow-lists est une décision produit,
  pas un correctif.
