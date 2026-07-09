# Iteration 157 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `75a5198` (dernier merge : PR #1765 iter 156 — fan des receipts de messages
drainés vers les rooms user). Branche `claude/brave-archimedes-n6t2ig` recréée sur
`origin/main` (0/0). Ce cycle prend **157**.

Priorité 1 = features récemment développées. La cible retenue est le **runner-up explicite
de l'itération 154** (voir « Suivis » de `2026-07-09-iteration-154-analyse.md`), non encore
traité, toujours en production.

## Cible retenue : F121 — le composer d'autocomplete de mention (`useMentions`) déclenche le pop sur le `@` interne d'une adresse e-mail, et sa sélection réécrit l'e-mail

### Current state
`apps/web/hooks/composer/useMentions.ts:56`

```ts
const MENTION_REGEX = /@([\w-]{0,30})$/;
```

`detectMentionAtCursor` (ligne 64) applique cette regex au **texte avant le curseur**. La
regex n'exige **aucune frontière gauche** : n'importe quel `@` suivi de `[\w-]` en fin de
chaîne ouvre l'autocomplete, y compris le `@` interne d'une adresse e-mail.

Exemple : l'utilisateur tape `contact@ali` (adresse e-mail en cours de frappe). `textBefore
Cursor = "contact@ali"`, `MENTION_REGEX` matche `@ali`, l'autocomplete des participants
s'ouvre. En sélectionnant un participant, `handleMentionSelect` (ligne 234) réécrit à partir
de `mentionCursorStartRef` (position du `@`) → l'adresse `contact@ali…` devient
`contact@<username> ` — **l'e-mail de l'utilisateur est corrompu**.

### Problems identified
- **Autocomplete parasite** sur toute saisie d'adresse e-mail (`user@domain`), d'identifiant
  réseau (`git@github`), ou de tout `mot@suite`.
- **Corruption de la saisie** si l'utilisateur sélectionne un participant : la partie
  `@locale` de l'e-mail est remplacée par `@username`.

### Root cause
Drift avec la source de vérité des mentions. `packages/shared/utils/mention-parser.ts`
définit `NAME_BOUNDARY_LEFT = (?<![\p{L}\p{N}_-])` et l'impose à **tous** les chemins de
mention (`parseMentions` @DisplayName + @username, `hasMentions`) : un `@` précédé d'un
caractère de nom appartient à une adresse e-mail et **n'est pas une mention**. L'itération 153
a propagé cette frontière au gateway (`resolveMentionedUsers`), et `apps/web/utils/mention-
display.ts` la réutilise déjà (`import { NAME_BOUNDARY_LEFT } from '@meeshy/shared/utils/
mention-parser'`). Le hook composer est le **dernier chemin de mention côté web à ne pas
respecter la frontière** — il a été écrit avec une regex ASCII locale (`\w`) sans lookbehind.

### Business impact
La saisie d'e-mail est un cas courant en chat (partage de contact, support). Un pop
d'autocomplete non sollicité au milieu de la frappe est une friction visible, et le risque de
réécriture silencieuse de l'e-mail (perte de données de saisie) érode la confiance dans le
composer — surface produit à fort trafic (chaque message tapé passe par `handleTextChange`).

### Technical impact
Une constante regex. Aucune donnée persistée. Le correctif **réutilise** la SSOT partagée
(zéro nouvelle règle, zéro nouveau charset) → convergence, pas d'ajout de surface.

### Risk assessment
Très faible. Le lookbehind `(?<![\p{L}\p{N}_-])` ne restreint que les `@` collés après un
caractère de nom — exactement le contrat déjà appliqué par les autres chemins. Les mentions
légitimes (début de ligne, après espace/ponctuation) restent détectées. Le flag `u` est
requis par les classes `\p{...}` et est compatible avec `\w`/`-`/`$`.

### Proposed improvement
Construire `MENTION_REGEX` à partir des constantes SSOT partagées, à l'identique de
`mention-display.ts` :

```ts
import { MENTION_HANDLE_CHARS, NAME_BOUNDARY_LEFT } from '@meeshy/shared/utils/mention-parser';

const MENTION_REGEX = new RegExp(
  `${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{0,30})$`,
  'u'
);
```

`MENTION_HANDLE_CHARS = '\\w-'` → capture identique (`[\w-]{0,30}`, tiret inclus pour
`@marie-cl…`, `{0,30}` pour ouvrir dès le `@` seul). Seul le lookbehind est ajouté.

### Expected benefits
- `contact@ali` n'ouvre plus l'autocomplete → plus de corruption d'e-mail.
- Convergence : les **quatre** chemins de mention (gateway `resolveMentionedUsers`, shared
  `parseMentions`/`hasMentions`, web `mention-display`, web `useMentions`) partagent une
  frontière gauche unique. Zéro drift résiduel côté mention.

### Implementation complexity
Triviale (1 import + 1 constante regex de prod).

### Validation criteria
- Tests RED d'abord (`__tests__/hooks/composer/useMentions.test.tsx`) :
  - `contact@ali` (curseur en fin) → `showMentionAutocomplete === false`.
  - `café@bob` (frontière non-latine) → `false`.
  - `mail contact@x.com @ali` (mention après espace, après un e-mail) → `true`, query `ali`.
  Échouent avant le fix (le pop s'ouvre), passent après.
- Non-régression : les tests existants restent verts, notamment
  - « should handle multiple @ symbols in text » (`email@test.com @john`, `@john` après
    espace → toujours détecté),
  - « @ at beginning of text », « hyphenated usernames », « underscore in usernames »,
    « numeric usernames », « queries up to 30 characters ».

### Tests — absence de couverture confirmée
Aucun test existant n'exerce un `@` collé après un caractère de nom en fin de curseur. Le
seul test proche (« multiple @ symbols ») place le curseur **après** un `@john` précédé d'un
espace — la branche buggée (email `@` en fin de curseur) n'est jamais couverte.

## Suivis (backlog, non traités ce cycle)
- **`PostService.recordView` clobber du `duration`** (`PostService.ts:1022-1028`) — reporté
  d'iter 154, choix produit à trancher.
- **Reaction self-echo compare Participant ID vs User ID** (`use-message-reactions.ts`) —
  confiance plus basse (auto-guérison via `refreshReactions()`).
