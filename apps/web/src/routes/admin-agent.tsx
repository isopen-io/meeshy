import { useQuery } from '@tanstack/react-query';

import { agentAccess } from '@/lib/admin/agent-access';
import { adminIdentityQueryOptions } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { AdminAgentPanel } from '@/routes/admin-agent-parts';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LE PILOTAGE DE L'AGENT** (#6733) — `/adm/agent` et `/admin/agent`.
 *
 * Le périmètre tranché par le porteur : vue d'ensemble, conversations suivies,
 * relance / arrêt, journal des scans. Les onglets LLM, sujets, rôles et file de
 * livraison sont un second lot.
 *
 * ## AUCUNE ROUTE NEUVE
 *
 * Les 35 routes `/admin/agent/*` existent depuis longtemps
 * (`services/gateway/src/routes/admin/agent-*.ts`) et n'avaient aucun
 * consommateur dans la v2 : la tuile portait `route: null`. Cet écran les
 * CONSOMME — via `lib/api/admin-agent.ts`, qui documente pour chacune ce que
 * son HANDLER sert, les schémas étant déclarés `additionalProperties: true`.
 *
 * ## LA GARDE EST LUE ICI, PAS HÉRITÉE
 *
 * On entre sur cette adresse par un lien profond aussi bien que par le hub, et
 * une garde posée seulement à l'étage du dessus ne garde que l'escalier. La
 * décision vient de `agentAccess` (`lib/admin/agent-access.ts`), qui distingue
 * les DEUX refus : « rien à faire ici » (`AdminDenied`) et « le droit d'être là
 * sans le droit de lire ceci » — le cas d'un MODERATOR ou d'un AUDIT, qui
 * portent `canAccessAdmin` et à qui la matrice centrale refuse
 * `canManageAgent`.
 *
 * ## LE SEUIL EST `canManageAgent`, ET IL VIENT D'ARRIVER
 *
 * C'est la garde RÉELLE de ces routes (`requirePermission('canManageAgent')`,
 * `agent-shared.ts`). La passerelle la sert depuis le lot B de ce chantier ;
 * la v2 la décode depuis celui-ci. Se rabattre sur `canAccessAdmin` — ce que
 * la tuile faisait — peignait un contrôle voué au 403.
 */

export default function AdminAgentScreen() {
  const language = currentInterfaceLanguage();
  const identite = useQuery(adminIdentityQueryOptions(apiDeps));

  const acces = agentAccess({
    permissions: identite.data?.permissions ?? null,
    role: identite.data?.role,
    chargement: identite.isPending,
  });

  const titre = translateAdmin(language, 'admin.agent.title');

  if (acces === 'attente') {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (acces !== 'ouvert') {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        {acces === 'espace-sans-droit' ? (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-admin-agent-denied>
            {translateAdmin(language, 'admin.agent.denied')}
          </p>
        ) : (
          <AdminDenied language={language} />
        )}
      </AdminScreenFrame>
    );
  }

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <AdminAgentPanel language={language} deps={apiDeps} />
    </AdminScreenFrame>
  );
}
