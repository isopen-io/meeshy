# Iteration 124 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `851d9068`, working tree propre. Branche `claude/brave-archimedes-s965k2` (re)créée depuis
`origin/main`. Numérotation : docs `main` vont jusqu'à **122** ; la PR ouverte **#1602** occupe déjà
le label `iter-123` → ce cycle prend **124**.

PR ouvertes au démarrage (cibles à éviter, strictement disjointes) : #1608/#1596/#1588/#1585 (gateway
realtime + read-status), #1607/#1603/#1599 (android chat typing), #1606/#1601 (calls GC/cleanup),
#1605/#1598 (gateway sanitize prototype-pollution — **couvre l'ancien backlog F87**), #1602 (iter-123 :
NLLB map, URL scheme, senderName), #1593 (translator segmentation), #1590 (shared time-remaining).
Cible retenue **strictement disjointe** de toutes ces surfaces.

## Revue d'ingénierie (constat de démarrage)
Le socle gateway/shared reste extrêmement mature (123 itérations de polissage) : les helpers purs
(`conversation-helpers`, `mention-parser`, `presence-visibility`, `email-validator`, `duration-format`,
`relative-time`) ont chacun leur invariant documenté et testé, sans edge case résiduel évident. La revue
adversariale ciblée s'est donc déplacée vers les **services applicatifs** à logique de retry/boucle, moins
souvent revisités que les fonctions pures. **Un** défaut de correction concret et actif a été identifié.

## Cible : off-by-one dans `TrackingLinkService.generateUniqueToken`

### Current state (bug de boucle actif, chemin de production)
`services/gateway/src/services/TrackingLinkService.ts` — la génération d'un token unique bornait ses
tentatives avec un compteur incrémenté **avant** la vérification d'unicité :
```ts
let attempts = 0;
const maxAttempts = 10;
do {
  token = this.generateToken();
  attempts++;
  if (attempts >= maxAttempts) {
    throw new Error('Unable to generate unique token after maximum attempts');
  }
} while (await this.tokenExists(token));
return token;
```

### Problems / Root cause
À la 10ᵉ itération, `attempts` atteint `10` et la fonction **lève l'erreur avant** d'exécuter la
condition `while (await this.tokenExists(token))`. Le 10ᵉ token fraîchement généré n'est donc **jamais
validé** : bien que `maxAttempts = 10`, seuls **9** candidats sont réellement testés contre la base. Un
10ᵉ candidat unique (cas de loin le plus probable après 9 collisions) est jeté et une erreur spurious est
propagée. Classique erreur de frontière « incrémente puis garde avant de vérifier ».

### Business / Technical impact
Sévérité pratique faible (espace de tokens 62⁶ ≈ 5,7·10¹⁰ ⇒ 9 collisions consécutives quasi impossibles
en régime normal), mais bug de correction **réel et actif** : sous forte densité de tokens ou en présence
d'un `generateToken` dégénéré (tests, seed, futur raccourcissement de longueur), `createTrackingLink`
échoue là où un token libre existait. Surface : toute création de lien de tracking (messages, posts,
stories, commentaires via `collectContentTrackingLinks`).

### Risk assessment
Très faible. Le correctif préserve exactement la sémantique voulue (« jusqu'à 10 candidats, sinon
erreur ») et ne change aucun contrat public. Les deux tests existants pertinents restent verts :
« retries on collision » (2 appels) et « throws when max attempts exceeded » (toujours en collision →
lève toujours). Seul le comptage interne de `findUnique` passe de 9 à 10 dans le cas d'échec total, non
asserté.

### Proposed improvements (implémenté ce cycle)
Boucle `for` à retour anticipé — valide les **10** candidats, ne lève qu'après épuisement réel. Supprime
au passage le compteur mutable et la variable `token` mutable (aligné style immuable CLAUDE.md) :
```ts
private async generateUniqueToken(): Promise<string> {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = this.generateToken();
    if (!(await this.tokenExists(token))) {
      return token;
    }
  }
  throw new Error('Unable to generate unique token after maximum attempts');
}
```

### Validation criteria
- [x] Nouveau test de régression `succeeds when the final (10th) candidate is the first unique one`
      (9 collisions + 1 libre) : **RED prouvé** sur l'ancien code (`Rejected: Unable to generate unique
      token after maximum attempts`), **GREEN** après correctif. Asserte aussi `findUnique` appelé 10×.
- [x] `TrackingLinkService.test.ts` : **72/72** (71 existants + 1 nouveau), aucune régression.
- [x] Suites `tracking*` : **200/200** tests passants (2 suites en échec de compilation **pré-existant**
      et sans lien — diagnostic TS sur un `reduce` de reaction-summary ; identique tree propre stashé).

### Leçon (à retenir)
Dans une boucle de retry bornée, la garde « nombre max atteint » doit s'évaluer **après** la vérification
de succès du candidat courant, jamais avant. Le motif `do { generate; if (++n >= max) throw } while
(collides)` gaspille toujours une tentative (`max` déclaré, `max-1` réellement testés). Préférer un `for`
à retour anticipé : le succès sort immédiatement, l'échec ne se déclenche qu'après épuisement complet.

## Future improvements (backlog, non traité ce cycle)
- **F89 (SSOT, LOW)** : duplicata mort `services/gateway/src/services/posts/postReplySnapshot.ts` (importé
  seulement par son propre test) qui a **déjà dérivé** du module de production `services/messaging/
  postReplySnapshot.ts` — son select `media` perd `orderBy:{order:'asc'} take:1`. Supprimer le duplicata +
  re-pointer/retirer son test.
- **F90 (invariant, LOW)** : `mention-parser.ts` — `hasMentions('@Владимир')` renvoie `true` alors que
  `parseMentions('@Владимир', [])` renvoie `[]` (le chemin @username capture `[\\w-]` ASCII, pas Unicode),
  violant l'invariant documenté « hasMentions ne signale jamais une mention que parseMentions ne résout
  pas ». Rendre le fallback raw-handle (participants vides) Unicode-aware, ou aligner les deux jeux.
- **F87 (résolu)** : divergence des sanitizers → traité par PR #1598/#1605.
