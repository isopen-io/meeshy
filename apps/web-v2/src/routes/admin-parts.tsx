import type { ReactNode } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph } from '@/components/glyph';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
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

export const ADMIN_HEADER_HEIGHT = 64;

const BRAND = 'var(--color-ios-brand)';
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

export function AdminHeader({
  language,
  title,
  back,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  /**
   * Les DEUX listes de membres y figurent (#6819) : un écran de détail revient
   * à la liste d'où l'on vient, jamais au tableau de bord — et il revient dans
   * l'ESPACE d'où l'on vient. `/adm/users/$user` renvoie vers `admUsers`,
   * `/admin/users/$user` vers `adminUsers` ; confondre les deux ferait sauter
   * l'administrateur d'une administration à l'autre au premier retour, alors
   * que D-76 les tient séparées à dessein.
   */
  readonly back: 'list' | 'admin' | 'adminUsers' | 'admUsers';
}) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: ADMIN_HEADER_HEIGHT }} lang={language}>
      <Link
        to={back}
        aria-label={translate(language, 'pending.back')}
        data-admin-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-center text-body font-semibold" style={{ color: INK }}>
        {title}
      </h1>
      <span aria-hidden="true" className="block shrink-0" style={{ width: 44 }} />
    </header>
  );
}

/**
 * LE REFUS — un seul écran pour les trois façons de ne pas entrer : la matrice
 * dit non, la requête a échoué, ou la source est en fixtures.
 *
 * Il ne DIT PAS laquelle, et c'est délibéré : distinguer « tu n'as pas le
 * droit » de « le serveur n'a pas répondu » sur une porte d'administration
 * apprend à un visiteur non autorisé si l'espace existe et s'il est vivant.
 */
export function AdminDenied({ language }: { readonly language: InterfaceLanguage }) {
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
          className="mx-auto grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
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
export function AdminSkeleton({ rows }: { readonly rows: number }) {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-16 rounded-card"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
        />
      ))}
    </div>
  );
}

export function AdminScreenFrame({
  language,
  title,
  back,
  children,
}: {
  readonly language: InterfaceLanguage;
  readonly title: string;
  /**
   * Les DEUX listes de membres y figurent (#6819) : un écran de détail revient
   * à la liste d'où l'on vient, jamais au tableau de bord — et il revient dans
   * l'ESPACE d'où l'on vient. `/adm/users/$user` renvoie vers `admUsers`,
   * `/admin/users/$user` vers `adminUsers` ; confondre les deux ferait sauter
   * l'administrateur d'une administration à l'autre au premier retour, alors
   * que D-76 les tient séparées à dessein.
   */
  readonly back: 'list' | 'admin' | 'adminUsers' | 'admUsers';
  readonly children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <AdminHeader language={language} title={title} back={back} />
      <main id="contenu" className="flex flex-1 flex-col overflow-y-auto px-4 pb-safe">
        <div className="mx-auto w-full max-w-3xl pb-24">{children}</div>
      </main>
    </div>
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
