"""Banc de mesure de la traduction de texte (#3662).

Mesure un moteur de traduction sur un jeu doré : chrF (et COMET quand il est
installé) par direction de langue, latence p50 / p95 sur messages courts et
paragraphes d'environ 500 caractères, puis compare le rapport à une référence
pour refuser une régression. C'est la porte de la migration hors de NLLB-200
(#9268) : aucun modèle ne bascule sans avoir passé ce banc.
"""
