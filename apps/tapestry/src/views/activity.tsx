import { useLiveQuery } from 'dexie-react-hooks';
import { BADGES, DEFAULT_TARGET_DAYS, dayIndex } from '@wells/activity';
import { setSetting } from '../db';
import { summary, today } from '../activity';
import { player } from '../audio';
import { BadgeArt, PlayGlyph, Weave } from '../ui';
import { useNav } from '../nav';
import { db } from '../db';
import { wellView, loadPassage, progressOf } from '../data';
import { queueFor } from './home';

const KIND: Record<string, string> = { save_passage: 'Saved passages', add_to_well: 'Added to wells', create_well: 'Created wells', order_well: 'Ordered wells', write_note: 'Wrote notes', listen_day: 'Listened' };
export function Activity() {
  const nav = useNav(); const s = useLiveQuery(summary, [], null);
  if (!s) return <div className="screen"><h1 className="h1">Activity</h1></div>;
  const by = new Map<string, number>(); s.weekEvents.forEach((e) => by.set(e.kind, (by.get(e.kind) ?? 0) + e.amount));
  const nextId = s.badges.next?.id;
  const listen = async () => { const w = (await wellView((await db.settings.get('currentWell'))?.value as string ?? 'courage-for-difficult-days')) ?? (await wellView('courage-for-difficult-days')); if (!w) return; const q = await queueFor(w, await progressOf(w.id)); if (q.length) { player.setMode({ silence: true }); player.play(q); nav.go({ t: 'player' }); } else nav.toast('Passages are not on this device yet.'); void loadPassage; };
  return (
    <div className="screen">
      <h1 className="h1">Activity</h1>
      <div className="row" style={{ alignItems: 'flex-end', marginTop: 20 }}><div className="serif b" style={{ fontSize: 88, lineHeight: 0.85 }}>{s.thread.count}</div><div style={{ paddingBottom: 4 }}><div className="b" style={{ fontSize: 18 }}>day thread</div><div className="sm mut">Longest: {s.thread.longest} days</div></div></div>
      <div style={{ marginTop: 18 }}><Weave days={s.weekly.doneDays} todayIdx={dayIndex(today())} /></div>
      <p style={{ marginTop: 16 }}>{s.thread.todayDone ? 'Your thread is kept for today.' : s.thread.count ? 'Your thread is waiting. A one-minute listen today keeps it unbroken.' : 'A one-minute listen today starts your thread.'} <span className="mut">One rest day each week keeps it whole if life gets in the way{s.thread.restUsedThisWeek ? ' (this week\u2019s is used)' : ''}.</span></p>
      {!s.thread.todayDone && <button className="btn primary big" style={{ marginTop: 14 }} onClick={() => void listen()}><PlayGlyph />Listen for 1 minute</button>}
      <div className="sec" style={{ marginTop: 22 }}><div className="row between"><span className="b">Weekly target</span><span className="b tx">{s.weekly.done} of {s.weekly.target} days</span></div>
        <div className="segs" style={{ marginTop: 10 }}>{Array.from({ length: s.weekly.target }, (_, i) => <i key={i} className={i < s.weekly.done ? 'on' : ''} />)}</div>
        <div className="sm mut" style={{ marginTop: 8 }}>{s.weekly.met ? 'Target reached. Anything more is a bonus.' : s.weekly.reachable ? `${s.weekly.remaining} more ${s.weekly.remaining === 1 ? 'day' : 'days'} by Sunday reaches your target.` : 'This week\u2019s target is out of reach. A fresh week starts Monday.'}</div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}><span className="sm mut">Target:</span>{[3, 4, 5, 6, 7].map((d) => <button key={d} className="pill" aria-pressed={s.weekly.target === d} onClick={() => void setSetting('targetDays', d)}>{d} days</button>)}</div></div>
      <div className="sec"><div className="row between"><span className="b">Level {s.xp.level} · {s.xp.name}</span><span className="b tx">{s.xp.xp} XP</span></div><div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${Math.round(s.xp.pct * 100)}%` }} /></div><div className="sm mut" style={{ marginTop: 8 }}>{s.xp.next ? `${s.xp.toNext} XP to level ${s.xp.level + 1}` : 'Highest level reached'}. XP is earned for saving and organising passages.</div></div>
      <div className="sec"><div className="row between"><span className="b">XP this week</span><span className="b tx">+{s.xp.week}</span></div>{[...by].map(([k, v]) => <div key={k} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}><span>{KIND[k] ?? k}</span><span className="b tx">+{v}</span></div>)}{!by.size && <p className="sm mut">Nothing yet this week. Save a passage to a well to earn your first XP.</p>}</div>
      <div className="sec"><div className="b">Milestones</div><div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>{BADGES.map((b) => { const earned = s.badges.earned.some((e) => e.id === b.id); const st = earned ? 'earned' : b.id === nextId ? 'next' : 'locked'; return <div key={b.id} className="grow stack" style={{ alignItems: 'center', gap: 6, textAlign: 'center' }}><BadgeArt strands={b.strands} state={st} progress={s.badges.progress} /><div className="b sm" style={{ lineHeight: 1.2 }}>{b.name}</div><div className="sm mut" style={{ fontSize: 12 }}>{st === 'next' ? `${s.thread.count} of ${b.days} days` : `${b.days} days`}</div></div>; })}</div>{s.badges.next && <p className="sm mut" style={{ marginTop: 12 }}>{s.badges.next.days - s.thread.count <= 1 ? `Tomorrow you could earn the ${s.badges.next.name}.` : `${s.badges.next.days - s.thread.count} more days to the ${s.badges.next.name}.`}</p>}</div>
      <div className="sec"><div className="row between"><span className="b">Weekly insight</span><span className="sm tx">Summary of your week</span></div><p className="serif" style={{ fontSize: 20, lineHeight: 1.4, marginTop: 10 }}>{s.insight.text}</p></div>
    </div>
  );
}
void DEFAULT_TARGET_DAYS;
