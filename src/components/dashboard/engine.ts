// Dashboard rendering — a typed port of the reference dashboard's script (RASA_P9_Dashboard_Reference.html).
// Same imperative approach: aggregate the selected week's row data client-side, write tables with innerHTML,
// destroy + rebuild every Chart.js chart on each render.
import Chart, { type ActiveElement, type ChartConfiguration, type ChartEvent, type ChartType } from 'chart.js/auto';
import {
  NOCO, NOT_IN_DB_COMPANY, PERSONAS, STORE_TABLE_ORDER, STORES,
} from '@/lib/constants';
import { fmt, gapText, makeDisp, mmss, pc, pct, usd } from '@/lib/format';
import { dialKpis, orderSummary, tvdRows } from '@/lib/metrics';
import type { DialRow, OrderRow, SnapshotData } from '@/lib/pipeline/types';

const TEAL = '#2BA5B5';
const PBLUE = '#4C6EDB';
const CSUB = "This week's dials · agent filter applies";
const NO_DIALS = 'No dials for this selection';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (x: unknown) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const $ = (id: string) => document.getElementById(id)!;

interface Col<R> { h: string; k: keyof R & string; num?: boolean; f?: (v: never, r: R) => string }
interface Section { h: string; cols: Col<any>[]; rows: any[]; total?: Record<string, unknown> } // eslint-disable-line @typescript-eslint/no-explicit-any
interface Agg { k: string; dials: number; contacts: number; rows: DialRow[] }

