/**
 * Le DOUBLE du module d'accès à une conversation — un seul exemplaire pour
 * toutes les suites qui contrôlent « cet appelant est-il membre ? » (#4792).
 *
 * ## Pourquoi il existe
 *
 * `canAccessConversation` n'est plus la DÉCISION : c'est la projection
 * booléenne de `verdictAccesConversation`, le noyau à trois états
 * (`ok` / `sans-session` / `non-membre`) que les routes appellent désormais
 * pour savoir QUEL refus servir. Une suite qui ne double que la projection
 * laisse le VRAI noyau interroger son double Prisma — et le symptôme n'est pas
 * une erreur mais un 403 là où la suite avait posé « cet appelant passe » :
 * mesuré sur cinq suites du dépôt, 109 témoins tombés d'un coup.
 *
 * ## Pourquoi une fabrique PARTAGÉE plutôt que cinq copies
 *
 * La projection `verdict → booléen` réécrite dans chaque suite serait cinq
 * jumelles d'une règle de production, libres de diverger d'elle et entre elles
 * — exactement ce que le `CLAUDE.md` du gateway proscrit (« ne JAMAIS
 * ré-implémenter le corps d'une méthode de production dans un helper de test »).
 * Ici la fabrique ne réimplémente RIEN de la règle d'appartenance : elle
 * PROLONGE le module réel (`...actual`, la doctrine du cycle 93) et n'exprime
 * qu'une chose — le double de la décision gouverne les deux formes.
 *
 * ## Ce qu'elle NE dit pas
 *
 * Elle ne sait pas produire `sans-session` : les suites qui l'emploient
 * n'exercent que la question d'appartenance, avec un contexte AUTHENTIFIÉ. Le
 * refus d'une session absente se prouve ailleurs, sur les VRAIES routes et la
 * VRAIE garde — `conversation-access-refusal-status.test.ts` — parce qu'un
 * double ne peut pas attester qu'une garde laisse passer.
 */

type DecisionDAcces = (...args: any[]) => any;

export const doubleAccesConversation = (
  reel: Record<string, unknown>,
  peutAcceder: DecisionDAcces
): Record<string, unknown> => ({
  ...reel,
  canAccessConversation: peutAcceder,
  verdictAccesConversation: async (...args: any[]) =>
    (await peutAcceder(...args)) ? { genre: 'ok' } : { genre: 'non-membre' },
});
