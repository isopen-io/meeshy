## Ne jamais commiter pendant qu'une QA mute l'arbre de travail

**Contexte** : cycle 42 de la routine d'appels (#19471). Pendant que l'agent `auditeur-adversarial` mutait `voice_api.py` dans l'arbre de travail partagé, l'orchestrateur a lancé un `git commit` d'étape. Le commit `3654628f` a capturé un mutant, « Job not yours », qui rouvrait l'oracle d'existence que le lot fermait, et il a été poussé.

**Règle** :
- Tant qu'un sous-agent qui mute le code tourne sur l'arbre partagé, aucun `git add` ni `git commit` ne part.
- Avant tout commit qui suit une QA, comparer le fichier source à la version validée (`cmp`) et relancer les témoins.
- À défaut, isoler la QA dans un worktree.
