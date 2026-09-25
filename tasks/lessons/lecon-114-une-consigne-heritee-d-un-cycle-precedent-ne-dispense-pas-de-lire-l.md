## Leçon 114 — une consigne héritée d'un cycle précédent ne dispense pas de lire l'en-tête du fichier qu'elle prescrit de changer (2026-08-12, routine messaging, cycle 81)

Le cycle 80 léguait une action nommée et argumentée : « ajouter un trigger `pull_request` restreint
aux chemins `apps/ios/**` » pour que la routine cesse de merger du Swift non compilé. L'appliquer
aurait annulé une décision **délibérée, datée et mesurée** — l'en-tête d'`ios-tests.yml` documente
son retrait au 2026-07-27 sur les runs #3728-#3741 : le trigger PR ajoutait 24-49 min de pure
attente de runner et ralentissait la suite **pour `dev` et `main` aussi**.

1. **Une prescription héritée est une hypothèse, pas un mandat.** Elle a été écrite par un cycle qui
   n'avait pas le fichier sous les yeux. Le fichier, lui, porte souvent la contre-mesure.
2. **Chercher la trace de décision AVANT de l'annuler**, et la chercher là où elle vit : l'en-tête du
   workflow, pas seulement `decisions.md`. Ici le paragraphe s'appelait littéralement
   « TRIGGER SCOPE (2026-07-27, measured on runs #3728-#3741) ».
3. **Le bon livrable, quand la prescription tombe, est la tête du cycle suivant** — les deux portes
   restantes (`macos-15-xlarge`, nommé « the RIGHT fix » par le fichier lui-même ; ou `actions: write`),
   avec la question qui les relie peut-être en une seule. Pas un revert silencieux, pas un abandon.
4. Corollaire du cycle 80 (fiche gwcontract-11) sous un autre angle : **le dépôt est une source, pas
   seulement un registre.** Au 80 il contenait déjà le correctif à écrire ; au 81 il contenait déjà la
   raison de ne pas écrire celui qu'on prescrivait.
