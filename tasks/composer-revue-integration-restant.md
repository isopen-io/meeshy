# Revue d'intégration MeeshyComposer — constats restants à intégrer

Source : workflow `w1nlc9yf9` (3 lentilles + 10 vérificateurs, 2026-08-20).
DÉJÀ CORRIGÉ (commit à suivre) : I1 comptes de lots (huit partout), I2/compteur
de lois (onze, P1 + spec §A), résidus « six lots », footer O1–O17, carte loi 11.
RESTE À FAIRE — chaque item vérifié réel sauf mention (overflow = non vérifié) :

## MAJEURS confirmés

### I3 [MAJEUR]
Deux numérotations de « lois » incompatibles coexistent (spec §B3 « lois produit » vs P1 « doctrine ») et les renvois nus « loi N » des plans entrent en collision : « loi 5 » désigne le socle immuable dans le lot C mais l'existence de l'annonce audio dans le lot B ; « loi 4 » désigne la provenance ♫ (B3.4) dans le lot B mais la règle d'apparition dans le design/P1 ; « loi 7 » = bibliothèque locale (B3.7) vs icône-est-le-verbe (P1.7, cité tel quel par P12 et design §6a). L'ajout des lois 8-10 À NUMÉROS IDENTIQUES dans les deux listes masque la divergence des rangs 1-7.
- **Proposition** : Renommer une des deux listes (p. ex. spec B3 → « directives D1-D10 » ou préfixer systématiquement « B3.N ») et faire une passe sur tous les renvois nus « loi N » des plans et planches.
- **Correction du vérificateur** : Deux imprécisions mineures qui ne changent rien au verdict : (1) la citation views P12 est à la ligne 984, pas 987 ; (2) la spec §B3 compte ONZE lois (11 = « Personne ne lit du vide », O17), pas dix — la passe de renommage proposée doit donc couvrir B3.11, ainsi que les deux compteurs périmés : titre P1 « dix lois » et spec §A « la doctrine (7 lois) est stable depuis P1 ».

