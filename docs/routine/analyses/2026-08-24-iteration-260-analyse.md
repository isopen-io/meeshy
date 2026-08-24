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
# Analyse — Itération 260 : la recherche de messages parsait sa taille de page à la main, rouvrant le bug exact que `validatePagination` documente tuer

## Protocole (démarrage)

`main` @ `52445d9e` (dernier commit : `Merge PR #3426 — 240i : « 1 réponses »,
les compteurs d'engagement du fil qu'aucune clé plate ne pouvait accorder`).
Branche `claude/brave-archimedes-5ji1l9` réalignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. Baseline verte au départ : suite `packages/shared` complète
(108 fichiers, 2574 témoins, vitest).

**Audit anti-doublon** (3 PRs ouvertes au départ) : #3461 (docs 240i, aucun
code), #3460 (Android `post:translation-updated`), #3459 (gateway : Prisme des
bannières de notification protégées + vocal). Aucune ne touche
`services/gateway/src/routes/conversations/messages.ts` ni
`services/gateway/src/utils/pagination.ts` — zéro chevauchement.

**Diversification voulue** : les itérations 246–259 ont massivement porté sur le
Prisme Linguistique et sur la déduplication de prédicats SSOT (regex ObjectId,
soldée à l'itération 259). Ce lot vise délibérément une autre famille — une
**correction de correctness de pagination**, hors Prisme.

## Sélection : **Priorité 1 — un défaut de correctness sur une surface utilisateur récente (recherche de messages)**

## Current state (avant correctif)

Le helper SSOT `validatePagination()` (`services/gateway/src/utils/pagination.ts`)
existe et **documente explicitement** le bug qu'il tue :

```ts
// `defaultLimit` is the fallback for MISSING/unparsable input only (`NaN`). An
// explicit but below-minimum value (`'0'`, `'-5'`) is a real parsed number and
// must clamp to the floor of 1 — not be falsy-coerced to `defaultLimit`. The
// former `parseInt(...) || defaultLimit` conflated `0` with "absent", so
// `limit=0` returned a full page (20) while `limit=-5` returned 1.
```

Or la route `GET /conversations/:id/messages/search`
(`routes/conversations/messages.ts:2775`) reparsait sa taille de page **à la
main**, avec exactement l'anti-patron que le commentaire ci-dessus condamne :

```ts
const searchLimit = Math.min(parseInt(limitStr, 10) || 20, 50);
```

Son schéma `querystring` déclare `limit: { type: 'string' }` **nu** — aucune
borne numérique (`minimum`/`maximum` ne s'appliquent pas à un `string`), aucun
`validateQuery` Zod. **Rien en amont ne borne `limit`.** La valeur brute
descend jusqu'au handler.

Comportement mesuré de l'inline sur les entrées limites :

| `limit` reçu | inline `Math.min(parseInt||20, 50)` | attendu |
|---|---|---|
| `'0'` | `parseInt('0')=0` → `0 \|\| 20` = **20** | 1 (plancher) |
| `'-5'` | `parseInt('-5')=-5` → `Math.min(-5,50)` = **−5** | 1 |
| `'999'` | `Math.min(999,50)` = 50 | 50 |
| absent / `'abc'` | 20 | 20 |

La ligne `−5` est la plus grave : `searchLimit` alimente
`take: searchLimit + 1` sur `prisma.message.findMany` — un `take` **négatif**
demande à Prisma une pagination À REBOURS depuis le curseur, et
`merged.slice(0, -5)` retire les 5 derniers résultats. `limit=0` sert 20
résultats là où l'appelant en demandait le minimum.

## Problems identified

1. **Un invariant SSOT réinliné, avec le défaut que le SSOT documente tuer.**
   La route n'importe même pas le helper par accident : `validatePagination`
   est **déjà importé et utilisé** vingt lignes plus haut dans le MÊME fichier
   (`messages.ts:478`, `{ maxLimit: 50 }`) par la route de liste paginée. La
   recherche était l'exception.
2. **Une taille de page non bornée par le schéma.** Le `querystring` nu ne peut
   pas clamper un `limit` numérique — c'est au handler de le faire, et il le
   faisait mal.
3. **Un `take` négatif atteignable.** `limit=-5` produit un comportement Prisma
   silencieusement faux (pagination inverse) plutôt qu'une erreur.

## Root cause

Le patron « cette route parse sa pagination à la main » est ce que
`validatePagination` a été écrit pour éliminer. La recherche a été écrite (ou
maintenue) avec le repli falsy `|| 20` — le réflexe précis que le commentaire du
helper nomme. Le helper existait, était importé dans le fichier, et n'a pas été
appelé ici.

## Portée honnête : **un seul site atteignable, pas cinq**

Un balayage (`parseInt(...limit...) || …` dans `routes/`) rend 6 occurrences.
**Cinq sont défendues en amont** et donc NON atteignables :

| site | garde amont | verdict |
|---|---|---|
| `admin/languages.ts:120` / `:353` | `validateQuery` → Zod `…pipe(z.number().int().min(1).max(100))` | `limit=0` **jette** au `validateQuery` — repli `istanbul ignore` |
| `admin/analytics.ts:238` | idem (`AnalyticsLanguageDistQuerySchema`, min(1)) | idem |
| `admin/system-rankings.ts:891` | `RankingsQuerySchema` (`…min(1).max(100)`) | idem |
| `admin/broadcasts.ts:53` | `BroadcastsListQuerySchema` (`…min(1).max(100)`) | idem |
| **`conversations/messages.ts:2775`** | **schéma `{ type: 'string' }` nu — aucune borne** | **ATTEIGNABLE — c'est le seul bug** |

Le test Zod `LanguageStatsQuerySchema.parse({ limit: '0' })` **`.toThrow()`**
existe déjà (`admin-schemas.test.ts:279`) : la preuve que les routes admin sont
gardées est dans le dépôt. L'inventaire honnête de ce lot est donc **1 défaut**,
pas 5 — la reprise des quatre autres serait du code mort déplacé.

## Business impact

Recherche de messages (surface la plus « facile à oublier », cf. commentaire du
handler) : `?limit=0` sert une page pleine au lieu du minimum ; `?limit=-5`
produit une pagination Prisme à rebours et tronque les résultats. Aucun client
connu n'envoie `limit=0`/négatif aujourd'hui (piège armé plutôt que panne
observée — mesuré, non supposé), mais la règle du cycle 84 tient : on ne laisse
pas un défaut de correctness atteignable au motif que personne n'a encore marché
dessus.

## Technical impact

- **Une ligne de production** (`messages.ts:2775`) : l'inline devient
  `const { limit: searchLimit } = validatePagination('0', limitStr, { maxLimit: 50 });`.
  La recherche étant curseur-based, seul `limit` est utilisé (offset `'0'`
  ignoré). Ceci reproduit à l'identique le comportement nominal (`20` par
  défaut, plafond `50`) et corrige les deux entrées limites.
- **Aucun changement d'import** : `validatePagination` était déjà importé.
- **Aucun changement de contrat client** : `cursorPagination.limit` reste servi
  tel quel ; seule la valeur clampée change pour des entrées hors-borne.

## Risk assessment

Faible. Substitution vers un helper déjà éprouvé (`pagination.test.ts` garde son
clamp), déjà consommé par la route sœur du même fichier. La seule différence de
comportement observable est sur des entrées que l'inline traitait de façon
incorrecte. Un test existant (`hasMore when merged results exceed searchLimit`)
couplé au parsing inline a été mis à jour pour refléter la délégation (il fixe
désormais le retour du helper mocké au lieu de dépendre du parsing d'un `limit`
de requête).

## Proposed improvements (réalisées)

Router la taille de page de la recherche par `validatePagination`.

## Validation criteria

- RED prouvé : deux témoins neufs tombent AVANT le correctif — `take: 51`
  (l'inline `Math.min(999||20,50)+1`) et `validatePagination` jamais appelé.
- GREEN : les deux passent après ; `take: 8` (helper mocké → 7, +1),
  `cursorPagination.limit: 7`, appel `validatePagination('0','0',{maxLimit:50})`.
- Suite `messages-routes.test.ts` : **229/229** verte.
- `tsc --noEmit` sur `services/gateway` : **0 erreur**.

## Améliorations futures (hors périmètre)

- **Helper `clamp(value, min, max)` partagé.** `Math.max(min, Math.min(max, x))`
  est inliné 10+ fois (`VoiceProfileService`, `PostService`, `PostFeedService`,
  `routes/posts/feed.ts`…), et la seule implémentation nommée est privée
  (`types/translation.types.ts:533`). Extraction SSOT propre mais à faible
  payoff (chaque site est une ligne d'arithmétique pure, sans bug) et à surface
  de conflit large — différée délibérément.
- **Durcir le schéma `querystring` de la recherche.** Passer `limit` à un
  `validateQuery` Zod borné aligne la route sur les routes admin. Non fait ici :
  le correctif au handler suffit à fermer le défaut, et le passage à Zod touche
  le contrat d'entrée (changement plus large, à évaluer séparément).
