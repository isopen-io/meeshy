import type { ReactNode } from 'react';

import { listedEntries, listedEntry, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { contentK01, entryK01 } from './k01';
import { contentK02, entryK02 } from './k02';
import { contentK03, entryK03 } from './k03';
import { contentK04, entryK04 } from './k04';
import { contentK05, entryK05 } from './k05';
import { contentK06, entryK06 } from './k06';
import { contentK07, entryK07 } from './k07';
import { contentK08, entryK08 } from './k08';
import { contentK09, entryK09 } from './k09';
import { contentK10, entryK10 } from './k10';
import { contentK11, entryK11 } from './k11';
import { contentK12, entryK12 } from './k12';
import { contentK13, entryK13 } from './k13';
import { contentK14, entryK14 } from './k14';
import { contentK15, entryK15 } from './k15';
import { contentK16, entryK16 } from './k16';
import { contentK17, entryK17 } from './k17';
import { contentK18, entryK18 } from './k18';
import { contentK19, entryK19 } from './k19';
import { contentK20, entryK20 } from './k20';
import { contentK21, entryK21 } from './k21';
import { contentK22, entryK22 } from './k22';
import { contentK23, entryK23 } from './k23';
import { contentK24, entryK24 } from './k24';
import { contentK25, entryK25 } from './k25';

type KitContent = (state: MeeshyKitCatalogState, isPressed: boolean) => ReactNode;

const entries: readonly MeeshyKitCatalogEntry[] = [
  entryK01,
  entryK02,
  entryK03,
  entryK04,
  entryK05,
  entryK06,
  entryK07,
  entryK08,
  entryK09,
  entryK10,
  entryK11,
  entryK12,
  entryK13,
  entryK14,
  entryK15,
  entryK16,
  entryK17,
  entryK18,
  entryK19,
  entryK20,
  entryK21,
  entryK22,
  entryK23,
  entryK24,
  entryK25,
];

const contents: Readonly<Record<string, KitContent>> = {
  K01: contentK01,
  K02: contentK02,
  K03: contentK03,
  K04: contentK04,
  K05: contentK05,
  K06: contentK06,
  K07: contentK07,
  K08: contentK08,
  K09: contentK09,
  K10: contentK10,
  K11: contentK11,
  K12: contentK12,
  K13: contentK13,
  K14: contentK14,
  K15: contentK15,
  K16: contentK16,
  K17: contentK17,
  K18: contentK18,
  K19: contentK19,
  K20: contentK20,
  K21: contentK21,
  K22: contentK22,
  K23: contentK23,
  K24: contentK24,
  K25: contentK25,
};

export const MeeshyKitCatalog = {
  entries,
  listedEntries: (): readonly MeeshyKitCatalogEntry[] => listedEntries(entries),
  listedEntry: (key: string): MeeshyKitCatalogEntry | null => listedEntry(key, entries),
  content: (key: string, state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => contents[key]?.(state, isPressed) ?? null,
} as const;
