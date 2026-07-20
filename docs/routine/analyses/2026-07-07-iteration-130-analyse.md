# Iteration 130 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `db89f6f` (dernier merge PR #1640, itération 129). Branche `claude/brave-archimedes-g2yvdr`
recréée depuis `origin/main`. Numérotation : docs `main` jusqu'à **129** → ce cycle prend **130**.

PR ouvertes au démarrage (strictement évitées) : uniquement dependabot (#1549/#1542/#1539/#1536/#1532).
Aucune PR humaine ouverte.

## Écartés cette session (revue, non retenus)
Revue d'ingénierie ciblée sur les zones récemment modernisées (Priorité 1). Candidats instruits puis
**écartés** :

- **`use-call-quality.ts` `calculateQualityLevel`** : les seuils chaînés en `&&` implémentent
  correctement « la pire des deux dimensions décide » et `poor` couvre bien « l'une OU l'autre dépasse
  la borne fair ». Pas de bug.
- **`lib/calls/adaptive-degradation.ts` `reduceDegradation`** : machine à états avec hystérésis, timers
  wall-clock, garde clock-skew — solide, fortement testée. Pas de bug.
- **`getTranslationFromJSON` (translation-transformer)** : lookup de clé **sensible à la casse** là où
  `transformTranslationsToArray` compare en lowercase — mais fonction **sans aucun appelant** (export
  mort). Reachability nulle → non retenu.
- **`resolveUserLanguage` vs `resolveUserLanguagesOrdered` (asymétrie de normalisation)** : les prefs
  in-app ne passent que par `.toLowerCase()` tandis que `deviceLocale` passe par `normalizeLanguageCode`.
  C'est un choix **documenté et intentionnel** (pass-through des prefs in-app, cf. commentaire l.35 de
  `conversation-helpers.ts` + miroir Swift). Modifier casserait la parité iOS/web documentée → non retenu.
- **F90 (message-search translation recall)** : réel mais **architecturalement significatif** (recall
  plafonné à 200 par fenêtre curseur, correction propre = recherche JSON côté DB ou keyset dédié). Hors
  périmètre d'un fix autonome sûr/testable → laissé au backlog pour décision produit.

## Cible : F93 — épingler le contrat distinct de `truncateText`

### Current state
`apps/web/utils/truncate.ts` expose **deux** utilitaires de troncature au contrat **différent** :

- `truncateFilename(name, max)` — garantit « le résultat ne dépasse **jamais** `maxLength` » (invariant
  documenté + testé, durci à l'itération 128, F88).
- `truncateText(text, max)` — traite `maxLength` comme un **budget de contenu** et **ajoute** l'ellipse
  par-dessus : la sortie peut atteindre `maxLength + 3`. Trim l'espace de fin avant l'ellipse et renvoie
  un flag `isTruncated`.

```ts
export function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return { truncated: text, isTruncated: false };
  return { truncated: text.slice(0, maxLength).trim() + '...', isTruncated: true };
}
```

### Problems identified
Le contrat « budget de contenu + ellipse en sus » de `truncateText` est **implicite** :
- La docstring du module ne distingue pas les deux sémantiques (l'itération 128 avait explicitement
  queué F93 : « documenter le contrat distinct de `truncateText` (`maxLength` contenu + ellipse) »).
- Les tests (`__tests__/utils/truncate.test.ts`) ne couvrent que 3 cas et **n'épinglent pas** que la
  sortie peut légitimement **dépasser** `maxLength` de la longueur de l'ellipse.

Risque concret : un refactor futur cherchant à « uniformiser » les deux fonctions (rendre `truncateText`
non-dépassant comme `truncateFilename`) casserait silencieusement les appelants qui comptent sur la
sémantique de budget de contenu (`v2/MediaAudioCard.tsx`, `v2/MediaVideoCard.tsx`) — sans qu'aucun test
ne l'attrape.

### Root cause
Deux fonctions au contrat opposé cohabitent dans le même module sans que la différence soit ni
documentée ni verrouillée par des tests. Le contrat de `truncateText` n'existe que dans le comportement,
pas dans une garantie explicite.

### Business impact
Nul en runtime (comportement inchangé). Impact **maintenabilité/qualité** : contrat implicite = piège de
régression pour un futur refactor, contraire au principe projet « code should be self-documenting » et à
la convergence qualité homogène visée par la routine.

### Technical impact
- Couverture insuffisante : le cas nominal « sortie > `maxLength` » (le cœur du contrat) n'est jamais
  asserté.
- Absence de garde contre une « uniformisation » erronée des deux fonctions.

### Proposed improvement
1. **Documenter** le contrat distinct de `truncateText` dans la docstring (budget de contenu, ellipse en
   sus → sortie jusqu'à `maxLength + 3`, trim de l'espace de fin, flag `isTruncated`) — en contraste
   explicite avec `truncateFilename`.
2. **Épingler** le contrat par des tests de régression : la sortie dépasse `maxLength` de l'ellipse ; le
   trim de fin ; la frontière `maxLength + 1` ; le contraste explicite avec `truncateFilename`.

### Expected benefits
- Le contrat de `truncateText` devient explicite et **verrouillé** : toute tentative future de le rendre
  non-dépassant échoue en CI.
- Ferme le backlog F93. Aligne le module sur le principe « self-documenting » et la discipline de
  test-hardening déjà pratiquée (itération 127 : couverture directe de `parseMessageLinks`).

### Implementation complexity
Très faible — 0 changement de production (docstring uniquement) + tests de régression. Aucun risque
comportemental.

### Validation criteria
- Nouveaux tests verts, épinglant : sortie `> maxLength`, trim de fin, frontière `maxLength+1`, contraste
  avec `truncateFilename`.
- Suite `__tests__/utils/truncate.test.ts` intégralement verte.
- Zéro changement de comportement runtime (docstring + tests seulement).
