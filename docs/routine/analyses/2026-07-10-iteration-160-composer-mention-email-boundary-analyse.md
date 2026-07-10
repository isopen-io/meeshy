# Iteration 160 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `7f61ca3` (dernier merge : PR #1783 — suppression du hook mort `useWebRTC`).
Branche `claude/brave-archimedes-1aeop1` déjà alignée sur `origin/main` (0/0). Ce cycle
prend **160**.

Priorité 1 (feature récemment développée) : le **composer de mentions web**. Cible reprise
du backlog explicite de l'iter 154 (« Suivis ») : la frontière gauche du `MENTION_REGEX`
composer, laissée en runner-up car la SSOT ne l'énumérait pas dans son docstring. Le
docstring de `mention-parser.ts` a depuis été étendu ; l'alignement est désormais net.

---

## Cible retenue : F160 — le `MENTION_REGEX` du composer omet la frontière gauche `NAME_BOUNDARY_LEFT` → l'autocomplete pop sur les adresses e-mail et la sélection réécrit l'e-mail

### Current state
`apps/web/hooks/composer/useMentions.ts:56`

```ts
const MENTION_REGEX = /@([\w-]{0,30})$/;
```

Cette regex détecte une mention en cours de frappe en s'ancrant sur la fin du texte avant le
curseur (`$`). Elle capture **tout** `@` suivi de `[\w-]{0,30}`, **sans regarder le
caractère précédent**. Or la SSOT `packages/shared/utils/mention-parser.ts` exporte
`NAME_BOUNDARY_LEFT` — un lookbehind négatif Unicode `(?<![\p{L}\p{N}_-])` — qui est le
contrat partagé par **TOUS** les chemins de mention (`parseMentions`, `hasMentions`, et les
helpers de `types/mention.ts`). Son rôle : un `@` précédé d'un caractère de nom appartient à
une **adresse e-mail** (`contact@ali`) et n'est **pas** une mention.

### Problems identified
- **L'autocomplete de mention s'ouvre à l'intérieur d'une adresse e-mail.** En tapant
  `contact@ali`, le pop d'autocomplete propose des participants pour le fragment `ali`.
- **La sélection réécrit l'e-mail.** `handleMentionSelect` calcule `beforeMention` à partir
  de `mentionCursorStartRef` (position du `@`), donc choisir un participant transforme
  `contact@ali` en `contact@alice ` — corruption silencieuse de l'adresse e-mail saisie par
  l'utilisateur.
- **Incohérence produit avec le reste du pipeline.** Le gateway (iter 153, `resolveMentionedUsers`)
  et le rendu web appliquent déjà `NAME_BOUNDARY_LEFT`. Le composer était le dernier chemin
  divergent : une mention « détectée » à la frappe dans un e-mail n'aurait de toute façon
  jamais été résolue côté serveur → friction visible sans effet fonctionnel.

### Root cause
Réimplémentation locale de la règle de détection de mention au lieu de réutiliser la SSOT.
Le charset (`[\w-]`) et la longueur max (`30`) étaient déjà alignés sur la SSOT
(`MENTION_HANDLE_CHARS`, `{1,30}`), mais la **frontière gauche** manquait — le seul écart
restant.

### Business impact
Le composer est le point d'entrée de tout message. Un utilisateur qui colle ou tape une
adresse e-mail (cas courant : partage de contact) voit un pop parasite et risque de corrompre
l'adresse d'un tap malencontreux. Dégrade la confiance dans un champ de saisie critique.

### Technical impact
1 ligne de production. Aucun état persisté, aucune migration, aucune donnée impactée. La
regex devient dérivée de la SSOT (import), supprimant tout drift futur.

### Risk assessment
Très faible.
- Le lookbehind zéro-largeur n'affecte pas `match[0].length` → `detection.start` (position du
  `@`) est inchangé, donc `handleMentionSelect` continue de fonctionner à l'identique pour les
  vraies mentions.
- Une mention en début de texte (`@john`) ou après une espace (`hello @john`) : le caractère
  précédent n'est pas un caractère de nom → le lookbehind réussit → comportement identique.
- Le flag `u` est requis par les classes Unicode `\p{...}` de `NAME_BOUNDARY_LEFT` ; `[\w-]`
  reste ASCII sous `u` (comportement identique à l'ancien).
- Compatibilité navigateur : le lookbehind négatif est déjà utilisé en production par le rendu
  de mentions web via la même SSOT (evergreen depuis ~2018).

### Proposed improvement
Dériver `MENTION_REGEX` de la SSOT au lieu de la réécrire :

```ts
import { NAME_BOUNDARY_LEFT, MENTION_HANDLE_CHARS } from '@meeshy/shared/utils/mention-parser';

const MENTION_REGEX = new RegExp(
  `${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{0,30})$`,
  'u'
);
```

`{0,30}` (et non `{1,30}` comme la SSOT) est conservé volontairement : le composer doit ouvrir
l'autocomplete dès la frappe d'un `@` seul (query vide).

### Expected benefits
- `contact@ali` n'ouvre plus l'autocomplete et la sélection ne peut plus réécrire un e-mail.
- Convergence complète du composer sur le contrat unique `NAME_BOUNDARY_LEFT` — zéro drift.
- Vraies mentions (début de texte, après espace/ponctuation, avec tiret `@marie-claire`)
  inchangées.

### Implementation complexity
Triviale (1 import + 1 regex dérivée).

### Validation criteria
- Test RED d'abord : `contact@ali` (curseur en fin) → `showMentionAutocomplete === false`.
  Échoue avant le fix (`true`), passe après. **Confirmé** : 2 tests RED sous l'ancienne regex.
- Non-régression : `@john` en début, `hello @john`, mention après espace, sélection préservant
  l'e-mail → verts. Suites `useMentions`, `mentions.service`, `mention-display` : 87/87 verts.
- `tsc` web : zéro nouvelle erreur sur `useMentions.ts` (import résolu).

### Tests — couverture ajoutée
`apps/web/__tests__/hooks/composer/useMentions.test.tsx` → nouveau bloc
`Email Left-Boundary (SSOT NAME_BOUNDARY_LEFT)` (5 tests) : e-mail avec query, e-mail sans
query, mention réelle après un e-mail, mention en début de texte, sélection préservant l'e-mail.

---

## Suivis (backlog, non traités ce cycle)
- **`PostService.recordView` clobber du `duration`** (`PostService.ts:1022-1028`) : `Math.max`
  vs. « keep latest » — choix produit à trancher.
- **Reaction self-echo compare Participant ID vs User ID** (`use-message-reactions.ts:363/389`) :
  confiance plus basse (auto-guérison via `refreshReactions()`).
