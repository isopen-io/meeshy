import type { SharedLocationState } from './sharedLocationStore';

/**
 * Le NOM d'un partage est son `startedAt` : une confirmation « Montrer ta position réelle ? » nomme le partage montré.
 * Le `startedAt` d'un démarrage qui remplace `prior` : jamais égal ni antérieur au sien, pour que deux démarrages dans
 * la même milliseconde ne portent pas le même nom (#20249).
 */
export const startedAfter = (now: number, prior: SharedLocationState | null): string => {
  const floor = prior?.startedAt === undefined ? Number.NaN : Date.parse(prior.startedAt) + 1;
  return new Date(Number.isNaN(floor) ? now : Math.max(now, floor)).toISOString();
};

/** Le partage servi est-il celui que le démarrage nomme ? Sans nom, oui (anciens clients). */
export const isNamedStart = (expected: string | undefined, served: SharedLocationState | null): boolean =>
  expected === undefined || (served?.startedAt !== undefined && Date.parse(served.startedAt) === Date.parse(expected));
