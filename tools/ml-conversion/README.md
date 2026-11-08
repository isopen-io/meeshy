# Conversion ML et clonage vocal (outillage hors build)

Scripts d'exploration (conversion NLLB / OpenVoice vers Core ML ou ONNX, bancs de clonage vocal Chatterbox / XTTS) sortis de `apps/ios/scripts` (#16907). Aucun workflow, aucune lane fastlane ni `meeshy.sh` ne les appelle : l'app iOS n'embarque aucun de ces modèles. La sortie générée (`voice_cloning_output/`) est ignorée par git.