### I4 [MAJEUR]
Le phasage §9 du design décrit toujours la rupture SANS drapeau et avec une « porte bloquante iOS/web », en contradiction avec R6 (le web est EXEMPT du plancher, il ne voit jamais ces écrans), O15 (écriture stricte sous CANVAS_V3_WRITE_STRICT, merge inerte) et P20.
- **Proposition** : Amender design §9 phase 1 : retirer « /web » de la porte bloquante, ajouter que la validation stricte et le 426 vivent sous CANVAS_V3_WRITE_STRICT (armement postérieur aux trois écrivains) ; reporter la note O15 de P14 dans la cellule O2 du §7.
- **Correction du vérificateur** : Amender design §9 phase 1 (~lignes 718-722 du working tree, qui porte une rév. 3 non committée) : retirer « /web » de la porte bloquante (R6 : le plancher ne gate que le natif — iOS ET Android, lot H), préciser que la validation stricte à l'écriture + le 426 vivent sous `CANVAS_V3_WRITE_STRICT` (env, défaut OFF), armé par acte de déploiement quand les TROIS écrivains émettent v3 (parc iOS large, composer web F5b, Android) — « rien de visible pour un client à jour » devient exact au sens fort : le merge de A est inerte à l'écriture comme en lecture. Reporter dans la cellule O2 du §7 la note de P14 : « Rév. 2 (C5/O15) : l'écriture stricte vit SOUS DRAPEAU — au merge, aucun écrivain n'émet v3 ; armée après les trois, le 426 sert la longue traîne ». Veiller à la cohérence avec le §6h/O17 fraîchement ajouté (sentinelle de lecture active dès le merge de A, « 426 + invite (O15, longue traîne) » à l'écriture) — l'amendement de §9 doit pointer ces mêmes références plutôt que les dupliquer. Attention : le fichier a des modifications non committées concurrentes (rév. 3) — éditer sur l'état du working tree, pas sur celui du commit 1ca1bee93.

### I5 [MAJEUR]
L'interface GELÉE du lot C fixe `.draft → (.post modifiable)` et supprime le champ `seed`, alors que P5 exige pour la porte Brouillon « format : celui du brouillon — reprise exacte » et que le design définit `ComposerIntent { origin, seed }` : le format-du-brouillon est irreprésentable dans `profile(for origin:)` tel que gelé.
- **Proposition** : Soit rendre `profile(for:)` dépendant du seed (réintroduire le champ du design §3 et dériver le format du brouillon chargé), soit consigner explicitement dans P5 et C1 que `.draft` s'ouvre en état transitoire .post puis rebascule au format du brouillon (loi 9) — mais pas les deux versions muettes l'une sur l'autre.
- **Correction du vérificateur** : Trancher et consigner UNE version : soit (a) réintroduire le champ `seed` du design §3 dans `ComposerIntent` (lot C) et faire dériver `initialFormat` du brouillon chargé (et donner un payload à `.share`, dont lot G déclare déjà dépendre) ; soit (b) consigner explicitement dans P5 (ligne Brouillon : tag de périmètre v1 comme les autres lignes) ET dans C1 que `.draft`/`.share` s'ouvrent en état transitoire `.post` avec `opensWith: .resume`, puis que le host rebascule au format du document chargé (loi 9), le seed étant matérialisé par les valeurs associées de `ComposerOrigin` (`.draft(id:)`) — avec renvoi croisé entre P5 et C1 pour qu'aucune des deux versions ne reste muette sur l'autre.

### I6 [MAJEUR]
C4 justifie le maintien de la porte feed sur FeedComposerSheet par « le host n'a pas de surface “document sans scène” » (surface reportée post-v1 en §F), mais O14/P18 routent en v1 des partages TEXTE/URL seuls (et §6f des DOCUMENTS reçus) vers ce même host via les brouillons de l'Étagère — des documents sans scène — et P6 dépeint « content seul — AUCUNE scène » comme un état v1 du composer, sans marque post-v1. Aucun lot ne construit la surface.
- **Proposition** : Trancher au niveau O14/lot G : soit un brouillon sans média route v1 vers FeedComposerSheet (comme la porte feed), soit la surface « document sans scène » minimale entre au périmètre du lot C/G — et marquer P6 vignette 3 en conséquence.
- **Correction du vérificateur** : Nuance mineure au constat : la spec assigne l'etat « scenes: nil » au lot C via O3 (§B1 :56, colonne « B (modèle), C (composer) »), donc un embryon d'etat sans scène est nominalement au perimetre v1 — mais aucune tache du plan lot C ne l'implemente, et la SURFACE d'edition (clavier content, rangee, envoi durable) reste explicitement §F. La proposition d'arbitrage au niveau O14/lot G reste la bonne ; elle devrait aussi statuer sur la branche O12 « carte de carrousel si Post sans scène » (lot C) et la note M3 de P7, qui presupposent toutes deux cette surface en v1.

### I7 [MAJEUR]
Les états AMORCE/INSPECTEUR sont présentés par le design §4 et la planche P4 comme LE chrome de la zone contextuelle, sans réserve v1 — mais la spec et le plan du lot C gardent en v1 « la zone contextuelle … celle du composer SDK existant », aucun lot n'implémente les deux états nommés, et §F (qui se déclare EXHAUSTIF) ne les liste pas : par sa propre clause, c'est un défaut de spec.
- **Proposition** : Soit baliser P4/§4 « cible — v1 : zone du composer SDK conservée », soit ajouter AMORCE/INSPECTEUR à la liste §F, soit les faire entrer au périmètre du lot C — au choix du porteur, mais dit au même endroit partout.

### I8 [MAJEUR]
Le plan du lot F se contredit après la greffe de F5b : son architecture affirme « le composer web actuel reste ce qu'il est » et son Hors périmètre liste « Composer web (création/édition v3) », alors que la tâche F5b — condition d'armement d'O15 — modifie précisément StoryComposer.tsx pour émettre v3 ; la liste des fichiers possédés étiquette en outre StoryComposer.tsx « (F5 — …) » au lieu de F5b.
- **Proposition** : Réécrire l'architecture (« LECTURE + trois correctifs d'écriture, dont l'émission v3 du composer existant — le composer COMPLET (bandes, stickers, collage) reste hors périmètre »), préciser le Hors périmètre en « Composer web complet (fonctionnalités nouvelles) » et corriger l'étiquette F5→F5b.
- **Correction du vérificateur** : Deux imprécisions mineures qui n'invalident pas le constat : (a) le Hors périmètre est aux lignes 137-138 du fichier amendé, pas :128 (numérotation pré-greffe — F5b a ajouté 11 lignes) ; (b) l'étiquette « (F5 — …:252) » n'est pas strictement fausse : F5 modifie aussi « le point de publication du composer story web » (ligne 112), donc la correction juste est « F5/F5b », pas un simple remplacement F5→F5b.

### I9 [MAJEUR]
L'auto-brouillon M10 est porteur dans les planches (fermeture = brouillon automatique ; le 426 de P20 et le balayage-bas de P5/P9 s'y adossent), mais AUCUNE tâche des lots ne l'implémente et §F ne le liste pas — un défaut au sens de la clause d'exhaustivité de §F, sur un comportement dont dépend la garantie « aucun contenu composé n'est jamais perdu ».
- **Proposition** : Ajouter une tâche au lot C (fermeture du host ⇒ persistance StoryDraftStore + toast ; réception 426 ⇒ même chemin) ou, si c'est déjà un comportement existant du composer SDK, le dire avec sa source vérifiée dans P10 et le plan.

