# Iteration 189 — `validateMessageContent` (web) : la borne de longueur mesure la chaîne brute alors que le message envoyé est *trimmé* → un message valide (≤ max après trim) rejeté « trop long » à cause d'espaces/retours de ligne périphériques

## Protocole (démarrage)
`main` @ `8d2799e1` (derniers merges : #2248 android/auth server-environment
selector ; itération **188** `0cd733b9` web — `generateLinkName` troncature
Unicode-safe du titre de conversation). Branche `claude/brave-archimedes-w0jdlq`
réinitialisée sur `origin/main`. Ce cycle prend **189**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances via `bun install` ; harnais validé
ce cycle : `apps/web` jest (`messaging-utils`, 37/37 ; les 37 autres suites
`__tests__/utils` restent vertes à 975/975 — `user-language-preferences.test.ts`
échoue sur résolution `@meeshy/shared/utils/languages` faute de `dist` shared
rebuild, **prérequis d'environnement documenté itér. 188**, sans lien avec ce
correctif qui ne touche aucune surface langue).

PRs ouvertes au démarrage : 20 PRs iOS (`laughing-thompson` swarm, tracks
a11y/i18n/design-system), toutes gérées par un autre swarm — **non touchées**
(aucune ne concerne la surface TypeScript de cette itération).

Sélection : **Priorité 1/continuité directe**. Le plan de l'itération 188
désignait explicitement, en tête de ses « Améliorations futures », l'alignement
du `trim` de `validateMessageContent` entre le check de vacuité et le check de
longueur. C'est un défaut de correctness sur le **chemin d'envoi de message**
(cœur produit), à coût de correctif nul.

## Current state
`apps/web/utils/messaging-utils.ts` — `validateMessageContent(content, maxLength)`
valide un message côté client avant envoi :

```ts
if (!content.trim()) {                       // ← vacuité : mesure la chaîne TRIMMÉE
  return { isValid: false, error: 'Le message ne peut pas être vide' };
}
if (content.length > maxLength) {            // ← longueur : mesure la chaîne BRUTE
  return { isValid: false, error: `…dépasser ${maxLength} caractères` };
}
```

Or l'expéditeur **trimme** le contenu avant de le persister :
- `prepareMessageMetadata` (même fichier, l.53) : `content: content.trim()`.
- `use-messaging.ts` (l.212) garde d'envoi sur `content.trim()`.

Le contenu réellement envoyé est donc `content.trim()` — jamais la chaîne brute.

## Problems identified
1. **Incohérence de mesure → faux rejet « trop long » d'un message valide.**
   Le check de vacuité et le contenu envoyé mesurent tous deux la chaîne
   **trimmée** ; seul le check de longueur mesure la chaîne **brute**. Un message
   dont le corps utile fait exactement `MAX_MESSAGE_LENGTH` (1024) mais entouré
   d'espaces/retours de ligne (copier-coller, texte pré-formaté) est compté
   `> maxLength` et **rejeté** — alors que le contenu qui *serait* envoyé
   (`content.trim()`, 1024 chars) est parfaitement valide.
   - `validateMessageContent('   ' + 'a'.repeat(1024) + '\n\n')` → **`isValid:false`**
     (attendu `true` : après trim, 1024 ≤ 1024).
2. **Aucune couverture du cas « whitespace périphérique + longueur limite ».**
   La suite existante testait la vacuité trimmée et la longueur brute
   séparément, jamais leur interaction — le défaut passait entre les mailles.

## Root causes
Deux mesures de la même grandeur (« longueur du message ») sur deux
représentations différentes de `content` : trimmée pour la vacuité et pour
l'envoi, brute pour la borne haute. La borne haute doit mesurer ce qui sera
effectivement persisté, c.-à-d. la chaîne trimmée.

## Business impact
Sur un chat social multilingue, le copier-coller de texte (souvent avec retour
de ligne final ou indentation) est courant. Un utilisateur voit son message
juste sous la limite refusé sans raison compréhensible (« dépasser N
caractères » alors que le texte visible est plus court) → friction directe sur
l'action produit la plus fréquente. Le Prisme vise zéro friction : un message
valide ne doit jamais être bloqué par une mesure fantôme.

## Technical impact
Faible surface (1 fonction pure, 1 fichier). Aligne la validation client sur le
contrat d'envoi (`trim()`) — élimine une classe entière de faux négatifs de
longueur. Rapproche aussi la validation client de la validation gateway (qui
opère sur le contenu reçu, déjà trimmé).

## Risk assessment
Minimal. Fonction pure, sans effet de bord ni état persistant. Le seul
changement de comportement observable est l'**acceptation** de messages
auparavant faussement rejetés (élargissement strict de l'ensemble valide,
borné par `maxLength` sur le contenu réel). Aucun message auparavant accepté ne
devient rejeté : `trimmed.length ≤ content.length`, donc un contenu qui passait
la borne brute passe *a fortiori* la borne trimmée.

## Proposed improvements
Extraire `const trimmed = content.trim()` une fois, mesurer la vacuité **et** la
longueur sur `trimmed`. Idempotent avec l'envoi.

## Expected benefits
- Fin des faux rejets « trop long » sur messages à whitespace périphérique.
- Cohérence vacuité / longueur / envoi (une seule représentation mesurée).
- Message d'erreur de longueur désormais toujours véridique.

## Implementation complexity
Triviale — 3 lignes modifiées, aucune signature changée, aucune migration.

## Validation criteria
- RED → GREEN prouvé sur `messaging-utils.test.ts` (test « measure length after
  trimming » échoue sans le correctif, passe avec).
- 37/37 sur la suite `messaging-utils`, 975/975 sur les 37 suites `__tests__/utils`
  exécutables (hors prérequis dist shared).
- Aucune signature ni type modifié (`string` → `.trim()` → `string`).

## Future improvements (itération 190+)
- `getLanguageInfo` (`packages/shared/utils/languages.ts`) : normaliser la casse
  du `code` retourné comme `name`/`flag` quand la langue est inconnue.
- `MAX_LINK_NAME_LENGTH` (`link-name-generator.ts`) : constante inutilisée +
  docstring 32≠60 (nettoyage doc).
- `validateMessageContent` : envisager de mesurer en **points de code** plutôt
  qu'en unités UTF-16 pour aligner « caractères » sur la perception utilisateur
  (défaut de classe déjà traité côté troncature aux itér. 187/188) — à évaluer
  contre la borne gateway pour éviter une divergence client/serveur.
