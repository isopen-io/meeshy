# Iteration 221 — Intégrité du contenu : séquences `$` dans le traitement des liens de tracking

## Protocole (démarrage)
`main` @ `68a1a33f` (dernier commit : fix gateway — traduire aussi les REEL et STATUS à la publication).
Branche `claude/brave-archimedes-lewp8x` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` puis `npx prisma generate --generator client` (parité CI : sans le
client généré, ~17 suites gateway échouent en compile TS, ex. `PostReactionService.reduce<T>` untyped).

PRs ouvertes au démarrage — **audit anti-doublon** (7 PRs : #2367→#2370 ios, #2406 android, #2389/#2391
dependabot). **Aucune PR ouverte ne touche `services/gateway/src/services/TrackingLinkService.ts`.**
Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — extension directe du correctif `7b70bfa1` (même classe de bug, code adjacent)**

Le commit `7b70bfa1` (`fix(gateway/messaging): preserve $-sequences in link processing`) vient de
corriger, dans `MessagingService.processLinksInContent`, l'interprétation par
`String.prototype.replace` des séquences `$$`, `$&`, `` $` ``, `$'` **dans la chaîne de remplacement**.
Un balayage `grep` de tous les `.replace(search, remplacement_variable)` du gateway révèle **la même
classe de défaut, toujours vivante**, dans `TrackingLinkService` — le pipeline SŒUR qui réécrit les
liens `[[url]]` / `<url>` / markdown en tokens de tracking, sur le **même chemin d'envoi primaire**.

## Current state (avant correctif)

`TrackingLinkService.processExplicitLinksInContent` réinjecte du texte contrôlé par l'utilisateur comme
*replacement string* de `String.prototype.replace` sur deux chemins :

1. **ÉTAPE 4 — restauration des liens markdown protégés** (`.replace(placeholder, original)`) : `original`
   est le lien markdown complet `[text](url)` retiré à l'ÉTAPE 1 et réinséré. **Chemin toujours actif**
   dès qu'un message contient un lien markdown.
2. **ÉTAPE 2/3 — repli d'erreur** (`.replace(fullMatch, url)`) : sur échec de mint, l'URL brute
   remplace le wrapper `[[url]]` / `<url>`.

`String.prototype.replace` interprète `$$` → `$`, `$&` → sous-chaîne trouvée, `` $` ``/`$'` →
avant/après, **que la recherche soit une chaîne ou une regex**. Conséquences observées (prouvées RED) :

| Entrée utilisateur | Sortie buggée (persistée + fan-out) |
|---|---|
| `[a$&b](https://x.com)` | `[a__PROTECTED_MD_0__b](https://x.com)` — **fuite de la sentinelle interne** |
| `[$$ deal](https://x.com)` | `[$ deal](https://x.com)` — **`$` avalé** |
| `` before [x$'y$`z](https://x.com) after `` | `before [x afterybefore z](...) after` — **texte mutilé** |
| `[[https://x.com/?q=$&a$$b]]` (mint échoue) | `https://x.com/?q=[[…]]a$b` — **URL corrompue** |

## Problems identified

1. **Bug de content-integrity sur le chemin d'envoi primaire.** Un `$`-sequence tapé dans un lien
   (markdown ou `[[]]`/`<>`) est mutilé **avant persistance MongoDB et fan-out `message:new`**. Le texte
   reçu par les destinataires diffère de ce que l'expéditeur a écrit — et la fuite de la sentinelle
   `__PROTECTED_MD_n__` expose un détail d'implémentation interne dans le contenu utilisateur.
2. **Incohérence de comportement entre pipelines sœurs.** `MessagingService.processLinksInContent`
   (corrigé par `7b70bfa1`) et `TrackingLinkService.processExplicitLinksInContent` traitent tous deux
   les liens du même message ; seul le premier était protégé — divergence selon que le contenu passe
   par le tracking ou non.

## Root causes
- `String.prototype.replace(search, replacementString)` applique la substitution `$` à la chaîne de
  remplacement **indépendamment** du type de la recherche — piège JS classique. Le correctif `7b70bfa1`
  l'a neutralisé dans le pipeline messaging via des *function replacers* (`() => value`), mais le pattern
  n'avait pas été propagé au code adjacent de `TrackingLinkService`.
- Le remplacement token-basé (`m+<token>`, token `[a-zA-Z0-9_-]`) est `$`-free par construction, ce qui
  masquait le bug : seuls les remplacements par **données utilisateur** (`original`, `url` de repli) sont
  atteints.

## Business impact
- Corruption silencieuse de tout message/post/story/commentaire contenant un lien markdown avec un `$`
  (prix `$$`, code, template `$'`…) — surface d'envoi primaire. Fuite de sentinelle interne visible par
  les destinataires. Impact direct sur la fidélité du contenu, cœur d'un produit de messagerie.

## Technical impact
- Élimine la classe de bug `$`-substitution sur **100 %** des `.replace` dynamiques du service (6 sites),
  en parité stricte avec `processLinksInContent`. Zéro nouvelle dépendance, zéro changement de contrat,
  zéro changement de schéma.

## Risk assessment
**Très faible.**
- Les *function replacers* réinsèrent le texte **verbatim** avec des sémantiques de première-occurrence
  **identiques** à `replace(search, string)` — seul le comportement pour les entrées contenant `$`
  change (de corrompu à correct). Toutes les entrées sans `$` sont inchangées (non-régression prouvée).
- Aucun chemin de lecture, aucun format de token, aucune API modifiés. Le remplacement token-basé
  (déjà `$`-free) est converti par cohérence défensive, comportement identique.

## Proposed improvements
1. `processExplicitLinksInContent` : convertir les 5 `.replace` dynamiques (ÉTAPE 2/3 succès + repli,
   ÉTAPE 4 restauration) en *function replacers* `() => value`.
2. `processMessageLinks` : convertir la réécriture `.replace(url, replacement)` par cohérence défensive.

## Expected benefits
- Contenu fidèle bout en bout sur le chemin de tracking ; plus de fuite de sentinelle ; parité totale
  avec le pipeline messaging.

## Implementation complexity
Très faible : 6 `.replace` re-câblés (mêmes valeurs, replacer fonctionnel), +2 commentaires explicatifs,
+5 tests RED→GREEN (3 restauration markdown `$&`/`$$`/`` $` ``+`$'`, 1 non-régression lien plain,
1 repli d'erreur `[[…]]` avec `$`).

## Validation criteria
- RED prouvé (source revertée via `git stash`) : 4 tests échouent (fuite sentinelle, `$` avalé,
  texte mutilé, URL de repli corrompue) ; le lien plain reste vert.
- GREEN : 5/5 sur la nouvelle suite ; suites tracking (content-links, resolve, share, posts-content) +
  callers (MessageProcessor, links-messages) = 129 + 89 verts, aucune régression.

## Future Considerations
- **`EmailService`** : nombreux `.replace('{token}', value)` avec `value` potentiellement à `$` (noms
  d'utilisateur, dates) — mais template i18n contrôlé, faible risque ; audit léger candidat.
- **Balayage périodique** : ajouter une règle lint interdisant `String.prototype.replace(x, <var string>)`
  au profit d'un helper `replaceLiteral(haystack, needle, value)` centralisé (SSOT anti-`$`).