## MINEURS (13, non vérifiés individuellement — vérifier en appliquant)
- La table comparative §0 du design professe encore la doctrine non-restreinte « rien par défaut — un contrôle n'apparaît que si l'objet courant le rend possible », que la revue totale C3 a précisément corrigée (portée limitée aux contrôles d'objet, AMORCE toujours visible) au §4 et en P1.
  - Prop : Remplacer la cellule §0 par « AMORCE/INSPECTEUR — rien d'inutile : un contrôle d'objet n'apparaît que si… ; les portes de création gardent un domicile (AMORCE) ».
- L'en-tête de la spec référence toujours « planches P1–P17 » alors que les planches sont passées à 21 (P18–P21) — et la spec elle-même cite P18 comme spécification du lot G.
  - Prop : Corriger en « (+ planches P1–P21) ».
- La vignette P12 de la carte Post annonce « CanvasPlayer — autoplay muet, tap = plein écran », alors que le contrat gelé B4 fait naître le mode .card EN PAUSE et que le lot E a consigné la décision inverse (« la carte de POST naît en pause … le mouvement est au tap ») — la réconciliation du lot E ne couvre que P15, pas ce libellé.
  - Prop : Corriger le libellé P12 en « CanvasPlayer — né en pause, muet, tap = plein écran » (et préciser dans P15 que la ligne « autoplay muet » vaut pour les cartes vidéo/réel existantes).
- La cellule P13 du bouton audio pour le format Post ne cite que « CARTE et DÉTAIL », alors que la loi B3.6, §6a et P12 exigent les TROIS surfaces — carte, détail, plein écran.
  - Prop : Compléter la cellule P13 : « bouton sur CARTE, DÉTAIL et PLEIN ÉCRAN (si piste) » — et vérifier que la tâche E2 couvre bien le plein écran post.
- Le mermaid P3 fait entrer TOUTES les portes dans le nœud MeeshyComposer — y compris e2 (feed) et e4 (mood) — alors que P5/C4 routent e2 en v1 vers FeedComposerSheet et que e4 route vers StatusComposerView « v1 ET cible » (S3 : « ou jamais ») ; la légende ne corrige e2 qu'en prose et e4 nulle part.
  - Prop : Faire porter au graphe la vérité de la table : flèches e2/e4 en pointillé vers des nœuds « sheet feed (v1) » / « StatusComposer » ou annotation sur l'arête, comme e3 porte déjà « hors v1 ».
- O12 et la carte P7 affirment que la règle « la surface décide » est écrite « même phrase » jusque dans « les fixtures §C4 », mais aucune fixture de §C4 (minimal-text, story-3-slides, reel-16x9-bands, post-carousel-sound-library, post-sound-original, v1-legacy-full) ne porte de cas collage/sticker-surface — la référence est pendante.
  - Prop : Retirer « les fixtures §C4 » de la phrase O12/P7, ou ajouter réellement une fixture (p. ex. un doc v3 avec sticker posé ≤512 et média collé ≤2048) si le gel doit la porter.
- Le corpus cite « AttachmentMediaSaveResolver.materialize — la cascade du flux Enregistrer : file:// direct → cache typé → téléchargement » (design §6f, spec O13, planche P18) comme point d'entrée de la matérialisation cache-first de la porte e9.
  - Prop : Remplacer « AttachmentMediaSaveResolver.materialize » par « AttachmentMediaSaveResolver.resolveLocalFile(for:) » dans les trois occurrences (2026-08-19-meeshy-composer-design.md §6f, exec-spec O13, planche P18), en gardant la description de la cascade telle quelle.
- O14 / design §6f : le SharePendingPostConsumer sera « décalqué de SharePendingSendConsumer et NSEPendingPostConsumer, appelé aux MÊMES deux points (boot après configure(pool:), retour avant-plan) » — la phrase affirme que les DEUX consumers existants partagent ces deux points d'appel.
  - Prop : Reformuler : « décalqué de SharePendingSendConsumer (boot après configure(pool:) + avant-plan — les deux points que le nouveau consumer reprend) ; NSEPendingPostConsumer partage le point avant-plan et ajoute des points de routage de tap » — ou citer SharePendingSendConsumer seul comme modèle des points d'appel.
- Lot C (Task 2, Step 1) : le test de contraste AA du plateau se fait « à la manière de TextMutedContrastAATests (loi D-18) ».
  - Prop : Corriger la référence en « LentilleTextMutedContrastAATests » dans docs/superpowers/plans/2026-08-20-meeshy-composer-lot-c.md (ligne ~92).
- P20 fig. 3 se contredit dans la même vignette : le libellé in-phone affirme « brouillons ET file migrés one-shot au premier lancement — même table de conversion que le serveur », alors que la légende (et la spec) disent que seule StoryDraftStore migre one-shot, la file étant REPUBLIÉE via l'encodage B7 du nouveau runtime.
  - Prop : Corriger le libellé in-phone : « brouillons migrés one-shot au premier lancement ; la file republie en v3 depuis le nouveau binaire » — ou retirer « ET file » du libellé.
- Deux vignettes dessinent le socle du composer (chip audience + œil + Publier) sur des écrans qui ne sont PAS le composer, contredisant P4 (le socle est un membre du composer) et U18 (pas de plateau/scène ⇒ thème de l'app).
  - Prop : Remplacer ces socles par une tab bar générique ou un bandeau neutre (« l'app ») — le « — » en position Publier montre déjà que le socle n'a rien à faire là.
- Croisement de numérotation : P18 est bien la bonne planche pour le lot G (vérifié : execution-spec:325 « les planches P18 et §6f du design sont sa spécification » ↔ P18 = Entrées externes ; design §6f existe, ligne 486), MAIS l'en-tête de la spec rév. 4 cite encore « (+ planches P1–P17) » — périmé depuis que le deck en compte 21.
  - Prop : Dans la spec, remplacer « (+ planches P1–P17) » par « (+ planches P1–P21) » en ligne 8.
- Mermaid : le diagramme P3 PARSE (vérifié avec mermaid@11.16.0 du dépôt, flowchart-v2, e9/e10 compris), mais e8 n'a pas la classe :::p alors que e9 l'a — les deux portes sont pourtant fixées « P (modifiable) » par la table P5.
  - Prop : Ajouter `:::p` à e8 (ou le retirer d'e9 si l'intention est de ne classer que les quatre portes canoniques e1-e4) — cohérence de codage couleur du mermaid avec la table P5.

## OVERFLOW (4 MAJEURS non vérifiés — vérifier avant d'intégrer)
- Résidu d'ancien état : la planche annonce encore « six lots parallèles » à deux endroits, alors que la spec rév. 4 découpe en sept lots (A–F + G séquencé) plus le lot H Android — et le footer du même fichier dit « lots A–H ».
  - Prop : Remplacer les deux occurrences par « lots A–H (G après C, H lockstep Android) » ou simplement « spec d'exécution 2026-08-20, lots A–H », aligné sur le footer.
- Les deux mockups composer de P18 (profil P) affichent un état AMORCE sans le kind `content`, en contradiction avec l'anatomie P4 et le §4 du design (« Aa · sticker · son · lieu (+ content pour P·R) ») — alors que la même planche dit « URL et texte → content ».
  - Prop : Ajouter l'icône content aux deux rangées AMORCE de P18 (ex. « AMORCE : ¶ · Aa · ☺ · ♫ · 📍 » avec le glyphe dédié P/R de P2), pour que la porte de création du texte principal ait son domicile visible.
- Les couleurs de FORMAT servent encore à peindre des ÉTATS dans la timeline P8 — exactement le résidu que la règle U15, énoncée sur la même planche, interdit (« Couleur de barre = le PLAN... jamais le format »).
  - Prop : Dédier des jetons d'état au CSS des planches (ex. `--state-play:#F87171` déjà utilisé pour l'enregistrement P9, `--kf:` un jaune distinct de --cM, barres de plan = 3 teintes neutres fg/content/bg) et ne garder --cS/--cP/--cR/--cM que pour les chips et le mermaid.
- P21 : le compte (18), l'ordre (allCases : 11 historiques puis 7 en queue) et la correspondance 1:1 des noms sont EXACTS vs `StoryTextStyle`, mais plusieurs spécimens travestissent la police réelle du résolveur — trois familles réelles sont même permutées entre elles.
  - Prop : Rapprocher chaque spécimen de sa police iOS réelle (machine → Courier/monospace ; rétro → 'American Typewriter' ; note → cursive craie type Noteworthy ; pinceau → cursive marqueur type Bradley Hand ; futuriste → condensé très gras ; tag → feutre large), en citant le nom PostScript réel dans chaque carte comme le lot F l'exige déjà pour le web.

## Et ensuite (déjà annoncé au porteur)
- Planches P22 (iconographie SF Symbols par outil/sous-contrôle), P23 (éditeurs
  trim·crop·cut audio/image/vidéo), P24 (cas d'usage carrousels & réels avec
  audio, incl. cas « aucune piste ⇒ rien ») — décisions prises, écriture HTML.
- Republier l'artefact après chaque vague ; cycle Fable final sur la vague O17+P22-24.
