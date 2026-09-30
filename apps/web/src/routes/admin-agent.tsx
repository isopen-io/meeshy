import { agentAccess } from '@/lib/admin/agent-access';
import { adminListRoute } from '@/lib/admin/admin-routes';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { AdminAgentPanel } from '@/routes/admin-agent-parts';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';

/**
 * **LE PILOTAGE DE L'AGENT** (#6733, #8876) — `/adm/agent` et `/admin/agent`.
 *
 * Le périmètre tranché par le porteur : vue d'ensemble, conversations suivies,
 * relance / arrêt, journal des scans. Les onglets LLM, sujets, rôles et file de
 * livraison sont un second lot.
 *
 * ## AUCUNE ROUTE NEUVE
 *
 * Les 35 routes `/admin/agent/*` existent depuis longtemps
 * (`services/gateway/src/routes/admin/agent-*.ts`). Cet écran en CONSOMME sept,
 * via `lib/api/admin-agent.ts`, qui documente pour chacune ce que son HANDLER sert.
 *
 * ## LA GARDE EST LUE ICI, PAS HÉRITÉE
 *
 * On entre sur cette adresse par un lien profond aussi bien que par le hub.
 * La décision vient de `agentAccess` (`lib/admin/agent-access.ts`), qui distingue
 * les DEUX refus : « rien à faire ici » (`AdminDenied`) et « le droit d'être là
 * sans le droit de lire ceci » — le cas d'un MODERATOR ou d'un AUDIT, qui portent
 * `canAccessAdmin` et à qui la matrice centrale refuse `canManageAgent`. Leur
 * servir « espace réservé » leur ferait croire qu'ils se sont trompés de porte.
 *
 * C'est pourquoi l'écran n'emprunte pas `AdminSectionScreen`, dont le refus est
 * UNIQUE et ne dit pas pourquoi : ici, dire pourquoi est le métier de la garde.
 *
 * ## LE SEUIL EST `canManageAgent`
 *
 * C'est la garde RÉELLE de ces routes (`requirePermission('canManageAgent')`,
 * `agent-shared.ts`). Se rabattre sur `canAccessAdmin` peindrait un contrôle voué
 * au 403.
 */
export default function AdminAgentScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const reach = useAdminReach();

  const access = agentAccess({
    permissions: reach.permissions,
    role: reach.role,
    chargement: reach.status === 'pending',
  });

  const frame = {
    language,
    title: translateAdmin(language, 'admin.agent.title'),
    back: adminListRoute('dashboard', reach.space),
    backLabel: translate(language, 'admin.title'),
    heading: 'content' as const,
  };

  if (access === 'attente') {
    return (
      <AdminScreenFrame {...frame}>
        <AdminSkeleton rows={4} />
      </AdminScreenFrame>
    );
  }

  if (access !== 'ouvert') {
    return (
      <AdminScreenFrame {...frame}>
        {access === 'espace-sans-droit' ? (
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
    <AdminScreenFrame {...frame}>
      <AdminAgentPanel language={language} />
    </AdminScreenFrame>
  );
}
