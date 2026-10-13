import type { Issue } from '@/lib/pipeline/types';

/** Hard errors (red) or warnings (amber), each expandable to show offending rows / values. */
export function IssueList({ issues, kind }: { issues: Issue[]; kind: 'err' | 'warn' }) {
  if (!issues.length) return null;
  return (
    <div>
      {issues.map((i, n) => {
        const where = [i.tab && `Tab: ${i.tab}`, i.column && `Column: ${i.column}`, i.rows?.length && `Rows: ${i.rows.join(', ')}${i.rows.length === 10 ? ' …' : ''}`].filter(Boolean).join(' · ');
        const body = (
          <>
            <div>{i.message}</div>
            {where && <div className="meta">{where}</div>}
          </>
        );
        return (
          <div key={n} className={`issue ${kind}`}>
            {i.items?.length ? (
              <details>
                <summary>{i.title} ({i.items.length})</summary>
                {body}
                <ul>{i.items.map((x, k) => <li key={k}>{x}</li>)}</ul>
              </details>
            ) : (
              <><div style={{ fontWeight: 700 }}>{i.title}</div>{body}</>
            )}
          </div>
        );
      })}
    </div>
  );
}
