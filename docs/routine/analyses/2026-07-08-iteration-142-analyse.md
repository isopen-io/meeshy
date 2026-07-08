# Iteration 142 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `1a90e77` (dernier merge PR #1657). Branche `claude/brave-archimedes-k2nlps` recréée depuis
`origin/main`. PR #1658 (iter 140) est ouverte et documente que la surface *pure-helper* est propre ; ce
cycle prend **141** et élargit la revue à la couche **services métier** de la gateway (`services/gateway/src/services`),
non couverte récemment. Fan-out multi-agents sur gateway/services + shared/web.

**Note de renumérotation (merge PR #1661 vers main, 2026-07-08)** : ce cycle a été documenté sous le
numéro **141**, mais PR #1659 (`R-AR1`, idempotence `attachment:reaction`) a réclamé et mergé le même
numéro en parallèle — collision de numérotation entre sessions concurrentes, pas de conflit de contenu.
Renumérotée **142** (prochain numéro libre sur `main`) au moment de la résolution du conflit de merge ;
le contenu ci-dessous (F109, DND matin nocturne) est inchangé.

## Cible : F109 — `PushNotificationService.isPushAllowed` : la tranche du matin d'une fenêtre DND nocturne est rattachée au mauvais jour calendaire

### Current state
`services/gateway/src/services/PushNotificationService.ts:284-300`. Porte d'entrée unique de tous les push
(message / mention / réaction) via `sendToUser` (l.321). Le mode Ne-Pas-Déranger combine deux critères :
un **ensemble de jours** (`dndDays`) et une **fenêtre horaire** (`dndStartTime` → `dndEndTime`). La fenêtre
par défaut est `22:00` → `08:00` (source : `packages/shared/types/preferences/notification.ts:80-81`), donc
**nocturne** (`start > end`).

```ts
if (prefs.dndEnabled) {
  const now = new Date();
  if (prefs.dndDays && prefs.dndDays.length > 0) {
    const dayMap = ['sun','mon','tue','wed','thu','fri','sat'] as const;
    const today = dayMap[now.getUTCDay()];
    if (!prefs.dndDays.includes(today as any)) return true; // ← jour COURANT
  }
  const currentTime = ...;                       // UTC HH:MM
  const start = prefs.dndStartTime;              // '22:00'
  const end   = prefs.dndEndTime;                // '08:00'
  if (start > end) {                             // fenêtre nocturne
    if (currentTime >= start || currentTime < end) return false;
  } else {
    if (currentTime >= start && currentTime < end) return false;
  }
}
return true;
```

### Problems identified
Une fenêtre nocturne `22:00 → 08:00` **déborde sur le lendemain**. Sa tranche du matin (`00:00 → 08:00`)
appartient logiquement à la nuit qui a **commencé la veille**. Or le filtre `dndDays` est évalué contre le
**jour courant** (`now.getUTCDay()`), donc la tranche du matin est rattachée au mauvais jour.

Semantique voulue : `dndDays: ['mon']` + `22:00→08:00` = « silence du **lundi soir** au **mardi matin** ».

### Root causes
Le test de `dndDays` ignore le fait que la fenêtre traverse minuit : pour la tranche du matin, le jour
pertinent est le jour de **début** de la fenêtre (`veille`), pas le jour courant.

### Business impact
Reproductible avec les **réglages par défaut** dès qu'un utilisateur active le DND avec un sous-ensemble
de jours. Deux symptômes opposés, tous deux visibles en prod :

- **Mardi 07:00 UTC** (`dndDays: ['mon']`) : `today='tue'` absent de `dndDays` → `return true` → push
  **DÉLIVRÉ**. Mais c'est exactement la fin de la nuit de lundi voulue silencieuse → devrait être **bloqué**.
  L'utilisateur est réveillé pendant ses heures calmes.
- **Lundi 07:00 UTC** (`dndDays: ['mon']`) : `today='mon'` ∈ `dndDays` et `currentTime < end` → `return false`
  → push **BLOQUÉ**. Mais c'est la fin de la nuit de dimanche (non sélectionnée) → devrait être **délivré**.
  L'utilisateur est silencié un jour qu'il n'a pas choisi.

### Technical impact
Erreur de logique calendaire pure. Masquée quand `dndDays` est vide (tous les jours → jamais de rattachement
erroné) et quand la fenêtre est intra-journée (`start <= end`, pas de débordement). Se manifeste sur toute
fenêtre nocturne combinée à un `dndDays` partiel — le cas d'usage le plus courant du DND.

### Risk assessment
Faible. La correction ne change QUE la tranche du matin d'une fenêtre nocturne quand `dndDays` est non vide —
c.-à-d. exactement les cas aujourd'hui faux. Les 5 tests DND existants (jour intra-fenêtre, hors-fenêtre,
crossover soir, crossover milieu de journée) restent verts (vérifié) car aucun ne teste la tranche du matin.

### Proposed improvements
Restructurer : calculer d'abord l'appartenance à la fenêtre (`inWindow`), puis, si `inWindow` et `dndDays`
non vide, tester `dndDays` contre le **jour de début** de la fenêtre — la veille (`(getUTCDay()+6)%7`) pour la
tranche du matin (`overnight && currentTime < end`), sinon le jour courant. Bloquer si `inWindow`.

Note : la comparaison horaire reste en UTC (cohérente avec l'existant). L'ambiguïté UTC-vs-heure-locale de
`dndStartTime/dndEndTime` est un sujet séparé, non traité ici pour rester minimal et prouvable.

### Expected benefits
DND correct pour le cas d'usage nominal (silence nocturne sur jours choisis). Plus de push intempestif la nuit
ni de silence un jour non sélectionné.

### Implementation complexity
Triviale : réécriture du bloc DND (une fonction pure de `Date`), + 2 tests de non-régression (les deux sens
du bug).

### Validation criteria
- `PushNotificationService.test.ts` : 5 tests DND existants verts + 2 nouveaux (tranche du matin bloquée quand
  jour de début sélectionné ; tranche du matin autorisée quand jour de début non sélectionné).
- `tsc --noEmit` gateway propre.
- Suite gateway complète verte.

## Candidats écartés ce cycle
- **MediaVideoCard** (match de langue casse-sensible, divergent de ses deux jumeaux) — composant **non câblé**
  dans l'arbre de rendu actuel (pas de site JSX `<MediaVideoCard>`), donc défaut *latent*, sous le seuil
  « production-visible » (même barre qui a écarté F108 en iter 140). À reprendre quand la carte sera câblée.
- **`getUserLanguagePreferences` omet `deviceLocale`** — écart de parité réel avec `resolveUserLanguagesOrdered`,
  mais reachability faible (nécessite les 3 préférences in-app vides). Noté comme F110 pour un cycle futur.
- **`smart_segment_merger._merge_group`** coerce `voice_similarity_score: Optional[float]` en booléen via
  `all(...)` — `merge_short_segments` n'est **appelé nulle part** dans `services/translator/src` (import mort),
  donc hors périmètre production-visible. La gateway neutralise déjà `false → null` défensivement
  (`routes/conversations/messages.ts:207,233`).

## Prochaines pistes
- **F110** : injecter `deviceLocale` dans `getUserLanguagePreferences` (parité `resolveUserLanguagesOrdered`).
- **F108** : nettoyage code mort `MessageValidator.checkPermissions` (reporté d'iter 140).
- MediaVideoCard : aligner le match de langue sur ses jumeaux **quand** le composant sera câblé.
