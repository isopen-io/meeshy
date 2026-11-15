import { useLayoutEffect, type RefObject } from 'react';

export type InlineScrollBox = { readonly scrollLeft: number; readonly scrollWidth: number; readonly clientWidth: number };

export const scrollsFurther = (box: InlineScrollBox): boolean => Math.abs(box.scrollLeft) + box.clientWidth < box.scrollWidth - 1;

export function useScrollsFurtherMark(ref: RefObject<HTMLElement | null>, attribute: string): void {
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;
    const mark = (): void => {
      node.toggleAttribute(attribute, scrollsFurther(node));
    };
    mark();
    node.addEventListener('scroll', mark, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    [node, ...node.children].forEach((element) => observer?.observe(element));
    return () => {
      node.removeEventListener('scroll', mark);
      observer?.disconnect();
    };
  }, [ref, attribute]);
}
