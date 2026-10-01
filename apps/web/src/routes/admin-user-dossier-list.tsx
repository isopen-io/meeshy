import type { ReactNode } from 'react';

import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState } from '@/components/admin/states';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import { ADMIN_DOSSIER_PAGE_SIZE, type AdminDossierPage } from '@/lib/api/admin-user-dossier';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { AdminSkeleton } from './admin-parts';
import { AdminPager } from './admin-table';

/**
 * **LES ÉTATS ET LA LISTE D'UN ONGLET DE DOSSIER** (#7845, #8876) — le même dessin que les listes
 * d'entités : un squelette annoncé, un refus (403) qui dit que le bloc est réservé, une erreur AVEC
 * « Réessayer » (hors ligne on nomme la coupure, en ligne la passerelle), un vide dessiné, et des
 * rangées qui se plient en CARTES sous le seuil du contenu — jamais un tableau qui défile de côté
 * à 375 px. Un échec se DIT : un vide avalé se lirait comme « ce membre n'a rien ».
 */

/** Un échec qui garde son STATUT : un 403 ne se dit pas comme une panne. */
export class LectureRefusee extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function servi<T>(promesse: Promise<ApiResult<T>>): Promise<T> {
  const resultat = await promesse;
  if (!resultat.ok) throw new LectureRefusee(resultat.error, resultat.status);
  return resultat.data;
}

type DossierQuery<T> = {
  readonly isPending: boolean;
  readonly data: T | undefined;
  readonly error: unknown;
  readonly refetch: () => unknown;
};

export function DossierGate<T>({
  language,
  query,
  rows = 3,
  children,
}: {
  readonly language: AdminLanguage;
  readonly query: DossierQuery<T>;
  readonly rows?: number;
  readonly children: (data: T) => ReactNode;
}) {
  const online = useOnline();
  if (query.isPending) return <AdminSkeleton rows={rows} language={language} />;
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error instanceof LectureRefusee && query.error.status === 403) {
    return <AdminDeniedInline language={language} message={translateAdmin(language, 'admin.dossier.restricted')} />;
  }
  return (
    <AdminErrorState
      language={language}
      message={translateAdmin(language, online ? 'admin.convList.unavailable' : 'admin.offline')}
      onRetry={() => void query.refetch()}
    />
  );
}

/** Une liste paginée du dossier : états, rangées-ou-cartes, pied de page. */
export function DossierList<T>({
  language,
  query,
  offset,
  onOffset,
  columns,
  rowKey,
  rowTarget,
  rowAttributes,
  caption,
}: {
  readonly language: AdminLanguage;
  readonly query: DossierQuery<AdminDossierPage<T>>;
  readonly offset: number;
  readonly onOffset: (offset: number) => void;
  readonly columns: readonly AdminColumn<T>[];
  readonly rowKey: (row: T) => string;
  readonly rowTarget?: (row: T) => AdminTarget | null;
  readonly rowAttributes?: (row: T) => Readonly<Record<string, string>>;
  readonly caption: string;
}) {
  return (
    <DossierGate language={language} query={query}>
      {(page) =>
        page.rows.length === 0 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.dossier.empty')} glyph="list" />
        ) : (
          <div className="grid gap-3" data-admin-dossier-list>
            <AdminResponsiveRows
              columns={columns}
              rows={page.rows}
              rowKey={rowKey}
              caption={caption}
              {...(rowTarget === undefined ? {} : { rowTarget })}
              {...(rowAttributes === undefined ? {} : { rowAttributes })}
            />
            <AdminPager
              language={language}
              offset={offset}
              limit={ADMIN_DOSSIER_PAGE_SIZE}
              count={page.rows.length}
              total={page.total}
              hasMore={page.hasMore}
              pageSizes={[ADMIN_DOSSIER_PAGE_SIZE]}
              onPage={(demande) => onOffset(Math.max(0, demande.offset ?? 0))}
            />
          </div>
        )
      }
    </DossierGate>
  );
}
