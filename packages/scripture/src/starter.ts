import { parseRefKey, verseCount, type Ref } from './reference.ts';

export type Link = 'direct' | 'related' | 'common';
export const LINK_LABEL: Record<Link, string> = { direct: 'Direct thematic connection', related: 'Related theme', common: 'Commonly associated passage' };
export interface StarterItem { ref: string; link: Link; note?: string }
export interface StarterWell { id: string; name: string; description: string; intro: string; tags: string[]; items: StarterItem[]; prompts: string[]; memorize: string; status: 'draft' | 'reviewed' }

const d = (ref: string, note?: string): StarterItem => ({ ref, link: 'direct', note });
const r = (ref: string, note?: string): StarterItem => ({ ref, link: 'related', note });
const c = (ref: string, note?: string): StarterItem => ({ ref, link: 'common', note });
const W = (id: string, name: string, tags: string[], description: string, intro: string, items: StarterItem[], prompts: string[], memorize: string): StarterWell => ({ id, name, description, intro, tags, items, prompts, memorize, status: 'draft' });

/**
 * Editorial draft. Every passage is a reference only: the words come from the licensed translation. Each list is ordered to move from the most direct passage outward,
 * and every item can be reviewed and removed. Items marked common carry a context note so nothing is read as a promise it does not make.
 */
