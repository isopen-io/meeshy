import { describe, expect, test } from 'bun:test';

import { agentAccess } from './agent-access';
import type { AdminPermissions } from './sections';

/**
 * **LES QUATRE RÉPONSES À « PUIS-JE PILOTER L'AGENT ? »** (#6733).
 *
 * Un écran d'administration atteint par un lien profond doit LIRE son droit,
 * jamais l'hériter de l'étage du dessus — une garde posée seulement sur le hub
 * ne garde que l'escalier. Et le refus a DEUX visages qu'il serait malhonnête
 * de confondre :
 *
 * | réponse | qui la reçoit |
 * |---|---|
 * | `attente` | la matrice n'est pas encore là — jamais un refus, qui clignoterait comme une accusation à chaque ouverture |
 * | `ouvert` | porteur de `canManageAgent` |
 * | `espace-sans-droit` | il a le droit d'ÊTRE là, pas celui de lire CECI (MODERATOR, AUDIT) |
 * | `refus` | rien à faire ici |
 *
 * **MODERATOR est le rang où `canAccessAdmin` et `canManageAgent` divergent** :
 * c'est là, et nulle part ailleurs, qu'un témoin sur ce droit peut tomber
 * (leçon 261 — un témoin de rang s'écrit sur un rang AUTRE que celui où les
 * deux règles s'accordent).
 */

const AUCUNE: AdminPermissions = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
  canManageAgent: false,
};

describe('agentAccess', () => {
  test('matrice inconnue ⇒ ATTENTE, jamais un refus qui clignote', () => {
    expect(agentAccess({ permissions: null, role: null, chargement: true })).toBe('attente');
  });

  /**
   * FAIL-CLOSED : la requête a répondu, et elle a répondu « rien ». Une garde
   * qui s'ouvrirait quand la réponse manque n'est pas une garde.
   */
  test('matrice ABSENTE une fois la requête finie ⇒ REFUS, jamais une ouverture par défaut', () => {
    expect(agentAccess({ permissions: null, role: null, chargement: false })).toBe('refus');
  });

  test('sans aucun droit ⇒ REFUS', () => {
    expect(agentAccess({ permissions: AUCUNE, role: 'USER', chargement: false })).toBe('refus');
  });

  test('porteur de canManageAgent ⇒ OUVERT', () => {
    const porteur: AdminPermissions = { ...AUCUNE, canAccessAdmin: true, canManageAgent: true };

    expect(agentAccess({ permissions: porteur, role: 'ADMIN', chargement: false })).toBe('ouvert');
  });

  test('MODERATOR : dans l’espace, SANS le droit — les deux refus ne se confondent pas', () => {
    const moderateur: AdminPermissions = {
      ...AUCUNE,
      canAccessAdmin: true,
      canModerateContent: true,
      canManageConversations: true,
    };

    expect(agentAccess({ permissions: moderateur, role: 'MODERATOR', chargement: false })).toBe('espace-sans-droit');
  });

  test('`canAccessAdmin` seul ne suffit JAMAIS — c’est le seuil de la porte, pas celui de l’agent', () => {
    const entreSansRien: AdminPermissions = { ...AUCUNE, canAccessAdmin: true };

    expect(agentAccess({ permissions: entreSansRien, role: 'AUDIT', chargement: false })).not.toBe('ouvert');
  });

  test('`canManageAgent` sans `canAccessAdmin` n’ouvre pas non plus — l’espace précède ses pièces', () => {
    // La passerelle laisserait peut-être passer ; l'écran, lui, tient la même
    // hiérarchie que le reste de l'administration (`visibleAdminSections`).
    const agentSansPorte: AdminPermissions = { ...AUCUNE, canManageAgent: true };

    expect(agentAccess({ permissions: agentSansPorte, role: 'ADMIN', chargement: false })).toBe('refus');
  });
});
