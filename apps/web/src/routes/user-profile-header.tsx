import { memo, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import {   SECTION_CARD_STYLE } from '@/components/grouped-section';
import { DISCOVER_GLYPHS } from '@/components/glyphs-discover';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import { attachmentSrc } from '@/lib/api/media-url';
import type { PublicProfile } from '@/lib/api/public-profile';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ProfileActionKind, ProfileRelation } from '@/lib/profile/relation';
import { initialsOf } from '@/lib/view/conversation';
import { BRAND, BRAND_FILL, BRAND_INK, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **L'IDENTITÉ DU PROFIL PUBLIC** (#7152) — extrait de `user-profile-sections.tsx`, qui
 * atteignait 748 lignes. L'extraction s'est faite par RESPONSABILITÉ, jamais
 * par tranche, et elle PRÉCÈDE l'ajout : ajouter à un fichier déjà en route
 * vers le plafond est ce que le budget du dépôt interdit.
 *
 * Bannière, avatar, nom, gestes — et bientôt leur repli au défilement.
 */

// ------------------------------------------------------------------ l'identité

/**
 * LA BANNIÈRE, L'AVATAR CHEVAUCHANT, LE NOM, LE PSEUDO — `bigCollapsibleHeader`
 * (`UserProfileSheet+Header.swift:24-151`). Sans image, iOS peint un DÉGRADÉ DE
 * L'ACCENT (`defaultBannerGradient`, `:78-112`) : la fiche d'un compte sans
 * bannière reste une fiche, pas un rectangle vide.
 *
 * **LA PRÉSENCE N'Y EST PAS** (`+Header.swift:139-143`), et c'est mesuré : le
 * port ne décode ni `isOnline` ni `lastActiveAt`, et la requête ne demande
 * jamais `expand=presence`. La loi du 2026-08-25 masque la présence hors amitié
 * acceptée ; un client qui ne décode rien ne peut pas fabriquer un point vert.
 *
 * **LA BANNIÈRE EST À LIRE, PAS À TOUCHER** dans ce lot : iOS l'ouvre en plein
 * écran, mais brancher le visualiseur ici tirerait un chunk de plus sur un
 * écran dont le poids se mesure pour la première fois. Issue compagnon — et
 * c'est déjà ce que `/me` fait.
 */
export const ProfileHero = memo(function ProfileHero({
  profile,
  name,
  accent,
}: {
  readonly profile: PublicProfile;
  readonly name: string;
  readonly accent: string;
}) {
  return (
    <section data-user-hero aria-label={name} className="grid justify-items-center">
      <div data-user-banner className="relative w-full overflow-hidden rounded-card" style={{ height: 120 }}>
        {profile.banner === null ? (
          <span
            aria-hidden="true"
            className="block size-full"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 42%, transparent), color-mix(in srgb, ${accent} 12%, transparent))` }}
          />
        ) : (
          <img src={attachmentSrc(profile.banner)} alt="" className="block size-full object-cover" />
        )}
      </div>
      <span className="block rounded-chip" style={{ marginTop: -45, padding: 4, backgroundColor: 'var(--color-ios-surface)' }}>
        <Avatar initials={initialsOf(name)} color={accent} size={90} name={name} {...(profile.avatar === null ? {} : { src: profile.avatar })} />
      </span>
      <div className="grid max-w-full justify-items-center gap-0.5 pt-2 text-center">
        <p className="max-w-full break-words text-screen font-bold" style={{ color: INK }}>
          {name}
        </p>
        {/* LE PSEUDO EST TEINTÉ PAR LA MARQUE, PAS PAR L'ACCENT — et c'est un
            écart ASSUMÉ avec iOS (`+Header.swift:134-137`). L'accent est
            DÉRIVÉ de l'identifiant (`authorAccentColor`) : il prend n'importe
            quelle teinte, et il en existe qui tombent sous AA sur fond de
            carte (mesuré : 4,22 en sombre). Un texte que le lecteur ne lit pas
            n'est pas une identité, c'est un défaut. L'accent reste peint là où
            il ne porte aucun texte — le dégradé de bannière et l'avatar. */}
        <p className={`text-body font-medium ${BRAND_INK}`}>{`@${profile.username}`}</p>
        {profile.bio === null ? null : (
          <p className="max-w-prose whitespace-pre-wrap pt-1.5 text-body" style={{ color: INK }}>
            {profile.bio}
          </p>
        )}
      </div>
    </section>
  );
});

// ----------------------------------------------------------- l'action relationnelle

type ActionTone = 'brand' | 'success' | 'muted' | 'danger' | 'warning';

const ACTIONS = {
  add: { aria: 'discover.connection.addLabel', tone: 'brand' },
  accept: { aria: 'discover.connection.acceptLabel', tone: 'success' },
  reject: { aria: 'discover.connection.rejectLabel', tone: 'muted' },
  cancel: { aria: 'discover.connection.cancelLabel', tone: 'muted' },
  write: { aria: 'userProfile.action.writeLabel', tone: 'brand' },
  block: { aria: 'userProfile.action.blockLabel', tone: 'danger' },
  unblock: { aria: 'discover.blocked.unblockLabel', tone: 'warning' },
  report: { aria: 'report.action', tone: 'danger' },
} as const satisfies Readonly<Record<ProfileActionKind, { readonly aria: InterfaceCatalogKey; readonly tone: ActionTone }>>;

/**
 * LE TEXTE DU BOUTON, EN DEUX TABLES parce qu'il y a DEUX FORMES de clé — l'une
 * prend le nom de la personne, l'autre non, et `translate` le VÉRIFIE au type.
 *
 * Aucune des deux ne porte de clé qu'on n'affiche pas : la table d'avant en
 * gardait trois (« Contact », « Bloqué », « En attente » pour accepter, refuser
 * et annuler) que le rendu écrasait. Ces mots nomment des ÉTATS, pas des
 * gestes — les laisser dans une table de libellés de BOUTON était un piège pour
 * la prochaine main, qui les aurait crus servis.
 */
const PLAIN_LABEL = {
  add: 'discover.connection.add',
  write: 'userProfile.action.write',
  block: 'userProfile.action.block',
  unblock: 'discover.blocked.unblock',
  report: 'report.action',
} as const satisfies Readonly<Record<'add' | 'write' | 'block' | 'unblock' | 'report', InterfaceCatalogKey>>;

/* Accepter, refuser et annuler nomment la personne : iOS écrit « Accepter la
   connexion » ; la v3.1 réutilise les libellés déjà traduits de « Découvrir ». */
const NAMED_LABEL = {
  accept: 'discover.connection.acceptLabel',
  reject: 'discover.connection.rejectLabel',
  cancel: 'discover.connection.cancelLabel',
} as const satisfies Readonly<Record<'accept' | 'reject' | 'cancel', InterfaceCatalogKey>>;

const TONE_COLOR: Readonly<Record<ActionTone, string>> = {
  brand: BRAND,
  success: 'var(--color-success)',
  muted: INK_2,
  danger: 'var(--color-error)',
  warning: 'var(--color-warning)',
};

const ACTION_GLYPH: Readonly<Record<ProfileActionKind, ReactNode>> = {
  add: <GlyphSvg glyph={DISCOVER_GLYPHS.userPlus} size={14} />,
  accept: <Glyph name="check" size={14} />,
  reject: <Glyph name="x" size={14} />,
  cancel: <Glyph name="x" size={14} />,
  write: <GlyphSvg glyph={PROFILE_GLYPHS.envelopeSimple} size={14} />,
  block: <GlyphSvg glyph={DISCOVER_GLYPHS.handPalm} size={14} />,
  unblock: <GlyphSvg glyph={DISCOVER_GLYPHS.handPalm} size={14} />,
  report: <Glyph name="warningCircle" size={14} />,
};

/**
 * Le VERBE court du bouton : iOS peint une phrase (« Demande de connexion »),
 * la v3.1 garde les libellés déjà traduits de « Découvrir » — même mot, même
 * icône, même couleur de contexte sur les deux surfaces (dimension 6).
 */
const actionText = (language: InterfaceLanguage, kind: ProfileActionKind, name: string): string => {
  if (kind === 'accept' || kind === 'reject' || kind === 'cancel') return translate(language, NAMED_LABEL[kind], { name });
  return translate(language, PLAIN_LABEL[kind]);
};

/**
 * **L'ENCRE DE MARQUE NE SE PEINT PAS AVEC `--color-ios-brand`** (revue #7083),
 * et le lot le savait pour les boutons PLEINS sans l'appliquer aux AUTRES :
 * `--color-ios-brand` vaut `--ios-indigo-500`, et sur la teinte à 12 % d'un
 * bouton de CONTOUR il rendait **3,84 en clair / 4,06 en sombre** pour
 * « Écrire » — le geste que l'audience de cet écran vient chercher — et 4,47 /
 * 4,45 pour « Charger plus ». Tous sous AA, dans les DEUX schémas.
 *
 * `BRAND_INK` est la seule encre de marque MESURÉE lisible (le `@pseudo` la
 * porte déjà, 6,67) : une classe, parce qu'elle BASCULE avec le schéma — et
 * une classe ne gagne contre un `style` inline que si celui-ci ne pose pas
 * `color`. D'où le choix : la teinte de marque passe par la CLASSE, les autres
 * tons (succès, danger, avertissement) restent inline.
 */
const brandInkOf = (kind: ProfileActionKind, filled: boolean): boolean => !filled && ACTIONS[kind].tone === 'brand';

export function ActionButton({
  language,
  kind,
  name,
  disabled,
  onAction,
}: {
  readonly language: InterfaceLanguage;
  readonly kind: ProfileActionKind;
  readonly name: string;
  readonly disabled: boolean;
  readonly onAction: (kind: ProfileActionKind) => void;
}) {
  const tone = TONE_COLOR[ACTIONS[kind].tone];
  const filled = kind === 'add' || kind === 'accept';
  const brandInk = brandInkOf(kind, filled);
  return (
    <button
      type="button"
      data-profile-action={kind}
      disabled={disabled}
      aria-label={translate(language, ACTIONS[kind].aria, { name })}
      onClick={() => onAction(kind)}
      className={`flex w-full items-center justify-center gap-2 rounded-card px-4 text-body font-semibold disabled:opacity-45 ${FOCUS} ${brandInk ? BRAND_INK : ''}`}
      style={{
        minHeight: 48,
        outlineColor: tone,
        /* BLANC, jamais la surface : un bouton PLEIN se lit sur sa teinte,
           et `--color-ios-surface` suit le schéma — en sombre il tombait à
           4,45 contre l'indigo de marque (mesuré). Même choix que la pastille
           de « Découvrir » (`discover-parts.tsx`, `text-white`). */
        ...(filled ? { color: '#fff' } : brandInk ? {} : { color: tone }),
        backgroundColor: filled ? (ACTIONS[kind].tone === 'brand' ? BRAND_FILL : tone) : `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {ACTION_GLYPH[kind]}
      </span>
      {actionText(language, kind, name)}
    </button>
  );
}

const CONTEXT_KEY = {
  pendingReceived: 'userProfile.context.received',
  pendingSent: 'userProfile.context.sent',
} as const satisfies Partial<Readonly<Record<ProfileRelation['kind'], InterfaceCatalogKey>>>;

export function ContextBanner({ language, relation, name }: { readonly language: InterfaceLanguage; readonly relation: ProfileRelation; readonly name: string }) {
  if (relation.kind !== 'pendingReceived' && relation.kind !== 'pendingSent') return null;
  const key = CONTEXT_KEY[relation.kind];
  return (
    <p data-profile-context className="flex items-start gap-2 rounded-card px-3.5 py-3 text-caption" style={{ ...SECTION_CARD_STYLE, color: INK_2 }}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: BRAND }}>
        <GlyphSvg glyph={PROFILE_GLYPHS.userPlus} size={14} />
      </span>
      {translate(language, key, { name })}
    </p>
  );
}

/**
 * **LES GESTES RELATIONNELS** — `actionButtons` (`+DetailsTab.swift:139-216`),
 * précédés de la bannière de contexte qui répond « connexion de quoi ? » quand
 * la notification d'origine a disparu (`:218-220`).
 *
 * **Elle n'est PAS rendue sur son propre profil** (`+DetailsTab.swift:23`), et
 * **un lecteur sans session y voit une INVITATION à se connecter**, jamais un
 * bouton désactivé : un contrôle inerte est un contrôle qui ment.
 *
 * **L'identifiant de la demande arrive AVEC l'identité** (#7122,
 * `relationRequestId`) : les gestes d'une relation en attente sont armés au
 * premier rendu, il n'y a plus de panier en vol ni d'état « en attente de sa
 * ligne ». S'il manquait tout de même, `actionsFor` n'offre pas les gestes qui
 * l'exigent — un bouton qui n'aurait rien à envoyer mentirait de la même façon.
 */
