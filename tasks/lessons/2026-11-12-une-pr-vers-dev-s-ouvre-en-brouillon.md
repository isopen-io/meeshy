## 2026-11-12 — Une PR vers `dev` s'ouvre en brouillon tant que la CI des PR est gelée (#17777, #17809)

La CI des PR est gelée (`vars.PR_CI_GEL == 'true'`). Ses jobs sont sautés, et son
verdict vide passe au vert. La fusion automatique vers `dev` suit donc dès
l'ouverture : la preuve lancée à la main n'a pas encore commencé.

### Ce qui s'est passé

#17777 (la carte de la Flamme) a été ouverte hors brouillon à 11 h 08 UTC et a
fusionné la tête `2917dfa6` à la même minute. La session l'a passée en brouillon
quelques minutes plus tard, sans voir qu'elle était déjà fusionnée. Elle a ensuite
poussé deux correctifs sur la branche (le mot « Flamme », `anchoredPicker`), qui
n'ont jamais atteint `dev`. Deux gardes sont restées rouges sur `dev` jusqu'à ce
qu'une autre session les répare (c18405fb49, f64ce69af8). Le commentaire de
clôture de l'issue annonçait à tort la tête corrigée comme fusionnée.

### La règle

1. Ouvrir toute PR vers `dev` avec `"draft": true`.
2. Lancer `ci.yml`, `ios.yml` et `android.yml` à la main sur la tête.
3. Ne sortir du brouillon (`POST /pulls/<n>/ccr/ready_for_review`) qu'une fois les
   preuves lues : la fusion suit aussitôt.
4. Avant d'écrire « fusionné à la tête X », lire `merged_at` et `merge_commit_sha`
   de la PR. Ne jamais déduire la tête fusionnée de la dernière poussée.
5. Pousser sur une branche dont la PR est fusionnée ne livre rien : ouvrir une
   nouvelle PR depuis `dev`.
