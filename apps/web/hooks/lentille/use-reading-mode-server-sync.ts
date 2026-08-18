'use client';

/**
 * `useReadingModeServerSync` — D-4 / R5-6, point 3(a) du mandat.
 *
 * Au chargement d'un fil, LA PRÉFÉRENCE SERVEUR (si présente) PRIME sur le
 * repli local scopé. LE CONTRAT QUI LE DIT : `applyReadingModeUpdate`
 * (`stores/reading-mode-preference-store.ts`) — « un payload de version
 * INFÉRIEURE OU ÉGALE à la version locale est ignoré ». Un magasin local
 * jamais touché pour cette conversation reste à sa version par défaut (`0`,
 * `ReadingModePreferenceState`, ou `0` posé par `seedEntries` pour tout
 * héritage purement local) — il perd donc TOUJOURS face à un `version >= 1`
 * posé par n'importe quel écrivain serveur. « Le serveur prime » n'est pas
 * un `if` ajouté ici : c'est la conséquence directe de l'arbitrage de
 * version qui existait déjà, ici simplement NOURRI par une lecture GET en
 * plus du broadcast socket (`lib/conversations/reading-mode-broadcast.ts`,
 * point 3(c) du même mandat) — LE MÊME point d'entrée, deux sources.
 *
 * Gardé par le drapeau web du fil (`useReadingModesFlag`, WF-110) :
 * sans lui, personne ne lit ce magasin pour CE fil (`use-thread-reading-
 * mode.ts` n'est consulté que dans la branche drapeau-ON du mux), donc
 * fetcher la préférence serveur serait un appel réseau sans lecteur.
 *
 * Gardé aussi par l'identité : seul un compte INSCRIT a une ligne
 * `UserConversationPreferences` (la route exige `fastify.authenticate`,
 * `services/gateway/src/routes/conversation-preferences.ts` — AUCUNE route
 * pour les comptes anonymes, D-4 point 4). Pré-vérifié ici plutôt que laissé
 * échouer en 401 : `resolveReadingModeIdentityScope().kind !== 'registered'`
 * ⇒ pas d'appel du tout, exactement ce que le mandat demande (« ne fabrique
 * pas d'appel »).
 *
 * Échec RÉSEAU (hors-ligne, 500) : silencieux, comme l'écriture (D-4/G-121,
 * `setReadingMode`). Le repli local scopé reste la vérité tant que le
 * serveur ne répond pas — aucune UI d'erreur, ce n'est pas une action de
 * l'utilisateur.
 *
 * @see apps/web/stores/reading-mode-preference-store.ts (`applyReadingModeUpdate`, `resolveReadingModeIdentityScope`)
 * @see apps/web/services/reading-mode-sync.service.ts (`fetchServerReadingModePreference`)
 */
import { useEffect } from 'react';
import { fetchServerReadingModePreference } from '@/services/reading-mode-sync.service';
import {
  useReadingModePreferenceStore,
  resolveReadingModeIdentityScope,
} from '@/stores/reading-mode-preference-store';
import { useReadingModesFlag } from './use-reading-modes-flag';

export function useReadingModeServerSync(conversationId: string | undefined): void {
  const { active: isReadingModesFlagActive } = useReadingModesFlag();

  useEffect(() => {
    if (!isReadingModesFlagActive || !conversationId) return;
    if (resolveReadingModeIdentityScope().kind !== 'registered') return;

    let cancelled = false;

    fetchServerReadingModePreference(conversationId)
      .then((server) => {
        if (cancelled || !server) return;
        useReadingModePreferenceStore
          .getState()
          .applyReadingModeUpdate(conversationId, server.value, server.version);
      })
      .catch(() => {
        // Silencieux par politique — voir docstring de fichier.
      });

    return () => {
      cancelled = true;
    };
  }, [isReadingModesFlagActive, conversationId]);
}
