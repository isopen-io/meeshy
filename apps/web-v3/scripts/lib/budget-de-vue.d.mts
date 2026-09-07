import type { PorteurDeGroupe } from './routes-emises.mjs';

export type BudgetsAvecGroupes = {
  readonly groupes?: readonly PorteurDeGroupe[];
};

export declare const motifsDuRolePremier: (budgets: BudgetsAvecGroupes | null | undefined) => readonly string[];

export declare const estRolePremier: (
  route: string,
  budgets: BudgetsAvecGroupes | null | undefined,
) => boolean;
