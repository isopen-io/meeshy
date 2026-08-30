# Itération 287 — plan : canonicalisation des langues cibles de diffusion admin

## Objectifs

Faire passer l'agrégat de cibles NLLB du handler `POST /admin/broadcasts/:id/preview`
par la SSOT de canonicalisation `normalizeLanguageForDedup` avant traduction et
persistance, pour n'émettre qu'une cible par langue réelle, sans langue source ni
variante. Solde le suivi de l'itération 286.

## Modules affectés

- `services/gateway/src/routes/admin/broadcast-target-languages.ts` — **nouveau**
  helper pur `broadcastTargetLanguages`.
- `services/gateway/src/routes/admin/broadcasts.ts` — import + câblage dans
  `POST /:id/preview`.
- `services/gateway/src/__tests__/unit/routes/admin/broadcast-target-languages.test.ts`
  — **nouveau**, 8 pins de comportement.

Aucun changement de schéma, d'API publique, d'événement socket ni de format
persistant (les clés de `translatedSubjects`/`translatedBodies` deviennent
canoniques, mais le rendu les canonicalisait déjà via `resolvePrismTranslation`).

## Phases

1. **RED** — écrire les 8 pins ciblant un module absent (échec `module not found`
   mesuré). ✅
2. **GREEN** — implémenter le helper pur (canonicalise, retire la source, dédup
   ordre-stable, sans cap). ✅ (8/8)
3. **Câblage** — importer et remplacer le `.map().filter(Boolean)` du handler. ✅
4. **Validation** — `tsc`, suites broadcast + admin + ratchet manifeste. ✅

## Dépendances

Aucune. `normalizeLanguageForDedup` existe déjà (`packages/shared`, dist inclus).

## Risques estimés

Faible : fonction pure, resserrement idempotent de l'ensemble sortant. Le rendu
restait robuste avant/après (canonicalisation à la lecture), donc aucune diffusion
existante ne change de résolution.

## Stratégie de rollback

`git revert` du commit unique. Aucun état à migrer (le champ persisté n'était lu
que par un résolveur qui canonicalise déjà).

## Critères de validation

- `broadcast-target-languages.test.ts` : 8/8.
- `admin-broadcasts-list-select.test.ts` intacte ; 34 suites admin : 1135/1135.
- `route-manifest-ratchet` : 4/4 (helper pur, aucune route).
- `tsc --noEmit` gateway : 0 erreur.

## Statut d'achèvement

**Terminé.** Toutes les phases livrées et validées.

## Suivi / améliorations futures

- La classe « agrégat de `systemLanguage` → cibles NLLB non canonicalisées » est
  désormais **close** côté gateway : les trois producteurs (audience de story,
  langues de conversation, cibles de diffusion) canonicalisent. Le prochain
  balayage de cette famille se fait en cherchant un NOUVEAU producteur, pas les
  trois connus.
- `ZmqRequestSender.ts:85` déduplique les listes de cibles ENTRANTES par
  `.map(l => l.toLowerCase())` seul (région non strippée). C'est une frontière de
  transport qui reçoit des listes déjà bâties, pas un producteur ; la
  canonicalisation reste la responsabilité de l'appelant (design SSOT). À
  transformer en garde-fou de dernier rang seulement si un producteur non
  canonique réapparaît — sinon inutile. Non planifié.
