import { lazy } from 'react';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * LE CHARGEMENT DES MENUS FLOTTANTS, PARTAGÉ PAR LEURS DEUX HÔTES (#10117) —
 * la coquille (`shell.tsx`, sur la fenêtre) et le cadre côte à côte
 * (`routes/split-frame.tsx`, dans la colonne de la liste). Un seul `lazy` :
 * le chunk et son catalogue se chargent une fois, et le préchargement de la
 * coquille sert aussi le cadre.
 *
 * Les menus se disent dans la langue d'interface (#6206) : leur catalogue est
 * attendu avec leur chunk, en parallèle — `import()` comme le catalogue sont
 * idempotents, un préchargement ne paie rien deux fois.
 */
export const loadFloatingMenus = () =>
  Promise.all([import('./floating-menus'), loadInterfaceCatalog(currentInterfaceLanguage())]).then(([m]) => ({
    default: m.FloatingMenus,
  }));

export const LazyFloatingMenus = lazy(loadFloatingMenus);
