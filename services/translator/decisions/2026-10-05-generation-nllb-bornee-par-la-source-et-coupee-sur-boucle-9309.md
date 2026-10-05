## 2026-10-05 : Génération NLLB bornée par la source et coupée sur boucle (#9309)

**Statut** : Accepté

**Contexte** : le premier passage du banc (#9284, run 37192319784, NLLB-200 600M, CPU 4 vCPU) mesure, sur les messages courts (≤ 160 caractères), un p95 de 19 à 20 s pour un p50 de 2 à 3 s en fr→ff, en→ff et en→wo. La production générait en glouton avec `max_length=256` fixe (`translator_engine.py` → `Seq2SeqTranslator`), sous le verrou du modèle : une génération qui boucle court jusqu'à 256 jetons (~75 ms par jeton sur ce CPU) et bloque toute traduction en file derrière elle.

**Décision** : un seul site, `src/utils/generation_guard.py`, consommé par la production (`Seq2SeqTranslator.__call__`) ET par le banc (`benchmark/engines.NllbTranslator`), pour que le banc mesure ce que la production fait.

1. **Budget proportionnel à la source** : `max_new_tokens = min(plafond, max(16, ⌈2,5 × jetons_source + 10⌉))`, `jetons_source` comptant le code de langue et `</s>` (somme du masque d'attention ; en lot, la source la plus longue). Le `max_length` des appelants (256) n'est plus qu'un plafond. Mesure sur FLORES-200 devtest, 20 langues (les dix du banc + am, zu, ig, es, de, zh, ja, ru, hi, ko), 380 ordres de paires × 1 012 phrases = 384 560 couples source/référence, jetons du tokenizer NLLB :
   | a × source + b | références plus longues que le budget |
   |---|---|
   | 1,5 × + 10 | 1 884 |
   | 2,0 × + 10 | 121 |
   | 2,0 × + 16 | 44 |
   | **2,5 × + 10** | **7** (dont 4 sur les lignes 480–481 du peul, une source de 14–30 jetons face à des références de 50–116 : un désalignement du jeu, pas une traduction) |
   | 3,0 × + 10 | 1 |
   Un message court (≤ 160 caractères) compte au plus 58 jetons en peul : son budget passe de 256 à 155 au pire, à 40 pour une source de 12 jetons.
2. **Arrêt sur boucle** : critère d'arrêt `RepetitionLoopStop` — une ligne s'arrête dès que sa queue répète **4 fois de suite** le même bloc de 1 à **16** jetons ; avant décodage, la boucle ne garde qu'une copie de son bloc. Faux positifs mesurés sur les mêmes références FLORES (≤ 200 caractères, la taille d'un morceau de production) : **0 sur 18 668** avec 4 copies, 1 avec 3 copies (« n’uwa n’uwa n’uwa », igbo).
3. Toute génération coupée (budget atteint ou boucle) se journalise en `WARNING` « génération coupée (#9309) » ; le banc compte par direction les segments arrêtés au budget, ceux arrêtés sur boucle, la sortie la plus longue et le plus grand ratio sortie/source (en caractères).

**Alternatives rejetées** :
- `no_repeat_ngram_size` : il interdit TOUTE répétition d'un n-gramme, légitime comprise. Sur les références FLORES (≤ 200 caractères), il en rend inatteignables 5,2 % à n = 4 (yoruba 12,4 %, amharique 9,1 %, arabe 8,0 %) et 2,2 % à n = 5 (amharique 5,1 %) — un coût de qualité certain pour couper un défaut rare.
- `repetition_penalty` : pénalise chaque jeton déjà émis, ponctuation et mots-outils compris ; même défaut, sans borne mesurable a priori.
- Baisser le plafond fixe (128) : ne protège pas les sources courtes et tronque les longues.

**Conséquences** : le modèle, le contrat ZMQ et l'API ne changent pas ; le décodage reste glouton et déterministe. Ce qui n'a pas pu être mesuré localement (poids du modèle absents de la machine de développement) se lit sur le banc nocturne : p95 court par direction (critère : < 3 × p50) et chrF/COMET dans les tolérances de la porte. Une boucle de période > 16 jetons ou non périodique n'est arrêtée que par le budget.
