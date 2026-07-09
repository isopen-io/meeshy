# Iteration 156 — Analyse d'optimisation (2026-07-09)

## Protocole (démarrage)
`main` @ `4c7f071` (dernier merge : PR #1766 — call duration `answeredAt` anchoring ;
dernier cycle numéroté = **155**, PR #1763 `mention:created` emit). Branche
`claude/brave-archimedes-upyukl` synchronisée sur `origin/main` (0/0). Ce cycle prend **156**.

PRs ouvertes au démarrage (autres sessions, hors périmètre) : aucune touchant
`apps/web`/`packages/shared` mentions → pas de conflit.

Fan-out : review ciblée de la surface **mentions** (Priorité 1 — massivement retravaillée :
charset tiret iter 145/151, frontière e-mail iter 132/153, `mention:created` iter 155, SSOT
`mention-parser.ts`) + un agent Explore parallèle sur `services/gateway/src`. Consigne : **un**
défaut de logique quasi-pure, haute confiance, **actuellement en production**, non couvert par
les tests.

---

## Cible retenue : F123 — `EditMessageView` valide la query de mention avec `/^\w{0,30}$/` (sans tiret) → les usernames à tiret ne sont plus autocomplétés en **édition** de message

### Current state
Trois sites du frontend valident une **query de mention en cours de frappe** (le texte tapé
après `@`, sous le curseur) pour décider d'ouvrir/fermer l'autocomplete. Ils **divergent** :

- **Composer** `apps/web/hooks/composer/useMentions.ts:205` : `/^[\w-]{0,30}$/` — **inclut** le
  tiret (corrigé iter 151, PR de parité charset username `/^[a-zA-Z0-9_-]+$/`).
- **Édition** `apps/web/components/common/bubble-message/EditMessageView.tsx:128` :
  `/^\w{0,30}$/` — **omet** le tiret. Sibling jamais migré lors de l'iter 151.

`\w` (`[A-Za-z0-9_]`) n'inclut pas `-`. Donc dès que l'utilisateur tape un tiret dans une
query de mention **en éditant un message existant**, la garde échoue :
`detectMentionAtCursor('...@marie-cl', pos)` renvoie `query = 'marie-cl'`, puis
`/^\w{0,30}$/.test('marie-cl')` → **false** → l'autocomplete se **ferme** (branche `else`,
ligne 150-155). L'utilisateur ne peut jamais sélectionner `@marie-claire` en édition.

### Problems identified
- Un username à tiret (`@marie-claire`, `@jean-luc`, `@ann-marie`) **ne peut pas être
  autocomplété ni inséré** lors de l'édition d'un message. L'autocomplete disparaît au premier
  tiret. C'est exactement le bug que l'iter 151 a corrigé dans le composer — toujours vivant
  dans le sibling *édition*.

### Root cause
Duplication de la regex de validation de query, inlinée dans **deux** hooks/composants qui ont
dérivé (`\w` vs `[\w-]`). Aucune source de vérité pour « cette query partielle peut-elle
alimenter l'autocomplete ? ». La classe de caractères d'un handle est pourtant déjà centralisée
(`MENTION_HANDLE_CHARS` dans `mention-parser.ts`) — mais aucun helper ne l'exposait pour la
validation d'une query *en cours de frappe* (longueur min 0, contrairement à
`isValidMentionUsername` qui exige min 1 pour un handle complet).

### Business impact
Friction directe sur une feature sociale centrale. Un utilisateur qui **corrige** un message
pour y ajouter/modifier une mention vers un contact au nom composé (très courant : prénoms
composés, handles pro `first-last`) ne reçoit aucune suggestion et croit le contact
introuvable. Incohérence perçue : la mention marche à la frappe initiale (composer) mais pas
en édition.

### Technical impact
Feature partiellement morte en édition. Drift de regex non testé entre deux siblings — classe
de bug déjà apparue et corrigée une fois (composer iter 151), re-apparue ici.

### Risk assessment
Très faible. Le charset ajouté (`-`) est **déjà** le charset autorisé côté serveur
(`resolveMentionedUsers`, `parseMentions`) et côté composer. Aucune query auparavant acceptée
ne devient rejetée (sur-ensemble strict : `\w` ⊂ `[\w-]`). Aucune API modifiée.

### Proposed improvement
Introduire un helper SSOT pur `isValidMentionQuery(query)` dans `packages/shared/types/mention.ts`
(charset `MENTION_HANDLE_CHARS`, longueur `{0,30}` — 0 pour autoriser l'autocomplete dès `@`),
puis :
- **Fix** : `EditMessageView.tsx:128` utilise `isValidMentionQuery` au lieu de `/^\w{0,30}$/`.
- **Convergence** (behavior-preserving) : `useMentions.ts:205` utilise le même helper au lieu
  de son inline `/^[\w-]{0,30}$/` — élimine définitivement la classe de drift.

### Expected benefits
- Usernames à tiret autocomplétables **partout** (composer ET édition).
- Une seule source de vérité pour la validation de query de mention → zéro drift futur.
- Parité complète composer/édition/serveur sur le charset de handle.

### Implementation complexity
Triviale : 1 helper pur (+ JSDoc), 2 sites d'appel migrés, 6 tests purs de comportement.

### Validation criteria
- RED : `isValidMentionQuery('marie-cl')` doit être `true` (échoue avant : le symbole n'existe
  pas → import cassé).
- GREEN : query vide `true` (autocomplete dès `@`), tiret `true`, espace/point `false`, `>30`
  `false`.
- Suite `mention-extract.test.ts` verte (+6). Aucune régression composer (`useMentions.test.tsx`).

### Tests — absence de couverture confirmée
- `EditMessageView` n'a **aucun** test dédié (`grep` : 0 fichier). Le chemin de validation de
  query en édition n'est exercé nulle part.
- `detectMentionAtCursor` (shared) n'a **aucun** test.
- La garde inline `/^\w{0,30}$/` n'était référencée par aucune assertion.

---

## Candidats non retenus (backlog priorisé)

- **F124** — Réaction self-echo (`apps/web/hooks/use-message-reactions.ts:363,389`) :
  `event.participantId === currentUserId` compare un **`Participant.id`** (émis par le serveur,
  `ReactionHandler._resolveParticipantId` → `prisma.participant.findFirst(...).id`) à un
  **`User.id`** (`currentUserId`). Espaces d'ID distincts pour un utilisateur enregistré → la
  branche « c'est nous » ne s'exécute **jamais** ; `userReactions` (surbrillance de MA réaction)
  ne se met à jour que via `refreshReactions()` (auto-guérison → confiance moyenne, impact
  atténué). **Fix non trivial** : requiert le `participantId` courant côté client OU d'émettre
  aussi le `userId` dans l'événement (changement de contrat) — à trancher.
- **F122** — `detectMentionAtCursor` (`packages/shared/types/mention.ts:306`) n'applique pas
  `NAME_BOUNDARY_LEFT` : l'autocomplete s'ouvre sur le `@` interne d'une adresse e-mail
  (`bob@alice`) même si le serveur ne résoudra jamais ce `@`. UX-only, confiance moyenne
  (produit défendable : détection permissive à la frappe, filtrage à l'envoi).
- **Composer `MENTION_REGEX`** (`useMentions.ts:57`) : détection locale sans frontière gauche —
  même remarque UX-only que F122.
