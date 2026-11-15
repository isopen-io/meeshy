## 2026-07-12 — Lire le code d'émission AVANT de qualifier une donnée de prod d'anomalie

**Contexte** : le pipeline analytics live révélait 3 « anomalies » dans les données prod
(endReason="in_progress", averageRtt=0.489ms, durationSeconds float). J'ai d'abord documenté
les 3 comme des bugs d'émission iOS. Après lecture du code d'émission (CallManager:3182-3239,
WebRTCTypes:232), **2 sur 3 étaient du comportement CORRECT** :
- `in_progress` = snapshot périodique 60s délibéré (anti-perte de télémétrie sur appel long
  killé mid-call), pas un statut qui « leake ».
- `averageRtt` bas = conversion `*1000` correcte + quirk des stats WebRTC, pas un bug de code.

**Règle** :
- Une donnée qui « semble » anormale n'est pas une anomalie tant qu'on n'a pas lu le code qui
  la produit. Avant de documenter un « bug » à partir de données observées, ouvrir le site
  d'émission et vérifier l'intention.
- Un faux rapport de bug coûte plus cher qu'un silence : il envoie l'équipe chasser un
  comportement voulu. Corriger publiquement un finding erroné dès qu'on le découvre.
- L'accuracy prime sur le volume : 1 insight actionnable vérifié (ici : ~20% des appels
  répondables échouent réellement) vaut mieux que 3 « anomalies » dont 2 fausses.
