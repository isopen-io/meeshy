import { AdminLoading } from '@/components/admin/states';
import { currentAdminLanguage, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import { Link } from '@/routes/route-table';

/**
 * LES PIÈCES PARTAGÉES DE L'ESPACE D'ADMINISTRATION (#6432).
 *
 * En-tête, refus, cartouche de compteur — ce que les deux écrans
 * (`admin.tsx`, `admin-users.tsx`) rendent tous les deux. Extraites ici pour
 * la raison habituelle : deux rédactions du même refus divergent au premier
 * lot qui n'en relit qu'une, et un refus qui diverge est un refus dont on ne
 * sait plus ce qu'il garde.
 */

export { ADMIN_HEADER_HEIGHT, AdminHeader, AdminScreenFrame } from './admin-shell';

const BRAND = 'var(--color-ios-brand)';
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

/**
 * LE REFUS — un seul écran pour les trois façons de ne pas entrer : la matrice
 * dit non, la requête a échoué, ou la source est en fixtures.
 *
 * Il ne DIT PAS laquelle, et c'est délibéré : distinguer « tu n'as pas le
 * droit » de « le serveur n'a pas répondu » sur une porte d'administration
 * apprend à un visiteur non autorisé si l'espace existe et s'il est vivant.
 */
export function AdminDenied({ language }: { readonly language: AdminLanguage }) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-center">
      <div className="grid gap-3">
        <p className="text-screen font-bold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.denied.title')}
        </p>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.denied.message')}
        </p>
        <Link
          to="list"
          className="mx-auto grid place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
          style={{ backgroundColor: BRAND, minHeight: 44 }}
        >
          {translate(language, 'pending.back')}
        </Link>
      </div>
    </div>
  );
}

/** Un compteur du tableau de bord. `value` est déjà FORMATÉ par l'appelant. */
export function AdminCounter({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div
      className="grid gap-1 rounded-card p-4"
      style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
    >
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      <span className="text-screen font-bold tabular-nums" style={{ color: INK }}>
        {value}
      </span>
    </div>
  );
}

/** Le squelette d'attente — jamais un `ProgressView` (cache-first, dimension 2). */
export function AdminSkeleton({
  rows,
  language = currentAdminLanguage(),
  label,
  anchor,
}: {
  readonly rows: number;
  readonly language?: AdminLanguage;
  readonly label?: string;
  readonly anchor?: string;
}) {
  return (
    <AdminLoading language={language} {...(label === undefined ? {} : { label })} {...(anchor === undefined ? {} : { anchor })} className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-16 rounded-card"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
        />
      ))}
    </AdminLoading>
  );
}

/**
 * CE QU'UN GESTE D'ADMINISTRATION A FAIT, DIT À VOIX HAUTE (#6819).
 *
 * Une écriture réussie ne change parfois qu'une ligne d'une fiche — un rôle,
 * un interrupteur. Sans annonce, un lecteur d'écran ne signale RIEN : le geste
 * a eu lieu, personne ne l'apprend. `role="status"` + `aria-live="polite"`
 * énonce le résultat sans voler le focus.
 *
 * Jumeau de `LinksAnnouncement`, et non son import : celui-là vit dans les
 * pièces des LIENS. Emprunter un composant à une autre famille pour son
 * comportement crée une dépendance que son nom dément — et c'est le genre de
 * lien qu'on ne défait plus.
 *
 * Le texte VIDE reste monté en `sr-only` : démonter la région la retirerait de
 * l'arbre d'accessibilité, et la remonter avec du texte ne serait plus une
 * MISE À JOUR de région vivante — beaucoup de lecteurs ne l'annonceraient pas.
 */
export function AdminAnnouncement({ text }: { readonly text: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-admin-announcement
      className={
        text === ''
          ? 'sr-only'
          : 'pointer-events-none fixed inset-x-0 bottom-24 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-chip px-4 py-2.5 text-center text-caption font-semibold'
      }
      style={
        text === ''
          ? undefined
          : { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }
      }
    >
      {text}
    </p>
  );
}
