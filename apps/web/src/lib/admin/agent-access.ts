import { canEnterAdmin, visibleAdminSections, type AdminPermissions } from './sections';

/**
 * **PUIS-JE PILOTER L'AGENT ?** (#6733) — la décision d'un écran atteint par un
 * lien profond, écrite une fois et mesurable sans monter React.
 *
 * ## Pourquoi une fonction, et pas trois ternaires dans l'écran
 *
 * L'écran routé lit `apiDeps` au niveau du module : une décision écrite dans
 * son corps n'est mesurable que par un gate au navigateur, et une garde qu'on
 * ne peut mesurer qu'en construisant un `dist` n'est jamais mesurée dans la
 * boucle courte. Ici la loi est pure — elle prend une matrice et un rôle, elle
 * rend un verdict.
 *
 * ## Les DEUX visages du refus, qu'il serait malhonnête de confondre
 *
 * `refus` — rien à faire ici. `espace-sans-droit` — le droit d'ÊTRE là sans le
 * droit de lire CECI : c'est le cas d'un MODERATOR ou d'un AUDIT, qui portent
 * `canAccessAdmin` et à qui la matrice centrale refuse `canManageAgent`. Leur
 * servir « espace réservé » leur ferait croire qu'ils se sont trompés de
 * porte, alors qu'ils sont bien chez eux — dans une pièce qui ne leur est pas
 * ouverte.
 *
 * ## `attente` n'est pas un refus
 *
 * Tant que la matrice n'est pas là, l'écran ATTEND. Rendre le refus d'abord
 * ferait clignoter une accusation à chaque ouverture, chez quelqu'un qui a
 * parfaitement le droit d'être là. Mais une matrice ABSENTE une fois la
 * requête FINIE est un refus — fail-closed : une garde qui s'ouvre quand la
 * réponse manque n'est pas une garde.
 */
export type AgentAccess = 'attente' | 'ouvert' | 'espace-sans-droit' | 'refus';

export function agentAccess(input: {
  readonly permissions: AdminPermissions | null;
  /** Le rôle **servi** par `GET /me/permissions`, jamais déduit de la session. */
  readonly role: string | null | undefined;
  readonly chargement: boolean;
}): AgentAccess {
  if (input.chargement) return 'attente';

  // `visibleAdminSections` porte déjà la hiérarchie « l'espace précède ses
  // pièces » et la lecture de la permission : la rejouer ici en ferait une
  // jumelle, qui divergerait au premier lot qui ne relit qu'une des deux.
  const ouvert = visibleAdminSections(input.permissions, input.role).some((section) => section.id === 'agent');
  if (ouvert) return 'ouvert';

  return canEnterAdmin(input.permissions) ? 'espace-sans-droit' : 'refus';
}
