# Plan de correction — itération 91w (web)

**Analyse** : `docs/analyses/uiux/2026-11-21-iteration-91w.md`
**Objectif** : vider le gate d'harmonie #8879 (5 → 0) en traitant ses 4 derniers
cas — tous calculés ou de masque — chacun par le bon outil.

## Doctrine de branche

| | |
|---|---|
| Base de départ | `origin/dev` (HEAD `79b8991bf`) |
| Cible de la PR | `dev` (auto-merge au vert, #9226) |
| Branche de travail | `claude/practical-fermat-h5vgy2` |

## Étapes (RED → GREEN)

1. **RED** — ajouter le describe « les quatre derniers cas du gate (91w) » dans
   `check-design-harmony.test.ts` : les 4 fichiers rendent `scanSource → []`,
   `admin-post-preview` contient `var(--color-media-backdrop)` et **plus**
   `'#000'`, les trois autres contiennent `harmony-exempt:`.
2. **GREEN** — appliquer les 4 corrections :
   - `routes/admin-post-preview.tsx:246` : `'#000'` → `var(--color-media-backdrop)`
     (jeton partagé des visionneuses plein écran, `#000000` byte-identique).
   - `components/message-menu.tsx:830` : `harmony-exempt` à la ligne (masque de
     luminance — couvre 830 **et** 831).
   - `components/conversation-backdrop.tsx:68` : `{/* harmony-exempt: … */}` au-dessus
     (voile dynamique composé, scheme-aware).
   - `components/game/rank-blason.tsx:115` : `harmony-exempt` à la ligne (couleur
     calculée depuis la roue du prisme).
3. **Vérifier** : gate `check-design-harmony.mjs` = 0 ; suite harmonie 46/46 ;
   tests des 4 composants 98/98 ; `tsc --noEmit` = 0.
4. **Livrer** : PR vers `dev`, auto-merge au vert ; annoter l'analyse
   `✅ Statut : CORRIGÉ (iter-91w)` ; mettre à jour `web-iteration-pointer.md`.

## Résultat

- Gate d'harmonie **5 → 0** (−5, exactement les 4 fichiers) — **liste vidée**.
- Suite harmonie **44 → 46** GREEN ; 4 composants **98/98** ; `tsc` 0.
- **Aucun pixel ne change** (un jeton `#000000` byte-identique + des commentaires).

## Suite — l'axe épuration (92w+)

Le gate d'harmonie étant clos, le prochain axe est l'**épuration** (dim. 12,
directive « logique épurée »). Voir le pied de l'analyse 91w pour les pistes de
départ. Remesurer le gate d'harmonie à chaque ouverture : le vider reste
prioritaire s'il remonte.

## ✅ Statut : LIVRÉ (iter-91w)
