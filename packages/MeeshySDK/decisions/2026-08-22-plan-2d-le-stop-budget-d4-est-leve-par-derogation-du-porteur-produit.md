## 2026-08-22 : Plan 2D — le STOP budget D4 est levé par DÉROGATION du porteur produit, la virtualisation restant le gage

**Décision.** Le porteur produit accorde, le 2026-08-21, la dérogation au critère de sortie
D4 Step 2 du lot D (`docs/superpowers/plans/2026-08-20-meeshy-composer-lot-d.md`), et autorise
le merge du lot. Cette entrée EST l'artefact que la ligne 117 de ce plan exigeait ; aucune tâche
d'implémentation ne l'a produite, et aucune ne le pouvait.

**Ce qui est mesuré, et ce qui ne l'est pas.** La spec exigeait une mesure de rendu du plan 2D
sur appareil **plancher A11** (iPhone 8 / SE 2, `design.md:663-664`). Elle n'a pas été obtenue :
aucun appareil A11 n'est apparié à cet environnement, et le blocage est structurel pour le scheme
SPM nu — `Tool-hosted testing is unavailable on device destinations`, or héberger le banc
exigerait un target d'app Xcode, que le périmètre du lot D interdit. La seule mesure device
réelle est un **plafond** : iPhone 16 Pro Max / A18 Pro, **2,0 ms par passe** en moyenne
(1,62–2,53 ms, RSD 17 %, 5 itérations), 30 pistes aux deux zooms. Extrapolée au plancher par
ratio Geekbench 6 single-core publié (A18 Pro/A11 ≈ ×3,16), la marge estimée reste **≈ ×2,1 à
×2,65** sous la frame 60 Hz — extrapolation **CPU seule, NON mesurée et optimiste** : elle ne
capture ni le GPU ni la bande mémoire du plancher.

**Pourquoi accorder plutôt que bloquer.** Le coût d'attente est certain (le lot D gate-vert
bloque D → E → C, toute la chaîne de merge du chantier) ; le risque couvert est hypothétique et
borné. Il est borné par construction : le schéma v3 plafonne à 60 objets par scène, donc ≤ ~60
pistes dessinées en UN passe `Canvas` — le banc mesure déjà la moitié de ce pire cas, et le coût
est linéaire en pistes. Une marge de ×2 sur une extrapolation optimiste reste une marge.

**Le gage, qui est la contrepartie de la dérogation** : si une saccade est observée au scrub sur
un appareil ancien, **la virtualisation du plan — déscopée en D2 avec justification — devient le
PREMIER CHANTIER, pas une dérogation silencieuse.** C'est ce qui rend la dérogation acceptable :
elle ne referme pas le sujet, elle en diffère la mesure en nommant d'avance le correctif.

**Alternatives rejetées** :
- *Attendre un appareil A11.* Aucun n'est apparié, aucune date ne peut être promise, et le
  blocage `Tool-hosted testing` resterait à lever séparément. Bloquer une chaîne de merge entière
  sur une échéance inconnue coûte plus que le risque.
- *Recalibrer le seuil du banc sur la mesure A18 et déclarer le budget tenu.* C'est le piège que
  la revue DoD a précisément refusé : un chiffre plafond maquillé en chiffre plancher. Le seuil
  du banc reste un garde-fou de RÉGRESSION, jamais une preuve de budget.
- *Mesurer au simulateur.* Le plan l'interdit mot pour mot — « le lot NE MERGE PAS sur un chiffre
  simulateur » — et il a raison : le simulateur mesure le Mac, pas le plancher.

**Cons** : le budget du plancher A11 reste **non mesuré** à la date de cette entrée. La ligne P0
D4 et l'en-tête de `Plan2DRenderMeasureTests.swift` doivent continuer de dire « plafond A18 » et
jamais « mesuré sur A11 » — la dérogation lève le STOP de merge, elle ne transforme pas une
extrapolation en mesure.