export function createDashboard(data: SnapshotData, abbrev: Record<string, string>) {
  const R = data.dials, ORDR = data.orders, CO = data.companies, TI = data.titles, AG = data.agents;
  const OR = orderSummary(ORDR);
  const disp = makeDisp(abbrev);
  let agent: number | 'all' = 'all';
  let charts: Chart[] = [];
  let PAL: string[] = [];
  let BRAND = '';

  const themeColors = () => {
    PAL = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'].map(css);
    BRAND = css('--brand');
  };
  const fil = () => (agent === 'all' ? R : R.filter(r => r[0] === agent));
  const uniq = (rows: DialRow[]) => new Set(rows.filter(r => r[7] >= 0).map(r => r[7])).size;

  // ---- drawer (6.12) ----------------------------------------------------------------------
  function closeDrawer() {
    const el = $('drawer');
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }
  function openDrawer(title: string, sub: string, sections: Section[]) {
    const el = $('drawer');
    el.querySelector('.dtitle')!.textContent = title;
    el.querySelector('.dsub')!.textContent = sub || '';
    const cell = (c: Col<any>, v: unknown, r: unknown) => // eslint-disable-line @typescript-eslint/no-explicit-any
      `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(v as never, r) : esc(v == null ? '—' : v)}</td>`;
    el.querySelector('.dbody')!.innerHTML = sections.map(sec => {
      let h = '<div class="dsec"><h4>' + esc(sec.h) + '</h4>';
      if (!sec.rows.length) return h + '<div class="dempty">No companies</div></div>';
      h += '<table><thead><tr>' + sec.cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('') + '</tr></thead><tbody>';
      for (const r of sec.rows) h += '<tr>' + sec.cols.map(c => cell(c, r[c.k], r)).join('') + '</tr>';
      if (sec.total) h += '<tr class="tot">' + sec.cols.map(c => (c.k in sec.total! ? cell(c, sec.total![c.k], sec.total) : '<td></td>')).join('') + '</tr>';
      return h + '</tbody></table></div>';
    }).join('');
    el.querySelector('.dbody')!.scrollTop = 0;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    (el.querySelector('.dx') as HTMLButtonElement).focus({ preventScroll: true });
  }

  type OCo = { k: string; ind: string; orders: number; value: number };
  function orderCompanies(pred: (x: OrderRow) => boolean) {
    const m = new Map<string, OCo>();
    for (const x of ORDR) {
      if (!pred(x)) continue;
      const k = x[0];
      if (!m.has(k)) m.set(k, { k, ind: x[1], orders: 0, value: 0 });
      const e = m.get(k)!;
      e.orders++;
      e.value += x[2];
      if (!e.ind && x[1]) e.ind = x[1];
    }
    const rows = [...m.values()].sort((a, b) => b.value - a.value);
    return { rows, total: { k: 'Total', orders: rows.reduce((s, r) => s + r.orders, 0), value: rows.reduce((s, r) => s + r.value, 0) } };
  }
  const ORDCOLS: Col<OCo>[] = [
    { h: 'Company', k: 'k' },
    { h: 'Industry', k: 'ind', f: (v: string) => (v ? esc(disp(v)) : '—') },
    { h: 'Orders', k: 'orders', num: true, f: fmt },
    { h: 'Value', k: 'value', num: true, f: usd },
  ];
  const showOrders = (title: string, sub: string, pred: (x: OrderRow) => boolean) => {
    const o = orderCompanies(pred);
    openDrawer(title, sub, [{ h: o.rows.length + ' companies', cols: ORDCOLS, rows: o.rows, total: o.total }]);
  };

  type CCo = { k: string; ind: string; dials: number; conn: number; c90: number };
  function callCompanies(rows: DialRow[]) {
    const m = new Map<string, CCo>();
    for (const r of rows) {
      const k = r[10] >= 0 ? CO[r[10]] : NOT_IN_DB_COMPANY;
      if (!m.has(k)) m.set(k, { k, ind: '', dials: 0, conn: 0, c90: 0 });
      const e = m.get(k)!;
      e.dials++;
      e.conn += r[3];
      e.c90 += r[2];
      if (!e.ind && r[4]) e.ind = r[4];
    }
    const out = [...m.values()].sort((a, b) => b.dials - a.dials);
    return { rows: out, total: { k: 'Total', dials: rows.length, conn: out.reduce((s, r) => s + r.conn, 0), c90: out.reduce((s, r) => s + r.c90, 0) } };
  }
  const CALLCOLS: Col<CCo>[] = [
    { h: 'Company', k: 'k' },
    { h: 'Industry', k: 'ind', f: (v: string) => (v ? esc(disp(v)) : '—') },
    { h: 'Dials', k: 'dials', num: true, f: fmt },
    { h: 'Connected', k: 'conn', num: true, f: fmt },
    { h: '&gt;90s', k: 'c90', num: true, f: fmt },
  ];
  const showCalls = (title: string, sub: string, rows: DialRow[], extra: Section[] = []) => {
    const c = callCompanies(rows);
    openDrawer(title, sub, [...extra, { h: c.rows.length + ' companies dialled', cols: CALLCOLS, rows: c.rows, total: c.total }]);
  };
  function titleSection(rows: DialRow[]): Section {
    const m = new Map<string, { k: string; dials: number; conn: number }>();
    for (const r of rows) {
      if (r[9] < 0) continue;
      const k = TI[r[9]];
      if (!m.has(k)) m.set(k, { k, dials: 0, conn: 0 });
      const e = m.get(k)!;
      e.dials++;
      e.conn += r[3];
    }
    return {
      h: 'Top job titles',
      cols: [{ h: 'Title', k: 'k' }, { h: 'Dials', k: 'dials', num: true, f: fmt }, { h: 'Connected', k: 'conn', num: true, f: fmt }],
      rows: [...m.values()].sort((a, b) => b.dials - a.dials).slice(0, 12),
    };
  }
  const personaDrill = (p: string) => { const rs = fil().filter(r => r[5] === p); showCalls(p + ' — who we dialled', CSUB, rs, [titleSection(rs)]); };
  const storeDrill = (st: string) => showCalls(st + ' — companies dialled', CSUB, fil().filter(r => r[6].includes(st)));
  function tvdDrill(ind: string) {
    const o = orderCompanies(x => x[1] === ind);
    const cr = callCompanies(fil().filter(r => r[1] && r[4] === ind));
    openDrawer(disp(ind) + ' — orders vs dials', 'Orders: YTD · Dials: this week (agent filter applies)', [
      { h: 'Companies that ordered (YTD) · ' + o.rows.length, cols: ORDCOLS, rows: o.rows, total: o.total },
      { h: 'Companies dialled (this week) · ' + cr.rows.length, cols: CALLCOLS, rows: cr.rows, total: cr.total },
    ]);
  }

  // ---- chart helpers ----------------------------------------------------------------------
  const hov = (e: ChartEvent, els: ActiveElement[]) => {
    const t = (e.native?.target as HTMLElement | undefined);
    if (t) t.style.cursor = els.length ? 'pointer' : 'default';
  };
  const clk = (fn: (el: ActiveElement) => void) => ({ onClick: (_: ChartEvent, els: ActiveElement[]) => { if (els?.length) fn(els[0]); }, onHover: hov });

  /** Build a chart, or show an empty-state message instead when there is nothing to draw (spec 9). */
  function mkc<T extends ChartType>(id: string, cfg: ChartConfiguration<T>, empty: boolean, msg = NO_DIALS) {
    const canvas = $(id) as HTMLCanvasElement;
    const box = canvas.parentElement!;
    box.querySelector('.empty-chart')?.remove();
    canvas.hidden = empty;
    if (empty) {
      const d = document.createElement('div');
      d.className = 'empty-chart';
      d.textContent = msg;
      box.appendChild(d);
      return;
    }
    charts.push(new Chart(canvas, cfg) as unknown as Chart);
  }

  function agg(rows: DialRow[], keyf: (r: DialRow) => string | string[] | null): Agg[] {
    const m = new Map<string, DialRow[]>();
    for (const r of rows) {
      const ks = keyf(r);
      if (ks == null) continue;
      for (const k of Array.isArray(ks) ? ks : [ks]) {
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      }
    }
    return [...m.entries()].map(([k, rs]) => ({ k, dials: rs.length, contacts: uniq(rs), rows: rs }));
  }

  function barH(id: string, items: Agg[], label: (k: string) => string, color: string, onpick: (d: Agg) => void) {
    mkc(id, {
      type: 'bar',
      data: { labels: items.map(d => label(d.k)), datasets: [{ data: items.map(d => d.dials), backgroundColor: color, borderRadius: 5 }] },
      options: {
        ...clk(el => onpick(items[el.index])), maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
        scales: { x: { grid: { color: css('--grid') }, ticks: { color: css('--ink-2') } }, y: { grid: { display: false }, ticks: { color: css('--ink'), font: { size: 11 }, autoSkip: false } } },
      },
    }, !items.length);
  }

  function donut(id: string, items: { k: string; label: string; v: number; color: string }[], onpick: (k: string) => void) {
    mkc(id, {
      type: 'doughnut',
      data: { labels: items.map(d => d.label), datasets: [{ data: items.map(d => d.v), backgroundColor: items.map(d => d.color), borderWidth: 1, borderColor: css('--card') }] },
      options: {
        ...clk(el => onpick(items[el.index].k)), maintainAspectRatio: false, cutout: '60%',
        plugins: { legend: { position: 'right', labels: { color: css('--ink-2'), boxWidth: 11, font: { size: 11 } } } },
      },
    }, !items.length);
  }

  function stackedStore(id: string, cats: string[], labels: string[], colors: string[], keyf: (r: DialRow) => string, onpick: (st: string, ci: number) => void) {
    const rows = fil();
    const ds = cats.map((cat, ci) => ({
      label: labels[ci],
      data: STORES.map(st => rows.filter(r => r[6].includes(st) && keyf(r) === cat).length),
      backgroundColor: colors[ci], borderRadius: 3, stack: 's',
    }));
    mkc(id, {
      type: 'bar',
      data: { labels: [...STORES], datasets: ds },
      options: {
        ...clk(el => onpick(STORES[el.index], el.datasetIndex)), maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { labels: { color: css('--ink-2'), boxWidth: 11, font: { size: 11 } } } },
        scales: { x: { stacked: true, grid: { color: css('--grid') }, ticks: { color: css('--ink-2') } }, y: { stacked: true, grid: { display: false }, ticks: { color: css('--ink'), font: { size: 11 }, autoSkip: false } } },
      },
    }, !rows.some(r => r[6].some(s => (STORES as readonly string[]).includes(s))));
  }

  // ---- 6.1 KPIs -----------------------------------------------------------------------------
  function kpis() {
    const k = dialKpis(fil());
    const items = [
      { v: fmt(k.dials), l: 'Total dials', n: 'across ' + (agent === 'all' ? AG.length : 1) + ' agent' + (agent === 'all' && AG.length > 1 ? 's' : '') },
      { v: fmt(k.unique), l: 'Unique contacts dialled', n: fmt(k.repeat) + ' repeat attempts' },
      { v: fmt(k.conv90), l: 'Conversations (>90 sec)', n: pct(k.convPct) + ' of connected calls' },
      { v: fmt(k.connected), l: 'Connected', n: pct(k.connPct) + ' of dials' },
    ];
    $('kpis').innerHTML = items.map(i => `<div class="kpi"><div class="v">${i.v}</div><div class="l">${esc(i.l)}</div><div class="n">${i.n}</div></div>`).join('');
  }

  // ---- 6.3 Targeting vs demand ---------------------------------------------------------------
  function targeting() {
    const rows = tvdRows(ORDR, fil());
    $('tvd-hint').textContent = `${fmt(OR.total)} orders YTD: ${fmt(OR.identified)} from identified organisations, ${fmt(OR.personal)} personal/individual, ${fmt(OR.unclassifiable)} unclassifiable. Dial side = dials.`;
    let h = '<thead><tr><th>Industry</th><th class="num">Orders</th><th class="num">Order share</th><th class="num">Dials</th><th class="num">Dial share</th><th class="num">Gap (pp)</th></tr></thead><tbody>';
    for (const r of rows) {
      h += `<tr class="click" tabindex="0" data-ind="${encodeURIComponent(r.ind)}"><td>${esc(disp(r.ind))}</td><td class="num">${r.orders}</td><td class="num">${pct(r.orderShare)}</td><td class="num">${fmt(r.dials)}</td><td class="num">${pct(r.dialShare)}</td><td class="num ${r.gap >= 0 ? 'pp-pos' : 'pp-neg'}">${gapText(r.gap)}</td></tr>`;
    }
    $('tvd').innerHTML = h + '</tbody>';
    mkc('tvdChart', {
      type: 'bar',
      data: {
        labels: rows.map(r => disp(r.ind)),
        datasets: [
          { label: 'Share of catering orders (YTD)', data: rows.map(r => r.orderShare), backgroundColor: css('--accent'), borderRadius: 3 },
          { label: "Share of this week's dials", data: rows.map(r => r.dialShare), backgroundColor: TEAL, borderRadius: 3 },
        ],
      },
      options: {
        ...clk(el => tvdDrill(rows[el.index].ind)), maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { labels: { color: css('--ink-2'), boxWidth: 12 } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.parsed.x as number).toFixed(1) + '%' } } },
        scales: { x: { grid: { color: css('--grid') }, ticks: { color: css('--ink-2'), callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { color: css('--ink'), font: { size: 11 }, autoSkip: false } } },
      },
    }, !rows.length, 'No identified orders YTD');
  }

  // ---- 6.4 – 6.6 dial charts -------------------------------------------------------------------
  function dialCharts() {
    const rows = fil();
    const pcol: Record<string, string> = {
      Events: PAL[0], 'Executive Assistant': TEAL, 'Office Manager / Admin': PAL[2], 'Admin Support': PAL[3], 'Chief of Staff': PBLUE,
      'HR / People Ops': PAL[7], 'Facilities / Operations': PAL[5], 'Leadership / Director': PAL[4], Other: PAL[6],
      'No title on file': css('--muted'), 'Not in database': css('--ink-2'),
    };
    const per = agg(rows, r => r[5]).sort((a, b) => PERSONAS.indexOf(a.k as never) - PERSONAS.indexOf(b.k as never));
    donut('cPersona', per.map(d => ({ k: d.k, label: d.k, v: d.dials, color: pcol[d.k] || BRAND })), personaDrill);

    const matched = rows.filter(r => r[1]);
    const indAll = agg(matched.filter(r => r[4]), r => r[4]).sort((a, b) => b.dials - a.dials);
    const top8 = indAll.slice(0, 8);
    const otherV = indAll.slice(8).reduce((s, o) => s + o.dials, 0);
    const unkRows = matched.filter(r => !r[4]);
    const idata = top8.map((o, i) => ({ k: o.k, label: disp(o.k), v: o.dials, color: PAL[i % 8] }));
    if (otherV) idata.push({ k: 'All other', label: 'All other', v: otherV, color: css('--ink-2') });
    if (unkRows.length) idata.push({ k: 'Unknown', label: 'Unknown', v: unkRows.length, color: css('--muted') });
    donut('cIndustry', idata, k => {
      const top = new Set(top8.map(o => o.k));
      const rs = k === 'All other' ? matched.filter(r => r[4] && !top.has(r[4])) : k === 'Unknown' ? unkRows : matched.filter(r => r[4] === k);
      showCalls((k === 'All other' || k === 'Unknown' ? k : disp(k)) + ' — companies dialled', CSUB, rs);
    });

    const tt = agg(rows.filter(r => r[9] >= 0), r => TI[r[9]]).sort((a, b) => b.dials - a.dials).slice(0, 12);
    barH('cTitle', tt, k => k, PAL[0], d => showCalls(d.k + ' — companies dialled', CSUB, rows.filter(r => r[9] >= 0 && TI[r[9]] === d.k)));
    barH('cTopInd', indAll.slice(0, 12), disp, BRAND, d => showCalls(disp(d.k) + ' — companies dialled', CSUB, matched.filter(r => r[4] === d.k)));

    const P5 = ['Events', 'Office Manager / Admin', 'Executive Assistant', 'Chief of Staff', 'Admin Support'];
    const persCat = (r: DialRow) => (P5.includes(r[5]) ? r[5] : r[5] === 'No title on file' ? 'No title on file' : 'All other personas');
    const pcats = [...P5, 'All other personas', 'No title on file'];
    stackedStore('cStorePersona', pcats, pcats, [PAL[0], PAL[2], PAL[1], PBLUE, PAL[3], PAL[5], css('--muted')], persCat,
      (st, ci) => showCalls(st + ' · ' + pcats[ci], CSUB, rows.filter(r => r[6].includes(st) && persCat(r) === pcats[ci])));

    const stTag = rows.filter(r => r[6].some(s => (STORES as readonly string[]).includes(s)));
    const top6 = agg(stTag.filter(r => r[4]), r => r[4]).sort((a, b) => b.dials - a.dials).slice(0, 6).map(o => o.k);
    const indCat = (r: DialRow) => (!r[4] ? 'Unknown' : top6.includes(r[4]) ? r[4] : 'All other');
    const icats = [...top6, 'All other', 'Unknown'];
    const ilabels = icats.map(c => (c === 'All other' || c === 'Unknown' ? c : disp(c)));
    const icolors = [PAL[1], PAL[2], PAL[3], PBLUE, PAL[4], PAL[5]].slice(0, top6.length).concat([css('--ink-2'), css('--muted')]);
    stackedStore('cStoreIndustry', icats, ilabels, icolors, indCat,
      (st, ci) => showCalls(st + ' · ' + ilabels[ci], CSUB, rows.filter(r => r[6].includes(st) && indCat(r) === icats[ci])));
  }

  // ---- 6.7 / 6.8 tables --------------------------------------------------------------------
  function storeTbl() {
    const rows = fil();
    const d = rows.length;
    const byk = Object.fromEntries(agg(rows, r => r[6]).map(o => [o.k, o]));
    let h = '<thead><tr><th>Store</th><th class="num">Dials</th><th class="num">Unique contacts</th><th class="num">Share of dials</th><th class="num">Calls &gt;90s</th><th class="num">Conv. rate</th></tr></thead><tbody>';
    let any = false;
    for (const s of STORE_TABLE_ORDER) {
      const o = byk[s];
      if (!o) continue;
      any = true;
      const c9 = o.rows.filter(r => r[2]).length, cn = o.rows.filter(r => r[3]).length;
      h += `<tr class="click" tabindex="0" data-k="${encodeURIComponent(s)}"><td>${s}</td><td class="num">${fmt(o.dials)}</td><td class="num">${fmt(o.contacts)}</td><td class="num">${pct(pc(o.dials, d))}</td><td class="num">${fmt(c9)}</td><td class="num">${pct(pc(cn, o.dials))}</td></tr>`;
    }
    if (!any) h += `<tr><td colspan="6">${NO_DIALS}</td></tr>`;
    $('tStore').innerHTML = h + '</tbody>';
  }
  function personaTbl() {
    const rows = fil();
    const d = rows.length;
    const byk = Object.fromEntries(agg(rows, r => r[5]).map(o => [o.k, o]));
    let h = '<thead><tr><th>Persona</th><th class="num">Dials</th><th class="num">Unique contacts</th><th class="num">Share</th><th class="num">Calls &gt;90s</th><th class="num">Avg duration</th></tr></thead><tbody>';
    let any = false;
    for (const s of PERSONAS) {
      const o = byk[s];
      if (!o) continue;
      any = true;
      const c9 = o.rows.filter(r => r[2]).length, avg = o.rows.reduce((x, r) => x + r[8], 0) / o.rows.length;
      h += `<tr class="click" tabindex="0" data-k="${encodeURIComponent(s)}"><td>${s}</td><td class="num">${fmt(o.dials)}</td><td class="num">${fmt(o.contacts)}</td><td class="num">${pct(pc(o.dials, d))}</td><td class="num">${fmt(c9)}</td><td class="num">${mmss(avg)}</td></tr>`;
    }
    if (!any) h += `<tr><td colspan="6">${NO_DIALS}</td></tr>`;
    $('tPersona').innerHTML = h + '</tbody>';
  }

  // ---- order side (6.2, 6.9) — ignores the agent filter ------------------------------------------
  function orderKpis(pred: (x: OrderRow) => boolean, id: string, label: string) {
    const rows = ORDR.filter(pred), n = rows.length, val = rows.reduce((t, x) => t + x[2], 0);
    const cos = new Set(rows.filter(x => x[0] !== NOCO).map(x => x[0])).size;
    $(id).innerHTML = [
      { v: fmt(n), l: label, n: fmt(cos) + ' compan' + (cos === 1 ? 'y' : 'ies') },
      { v: usd(val), l: 'Order value', n: 'avg ' + usd(n ? val / n : 0) },
    ].map(i => `<div class="kpi"><div class="v">${i.v}</div><div class="l">${i.l}</div><div class="n">${i.n}</div></div>`).join('');
  }

  function orderIndChart(id: string, pred: (x: OrderRow) => boolean, tag: string, sub: string) {
    const m = new Map<string, { k: string; value: number }>();
    let iv = 0, inn = 0;
    for (const x of ORDR) {
      if (!pred(x)) continue;
      if (!x[1]) {
        if (x[2] < 1) continue;
        if (x[0] === NOCO) { iv += x[2]; inn++; }
        continue; // unclassifiable orders are not drawn
      }
      const e = m.get(x[1]) || { k: x[1], value: 0 };
      e.value += x[2];
      m.set(x[1], e);
    }
    const all = [...m.values()].sort((a, b) => b.value - a.value), top = all.slice(0, 9), rest = all.slice(9);
    type Item = { k: string; value: number; kind: 'ind' | 'rest' | 'indiv'; set?: Set<string> };
    const items: Item[] = top.map(t => ({ k: t.k, value: t.value, kind: 'ind' }));
    if (rest.length) items.push({ k: 'All other industries (' + rest.length + ')', value: rest.reduce((t, r) => t + r.value, 0), kind: 'rest', set: new Set(rest.map(r => r.k)) });
    if (inn) items.push({ k: 'Individuals (no company)', value: iv, kind: 'indiv' });
    const uk = (v: number) => '$' + (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : Math.round(v));
    mkc(id, {
      type: 'bar',
      data: { labels: items.map(i => (i.kind === 'ind' ? disp(i.k) : i.k)), datasets: [{ data: items.map(i => i.value), backgroundColor: items.map(i => (i.kind === 'ind' ? BRAND : i.kind === 'indiv' ? css('--ink-2') : css('--muted'))), borderRadius: 5 }] },
      options: {
        ...clk(el => {
          const it = items[el.index];
          if (it.kind === 'indiv') {
            const g = new Map<string, { k: string; orders: number; value: number }>();
            for (const x of ORDR) {
              if (!pred(x) || x[1] || x[0] !== NOCO || x[2] < 1) continue;
              const e = g.get(x[4]) || { k: x[4], orders: 0, value: 0 };
              e.orders++;
              e.value += x[2];
              g.set(x[4], e);
            }
            const rows = [...g.values()].sort((a, b) => b.value - a.value);
            openDrawer(tag + ' — Individuals (no company)', 'Orders from individuals / personal email, by location · $0 orders ignored', [{
              h: 'By location',
              cols: [{ h: 'Location', k: 'k' }, { h: 'Orders', k: 'orders', num: true, f: fmt }, { h: 'Value', k: 'value', num: true, f: usd }],
              rows,
              total: { k: 'Total', orders: rows.reduce((t, r) => t + r.orders, 0), value: rows.reduce((t, r) => t + r.value, 0) },
            }]);
            return;
          }
          const p = it.kind === 'ind' ? (x: OrderRow) => pred(x) && x[1] === it.k : (x: OrderRow) => pred(x) && it.set!.has(x[1]);
          showOrders(tag + ' — ' + (it.kind === 'ind' ? disp(it.k) : it.k), sub, p);
        }),
        maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => usd(c.parsed.x as number) } } },
        scales: { x: { grid: { color: css('--grid') }, ticks: { color: css('--ink-2'), callback: v => uk(+v) } }, y: { grid: { display: false }, ticks: { color: css('--ink'), font: { size: 11 }, autoSkip: false } } },
      },
    }, !items.length, 'No orders');
  }

  function accountsTable(id: string, pred: (x: OrderRow) => boolean) {
    const { rows } = orderCompanies(pred);
    let h = '<thead><tr><th>Account</th><th>Industry</th><th class="num">Orders</th><th class="num">Value</th></tr></thead><tbody>';
    for (const r of rows.slice(0, 12)) h += '<tr><td>' + esc(r.k) + '</td><td>' + (r.ind ? esc(disp(r.ind)) : '—') + '</td><td class="num">' + fmt(r.orders) + '</td><td class="num">' + usd(r.value) + '</td></tr>';
    if (!rows.length) h += '<tr><td colspan="4">No orders</td></tr>';
    $(id).innerHTML = h + '</tbody>';
  }

  function weekRender() {
    const isWk = (x: OrderRow) => x[3] === 1;
    orderKpis(isWk, 'kWeek', 'Orders this week');
    orderIndChart('wkInd', isWk, 'This week', "Company-wise · this week's orders");
    const lm = new Map<string, number>(STORES.map(s => [s, 0])); // all four stores always shown, $0 when no orders
    for (const x of ORDR) if (isWk(x)) lm.set(x[4], (lm.get(x[4]) || 0) + x[2]);
    const locs = [...lm.entries()].sort((a, b) => b[1] - a[1]);
    mkc('wkLoc', {
      type: 'bar',
      data: { labels: locs.map(l => l[0]), datasets: [{ label: 'Value', data: locs.map(l => l[1]), backgroundColor: PAL[2], borderRadius: 5 }] },
      options: {
        ...clk(el => { const L = locs[el.index][0]; showOrders('This week — ' + L, "Company-wise · this week's orders at this location", x => isWk(x) && x[4] === L); }),
        maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { grid: { color: css('--grid') }, ticks: { color: css('--ink-2'), callback: v => '$' + (+v >= 1000 ? +v / 1000 + 'k' : v) } }, x: { grid: { display: false }, ticks: { color: css('--ink'), font: { size: 11 }, autoSkip: false } } },
      },
    }, !ORDR.some(isWk), 'No orders this week');
    accountsTable('wkCo', isWk);
  }

  function ytdRender() {
    const any = () => true;
    orderKpis(any, 'kYtd', 'Orders (YTD)');
    const uk = (v: number) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : Math.round(v));
    const mm = new Map<string, { k: string; value: number; orders: number }>();
    for (const x of ORDR) {
      if (!x[5]) continue;
      const e = mm.get(x[5]) || { k: x[5], value: 0, orders: 0 };
      e.value += x[2];
      e.orders++;
      mm.set(x[5], e);
    }
    const months = [...mm.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
    mkc('ytdMonth', {
      type: 'bar',
      data: {
        labels: months.map(m => m.k),
        datasets: [
          { type: 'bar', label: 'Value', data: months.map(m => m.value), backgroundColor: BRAND, borderRadius: 4, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Orders', data: months.map(m => m.orders), borderColor: TEAL, backgroundColor: TEAL, tension: 0.3, yAxisID: 'y1', order: 1 },
        ],
      } as ChartConfiguration['data'],
      options: {
        ...clk(el => { const M = months[el.index].k; showOrders('Orders in ' + M, 'Company-wise · YTD', x => x[5] === M); }),
        maintainAspectRatio: false, plugins: { legend: { labels: { color: css('--ink-2') } } },
        scales: {
          y: { position: 'left', grid: { color: css('--grid') }, ticks: { color: css('--ink-2'), callback: v => uk(+v) } },
          y1: { position: 'right', grid: { display: false }, ticks: { color: css('--ink-2') } },
          x: { grid: { display: false }, ticks: { color: css('--ink-2'), autoSkip: false, maxRotation: 60, minRotation: 0 } },
        },
      },
    }, !months.length, 'No orders');
    orderIndChart('ytdInd', any, 'YTD', 'Company-wise · YTD orders');
    accountsTable('ytdCo', any);
  }

  // ---- lifecycle ----------------------------------------------------------------------------
  function render() {
    charts.forEach(c => c.destroy());
    charts = [];
    themeColors();
    Chart.defaults.font.family = 'Arial,Helvetica,sans-serif';
    Chart.defaults.color = css('--ink-2');
    kpis();
    weekRender();
    targeting();
    dialCharts();
    storeTbl();
    personaTbl();
    ytdRender();
  }

  const rowKey = (e: Event, attr: string) => {
    const tr = (e.target as HTMLElement).closest(`tr[${attr}]`) as HTMLElement | null;
    return tr ? decodeURIComponent(tr.getAttribute(attr)!) : null;
  };
  const rowHandler = (attr: string, fn: (k: string) => void) => (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    const k = rowKey(e, attr);
    if (k == null) return;
    e.preventDefault();
    fn(k);
  };
  const listeners: [EventTarget, string, EventListener][] = [
    [$('dclose'), 'click', closeDrawer],
    [document, 'keydown', (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') closeDrawer(); }],
  ];
  for (const [id, attr, fn] of [['tvd', 'data-ind', tvdDrill], ['tStore', 'data-k', storeDrill], ['tPersona', 'data-k', personaDrill]] as const) {
    listeners.push([$(id), 'click', rowHandler(attr, fn)], [$(id), 'keydown', rowHandler(attr, fn)]);
  }
  for (const [t, ev, fn] of listeners) t.addEventListener(ev, fn);

  return {
    render,
    setAgent(a: number | 'all') { agent = a; render(); },
    destroy() {
      charts.forEach(c => c.destroy());
      charts = [];
      for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
      closeDrawer();
    },
  };
}
