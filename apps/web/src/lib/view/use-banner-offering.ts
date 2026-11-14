import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { claimChest } from '@/lib/api/game';
import { appQueryClient } from '@/lib/api/query-client';
import { createOfferingOpener, type BannerOffering } from './banner-offering';

/** Le temps pendant lequel le gain d'une Offrande ouverte reste dit sur le bandeau. */
export const OFFERING_REWARD_MS = 4000;

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

/**
 * L'OFFRANDE DU BANDEAU, BRANCHÉE (#18199) — l'ouvreur (`createOfferingOpener`) sur le cache de l'application et la
 * passerelle, et le gain annoncé `OFFERING_REWARD_MS`, puis retiré. Un refus ne dit rien ici : la pièce revient d'elle-même,
 * puisque le cache restauré la redit prête.
 */
export function useBannerOffering(schedule: (run: () => void, ms: number) => () => void = defaultSchedule): BannerOffering {
  const [reward, setReward] = useState<number | null>(null);
  const opener = useMemo(
    () => createOfferingOpener({ client: appQueryClient, claim: (requestId) => claimChest(apiDeps.transport, requestId), newId: newClientMessageId }),
    [],
  );
  const stop = useRef<() => void>(() => undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current();
    };
  }, []);
  const open = useCallback(() => {
    void opener.open().then((outcome) => {
      if (outcome.kind !== 'opened' || !mounted.current) return;
      stop.current();
      setReward(outcome.points);
      stop.current = schedule(() => setReward(null), OFFERING_REWARD_MS);
    });
  }, [opener, schedule]);
  return useMemo(() => ({ open, reward }), [open, reward]);
}
