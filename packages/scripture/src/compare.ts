/** Lines translations up verse by verse for side-by-side reading. Pure: it only arranges text it is given. */
export interface CompareInput { id: string; abbreviation: string; name: string; verses: Array<{ n: number; text: string }> | null }
export interface CompareRow { n: number; cells: Array<string | null> }
export interface CompareTable { columns: Array<{ id: string; abbreviation: string; name: string; available: boolean }>; rows: CompareRow[] }

export function alignVerses(inputs: readonly CompareInput[]): CompareTable {
  const numbers = new Set<number>();
  for (const i of inputs) for (const v of i.verses ?? []) numbers.add(v.n);
  const maps = inputs.map((i) => new Map((i.verses ?? []).map((v) => [v.n, v.text])));
  return {
    columns: inputs.map((i) => ({ id: i.id, abbreviation: i.abbreviation, name: i.name, available: !!i.verses?.length })),
    rows: [...numbers].sort((a, b) => a - b).map((n) => ({ n, cells: maps.map((m) => m.get(n) ?? null) })),
  };
}
