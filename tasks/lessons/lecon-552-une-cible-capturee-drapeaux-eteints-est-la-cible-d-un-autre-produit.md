## Leçon 552 — Une cible capturée DRAPEAUX ÉTEINTS est la cible d'un autre produit

Le 2026-09-08, le tour 2 du chantier web-v3 a posé ses cibles iOS au
simulateur : la liste capturée était la peau en cartes, le fil capturé rendait
des bulles sans puce de mode — et le rapport de conception l'écrivait lui-même, « preuve
vivante que le drapeau iOS est désactivé, exactement l'écart assumé par D-7 ».
Les spécifications du tour 1 avaient été écrites sur lecture de source, depuis
le MONTAGE (`ConversationListView.swift:945-1040`) et non depuis le dossier de
la feature (`Lentille/**`) : le pont ✦, la magnification actionnable, la scène
et son aplatissement, les sections et leurs stickers n'y figuraient jamais —
non par oubli d'exécution, mais parce qu'ils n'ont jamais été mis au périmètre.
Deux décisions (D-7, D-9) avaient consacré l'écart en « écart assumé ».

**La forme.** Un drapeau de feature rend l'ancien produit et le nouveau
indiscernables à qui ne l'allume pas : la capture est nette, l'app tourne, le
rapport est honnête — et tout vise la mauvaise cible. L'indice était dans le
rapport (« le drapeau est désactivé ») ; personne ne l'a lu comme un défaut de
la cible, parce qu'une décision l'avait déjà qualifié d'écart assumé.

**La règle.**
1. Avant de capturer une cible, ÉNUMÉRER les drapeaux qui gouvernent l'écran
   (`grep -rn "FeatureFlag\|isEnabled" <dossier>`) et les ALLUMER ; la capture
   de la preuve (l'écran qui montre le drapeau ON) fait partie de la cible.
2. Une spécification s'écrit depuis le DOSSIER de la feature, pas depuis son
   montage : le montage dit où l'écran se branche, le dossier dit ce qu'il est.
3. « Écart assumé avec la référence » est une phrase à relire à chaque
   directive : elle survit à la décision qui l'a produite et continue de
   couvrir tout ce qu'on ne regarde plus.

Détail : issue #5672, `apps/web-v3/targets/`, D-20.
