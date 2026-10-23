## Un pack de lens se propose, se modère avec une fenêtre et des communautés, et s'installe par le moteur de packs (2026-10-23, #11271)

### Contexte

MeeshyLens v1 avait son contrat (`lens-format.ts`, #11270) mais aucun circuit : un partenaire ne pouvait rien proposer, la modération rien publier, et aucun client rien installer. Les défauts validés de #11251 tiennent : revue manuelle sur le circuit existant, validation automatique (taille, coût, contenu), pas de shader ni de script.

### Décision

1. **`lens` rejoint `PACK_DOMAINS`.**
   - Un ancien client iOS le décode en `.unknown` (`PackDomain.swift`) et l'ignore.
   - Le web l'adopte : libellé dans les 7 langues, routes dérivées de `/packs/lens`.
2. **Proposer** (`POST /packs/lens/submissions`, `{ document, assets }`) passe par `parseLens` (#11270), puis par ce que la passerelle exige en plus (`lens-pack.ts`) :
   - **le coût est MESURÉ** (`measureLensCost` : barème par primitive, calé sur les vecteurs du format), et une lens qui déclare moins qu'elle ne coûte est refusée ;
   - **les fichiers sont exactement ceux que les couches nomment.** Chacun est sous son plafond, ré-encodé par la porte des octets des stickers (`normalizeStickerImage`) puis renommé par l'empreinte de ses octets ;
   - **le document gardé est la copie re-sérialisée** de ce que le schéma a lu.

   La lens naît `pending`.
3. **Modérer** (`GET /pending`, `POST /:slug/review`) se fait sous `canModerateContent`, fail-closed, et jamais sur sa propre proposition. La publication :
   - **fixe** la fenêtre et les communautés (celles du document à défaut) ;
   - **réécrit** le document servi, donc le ré-adresse ;
   - **n'accepte aucun prix** : une lens est gratuite.
4. **Servir** :
   - le moteur de packs (`PackCatalog` + `LensPacks.store`) n'offre une lens publiée que dans sa fenêtre et à ses communautés (`isPackShelved`, #11274) ;
   - une lens installée reste en rayon, et s'installer hors offre rend 404 ;
   - `/pack-assets` sert le document et les fichiers d'une lens PUBLIÉE seulement, lus en base (`LensPackAsset`).
5. **Stockage** :
   - modèles `LensPack` et `LensPackAsset` (MongoDB, aucune migration) ;
   - fichiers en base : quelques centaines de Ko par lens, servis immuables par empreinte, et la passerelle reste sans état ;
   - RGPD : l'export (`packs.lensSubmissions`) et la purge (`PackPrivacy`) les couvrent comme les autres propositions.

### Laissé absent, à dessein

- **Points « ATTEND » de #11251, jamais tranchés ici** :
  - pas de rémunération ;
  - pas de crédit « Lens par X » en E2EE ;
  - pas de géo-créneau : la revue retire `window.geo` du document servi.
- L'identité partenaire et le comptage d'usage reviennent à S26.
- Le coût est une mesure STATIQUE du graphe déclaré, pas un rendu headless sur fixtures. Ce rendu reste à outiller (issue de suivi).
