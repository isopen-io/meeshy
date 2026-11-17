# `e2ee-signal/` — le signal chiffré d'une conversation e2ee (#13142, #18940)

`signal.vectors.json` fixe, à l'octet près, le JSON qu'un appareil chiffre pour un SIGNAL (réaction, frappe, accusé,
progression de lecture, modification, suppression pour tous, vue unique ouverte, épinglage) : version sous la clé `s`
(jamais `v`, pour qu'un client antérieur ne le lise pas comme un message), conversation REQUISE, auteur obligatoire pour
être admis, une action inconnue reconnue et jamais appliquée.

Même forme, mêmes verdicts et même rejeu que le contenu d'un message : voir `../e2ee-content/README.md`.
Source TS : `packages/shared/types/e2ee-content.ts` ; référence Swift : `packages/MeeshySDK/Sources/MeeshyE2EE/E2EESignal.swift`.
