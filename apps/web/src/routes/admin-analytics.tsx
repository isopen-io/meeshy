import type { ReactNode } from 'react';

import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { AdminFilterChips } from '@/components/admin/list-toolbar';
import { AdminTabs, useAdminTab } from '@/components/admin/tabs';
import { ACTIVITY_DEFAULT, ACTIVITY_PERIODS, CALLS_DEFAULT, CALLS_PERIODS, MESSAGES_DEFAULT, MESSAGES_PERIODS } from '@/lib/admin/analytics-windows';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { AdminActivityTab } from './admin-analytics-activity';
import { AdminCallsTab } from './admin-analytics-calls';
import { AdminMessagesTab } from './admin-analytics-messages';
import { periodLabel, usePeriodParam, type WindowPeriod } from './admin-analytics-parts';

const TABS = ['activity', 'messages', 'calls'] as const;

type PeriodControlProps<T extends WindowPeriod> = {
  readonly language: InterfaceLanguage;
  readonly periods: readonly T[];
  readonly fallback: T;
  readonly children: (period: T) => ReactNode;
};

/** La période vit dans l'adresse ; chaque onglet a SES périodes et SA valeur par défaut. */
function WithPeriod<T extends WindowPeriod>({ language, periods, fallback, children }: PeriodControlProps<T>) {
  const [period, setPeriod] = usePeriodParam(periods, fallback);
  return (
    <div className="grid gap-6">
      <AdminFilterChips
        label={translateAdmin(language, 'admin.kit.period.label')}
        options={periods.map((value) => ({ value, label: periodLabel(language, value) }))}
        value={period}
        onChange={(value) => {
          const next = periods.find((candidate) => candidate === value);
          if (next !== undefined) setPeriod(next);
        }}
      />
      {children(period)}
    </div>
  );
}

function TabBody({ tab, language, deps, now }: { readonly tab: (typeof TABS)[number]; readonly language: InterfaceLanguage; readonly deps: AdminDeps; readonly now: Date }) {
  switch (tab) {
    case 'activity':
      return (
        <WithPeriod language={language} periods={ACTIVITY_PERIODS} fallback={ACTIVITY_DEFAULT}>
          {(period) => <AdminActivityTab language={language} deps={deps} now={now} period={period} />}
        </WithPeriod>
      );
    case 'messages':
      return (
        <WithPeriod language={language} periods={MESSAGES_PERIODS} fallback={MESSAGES_DEFAULT}>
          {(period) => <AdminMessagesTab language={language} deps={deps} period={period} />}
        </WithPeriod>
      );
    case 'calls':
      return (
        <WithPeriod language={language} periods={CALLS_PERIODS} fallback={CALLS_DEFAULT}>
          {(period) => <AdminCallsTab language={language} deps={deps} period={period} />}
        </WithPeriod>
      );
  }
}

/**
 * **LE PANNEAU DES STATISTIQUES** (#8876, #6728) — trois onglets dans l'adresse
 * (`?tab=activity|messages|calls`) et une période dans l'adresse (`?period=`), chaque
 * onglet avec ses propres périodes. `deps` et `now` sont injectables : les témoins
 * montent le panneau sans transport réel et avec une horloge fixe.
 *
 * Aucun contenu de message n'est lu ici (#6919) — voir `admin-message-stats.ts`.
 */
export function AdminAnalyticsPanel({
  language,
  deps = apiDeps,
  now,
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const [tab, setTab] = useAdminTab(TABS, 'activity');
  const clock = now ?? new Date();

  return (
    <div className="grid gap-6" data-admin-analytics>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.analytics')}
        subtitle={translateAdmin(language, 'admin.analytics.subtitle')}
      />
      <AdminOfflineNotice language={language} />
      <AdminTabs
        label={translateAdmin(language, 'admin.analytics.tabs.label')}
        tabs={TABS.map((id) => ({ id, label: translateAdmin(language, `admin.analytics.tab.${id}`) }))}
        active={tab}
        onChange={setTab}
      />
      <div role="tabpanel" aria-label={translateAdmin(language, `admin.analytics.tab.${tab}`)}>
        <TabBody tab={tab} language={language} deps={deps} now={clock} />
      </div>
    </div>
  );
}

/** **LES STATISTIQUES** — `/admin/analytics` et `/adm/analytics`, gardés par `canViewAnalytics` (la section). */
export default function AdminAnalyticsScreen() {
  const language = currentInterfaceLanguage();
  return (
    <AdminSectionScreen section="analytics" language={language} title={translateAdmin(language, 'admin.nav.analytics')}>
      {() => <AdminAnalyticsPanel language={language} />}
    </AdminSectionScreen>
  );
}
