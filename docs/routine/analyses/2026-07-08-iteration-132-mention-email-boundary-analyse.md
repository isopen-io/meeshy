# Iteration 132 — Analyse (2026-07-08)

## Protocole (démarrage)
`main` @ `9f989a7` (dernier merge PR #1642, itération 131). Branche `claude/loving-fermat-zg89wb`
recréée depuis `origin/main`, working tree propre. Numérotation : docs `main` jusqu'à **131** → ce
cycle prend **132**.

PR ouvertes au démarrage (strictement évitées) : uniquement dependabot (#1549/#1542/#1539/#1536/#1532).
Aucune PR humaine ouverte.

## Cible : F95 — les helpers de mention `types/mention.ts` + `MentionService` violent la frontière gauche SSOT (fragment d'e-mail traité comme mention)

### Current state (drift latent vs SSOT)
La source de vérité `parseMentions()` / `hasMentions()` (`packages/shared/utils/mention-parser.ts`)
garde **délibérément** toute mention par une frontière gauche Unicode :

```ts
const NAME_CHAR = '[\\p{L}\\p{N}_-]';
const NAME_BOUNDARY_LEFT = `(?<!${NAME_CHAR})`;   // un `@` collé après un mot = e-mail, PAS une mention
```

Contrat explicitement testé (`mention-parser.test.ts:179-181`) :
`parseMentions('écris à contact@marie.com', [])` → `[]`, `hasMentions('… jean.dupont@example.org …')`
→ `false`.

Mais **cinq** regex sœurs, réparties sur trois fichiers, reconstruisaient `@([\w-]+)` **sans** cette
frontière (et sans le flag `u`) :

| Fichier | Fonction | Regex (avant) |
|---|---|---|
| `packages/shared/types/mention.ts:227` | `extractMentions` | `@([\w-]{1,30})` `g` |
| `packages/shared/types/mention.ts:281` | `mentionsToLinks` | `@([\w-]+)` `g` |
| `packages/shared/types/mention.ts:370` | `MENTION_CONSTANTS.MENTION_REGEX` | `@([\w-]+)` `g` |
| `services/gateway/src/services/MentionService.ts:39` | `extractMentions` | `@([\w-]+)` `g` |
| `apps/web/utils/mention-display.ts:6` | `resolveDisplayContent` | `@([\w-]{1,30})` `g` |

### Problems identified
1. **[USER-FACING] `mentionsToLinks` transforme le domaine d'un e-mail en lien profil cliquable.**
   Rendu live dans chaque bulle de message web (`apps/web/hooks/use-message-display.ts:51`) :
   ```
   mentionsToLinks('mail bob@alice.com', '/u/{username}', ['alice'])
     avant : 'mail bob[@alice](/u/alice).com'   ← le domaine devient /u/alice cliquable (faux)
     après : 'mail bob@alice.com'               ← inchangé
   ```
2. **[FAUSSE NOTIFICATION] `MentionService.extractMentions` extrait le fragment après `@`.**
   Chemin de production réel — `MessagingService.ts:437`, `MessageProcessor.ts:1155`,
   `messages-advanced.ts:280`, `posts/core.ts`, `posts/comments.ts`. `john@example.com` extrayait
   `example` ; si `example` est un username valide d'un participant → **notification de mention
   fantôme** que `parseMentions` (chemin `extractMentionsWithParticipants`) ne résout jamais.
   Un test **entérinait le bug** (`MentionService.test.ts:281` : `expect(mentions).toContain('example')`,
   commentaire à l'appui « the regex captures after @, so it gets 'example' »).
3. **[RENDU WEB] `resolveDisplayContent` réécrit le `@` interne d'un e-mail en display name.**
   `mail bob@alice.com` (avec `alice` = utilisateur mentionné « Alice Cooper ») devenait
   `mail bob@Alice Cooper.com` — corruption du texte rendu. (Util public exporté, sans appelant
   courant, mais désormais gardé par test.)
4. **[SSOT] Cinq gardes divergents pour une frontière unique.** Aucune source partagée pour « où
   commence une mention ».

### Root cause
Historiquement, `parseMentions`/`hasMentions` ont été durcis avec `NAME_BOUNDARY_LEFT` (Unicode-aware,
anti-e-mail) mais la constante restait **privée** au module `mention-parser`. Les helpers publics de
`types/mention.ts` et le `MENTION_REGEX` du gateway ont continué à recompiler leur propre regex sans la
frontière — drift classique par absence d'export SSOT.

### Business / Technical impact
- Web : lien profil trompeur dans toute bulle contenant `mot@nom.tld` — bruit UX + risque de mauvaise
  navigation.
- Gateway : notifications de mention fausses/parasites sur messages, posts et commentaires contenant une
  adresse e-mail — incohérence directe avec la résolution `parseMentions`.
- Maintenabilité : quatre copies d'une même règle de frontière = piège de régression permanent.

## Écartés cette session (revue, non retenus)
- **`apps/web/hooks/composer/useMentions.ts:56`** `/@([\w-]{0,30})$/` (détection de mention **au
  curseur** pour l'autocomplétion) : ancrée `$` sur `textBeforeCursor`, sémantique distincte
  (token en cours de frappe). Ajouter la frontière modifierait le comportement d'autocomplétion mid-mot —
  hors périmètre d'un fix sûr/testable ce cycle. Laissé au backlog (F96).
- **`reaction.ts` `isValidEmoji`** (rejette les emoji multi-codepoint) : entériné comme intentionnel par
  `reaction.test.ts:90` → décision produit, pas un bug.

## Solution retenue
Exporter la frontière SSOT unique (`NAME_BOUNDARY_LEFT`) depuis `mention-parser.ts` et la réutiliser
dans les cinq regex (avec flag `u`). Zéro nouvelle règle, zéro duplication : une seule frontière,
importée partout.

## Validation
- RED prouvé (vitest + jest) : `mentionsToLinks('mail bob@alice.com', …, ['alice'])` produisait
  `'mail bob[@alice](/u/alice).com'` ; `extractMentions('write to bob@alice.com')` → `['alice']` ;
  `resolveDisplayContent('mail bob@alice.com', {alice→'Alice Cooper'})` → `'mail bob@Alice Cooper.com'`.
- GREEN : shared 1294/1294 · gateway MentionService 105/105 · suites mentions gateway
  (MessagingService, MessageProcessor, posts core/comments, messages-advanced) 378/378 · web
  mentions.service 31/31 · web mention-display 8/8.
- Comportement des vraies mentions inchangé (charset `\w-`, casse, tiret, dédup, DisplayName tous verts).
