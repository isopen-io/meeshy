# Plan — Itération 288 : cliquet « prisme du lecteur par la SSOT » (web)

## Objectifs

Figer par un cliquet l'absence du motif « liste de langues du lecteur bâtie en
ligne » côté web, retiré aux cycles 285/286 et resté sans garde (suivi ouvert
depuis le cycle 283). Aucune modification de production.

## Modules affectés

- `apps/web/__tests__/hooks/reader-language-ssot-guard.test.ts` (NOUVEAU) — seul
  fichier ajouté.
- Aucun fichier d'exécution modifié.

## Phases d'implémentation

1. **Recensement** (fait) — balayer l'arbre web pour prouver qu'aucun exemplaire
   du motif ne subsiste (inventaire vide) et distinguer les usages légitimes de
   `resolveUserLanguagesOrdered` (résolution d'un AUTRE utilisateur).
2. **Détecteur** (fait) — regex étroite sur la liste de résolution : trois champs
   du lecteur dans un littéral de tableau refermé par `.filter(Boolean)`, après
   dépouillement des commentaires et normalisation des blancs.
3. **Témoins** (fait) — prémisse non vide, inventaire vide, RED prouvé, trois
   non-cibles figées.

## Dépendances

Aucune. Le cliquet est autonome (marche `fs`), modèle
`composer-legacy-mounts-guard.test.ts`.

## Risques estimés

- **Faux positif** : neutralisé par le ciblage `.filter(Boolean)` (exclut les
  tableaux de dépendances) et le dépouillement des commentaires. Trois témoins
  négatifs figent ces cas.
- **Faux négatif** (variante `Set`/`reduce`) : assumé — détecteur étroit et sûr
  plutôt que large et bruyant ; la revue de recensement reste le filet.

## Stratégie de rollback

Retirer le fichier de test. Aucun effet sur la production.

## Critères de validation

- `npx jest __tests__/hooks/reader-language-ssot-guard.test.ts` : 6/6 verts.
- Inventaire réel (arbre entier) vide.
- RED prouvé sur le motif exact retiré aux cycles 285/286.

## Statut

**LIVRÉ.** 6/6 témoins verts, inventaire vide, RED prouvé.

## Suivi / améliorations futures

- Étendre au miroir iOS/Android si un motif équivalent y apparaît (hors périmètre
  d'un cliquet TS).
- Élargir le détecteur si une variante `Set`/`reduce` de la liste du lecteur est
  un jour introduite (à ne faire qu'en réaction à un cas réel).
