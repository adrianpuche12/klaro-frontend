/**
 * Utilidades del árbol de categorías (Revisión 04).
 * I-06: filtrar por id, no por nombre (dos "Frías" en padres distintos se mezclaban).
 * I-13: el contador de cada categoría suma sus subcategorías.
 */
export interface CatNode { id: number; children: CatNode[] }

/** IDs de una categoría y todas sus descendientes. */
export const descendantIds = (cat: CatNode): number[] =>
  [cat.id, ...(cat.children ?? []).flatMap(descendantIds)];

/** Busca una categoría por id en todo el árbol. */
export const findCat = <T extends CatNode>(cats: T[], id: number): T | null => {
  for (const c of cats) {
    if (c.id === id) return c;
    const f = findCat((c.children ?? []) as T[], id);
    if (f) return f;
  }
  return null;
};

interface CountNode { productCount: number; children: CountNode[] }

/** Productos de la categoría + todas sus subcategorías. */
export const countProductsDeep = (cat: CountNode): number =>
  (Number(cat.productCount) || 0) + (cat.children ?? []).reduce((s, c) => s + countProductsDeep(c), 0);
