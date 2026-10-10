# L'espace d'administration ne repose plus que sur components/admin (#9463)

Décision porteur 2026-10-05 : l'approche modules + composants de `dev`
(`apps/web/src/components/admin/*`, fiche membre en cartes et modales) est la
référence ; l'ancienne approche (`routes/admin-parts.tsx`, feuilles et panneaux
qui recodent leurs champs) disparaît.

Lots :
1. Kit de formulaire d'administration (`components/admin/form.tsx`) : champ,
   interrupteur, choix, motif, barre d'actions, refus énoncé — testé.
2. Feuilles et panneaux migrés sur le kit : create / password / ban / image /
   conversation-settings sheets, preferences, member identity / contact / role /
   images / quick-actions.
3. `admin-parts.tsx` supprimé, ses 34 consommateurs sur `components/admin`.
4. `admin-table` remplacé par `AdminEntityList` / `responsive-rows` (ou retiré).
