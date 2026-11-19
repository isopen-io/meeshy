/**
 * Une sonde de dépendance qui répond dans un délai BORNÉ : sa réponse, ou
 * `false` si elle lève ou se tait au-delà de `timeoutMs` (#19280). `/health`
 * décide si Traefik route vers la passerelle ; une dépendance qui ne répond
 * plus (le traducteur, joint par un PUSH ZMQ sans délai d'envoi) s'y lit
 * « down », jamais comme une sonde qui ne revient pas.
 */
export const boundedProbe = (probe: () => Promise<boolean>, timeoutMs: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const settle = (healthy: boolean): void => {
      clearTimeout(timer);
      resolve(healthy);
    };
    Promise.resolve()
      .then(probe)
      .then((healthy) => settle(healthy === true), () => settle(false));
  });
