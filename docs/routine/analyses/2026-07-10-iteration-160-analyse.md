# Iteration 160 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `b66b33c` (dernier merge : PR #1789 — Android LanguageData catalog parity).
Branche de travail recréée sur `origin/main` (0/0). Ce cycle prend **160**.

Cible retenue depuis le **backlog documenté** de l'iteration 154 (« Suivis », runner-up de
ce cycle) : **Composer mention left-boundary**. Priorité 1 (feature récemment développée :
la pile mentions a été refactorée sur `MENTION_HANDLE_CHARS`/`NAME_BOUNDARY_LEFT` aux
iterations F60/153).

---

## Cible retenue : F154-suivi — le hook composer `useMentions` détecte une mention sur le `@` interne d'une adresse e-mail, ouvre l'autocomplete et réécrit l'e-mail à la sélection

### Current state
`apps/web/hooks/composer/useMentions.ts:56`. La détection de mention en cours de frappe
utilise une regex **locale** qui n'applique **pas** la frontière gauche que la SSOT impose :

```ts
const MENTION_REGEX = /@([\w-]{0,30})$/;
```

La source de vérité `packages/shared/utils/mention-parser.ts` définit
`NAME_BOUNDARY_LEFT = (?<![\p{L}\p{N}_-])` et l'applique sur **tous** les chemins de mention
(`parseMentions` @DisplayName + @username, `hasMentions`, et les helpers de
`types/mention.ts` : `extractMentions`, `mentionsToLinks`, `MENTION_REGEX`). Un `@` collé
après un caractère de nom appartient à une adresse e-mail (`contact@ali`) et n'est **pas**
une mention. Le hook composer était le seul chemin resté hors de cette SSOT (son docstring ne
l'énumérait pas).

### Problems identified
- **Faux positif d'autocomplete** : taper `contact@ali` (ou `café@ali` — frontière Unicode)
  ouvre le pop d'autocomplete des participants alors qu'aucune mention n'est en cours.
- **Corruption de l'e-mail** : sélectionner un participant dans ce pop réécrit le segment
  `@ali` en `@username `, détruisant l'adresse e-mail que l'utilisateur était en train de
  saisir dans le composer.

### Root cause
Duplication locale de la logique de détection de mention, divergente de la SSOT. Le hook
codait sa propre regex avec le bon charset (tiret inclus, F60) mais sans la frontière gauche
Unicode ajoutée/consolidée à l'iteration 153 côté gateway.

### Business impact
Partager une adresse e-mail dans un message est un usage courant. Un composer qui pop un menu
parasite puis corrompt l'adresse à la sélection dégrade la confiance dans la saisie et peut
envoyer un message erroné.

### Technical impact
Drift SSOT : quatre implémentations de la frontière de mention devaient rester alignées ; le
hook composer était le maillon manquant. Le corriger **en réutilisant les constantes
partagées** (`MENTION_HANDLE_CHARS`, `NAME_BOUNDARY_LEFT`) supprime le drift structurel, pas
seulement le symptôme.

### Risk assessment
Très faible. Changement d'une seule constante regex (charset et longueur `{0,30}` inchangés,
seule la frontière gauche s'ajoute). Aucun impact sur les mentions légitimes : `@` en début
de texte, après espace ou après ponctuation continue de matcher.

### Proposed improvements
1. Importer `MENTION_HANDLE_CHARS` et `NAME_BOUNDARY_LEFT` de `@meeshy/shared/utils/mention-parser`.
2. Construire `MENTION_REGEX` à partir de ces constantes + flag `u` (requis par `\p{...}`),
   en conservant la sémantique composer `{0,30}` (autorise le `@` seul en cours de frappe).

### Expected benefits
- Fin du faux positif e-mail (ASCII **et** Unicode).
- Convergence du dernier chemin de mention vers la SSOT → zéro drift futur.

### Implementation complexity
Triviale : 1 import + 1 constante regdérivée des constantes partagées.

### Validation criteria
- Test RED d'abord : `contact@ali` (cursor à la fin) → autocomplete **fermé**. Échoue avant
  le fix (la regex locale matchait), passe après.
- Frontière Unicode : `café@ali` → fermé.
- Non-régression : `(@john` (après ponctuation) → ouvert, query `john`.
- Suite `useMentions.test.tsx` intégralement verte (46 tests) + suites composer/mention
  voisines (225 tests).

### Tests — absence de couverture confirmée
`apps/web/__tests__/hooks/composer/useMentions.test.tsx` couvrait le charset (tiret,
underscore, chiffres) et le cas `email@test.com @john` (où le curseur est **après** un espace,
donc la frontière n'était jamais exercée), mais **aucun** test ne plaçait le curseur juste
après le `@` interne d'une adresse — le bug était invisible.

---

## Suivis (backlog, non traités ce cycle)
- **`PostService.recordView` clobber du `duration`** (`PostService.ts:1022-1028`) : `Math.max`
  probablement voulu vs. « keep latest » (choix produit défendable — à trancher).
- **Reaction self-echo compare Participant ID vs User ID** (`use-message-reactions.ts:363/389`) :
  confiance plus basse (auto-guérison via `refreshReactions()`).
