import type { AdminDeps } from '@/lib/api/admin';
import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import {
  activateAdminUser,
  adminAccountNeedsActivation,
  adminActivationNeedsProof,
  setAdminUserVerification,
  type AdminContactChannel,
} from '@/lib/api/admin-user-verifications';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { withContactProof } from './admin-member-contact';
import { GLASS_CARD_CLASS, GLASS_CARD_EDGE, INK2, SectionButton, useMemberWrite } from './admin-member-parts';

/**
 * **LES ACTIONS EN UN CLIC** (#8289, demande porteur) — ce qu'un
 * administrateur fait le plus souvent sur un compte qui bloque :
 *
 * - « Activer le compte » : actif ET sorti de la phase `blocked` de #8238 ;
 * - « Valider l'e-mail » / « Valider le téléphone » : la preuve posée.
 *
 * Chacune est IMMÉDIATE et OPTIMISTE — le badge bascule au clic, l'instantané
 * revient si la passerelle refuse, et le motif se lit sous la barre. Pas de
 * modale : aucun de ces gestes ne retire un droit, et chacun se défait par la
 * section Contact. Une action qui n'a plus rien à faire disparaît.
 */
type QuickAction = {
  readonly id: 'activate' | 'email' | 'phone';
  readonly label: AdminPlainCatalogKey;
  readonly done: AdminPlainCatalogKey;
  readonly visible: (m: AdminUserDetail) => boolean;
};

const ACTIONS: readonly QuickAction[] = [
  { id: 'activate', label: 'admin.quick.activate', done: 'admin.quick.activated', visible: adminAccountNeedsActivation },
  { id: 'email', label: 'admin.quick.validateEmail', done: 'admin.edit.saved', visible: (m) => m.email !== '' && m.emailVerifiedAt === null },
  { id: 'phone', label: 'admin.quick.validatePhone', done: 'admin.edit.saved', visible: (m) => m.phoneNumber !== '' && m.phoneVerifiedAt === null },
];

/** Le membre tel qu'il sera une fois activé — actif, et prouvé si c'est la preuve qui le bloquait. */
function activated(m: AdminUserDetail): AdminUserDetail {
  const actif = { ...m, isActive: true, deactivatedAt: null };
  return adminActivationNeedsProof(m) ? withContactProof(actif, 'email', true) : actif;
}

export function AdminMemberQuickActions({
  membre,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly membre: AdminUserDetail;
  readonly language: AdminLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  const ecriture = useMemberWrite({ userId: membre.id, language, onAnnounce });
  const visibles = ACTIONS.filter((action) => action.visible(membre));
  const etat = ecriture.state;

  if (visibles.length === 0 && etat.phase === 'idle') return null;

  const lancer = (action: QuickAction) => {
    if (action.id === 'activate') {
      void ecriture.run(() => activateAdminUser({ ...deps, membre }), action.done, activated);
      return;
    }
    const channel: AdminContactChannel = action.id;
    void ecriture.run(
      () => setAdminUserVerification({ ...deps, userId: membre.id, channel, verified: true }),
      action.done,
      (avant) => withContactProof(avant, channel, true),
    );
  };

  return (
    <section
      aria-label={translateAdmin(language, 'admin.quick.title')}
      data-admin-quick-actions=""
      className={`${GLASS_CARD_CLASS} grid gap-3 p-4`}
      style={GLASS_CARD_EDGE}
    >
      {visibles.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {visibles.map((action) => (
            <SectionButton
              key={action.id}
              tone={action.id === 'activate' ? 'primary' : 'secondary'}
              disabled={etat.phase === 'saving'}
              data={{ 'data-admin-quick': action.id }}
              onClick={() => lancer(action)}
            >
              {translateAdmin(language, action.label)}
            </SectionButton>
          ))}
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        data-admin-quick-state={etat.phase}
        className="text-caption"
        style={{ color: etat.phase === 'error' ? 'var(--color-danger)' : etat.phase === 'saved' ? 'var(--color-success)' : INK2 }}
      >
        {etat.phase === 'saved' || etat.phase === 'error' ? etat.message : ''}
      </p>
    </section>
  );
}
