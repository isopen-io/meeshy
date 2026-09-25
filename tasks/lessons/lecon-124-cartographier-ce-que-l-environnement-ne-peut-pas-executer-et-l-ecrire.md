## Leçon 124 — cartographier ce que l'environnement NE PEUT PAS exécuter, et l'écrire dans la tête de cycle (2026-08-12, routine messaging, cycle 88)

**Contexte.** Trois cycles de suite (86, 87, 88) ont buté sur l'absence de toolchain Swift pour les
242 « source guards » iOS. Le cycle 88 a découvert une seconde zone morte : les tests du translator
sont incollectables parce que `numpy`/`torch` s'installent depuis l'index PyTorch, **bloqué par le
proxy** — quatre tentatives d'installation (pip système, pip du venv `uv`, `uv pip`) avant de le
constater.

**La leçon.** Une zone non exécutable n'est pas un échec ponctuel, c'est une **propriété stable de
l'environnement**. Ne pas la consigner condamne chaque cycle suivant à la redécouvrir au prix de
plusieurs minutes et d'un faux espoir. La tête de cycle porte désormais un tableau explicite
(iOS ✗, translator ✗, gateway/web ✓ + prérequis d'installation).

**Corollaire sur ce qu'on livre quand même.** L'impossibilité de tester n'interdit pas de corriger —
elle change le standard de preuve. Le retrait du doublon audio du translator a été livré parce que
sa sûreté est établie par **lecture des deux côtés du contrat** (producteur, et consommateur
`extractAudioBinaryFrames` qui résout par index borné), pas parce qu'on l'espérait sans risque. Ce
qui est dû dans ce cas, c'est de l'ÉCRIRE : le commit et le dossier de cycle disent tous deux que ce
correctif-là n'est pas couvert par un test vert. Un correctif non testé qui se présente comme testé
est le vrai défaut.

---
