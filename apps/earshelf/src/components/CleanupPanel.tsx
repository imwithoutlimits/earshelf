import type { CleanupFlag, CleanupOptions, CleanupReport, SectionItem } from '@wells/core';

interface Row { key: CleanupFlag; label: string; count?: number }

const BACK_MATTER = /^(acknowledg|index$|appendix|about the author|copyright|dedication|bibliography|further reading|endnotes|notes$|glossary|permissions)/i;

/**
 * What will be left out of the reading. Every choice can be ticked whether or not something was found, because a person knows
 * better than the detector what they do not want read. `sections`, when given, lets whole chapters be skipped too.
 */
export function CleanupPanel({ report, options, onChange, sections }: { report: CleanupReport; options: CleanupOptions; onChange: (o: CleanupOptions) => void; sections?: SectionItem[] }) {
  const found: Row[] = [
    { key: 'pageNumbers', label: 'Page numbers', count: report.pageNumbers },
    { key: 'repeatedHeaders', label: 'Repeated headers and footers', count: report.repeatedHeaders },
    { key: 'footnotes', label: 'Footnotes', count: report.footnotes },
    { key: 'references', label: 'The reference list', count: report.references },
    { key: 'citations', label: 'Citations like [3] or (Smith, 2020)', count: report.citations },
  ];
  const more: Row[] = [
    { key: 'tables', label: 'Tables and their captions', count: report.tables },
    { key: 'figures', label: 'Figure captions', count: report.figures },
    { key: 'urls', label: 'Web addresses and email addresses', count: report.urls },
    { key: 'contents', label: 'The table of contents', count: report.contents },
    { key: 'code', label: 'Code blocks', count: report.code },
    { key: 'emoji', label: 'Emoji', count: report.emoji },
  ];
  const tidy: Row[] = [
    { key: 'hyphenation', label: 'Rejoin words split across lines', count: report.hyphenatedWords },
    { key: 'lineWraps', label: 'Join broken lines into paragraphs' },
  ];
  const skip = new Set(options.skipSections ?? []);
  const setSkip = (next: Set<string>) => onChange({ ...options, skipSections: [...next] });
  const list = (rows: Row[]) => (
    <ul className="cleanup-list">
      {rows.map((r) => (
        <li key={r.key}>
          <label className={r.count === 0 ? 'muted' : ''}>
            <input type="checkbox" checked={!!options[r.key]} onChange={(e) => onChange({ ...options, [r.key]: e.target.checked })} />
            <span>{r.label}</span>
            {r.count !== undefined && <span className="count" aria-label={r.count === 0 ? 'none found' : `${r.count} found`}>{r.count === 0 ? 'none found' : r.count}</span>}
          </label>
        </li>
      ))}
    </ul>
  );
  const likely = (sections ?? []).filter((s) => BACK_MATTER.test(s.title.trim()));
  return (
    <div className="cleanup-wrap">
      <fieldset className="cleanup">
        <legend>We found</legend>
        {list(found)}
      </fieldset>
      <fieldset className="cleanup">
        <legend>Also skip, if you like</legend>
        {list(more)}
      </fieldset>
      {sections && sections.length > 1 && (
        <details className="cleanup skip-sections">
          <summary>Skip whole chapters or sections <span className="count">{skip.size} chosen</span></summary>
          <p className="hint">Tick anything you do not want read, such as acknowledgements, an index or an appendix.</p>
          {likely.length > 0 && (
            <button type="button" className="btn small" onClick={() => setSkip(new Set([...skip, ...likely.map((s) => s.key)]))}>
              Tick likely back matter ({likely.length})
            </button>
          )}
          <ul className="cleanup-list sections">
            {sections.slice(0, 300).map((s) => (
              <li key={s.key} style={{ paddingLeft: Math.max(0, s.level - 1) * 14 }}>
                <label>
                  <input type="checkbox" checked={skip.has(s.key)} onChange={(e) => { const n = new Set(skip); if (e.target.checked) n.add(s.key); else n.delete(s.key); setSkip(n); }} />
                  <span>{s.title}</span>
                  <span className="count">{s.words < 80 ? '<1 min' : `${Math.round(s.words / 160)} min`}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      <fieldset className="cleanup">
        <legend>Tidy up</legend>
        {list(tidy)}
      </fieldset>
    </div>
  );
}
