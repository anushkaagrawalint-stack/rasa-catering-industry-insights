'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { rangeLabel, weekShortLabel } from '@/lib/pipeline/dates';
import type { SnapshotData } from '@/lib/pipeline/types';
import { createDashboard } from './engine';

interface Props {
  data: SnapshotData;
  weeks: string[];
  abbrev: Record<string, string>;
}

export function Dashboard({ data, weeks, abbrev }: Props) {
  const router = useRouter();
  const [agentName, setAgentName] = useState<string>('all');
  const engine = useRef<ReturnType<typeof createDashboard> | null>(null);
  const m = data.meta;
  const agentIdx = agentName === 'all' ? -1 : data.agents.indexOf(agentName);
  const agent = agentIdx < 0 ? 'all' : agentIdx; // an agent absent from the selected week falls back to all

  useEffect(() => {
    const e = createDashboard(data, abbrev);
    engine.current = e;
    return () => { e.destroy(); engine.current = null; };
  }, [data, abbrev]);

  useEffect(() => { engine.current?.setAgent(agent); }, [agent, data, abbrev]);

  function toggleTheme() {
    const r = document.documentElement;
    const cur = r.getAttribute('data-theme');
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.setAttribute('data-theme', dark ? 'light' : 'dark');
    engine.current?.render();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login');
  }

  const weekRange = rangeLabel(m.weekStart, m.weekEnd);
  const ytdRange = rangeLabel(m.ytdStart, m.ytdEnd);

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo on-light" src="/kutlerri-logo-light-bg.png" alt="Kutlerri" width={489} height={96} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo on-dark" src="/kutlerri-logo-dark-bg.png" alt="" aria-hidden="true" width={489} height={96} />
            <h1>RASA Weekly — Dials, Targeting &amp; Demand</h1>
          </div>
          <div className="controls">
            <label htmlFor="week" style={{ fontSize: 12, color: 'var(--ink-2)' }}>Week</label>
            <select id="week" value={m.weekStart} onChange={e => router.push(`/?week=${e.target.value}`)}>
              {weeks.map(w => <option key={w} value={w}>{weekShortLabel(w)}</option>)}
            </select>
            <label htmlFor="agent" style={{ fontSize: 12, color: 'var(--ink-2)' }}>Agent</label>
            <select id="agent" value={agent === 'all' ? 'all' : agentName} onChange={e => setAgentName(e.target.value)}>
              <option value="all">All agents</option>
              {data.agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="themebtn" id="theme" onClick={toggleTheme} aria-label="Toggle light / dark theme">◐</button>
            <button className="btn" onClick={logout}>Log out</button>
          </div>
        </header>
        <div className="kpis" id="kpis" />

        <div className="panel" style={{ borderTop: '3px solid var(--accent)' }}>
          <h2 style={{ fontSize: 16 }}>This week&apos;s orders only · {weekRange}</h2>
          <div className="hint">Catering orders placed this week — the same week as the dials above (independent of the agent filter).</div>
          <div className="kpis" id="kWeek" style={{ marginTop: 12 }} />
          <div className="grid2" style={{ marginTop: 4 }}>
            <div className="panel" style={{ boxShadow: 'none' }}><h2>This week&apos;s order value by industry</h2><div className="hint">By $ · click a bar for the company breakdown · $0 orders ignored in the Individuals bar</div>
              <div className="chart-tall"><canvas id="wkInd" role="img" aria-label="This week's order value by industry" /></div></div>
            <div className="panel" style={{ boxShadow: 'none' }}><h2>This week&apos;s orders by location</h2><div className="hint">Order value by store area (Ballpark folded into MVT)</div>
              <div className="chart-box"><canvas id="wkLoc" role="img" aria-label="This week's order value by location" /></div></div>
          </div>
          <div className="panel" style={{ boxShadow: 'none', marginBottom: 0 }}><h2>This week&apos;s accounts</h2><div className="hint">Companies that ordered this week, by value</div>
            <div className="tbl-wrap"><table id="wkCo" /></div></div>
        </div>

        <div className="panel"><h2>Targeting vs demand</h2><div className="hint" id="tvd-hint" />
          <div style={{ position: 'relative', height: 430, marginBottom: 10 }}><canvas id="tvdChart" role="img" aria-label="Share of catering orders (YTD) vs share of this week's dials, by industry" /></div>
          <div className="tbl-wrap"><table id="tvd" /></div>
          <div className="note">Gap = dial share − order share. Positive (green) = dialling this industry more than its share of catering demand; negative (red) = under-dialled vs demand.</div>
        </div>

        <div className="grid2">
          <div className="panel"><h2>Persona mix</h2><div className="hint">Grouped from job title · unmatched numbers in grey</div>
            <div className="chart-box"><canvas id="cPersona" role="img" aria-label="Dials by persona" /></div></div>
          <div className="panel"><h2>Industry mix</h2><div className="hint">Matched contacts with an industry · top 8, rest grouped</div>
            <div className="chart-box"><canvas id="cIndustry" role="img" aria-label="Dials by industry" /></div></div>
        </div>
        <div className="grid2">
          <div className="panel"><h2>Top job titles</h2><div className="hint">Exact title as stored · top 12 · matched with a title</div>
            <div className="chart-box"><canvas id="cTitle" role="img" aria-label="Top job titles by dials" /></div></div>
          <div className="panel"><h2>Top industries</h2><div className="hint">Top 12 · matched contacts with an industry</div>
            <div className="chart-box"><canvas id="cTopInd" role="img" aria-label="Top industries by dials" /></div></div>
        </div>
        <div className="grid2">
          <div className="panel"><h2>Dials by store — persona mix</h2><div className="hint">Store-tagged contacts · dual-tagged counted under each store</div>
            <div className="chart-box"><canvas id="cStorePersona" role="img" aria-label="Dials by store and persona" /></div></div>
          <div className="panel"><h2>Dials by store — industry mix</h2><div className="hint">Store-tagged contacts · top 6 industries, rest grouped</div>
            <div className="chart-box"><canvas id="cStoreIndustry" role="img" aria-label="Dials by store and industry" /></div></div>
        </div>
        <div className="panel"><h2>Store detail</h2><div className="hint">Which store each dial supports (contact&apos;s Store Location tag). Dual-tagged contacts count under each store, so rows can sum above the filtered total.</div>
          <div className="tbl-wrap"><table id="tStore" /></div></div>
        <div className="panel"><h2>Persona detail</h2><div className="hint">Personas grouped from the exact job title.</div>
          <div className="tbl-wrap"><table id="tPersona" /></div></div>

        <div className="panel" style={{ borderTop: '3px solid var(--accent)' }}>
          <h2 style={{ fontSize: 16 }}>YTD orders — full insight · {ytdRange}</h2>
          <div className="hint">All catering orders YTD (independent of the dial filters). Dials exist for the selected week only, so this side is orders alone.</div>
          <div className="kpis" id="kYtd" style={{ marginTop: 12 }} />
          <div className="grid2" style={{ marginTop: 4 }}>
            <div className="panel" style={{ boxShadow: 'none' }}><h2>Orders by month</h2><div className="hint">Value (bars) and order count (line)</div>
              <div className="chart-box"><canvas id="ytdMonth" role="img" aria-label="YTD order value and count by month" /></div></div>
            <div className="panel" style={{ boxShadow: 'none' }}><h2>Order value by industry</h2><div className="hint">Top 10 industries · by $</div>
              <div className="chart-tall"><canvas id="ytdInd" role="img" aria-label="YTD order value by industry" /></div></div>
          </div>
          <div className="panel" style={{ boxShadow: 'none', marginBottom: 0 }}><h2>Top accounts (YTD)</h2>
            <div className="tbl-wrap"><table id="ytdCo" /></div></div>
        </div>
        <div className="note">Not in database = dialled number not matched to the TAM (or the TAM has no industry for it). Industry excludes unmatched dials. Avg duration is over all dials in the persona. Snapshot of the uploaded week.</div>
        <div className="foot">Prepared by Kutlerri for RASA | Confidential</div>
      </div>
      <aside className="drawer" id="drawer" aria-label="Company-wise breakdown" aria-hidden="true">
        <div className="dhead"><div><div className="dtitle" /><div className="dsub" /></div>
          <button className="dx" id="dclose" aria-label="Close breakdown">×</button></div>
        <div className="dbody" />
      </aside>
    </>
  );
}
