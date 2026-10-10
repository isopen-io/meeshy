import type { CSSProperties } from 'react';

export type AuthorInk = { readonly dark: string; readonly light: string };

export const AUTHOR_INK_BACKGROUNDS: { readonly dark: readonly string[]; readonly light: readonly string[] } = { dark: [], light: [] };

export const authorInk = (_author: { readonly authorId: string | undefined | null; readonly name: string }): AuthorInk => {
  throw new Error('#10004 — à implémenter');
};

export const authorInkStyle = (author: { readonly authorId: string | undefined | null; readonly name: string }): CSSProperties => {
  const ink = authorInk(author);
  return { '--author-ink-dark': ink.dark, '--author-ink-light': ink.light } as CSSProperties;
};
