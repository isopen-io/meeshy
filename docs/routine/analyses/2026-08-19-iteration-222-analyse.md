# Iteration 222 — Intégrité du contenu : séquences `$` dans l'interpolation des noms d'affichage (EmailService)

## Protocole (démarrage)
`main` @ `a53205df` (dernier commit : `test(web): repostOf.mentions n'est plus structurellement vide`).
Branche `claude/brave-archimedes-3c43jt` alignée sur `origin/main` (0 commit d'écart).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts` puis
`npx prisma generate --generator client` (sans le client généré, ~17 suites gateway échouent
en compile TS).

PRs ouvertes au démarrage : aucune ne touche `services/gateway/src/services/EmailService.ts` —
zéro chevauchement de fichier.

## Sélection : **Priorité 1 — clôture directe du suivi laissé par l'itération 221**

L'itération 221 (`docs/routine/analyses/2026-07-27-iteration-221-analyse.md`) a éliminé la classe de
bug `$`-substitution dans `TrackingLinkService`, en parité avec `7b70bfa1`
(`MessagingService.processLinksInContent`). Elle a explicitement listé en *Future Considerations* :

> **`EmailService`** : nombreux `.replace('{token}', value)` avec `value` potentiellement à `$`
> (noms d'utilisateur, dates) — audit léger candidat.

Cet audit est réalisé ici. Un balayage `grep` de tous les `.replace(literal, value)` du gateway hors
tests révèle que la **seule** surface encore vivante avec une valeur **contrôlée par l'utilisateur** est
`EmailService` — sur deux sites précis.

## Current state (avant correctif)

`EmailService` interpole le nom d'affichage de l'expéditeur/accepteur dans la ligne d'intro localisée
via `String.prototype.replace(placeholderString, userName)` :

| Site | Ligne | Valeur |
|---|---|---|
| `sendFriendRequestEmail` | `t.friendRequest.intro.replace('{sender}', data.senderName)` | nom d'affichage utilisateur |
| `sendFriendAcceptedEmail` | `t.friendAccepted.intro.replace('{accepter}', data.accepterName)` | nom d'affichage utilisateur |

Les gabarits placent le placeholder **en tête** de phrase, ex. `'{sender} wants to connect with you on
Meeshy.'`. `String.prototype.replace` interprète les séquences `$` de la **chaîne de remplacement**,
que la recherche soit une chaîne ou une regex :

| Nom saisi (`senderName`) | Sortie buggée |
|---|---|
| `Alice $& Bob` | `Alice {sender} Bob wants to connect…` — **fuite du placeholder interne `{sender}`** |
| `$'` | ` wants to connect…  wants to connect…` — **queue de phrase dupliquée** (`$'` = texte après le match) |
| `Deal $$ Co` | `Deal $ Co wants to connect…` — **`$` avalé** |

Le contenu est ensuite persisté/envoyé aux fournisseurs (Brevo/SendGrid/Mailgun) via `htmlContent` et
`textContent`. `escapeHtml` (appliqué au HTML) n'échappe ni `$` ni `{`/`}` — il ne masque donc pas la
corruption ; la version `text` n'a aucun échappement.

## Problems identified

1. **Bug de content-integrity sur le chemin e-mail transactionnel.** Un nom d'affichage contenant une
   séquence `$` corrompt l'e-mail de demande d'ami / d'acceptation avant envoi. Le placeholder interne
   `{sender}` / `{accepter}` peut fuiter dans le corps du message reçu par le destinataire.
2. **Incohérence avec les pipelines sœurs déjà corrigés.** `MessagingService` (`7b70bfa1`) et
   `TrackingLinkService` (itération 221) neutralisent déjà cette classe via *function replacers* ; le
   chemin e-mail était le dernier site vivant à valeur utilisateur.

## Root causes
- `String.prototype.replace(search, replacementString)` applique la substitution `$` à la chaîne de
  remplacement **indépendamment** du type de la recherche — piège JS classique. Le pattern correctif
  (`() => value`) n'avait pas encore été propagé à `EmailService`.
- Les autres `.replace('{token}', value)` du service portent des valeurs `$`-free par construction
  (nombres : `expiryHours`, `expiryMinutes`, `unreadCount`, `year` ; date serveur formatée :
  `gracePeriodEndDate`), ce qui restreint la surface aux deux seuls sites à nom utilisateur.

## Business impact
- Corruption silencieuse d'un e-mail transactionnel (premier contact social : demande d'ami) dès qu'un
  utilisateur choisit un nom d'affichage contenant `$`. Fuite d'un détail d'implémentation (`{sender}`)
  visible par le destinataire. Impact direct sur la fidélité du contenu et l'image produit.

## Technical impact
- Élimine la classe de bug `$`-substitution sur **100 %** des `.replace` à valeur utilisateur du service
  (2 sites), en parité stricte avec `processLinksInContent` et `TrackingLinkService`. Zéro nouvelle
  dépendance, zéro changement de contrat, zéro changement de schéma.

## Risk assessment
**Très faible.**
- Le *function replacer* `() => value` réinsère le texte **verbatim** avec des sémantiques de
  première-occurrence **identiques** à `replace(search, string)` — seul le comportement pour les entrées
  contenant `$` change (de corrompu à correct). Les noms sans `$` sont inchangés (non-régression prouvée).
- Aucun chemin de lecture, aucun gabarit i18n, aucune API modifiés.

## Proposed improvements
1. `sendFriendRequestEmail` : `.replace('{sender}', () => data.senderName)`.
2. `sendFriendAcceptedEmail` : `.replace('{accepter}', () => data.accepterName)`.

## Expected benefits
- Nom d'affichage fidèle bout en bout dans les e-mails d'ami ; plus de fuite de placeholder ; parité
  totale avec les pipelines messaging et tracking.

## Implementation complexity
Très faible : 2 `.replace` re-câblés (même valeur, replacer fonctionnel), +2 commentaires explicatifs
alignés sur `TrackingLinkService`, +5 tests RED→GREEN (`$&` fuite placeholder, `$'` duplication de queue,
`$$` avalement — pour `sender` et `accepter` —, +1 non-régression nom ordinaire).

## Validation criteria
- RED prouvé (source non patchée) : 4 tests échouent (`$&`×2 fuite placeholder, `$'` duplication, `$$`
  avalé) ; le nom ordinaire reste vert.
- GREEN : 86/86 sur la suite `EmailService.test.ts` (81 existants + 5 nouveaux), aucune régression.

## Future Considerations
- **Balayage clos.** Après cette passe, tous les `.replace(x, <var string>)` du gateway à valeur
  contrôlée par l'utilisateur sont neutralisés (messaging, tracking, email). Les résidus portent des
  valeurs `$`-free (nombres, dates serveur, `frontendUrl` de config) — pas de correctif requis.
- **Règle lint / helper centralisé (rappel de l'itération 221)** : une règle interdisant
  `String.prototype.replace(x, <var string>)` au profit d'un helper `replaceLiteral(haystack, needle,
  value)` reste candidate pour transformer cette classe de bug récurrente en garde structurelle (SSOT
  anti-`$`), plutôt que de la chasser site par site.
