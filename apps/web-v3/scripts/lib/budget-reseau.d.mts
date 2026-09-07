import type { PorteurDeGroupe } from './routes-emises.mjs';

export type CleDeBudget = 'role-premier' | 'defaut';

export declare const GROUPE_ROLE_PREMIER: '(public)';

export declare const pathnameDeRoute: (route: string) => string;

export declare const cleDeBudget: (
  route: string,
  groupes: readonly PorteurDeGroupe[],
) => CleDeBudget;
