# Cycle 57 — le troisième réglage de police, réglable partout et appliqué nulle part

## La piste

- [x] Piste n°5 du cycle 56-bis : « `slowModeSeconds`, réglage de conteneur que
      personne n'applique » — la DERNIÈRE des trois colonnes « WRITE
      PERMISSIONS » à n'avoir aucun exécuteur

## Le constat

- [x] `Conversation.slowModeSeconds` est complet de bout en bout SAUF son
      application : schéma Prisma (`@default(0)`), schéma d'API documenté,
      `PUT /conversations/:id` qui l'écrit, `conversation:updated` qui le
      diffuse, modèles iOS qui le décodent, et un `Picker` iOS qui le RÈGLE
      (`ConversationSettingsView`)
- [x] Zéro lecteur de production côté serveur — un modérateur règle « 30 s »,
      l'écran le confirme, et rien ne ralentit personne
- [x] L'en-tête du module d'admission déclarait la règle hors de portée : elle
      « demande un état *dernier envoi par personne* qui n'existe nulle part ».
      Cet état existe — c'est la table `Message` elle-même, indexée
      `[senderId, conversationId]`

## Correctif — la règle rejoint ses deux sœurs, au même point de convergence

- [x] `slowModeSeconds` entre dans `ConversationWriteStateRow`, dans le `select`
      de `admitConversationWrite` ET dans `SHARE_LINK_CONVERSATION_SELECT`
- [x] Nouveau refus `'slow-mode-active'` PORTEUR de `retryAfterSeconds` — un
      « pas encore » que le client peut décompter, pas un « jamais »
- [x] Fenêtre bornée à la lecture : `createdAt > now - slowMode` filtre AVANT le
      tri, donc l'ensemble trié est minuscule — aucun index neuf
- [x] Seuls les messages `messageSource: 'user'` comptent : les résumés d'appel
      sont attribués au participant de l'initiateur (`CallService`), et
      raccrocher ne doit pas faire taire
- [x] Dispense de rang ⇒ dispense de débit (`WRITE_HIERARCHY_FREE_TYPES`) : le
      contournement du mode lent est une HIÉRARCHIE, et un tête-à-tête n'en a
      pas. Guérit les tête-à-tête déjà empoisonnés, comme au cycle 56-bis
- [x] `moderator` et au-delà contournent ; le staff plateforme aussi
- [x] UNE seule lecture de participant, partagée par les deux règles
- [x] Valeur négative (le schéma n'a AUCUNE borne) normalisée en « désactivé »
- [x] `conversationId` devient un paramètre EXIGÉ de `admitConversationWriteFor`
      — le compilateur prouve que les deux chemins de lien portent la garde

## Gates

- [x] Suite gateway complète sous bun (parité CI)
- [x] `prisma generate` + `packages/shared` construits avant campagne
- [x] Preuve par mutation dans les deux sens
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG + journal de cycle + leçon

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle57.md` — pourquoi une note de
conception a protégé une fonctionnalité morte pendant deux cycles, le tableau des
sept étages où `slowModeSeconds` était complet, et les onze pistes du cycle 58.

Gates constatés : **740 suites / 17 969 témoins verts** (+32 sur la baseline du
cycle 56-bis), `tsc --noEmit` à 0 erreur sur tout le gateway,
`conversationWriteAdmission.ts` à **100 %** (lignes, branches, fonctions,
instructions), 32 témoins neufs, **10 mutations** (5 sous-dosages, 5 sur-dosages)
toutes rouges comme attendu — dont une que le typage structurel du lecteur rend
impossible à écrire.

### Deux gestes non prévus au plan, et pourquoi

- **`describeConversationWriteRefusal`** — les trois sites de refus portaient un
  `if/else` BINAIRE sur `reason`, en deux dialectes. Cette forme range tout refus
  ajouté dans sa branche par défaut : elle aurait annoncé le mode lent, un « pas
  encore », avec les mots d'un « jamais ». Le `switch` exhaustif rend la prochaine
  addition visible.
- **La suppression du garde `remaining > 0`** — la fenêtre étant bornée dans le
  `where`, ce garde reposait le même calcul et formait une branche inatteignable.
  C'est le trou de couverture qui l'a nommée, pas une relecture.
