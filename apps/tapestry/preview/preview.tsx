import { createRoot } from 'react-dom/client';
import { bookByCode, passageId } from '@wells/scripture';
import { db, setSetting } from '../src/db';
import { today } from '../src/activity';
import { addDays } from '@wells/activity';
import { App } from '../src/App';

// Sample text for this preview only: a few short World English Bible verses typed in by hand. The real app downloads the full text from the server.
const SAMPLE: Record<string, string[]> = {
  'ISA.41.10': ["Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness."],
  'PSA.46.1': ['God is our refuge and strength, a very present help in trouble.'],
  'PHP.4.6': ['In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.', 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.'],
  '1PE.5.7': ['casting all your worries on him, because he cares for you.'],
  'JHN.14.27': ['Peace I leave with you. My peace I give to you; not as the world gives, give I to you. Don’t let your heart be troubled, neither let it be fearful.'],
  '2TI.1.7': ['For God didn’t give us a spirit of fear, but of power, love, and self-control.'],
  'ROM.15.13': ['Now may the God of hope fill you with all joy and peace in believing, that you may abound in hope, in the power of the Holy Spirit.'],
  'MAT.11.28': ['Come to me, all you who labor and are heavily burdened, and I will give you rest.', 'Take my yoke upon you, and learn from me, for I am gentle and lowly in heart; and you will find rest for your souls.', 'For my yoke is easy, and my burden is light.'],
  'JAS.1.5': ['But if any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach; and it will be given him.'],
  'MAT.5.4': ['Blessed are those who mourn, for they shall be comforted.'],
  'EPH.4.32': ['Be kind to one another, tenderhearted, forgiving each other, just as God also in Christ forgave you.'],
  'PRO.15.1': ['A gentle answer turns away wrath, but a harsh word stirs up anger.'],
};
async function seed() {
  const rows = Object.entries(SAMPLE).flatMap(([k, vs]) => { const [c, ch, v0] = k.split('.'); return vs.map((text, i) => ({ key: `engwebp:${bookByCode(c)!.n}:${ch}:${+v0 + i}`, tr: 'engwebp', book: bookByCode(c)!.n, chapter: +ch, verse: +v0 + i, text })); });
  await db.verses.bulkPut(rows);
  const items = ['JHN.14.27', 'PHP.4.6-7', '1PE.5.7', '2TI.1.7', 'ISA.41.10', 'PSA.46.1', 'ROM.15.13', 'MAT.11.28-30', 'JAS.1.5'];
  const now = Date.now(); await db.wells.add({ id: 'demo-courage', name: 'Courage for Difficult Days', description: 'Passages for hard days.', kind: 'mine', createdAt: now, updatedAt: now });
  await db.items.bulkAdd(items.map((ref, position) => ({ id: passageId(ref) + position, wellId: 'demo-courage', ref, position, updatedAt: now })));
  await db.progress.put({ wellId: 'demo-courage', index: 4, updatedAt: now });
  const t = today();
  for (let o = 1; o <= 6; o++) { const day = addDays(t, -o); await db.listens.add({ id: `l${o}`, day, at: Date.parse(`${day}T07:30:00`), seconds: o === 4 ? 360 : 100, wellName: 'Courage for Difficult Days', synced: 1 }); const n = [7, 6, 6, 5, 6, 4][o - 1]; for (let i = 0; i < n; i++) await db.events.add({ id: `e${o}-${i}`, kind: 'save_passage', ref: `X.${o}.${i}`, day, amount: 10, at: Date.parse(`${day}T08:00:00`), synced: 1 }); }
  await setSetting('currentWell', 'demo-courage'); await setSetting('onboarded', true); await setSetting('theme', new URLSearchParams(location.search).get('theme') ?? 'dark');
}
const note = document.createElement('div'); note.textContent = 'Preview: sample text and activity'; note.setAttribute('style', 'position:fixed;top:4px;right:8px;z-index:99;font:600 12px sans-serif;color:#b09aa5;background:#1f131a;border:1px solid #3a2631;border-radius:99px;padding:3px 10px;pointer-events:none'); document.body.appendChild(note);
void seed().then(() => createRoot(document.getElementById('root')!).render(<App />));
