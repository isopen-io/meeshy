# Iteration 215 — L'en-tête de conversation directe converge sur le SSOT `getUserDisplayName` (nom résolu, plus le handle `username`)

## Protocole (démarrage)
`main` @ `a32b9295` (dernier commit : fix ios/story dégradé séparateur). Branche
`claude/brave-archimedes-1malmo` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` (3789 paquets ; le postinstall
`turbo run generate` — prisma — est bloqué par le proxy, sans impact : correctif
**web-only**, aucun type Prisma). `packages/shared/dist` construit via
`bun run build` (tsc) — requis car le jest web mappe `@meeshy/shared/(.*)` →
`packages/shared/dist/$1`.

PRs ouvertes au démarrage — **audit anti-doublon** (9 PRs, série routine 206–214) :
- **#2305** (206) : `utils/auth.ts`, `ConversationView.tsx`.
- **#2307** (207) : gateway `MessageReadStatusService.ts`.
- **#2309** (208) : `AudioFilePreview.tsx`, `AudioRecorderCard.tsx`, `admin/messages/page.tsx`.
- **#2311** (209) : `messages.service.ts`, `use-contacts-actions.ts`, `invite-user-modal.tsx`, `link-details-modal.tsx`, `conversation-participants.tsx`.
- **#2313** (210) : `details-sidebar/ActiveUsersSection.tsx`.
- **#2315** (211) : `utils/language-utils.ts`.
- **#2317** (212) : `conversation-item/conversation-utils.tsx`, `conversation-item/ConversationItem.tsx`.
- **#2319** (214i) / **#2275** (213i) : iOS (hors surface TypeScript).

Aucune PR ouverte ne touche `components/conversations/header/` → zéro risque de
conflit. Cette itération **prolonge la vague de convergence display-name**
(#2311/#2313/#2317) sur un **site distinct non couvert** : l'en-tête de la
conversation directe.

## Sélection : **Priorité — correctness + Single Source of Truth (couche web, en-tête de conversation)**

`apps/web/components/conversations/header/use-participant-info.ts` réimplémentait
**trois fois** (chaînes strictement identiques, lignes 27-28, 37-38, 48-49) la
résolution du nom d'affichage du participant, avec l'ordre de priorité **cassé** —
exactement la classe de bug déjà corrigée par #2311/#2313/#2317 ailleurs dans
l'app.

## Current state (avant correctif)

```ts
const name = user.displayName || user.username ||
       (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
if (name) return name;
```

Trois copies (`getConversationName` a trois branches de repli : participants
passés en prop, `conversation.participants`, `members`).

## Problems identified

1. **Ordre de priorité inversé — `username` avant le vrai nom.** Le SSOT
   `getUserDisplayName` (`apps/web/utils/user-display-name.ts`) impose
   **`displayName > firstName+lastName > username`**. Ici `username` est testé
   **avant** `firstName+lastName` : un compte direct avec un vrai nom
   (`Alice Wang`) mais sans `displayName` personnalisé affiche le **handle
   cryptique** (`aw_1234`) dans l'**en-tête de la conversation** — l'élément le
   plus visible de l'écran de chat, et **incohérent** avec la liste de
   conversations (#2317), la sidebar « utilisateurs actifs » (#2313) et
   `transform-conversation.ts`, tous déjà convergés sur le SSOT.
2. **`displayName` non trimmé.** `user.displayName || …` accepte un `displayName`
   composé **uniquement d'espaces** (`'   '`) comme valeur truthy et l'affiche tel
   quel. Le SSOT applique `.trim()` et retombe sur le nom réel.
3. **Duplication triple.** La même chaîne est copiée-collée trois fois dans une
   seule fonction : un correctif sur une branche ne se propage pas aux deux
   autres.

## Root causes

Helper d'en-tête écrit localement avant/à côté du SSOT `getUserDisplayName`, en
figeant l'ancien ordre `username`-first — un défaut masqué tant que les comptes
de test portent un `displayName` explicite, révélé sur les comptes réels
`firstName`/`lastName` sans displayName.

## Business impact

- **En-tête de conversation directe** : le nom du correspondant en haut de
  l'écran de chat. Afficher `aw_1234` au lieu de `Alice Wang` dégrade la lisibilité
  et rompt la cohérence avec le reste de l'app (liste, sidebar, transforms).
- `getConversationAvatar` dérive les **initiales** de ce nom (`name.slice(0,2)`) :
  le bug propageait `AW` (handle) au lieu des initiales du vrai nom.

## Technical impact

- Import du SSOT `getUserDisplayNameOrNull` ; les trois chaînes inline
  remplacées par `const name = getUserDisplayNameOrNull(user)`. −9 lignes de
  logique dupliquée.
- Les repli participant-level (`otherMember?.displayName`, titre de conversation,
  extraction `Conversation avec …`, `'Utilisateur'`) restent **inchangés** — seul
  le premier maillon (résolution du user) délègue au SSOT.
- Comportement modifié **uniquement** sur les chemins buggés : `firstName`/`lastName`
  présents sans `displayName` (→ vrai nom au lieu du handle) et `displayName`
  espaces-seul (→ nom réel). Les comptes `displayName`-défini et `username`-seul
  rendent un nom identique.

## Risk assessment

**Faible.** Web-only ; aucun schéma/API/migration/clé i18n. La version conservée
est le SSOT production déjà consommé par ≥ 6 sites. `getUserDisplayNameOrNull`
retourne `null` quand aucune info n'est disponible — sémantique identique au `null`
final de l'ancienne chaîne, donc les repli en aval (`if (name) return name`) sont
préservés à l'octet près.

## Proposed improvements (implémenté)

1. `use-participant-info.ts` : import `getUserDisplayNameOrNull` ; 3 chaînes
   inline → 3 délégations SSOT.

## Expected benefits

- L'en-tête de conversation directe affiche enfin le **vrai nom** (parité avec
  liste/sidebar/transforms) ; initiales d'avatar cohérentes.
- Fin d'un `displayName` espaces-seul affiché tel quel.
- −1 classe de duplication (triple) ; une source unique pour la résolution de nom
  côté en-tête.

## Implementation complexity

**Triviale** — 1 import + 3 substitutions dans un seul fichier ; 6 tests neufs.

## Validation criteria

- Nouvelle suite `use-participant-info.test.ts` : 6/6 verts, dont **3 régressions
  RED prouvées** (nom réel > handle sur `firstName+lastName` et `firstName`-seul ;
  `displayName` espaces-seul retombe sur le nom réel).
- Non-régression : `header/` 27/27 ; `components/conversations/` 30 suites /
  586 tests, 0 échec.
- `tsc --noEmit` : 0 **nouvelle** erreur (les erreurs `unknown`-access du fichier
  production préexistent à l'identique sur `main` ; le fichier de test est propre).

## Future improvements (backlog restant)

- **`apps/web/utils/user-display-name.ts`** : `getUserDisplayName(user, fallback)`
  peut déléguer `getUserDisplayNameOrNull(user) ?? fallback` (corps copiés-collés,
  seule la queue diffère). Micro-dedup interne du SSOT, équivalence prouvée par la
  suite existante. **Candidat prioritaire** — aucune PR ouverte ne touche ce
  fichier.
- **`apps/web/hooks/v2/use-contacts-v2.ts:53`** et
  **`apps/web/utils/v2/transform-conversation.ts:120`** :
  `languageCode = user.systemLanguage || user.regionalLanguage || 'fr'` — omettent
  `customDestinationLanguage` + `deviceLocale` et la normalisation. **Attention :
  sémantique à confirmer** (langue du *participant* affiché vs langue *consommée*
  par le lecteur) — #2317 a explicitement laissé ce lead « intention à confirmer ».
  Ne pas converger sans clarifier l'intention produit.
- **`apps/web/services/conversations/transformers.service.ts:181-197`** :
  `regionalLanguage || 'fr'` fabrique une préférence absente et
  `customDestinationLanguage: undefined` codé en dur droppe la vraie langue custom
  du sender reconstruit → corrompt l'entrée du SSOT `resolveUserPreferredLanguage`
  en aval. Candidat correctness (préserver les champs bruts).
