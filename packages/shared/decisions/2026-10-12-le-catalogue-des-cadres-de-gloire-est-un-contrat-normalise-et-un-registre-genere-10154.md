## 2026-10-12: Le catalogue des cadres de gloire est un contrat normalisé par collection et un registre de packs généré ; la loi de proposition est bornée par la loi d'usage (#10154, #10156)

**Statut** : Accepté (lots L3 et L4 du chantier « Cadres de gloire »).

**Contexte** : § 5.2, § 5.3, § 5.4 et § 5.10.5 de `docs/product/cadres-de-gloire/PROMPT-developpement.md`. L'export L1 (`lib/export.mjs`) produit, par collection, des couches WebP et un `export.json` brut ; le moteur de packs (LP0) et le magasin adressé (L5) attendaient un registre réel.

**Décisions** :
- **Deux lecteurs, un fichier.** Le contrat d'un pack reste lu par la boutique (`types/glory-frame-pack.ts` : identifiant, usage, vignette, clés de nom) ; le contrat COMPLET (`types/glory-frames.ts` + `types/glory-frame-format.ts` : placement dans la loi, formats, couches, emplacements de texte, oiseaux) l'étend sans le dupliquer. Le chunk web de la boutique n'embarque pas le schéma des formats.
- **La cible d'un cadre se lit dans son identifiant**, avec les clés de la loi (`appliesTo`), jamais dans la prose des manifestes ; elle doit dire la même chose que son `usage` (#10146), sinon le cadre tombe. Un cadre de RANG sert son rang, toutes divisions (`usage` sans division) : D3 propose les cinq décorations du rang, celle de la division d'abord.
- **Un pack de gloire peut laisser l'usage à ses cadres** (`usage` de registre facultatif pour `glory-frame`) : l'Afrique éternelle sert cinq rangs, les moments quatre familles — un usage de pack mentirait. Chaque cadre porte le sien, obligatoire et lu fail-closed ; la boutique l'affiche cadre par cadre.
- **Les types dérivent des schémas `zod/mini`** : la passerelle compile `packages/shared` sans `strictNullChecks`, où un type écrit à la main diverge de l'inféré (nullables, tuples) et casse l'image.
- **`version` = empreinte de l'ensemble** (contrat, chaînes par langue, couverture, atlas), montée de un par `generate:glory-frames`, jamais descendue ; les fichiers de la version quittée entrent dans `retained.json`.
- **Les écarts connus sont des cliquets d'égalité exacte** (`design/glory-frames/known-gaps.json` : pose par défaut selfie #10153, motif `afrique` #10253, contraste #10265, six langues #10172).
- **La loi de proposition (`utils/game/glory-frames.ts`) est bornée par `canUseFrame`** : un Prestige, un niveau 100, un départ, un trophée, une ligue ou une saison sans cadre déclaré pour eux reçoivent la carte simple. La recommandation D5 (« cadres du rang courant ») est SUSPENDUE par la loi d'usage, postérieure (directive porteur 2026-10-11) ; #10180 reste ouverte. D4 (palier dessiné le plus proche en dessous) est appliquée, réversible dans la loi.
- **Les vecteurs de la loi vivent dans `design/packs/frame-offer-vectors.json`**, à côté de `frame-usage-vectors.json`, et non dans `game.vectors.json` (27 000 lignes, réécrit par d'autres lots) ; `sdk-tests.yml` les surveille. La loi n'entre pas dans le baril `utils/game/index.ts` : elle tire `frame-usage.ts` (schémas `zod/mini`), qu'aucune entrée web ne doit charger (leçon 589).

**Alternatives rejetées** : un type `uses` de plus (seconde taxonomie) ; un usage de pack « résumé » (faux pour cinq rangs) ; des types écrits à la main annotant les schémas (image de la passerelle cassée, mesuré le 2026-10-12).

**Conséquences** : le socle iOS (`apps/ios/Meeshy/Resources/Packs/`), l'atlas `preview`, la fixture de géométrie et le décodage Swift des formats restent à faire (issues de suivi) ; une régénération de l'export repasse par `import:glory-frames` puis `generate:glory-frames`.