export const STARTER_WELLS: StarterWell[] = [
  W('peace-when-worried', 'Peace When Worried', ['peace', 'anxiety', 'worry', 'trust'], 'Passages for restless minds and heavy thoughts.', 'These passages speak to worry and the peace they describe. Read slowly; stay with one phrase.',
    [d('PHP.4.6-7'), d('1PE.5.7'), d('MAT.6.25-34'), d('PSA.94.19'), d('ISA.26.3'), d('JHN.14.27'), c('PSA.55.22'), r('PSA.29.11'), r('PRO.12.25'), r('PHP.4.8-9')],
    ['What are you carrying that you could hand over today?', 'Which phrase here do you most want to remember?'], 'PHP.4.6-7'),
  W('courage-for-difficult-days', 'Courage for Difficult Days', ['courage', 'fear', 'strength'], 'Passages about facing fear and hard things.', 'Courage in these passages is not the absence of fear. Read them as words spoken to people who were afraid.',
    [d('JOS.1.9'), d('ISA.41.10'), d('DEU.31.6'), d('PSA.27.1'), d('2TI.1.7'), d('PSA.56.3-4'), d('ISA.43.1-2'), r('PSA.118.6'), r('1CO.16.13'), r('PSA.31.24')],
    ['What difficult thing is in front of you today?', 'What would taking one small step look like?'], 'JOS.1.9'),
  W('hope-when-discouraged', 'Hope When Discouraged', ['hope', 'discouragement', 'perseverance'], 'Passages for low days and long roads.', 'These passages hold hope next to honest weariness. If heaviness lasts, speaking with a doctor or counsellor is part of caring for yourself.',
    [d('ROM.15.13'), d('LAM.3.21-23'), d('PSA.42.5'), d('PSA.71.14'), d('ISA.40.28-31'), d('2CO.4.16-18'), r('ROM.5.3-5'), r('HEB.6.19'), c('JER.29.11', 'Written to exiles in Babylon. Read it with Jeremiah 29:4-14 for its setting.')],
    ['What feels heavy right now, in plain words?', 'Where have you seen even a small sign of hope lately?'], 'ROM.15.13'),
  W('faith-and-trust', 'Faith and Trust', ['faith', 'trust', 'uncertainty'], 'Passages about trusting when things are unclear.', 'Several of these were written by people who did not have answers. Trust here is often a choice made in the dark.',
    [d('PRO.3.5-6'), d('PSA.37.5'), d('ISA.12.2'), d('HEB.11.1'), d('MRK.9.23-24'), d('PSA.62.5-8'), d('2CO.5.7'), r('HEB.11.6'), r('PSA.9.10'), c('HAB.3.17-19')],
    ['What are you trying to control that you could loosen your grip on?', 'What has helped you trust before?'], 'PRO.3.5-6'),
  W('healing-and-comfort', 'Healing and Comfort', ['healing', 'comfort', 'sickness'], 'Passages about care and comfort in sickness and pain.', 'These passages speak of God\u2019s care for the hurting. They do not replace medical care, and they do not promise a particular outcome.',
    [d('PSA.147.3'), d('PSA.103.2-4'), d('JER.17.14'), d('ISA.40.1-2'), r('PSA.30.2'), r('PSA.41.3'), r('PSA.119.50'), r('PSA.73.26')],
    ['What do you most need comfort for today?', 'Who could you let know how you are really doing?'], 'PSA.147.3'),
  W('wisdom-and-direction', 'Wisdom and Direction', ['wisdom', 'guidance', 'decisions'], 'Passages for decisions and finding your way.', 'These passages treat wisdom as something asked for and practised. They offer guidance for how to decide, not a script for what to decide.',
    [d('JAS.1.5'), d('PSA.32.8'), d('PRO.2.6'), d('PSA.119.105'), d('PRO.16.3'), d('PRO.16.9'), d('ISA.30.21'), d('PSA.25.4-5'), r('PRO.11.14'), r('PRO.19.21'), r('COL.1.9')],
    ['What decision are you holding?', 'Who is a wise person you could ask?'], 'JAS.1.5'),
  W('provision-and-contentment', 'Provision and Contentment', ['provision', 'contentment', 'enough'], 'Passages about need, enough, and being content.', 'Contentment in these passages sits beside real need. Notice where they speak of daily care rather than abundance.',
    [d('PHP.4.11-13', 'Paul wrote this from prison.'), d('PSA.23.1'), d('1TI.6.6-8'), d('HEB.13.5'), d('PSA.145.15-16'), d('MAT.6.31-33'), r('PRO.30.8-9'), r('DEU.8.3'), r('LUK.12.22-24'), r('2CO.9.8'), c('PHP.4.19', 'Written to a church that had supported Paul. Read it with Philippians 4:10-18.')],
    ['What is enough for today?', 'What are you grateful already has been provided?'], 'HEB.13.5'),
  W('gratitude', 'Gratitude', ['gratitude', 'thanksgiving', 'praise'], 'Passages of thanks and praise.', 'Short passages for noticing what you have been given.',
    [d('PSA.100.1-5'), d('1TH.5.16-18'), d('PSA.107.1'), d('PSA.136.1-3'), d('PSA.103.1-2'), d('PSA.9.1-2'), d('PSA.95.1-2'), r('COL.3.15-17'), r('LUK.17.11-19'), r('EPH.5.20'), r('JAS.1.17')],
    ['What are three small things from today you are thankful for?', 'Who could you thank?'], '1TH.5.16-18'),
  W('forgiveness', 'Forgiveness', ['forgiveness', 'mercy', 'reconciliation'], 'Passages on forgiving and being forgiven.', 'Forgiveness here runs both ways: being forgiven and forgiving. Take the one that is yours today.',
    [d('PSA.103.10-12'), d('1JN.1.9'), d('EPH.4.31-32'), d('COL.3.12-13'), d('MAT.6.14-15'), d('MAT.18.21-22'), d('PSA.32.1-2'), d('MIC.7.18-19'), r('LUK.6.37'), r('ISA.1.18'), r('PSA.51.1-2'), r('LUK.23.34')],
    ['Is there something you need to be forgiven for, or to forgive?', 'What would setting it down feel like?'], 'EPH.4.31-32'),
  W('grief-and-comfort', 'Grief and Comfort', ['grief', 'comfort', 'loss'], 'Passages for loss and for those who mourn.', 'These passages sit with sorrow and do not hurry it. Grief does not follow a schedule.',
    [d('PSA.34.18'), d('MAT.5.4'), d('REV.21.3-4'), d('2CO.1.3-4'), d('JHN.11.33-35'), d('1TH.4.13-14'), d('PSA.56.8'), r('PSA.30.5'), r('PSA.126.5-6'), r('ISA.61.1-3'), r('ROM.8.38-39')],
    ['Who or what are you missing today?', 'What is one memory you would like to hold gently?'], 'PSA.34.18'),
  W('morning-strength', 'Morning Strength', ['morning', 'strength', 'new day'], 'Short passages to begin the day.', 'A few minutes for the start of the day. Listen once, then carry one line with you.',
    [d('LAM.3.22-23'), d('PSA.143.8'), d('PSA.5.3'), d('PSA.90.14'), d('PSA.118.24'), d('PSA.46.1'), d('ISA.33.2'), r('NEH.8.10'), r('PSA.28.7'), r('PSA.59.16'), r('EXO.15.2'), c('PHP.4.13', 'Paul is speaking of being content in every circumstance, not of achieving anything he wants.')],
    ['What is one thing you want to carry into today?', 'What would make today a good day, however small?'], 'LAM.3.22-23'),
  W('evening-reflection', 'Evening Reflection', ['evening', 'rest', 'sleep'], 'Passages for winding down.', 'Quiet passages for the end of the day. Set a sleep timer if you like.',
    [d('PSA.4.8'), d('PSA.91.1-2'), d('PSA.121.1-8'), d('PSA.23.1-6'), d('PSA.63.6-7'), d('PSA.134.1-3'), d('PSA.3.5'), r('MAT.11.28-30'), r('PSA.16.7-9'), r('PSA.139.23-24'), r('PRO.3.24'), r('PSA.127.2')],
    ['What from today do you want to set down?', 'What went well, even a little?'], 'PSA.4.8'),
  W('before-a-difficult-conversation', 'Before a Difficult Conversation', ['conversation', 'speech', 'reconciliation'], 'Passages on speaking with care.', 'These passages are about how we speak: slowly, honestly and kindly. Read them before you go in.',
    [d('PRO.15.1'), d('JAS.1.19-20'), d('COL.4.6'), d('EPH.4.15'), d('EPH.4.29'), d('PSA.141.3'), d('PSA.19.14'), r('PRO.16.24'), r('PRO.18.13'), r('MAT.5.23-24'), r('PRO.12.18'), c('EXO.4.11-12', 'Moses is being sent to speak to Pharaoh; the setting is his fear of speaking.')],
    ['What do you most want the other person to understand?', 'What do you most need to hear from them?'], 'PRO.15.1'),
  W('patience-and-waiting', 'Patience and Waiting', ['patience', 'waiting', 'perseverance'], 'Passages for seasons of waiting.', 'Waiting in these passages is active and often painful. They do not say it is easy.',
    [d('PSA.27.14'), d('PSA.37.7'), d('ISA.30.18'), d('LAM.3.25-26'), d('PSA.40.1-3'), d('ROM.8.24-25'), d('JAS.5.7-8'), d('PSA.130.5-6'), d('MIC.7.7'), r('GAL.6.9'), r('HAB.2.3'), r('ROM.12.12'), r('HEB.10.36'), r('ECC.3.1-8')],
    ['What are you waiting for?', 'What is one thing you can do while you wait?'], 'PSA.27.14'),
  W('purpose-and-calling', 'Purpose and Calling', ['purpose', 'calling', 'work'], 'Passages about meaning, gifts and work.', 'Calling in these passages is often ordinary: faithful work, shared gifts, and doing justice. Read them as invitations to look, not as a map.',
    [d('EPH.2.10'), d('1PE.4.10'), d('COL.3.23-24'), d('PSA.138.8'), d('MIC.6.8'), d('ISA.6.8'), d('PSA.90.17'), r('1CO.12.4-7'), r('MAT.5.14-16'), r('ROM.12.4-8'), c('EST.4.14', 'Said to Esther before she risked speaking to the king.'), c('PHP.1.6', 'Paul is speaking of a church\u2019s shared work, not a personal guarantee.')],
    ['What work or task feels most like yours?', 'Who benefits when you do it well?'], 'MIC.6.8'),
  W('family-and-relationships', 'Family and Relationships', ['family', 'love', 'friendship'], 'Passages on love, family and friendship.', 'Relationships in these passages are shown with both joy and effort. Use them to bring someone to mind.',
    [d('ECC.4.9-12'), d('PRO.17.17'), d('COL.3.12-14'), d('1CO.13.4-7'), d('1JN.4.7-8'), d('ROM.12.9-10'), d('PHP.2.3-4'), r('JOS.24.15'), r('PSA.127.3'), r('EPH.6.1-4'), r('PRO.27.17'), r('PSA.133.1'), r('PRO.18.24'), c('RUT.1.16', 'Ruth is speaking to her mother-in-law, not a spouse.')],
    ['Who comes to mind first?', 'What is one kind thing you could do for them this week?'], 'PRO.17.17'),
];
export const GENERIC_PROMPTS = ['What phrase stands out to you?', 'What concern are you bringing to this passage?', 'What would you like to remember today?', 'What part would you like to revisit?'];

export const refOf = (k: string): Ref => { const x = parseRefKey(k); if (!x) throw new Error(`Bad reference ${k}`); return x; };
/** About 10 seconds a verse read slowly, plus a short pause between passages. */
export function estimateMinutes(w: StarterWell): number {
  const sec = w.items.reduce((n, i) => n + Math.max(1, verseCount(refOf(i.ref))) * 10 + 4, 0);
  return Math.max(1, Math.round(sec / 60));
}

/** Checks every starter passage against the imported text: the chapter must exist and be long enough. Returns the problems, empty when all is well. */
export function validateStarter(verses: (book: number, chapter: number) => number | undefined): string[] {
  const bad: string[] = [];
  for (const w of STARTER_WELLS) for (const i of w.items) {
    const r = refOf(i.ref); const max = verses(r.book.n, r.chapter);
    if (max === undefined) bad.push(`${w.id}: ${i.ref} (chapter not found)`);
    else if ((r.verseEnd ?? r.verseStart ?? 1) > max || (r.verseStart ?? 1) > max) bad.push(`${w.id}: ${i.ref} (chapter has ${max} verses)`);
  }
  return bad;
}
