# Banc de mesure de la traduction (#3662)

Mesure un moteur de traduction de texte sur un jeu doré : chrF et COMET par direction
de langue, latence p50 / p95 sur messages courts (≤ 160 caractères) et sur paragraphes
(≥ 400 caractères), échecs du moteur. Le job `translation-benchmark.yml` le lance chaque
nuit sur NLLB-200 600M, et refuse une régression face à `baselines/<modèle>.json`.

NLLB y génère avec les bornes de la production (`utils/generation_guard.py`, #9309) :
budget de jetons proportionnel à la source, arrêt quand la sortie boucle. Pour que
l'emballement se voie, chaque direction rapporte aussi la sortie la plus longue (en
caractères), le plus grand ratio sortie/source, et le nombre de segments arrêtés au
budget ou sur une boucle (`—` pour un moteur qui ne le dit pas).

## Jeux dorés

- **FLORES-200 devtest** : téléchargé par le job, jamais committé (CC-BY-SA 4.0). Chaque
  langue est mesurée dans les deux sens contre les pivots `fr` et `en`, avec des phrases
  réparties dans le fichier et un paragraphe de quatre phrases consécutives.
- **`golden/meeshy-chat.jsonl`** : messages de conversation fr↔en, le registre que FLORES
  (Wikipédia) ne couvre pas. Rédigés à la main, à relire par un locuteur natif.

Les langues camerounaises (`bas`, `byv`, `dua`, `ewo`, `fan`, `ksf`, `nnh`) n'ont pas de
code FLORES-200 : le banc les refuse par leur nom plutôt que d'inventer une référence.
Leur jeu doré dépend de locuteurs (#9269).

## Mesurer un candidat

Un candidat servi par un serveur compatible OpenAI se mesure avec le même code sur CPU
(`llama-server` de llama.cpp, modèle GGUF) et sur GPU (vLLM) :

```bash
llama-server -m translategemma-4b-it-Q4_K_M.gguf --port 8080
cd services/translator/src
python -m benchmark run --engine openai --model translategemma-4b \
  --base-url http://localhost:8080 \
  --golden benchmark/golden/meeshy-chat.jsonl \
  --flores-dir ~/flores200_dataset --languages fr,en,sw,ha,yo \
  --out /tmp/candidat.json --markdown /tmp/candidat.md
python -m benchmark gate --current /tmp/candidat.json \
  --baseline benchmark/baselines/nllb-200-distilled-600M.json
```

Le prompt de `engines.translation_prompt` est générique : vérifier, avant de conclure sur
un modèle, qu'il suit le format recommandé par sa carte.

## Référence

`baselines/` reçoit le rapport JSON d'une nuit jugée saine. Sans référence, la porte
s'annonce non appliquée et passe.

Le job imprime ce rapport dans son journal, dans le bloc replié
« report.json » de l'étape « Mesurer » : c'est de là qu'on le recopie. La qualité est
déterministe (décodage glouton), donc une référence ne bouge que si le modèle, le jeu
ou le code changent. La latence varie d'une machine partagée à l'autre et la porte ne
la garde pas par défaut.

`nllb-200-distilled-600M.json` vient du passage 37194080600 (2026-10-04, runner CPU à
4 vCPU).
