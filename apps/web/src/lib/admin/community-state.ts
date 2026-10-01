import { asRecord } from '@/lib/api/admin';
import type { AdminCommunityChange } from '@/lib/api/admin-communities-detail';
import type { Interpreted } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **L'ÉTAT D'UNE COMMUNAUTÉ, DIT EN MOTS** (#8876) — la passerelle sert deux
 * BOOLÉENS (`isPrivate`, `isActive`), pas des énumérations : c'est ici qu'ils
 * deviennent un mot, un ton et la phrase qui dit ce que l'état CHANGE pour les
 * lecteurs (rien ne s'écrit « true » dans une fiche).
 *
 * Et c'est ici que se décide quels GESTES l'état courant offre : un geste qui ne
 * changerait rien n'est pas dessiné (loi 4) — on ne propose pas « Désactiver » à
 * une communauté déjà désactivée.
 */
export function communityVisibilityOf(isPrivate: boolean, language: AdminLanguage): Interpreted {
  return isPrivate
    ? {
        label: translateAdmin(language, 'admin.community.visibility.private'),
        tone: 'neutral',
        explain: translateAdmin(language, 'admin.community.visibility.private.explain'),
        raw: 'private',
      }
    : {
        label: translateAdmin(language, 'admin.community.visibility.public'),
        tone: 'neutral',
        explain: translateAdmin(language, 'admin.community.visibility.public.explain'),
        raw: 'public',
      };
}

export function communityStateOf(isActive: boolean, language: AdminLanguage): Interpreted {
  return isActive
    ? { label: translateAdmin(language, 'admin.community.state.active'), tone: 'success', explain: null, glyph: 'checkCircle', raw: 'active' }
    : {
        label: translateAdmin(language, 'admin.community.state.inactive'),
        tone: 'warning',
        explain: translateAdmin(language, 'admin.community.state.inactive.explain'),
        glyph: 'prohibit',
        raw: 'inactive',
      };
}

export type CommunityGestureId = 'deactivate' | 'reactivate' | 'makePrivate' | 'makePublic';

export type CommunityGesture = {
  readonly id: CommunityGestureId;
  /** Ce que le geste envoie : un seul champ à la fois. */
  readonly change: AdminCommunityChange;
  /** `danger` pour ce qui retire la communauté du monde ; `primary` pour le reste. */
  readonly tone: 'danger' | 'primary';
};

/** Les gestes que l'état courant offre : l'activation d'abord, la visibilité ensuite. */
export function communityGestureOptions(state: { readonly isActive: boolean; readonly isPrivate: boolean }): readonly CommunityGesture[] {
  const activation: CommunityGesture = state.isActive
    ? { id: 'deactivate', change: { isActive: false }, tone: 'danger' }
    : { id: 'reactivate', change: { isActive: true }, tone: 'primary' };
  const visibility: CommunityGesture = state.isPrivate
    ? { id: 'makePublic', change: { isPrivate: false }, tone: 'primary' }
    : { id: 'makePrivate', change: { isPrivate: true }, tone: 'primary' };
  return [activation, visibility];
}

export type CommunityGestureWords = {
  readonly action: string;
  readonly title: string;
  readonly body: string;
  /** Le verbe exact du bouton de confirmation — celui du geste, jamais « OK ». */
  readonly confirm: string;
  readonly done: AdminPlainCatalogKey;
};

/** Les mots de chaque geste : un `switch` EXHAUSTIF — un geste ajouté sans ses mots ne compile pas. */
export function communityGestureWords(id: CommunityGestureId, language: AdminLanguage): CommunityGestureWords {
  switch (id) {
    case 'deactivate':
      return {
        action: translateAdmin(language, 'admin.community.action.deactivate'),
        title: translateAdmin(language, 'admin.community.deactivate.title'),
        body: translateAdmin(language, 'admin.community.deactivate.body'),
        confirm: translateAdmin(language, 'admin.community.action.deactivate'),
        done: 'admin.community.done.deactivated',
      };
    case 'reactivate':
      return {
        action: translateAdmin(language, 'admin.community.action.reactivate'),
        title: translateAdmin(language, 'admin.community.reactivate.title'),
        body: translateAdmin(language, 'admin.community.reactivate.body'),
        confirm: translateAdmin(language, 'admin.community.action.reactivate'),
        done: 'admin.community.done.reactivated',
      };
    case 'makePrivate':
      return {
        action: translateAdmin(language, 'admin.community.action.makePrivate'),
        title: translateAdmin(language, 'admin.community.makePrivate.title'),
        body: translateAdmin(language, 'admin.community.makePrivate.body'),
        confirm: translateAdmin(language, 'admin.community.action.makePrivate'),
        done: 'admin.community.done.private',
      };
    case 'makePublic':
      return {
        action: translateAdmin(language, 'admin.community.action.makePublic'),
        title: translateAdmin(language, 'admin.community.makePublic.title'),
        body: translateAdmin(language, 'admin.community.makePublic.body'),
        confirm: translateAdmin(language, 'admin.community.action.makePublic'),
        done: 'admin.community.done.public',
      };
  }
}

/**
 * L'EFFET IMMÉDIAT d'un geste sur la fiche en cache (mise à jour optimiste) : ce
 * que la passerelle écrira, écrit d'avance — désactiver pose `deletedAt`,
 * réactiver l'efface. `useAdminAction` le défait si la passerelle refuse et relit
 * la fiche de toute façon : la vérité vient du serveur, ceci n'est qu'un avant-goût.
 * Un cache qui n'est pas une fiche est rendu tel quel.
 */
export function withCommunityChange(cached: unknown, change: AdminCommunityChange, at: string): unknown {
  const fiche = asRecord(cached);
  if (fiche === null) return cached;
  return {
    ...fiche,
    ...(change.isActive === undefined ? {} : { isActive: change.isActive, deletedAt: change.isActive ? null : at }),
    ...(change.isPrivate === undefined ? {} : { isPrivate: change.isPrivate }),
  };
}
