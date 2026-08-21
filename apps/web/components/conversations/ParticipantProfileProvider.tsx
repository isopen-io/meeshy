'use client';

import { useCallback, useState } from 'react';
import { ParticipantProfileDialog } from './ParticipantProfileDialog';
import { ParticipantProfileContext } from './participant-profile-context';
import { useParticipantRightsSync } from '@/hooks/queries/use-participant-rights-sync';

interface ParticipantProfileProviderProps {
  readonly conversationId: string;
  readonly children: React.ReactNode;
}

/**
 * Monte l'unique fiche de la conversation et publie son ouverture.
 *
 * Le contexte et son hook vivent dans `participant-profile-context.tsx` — les
 * feuilles consommatrices ne doivent pas dépendre du dialogue.
 */
export function ParticipantProfileProvider({
  conversationId,
  children,
}: ParticipantProfileProviderProps) {
  const [participantId, setParticipantId] = useState<string | null>(null);

  // L'écoute vit ici, pas dans le dialogue : le VISITEUR concerné n'ouvre pas
  // sa propre fiche, et c'est pourtant lui que la décision contraint. Montée au
  // niveau de la conversation, elle le suit tant qu'il y est.
  useParticipantRightsSync(conversationId);

  /**
   * Le dialogue n'est monté qu'à partir de la PREMIÈRE ouverture, et le reste
   * ensuite. Les deux moitiés comptent :
   *
   * - le monter d'emblée ferait tourner `useParticipantProfile` — donc
   *   `useQuery` — dans toute conversation affichée, y compris celles où
   *   personne n'ouvrira jamais de fiche. Ce n'est pas qu'un coût : cela impose
   *   un `QueryClientProvider` à tout ce qui rend une conversation, ses tests
   *   compris, pour une requête qui reste désactivée ;
   * - le démonter à la fermeture couperait l'animation de sortie de Radix, qui
   *   a besoin de survivre à `open = false`.
   */
  const [everOpened, setEverOpened] = useState(false);

  // Stable : aucune feuille consommatrice ne se re-rend quand la fiche s'ouvre
  // ou se ferme.
  const open = useCallback((id: string) => {
    setEverOpened(true);
    setParticipantId(id);
  }, []);
  const close = useCallback(() => setParticipantId(null), []);

  return (
    <ParticipantProfileContext.Provider value={open}>
      {children}
      {everOpened && (
        <ParticipantProfileDialog
          conversationId={conversationId}
          participantId={participantId}
          onClose={close}
        />
      )}
    </ParticipantProfileContext.Provider>
  );
}
