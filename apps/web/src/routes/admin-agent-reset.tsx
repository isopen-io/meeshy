import { AdminButton } from '@/components/admin/button';
import { AdminFicheSection } from '@/components/admin/fiche';
import { INK2 } from '@/components/admin/tone';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { resetAgentEverything } from '@/lib/api/admin-agent-settings';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { useAgentConfirm, useAgentGesture } from './admin-agent-form';

/**
 * **LA MODALE « REMISES À ZÉRO »** (lot Agent complet) — où se trouve chacune des
 * trois remises à zéro, et la plus lourde d'entre elles.
 *
 * Une conversation (`DELETE /reset/conversation/:id`) et un membre
 * (`DELETE /reset/user/:id`) se remettent à zéro là où on les voit : la fiche de
 * l'agent sur une conversation, et ses membres pilotés. Cette modale le dit.
 *
 * **TOUT remettre à zéro** (`DELETE /reset`) est souverain (`requireSovereign()`,
 * #4157) : le bloc n'est PEINT que pour `isSovereign` — un administrateur de
 * l'agent ne voit pas un bouton voué au 403. La confirmation est la plus forte de
 * l'écran : elle énumère tout ce qui disparaît sur la plateforme entière, dit ce
 * qui reste, et que le geste ne se défait pas. La route déclare un corps : `{}`
 * part sans motif (le souverain n'en écrit pas), `{ reason }` sinon.
 */
export function AgentResetDetail({ language, deps }: { readonly language: AdminLanguage; readonly deps: AdminDeps }) {
  const reach = useAdminReach();
  const online = useOnline();
  const gesture = useAgentGesture(language);
  const confirm = useAgentConfirm(language, gesture);

  return (
    <AdminFicheSection id="agent-reset" title={translateAdmin(language, 'admin.agentPanel.card.reset')}>
      <ul className="grid list-disc gap-2 ps-5 text-body" style={{ color: INK2 }}>
        <li>{translateAdmin(language, 'admin.agentPanel.reset.conversationHint')}</li>
        <li>{translateAdmin(language, 'admin.agentPanel.reset.userHint')}</li>
      </ul>
      {reach.isSovereign ? (
        <div className="grid gap-2" data-agent-reset-all-block>
          <p className="max-w-prose text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.agentPanel.reset.allBody')}
          </p>
          <div className="flex">
            <AdminButton
              tone="danger"
              disabled={!online}
              data={{ 'data-agent-reset-all': '' }}
              onClick={() =>
                confirm.ask({
                  id: 'reset-all',
                  title: translateAdmin(language, 'admin.agentPanel.reset.all'),
                  body: translateAdmin(language, 'admin.agentPanel.reset.allBody'),
                  confirmLabel: translateAdmin(language, 'admin.agentPanel.reset.all'),
                  tone: 'danger',
                  withMotive: true,
                  act: (reason) => resetAgentEverything({ ...deps, reason }),
                  success: translateAdmin(language, 'admin.agentPanel.reset.allDone'),
                })
              }
            >
              {translateAdmin(language, 'admin.agentPanel.reset.all')}
            </AdminButton>
          </div>
        </div>
      ) : null}
      {confirm.node}
      {gesture.announcement}
    </AdminFicheSection>
  );
}
