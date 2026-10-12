/** Feelings and situations (the words people actually type) mapped to starter wells. Works with no AI and no network, so discovery never depends on a model. */
export const TOPIC_CHIPS = ['Peace', 'Courage', 'Hope', 'Wisdom', 'Strength', 'Healing', 'Gratitude', 'Forgiveness', 'Focus', 'Confidence', 'Comfort'] as const;
export const CHIP_TO_WELL: Record<string, string> = {
  Peace: 'peace-when-worried', Courage: 'courage-for-difficult-days', Hope: 'hope-when-discouraged', Wisdom: 'wisdom-and-direction', Strength: 'morning-strength',
  Healing: 'healing-and-comfort', Gratitude: 'gratitude', Forgiveness: 'forgiveness', Focus: 'purpose-and-calling', Confidence: 'faith-and-trust', Comfort: 'grief-and-comfort',
};
const LEX: Record<string, string[]> = {
  'peace-when-worried': ['worr', 'anxi', 'anxious', 'stress', 'nervous', 'overwhelm', 'panic', 'restless', 'uneas', 'calm', 'peace'],
  'courage-for-difficult-days': ['afraid', 'fear', 'scare', 'terrif', 'brave', 'courage', 'intimidat', 'strong'],
  'hope-when-discouraged': ['discourag', 'hopeless', 'hope', 'despair', 'give up', 'giving up', 'defeat', 'exhaust', 'tired', 'burnt', 'burned out', 'low'],
  'faith-and-trust': ['faith', 'trust', 'doubt', 'uncertain', 'unsure', 'believe', 'unknown', 'control'],
  'healing-and-comfort': ['sick', 'illness', 'pain', 'hurting', 'surgery', 'hospital', 'heal', 'recover', 'diagnos', 'suffer'],
  'wisdom-and-direction': ['decision', 'decide', 'choose', 'direction', 'guidance', 'guide', 'confus', 'wisdom', 'lost', 'crossroad', 'which way', 'advice'],
  'provision-and-contentment': ['money', 'bills', 'debt', 'provision', 'provide', 'afford', 'job', 'income', 'enough', 'content', 'jealous', 'envy', 'lack'],
  'gratitude': ['thank', 'grate', 'blessed', 'praise', 'appreciat'],
  'forgiveness': ['forgiv', 'resent', 'bitter', 'grudge', 'angry', 'anger', 'hurt me', 'apolog', 'guilt', 'ashamed', 'sorry', 'betray'],
  'grief-and-comfort': ['grie', 'mourn', 'passed away', 'died', 'death', 'funeral', 'lost someone', 'loss', 'lonely', 'sad', 'miss him', 'miss her', 'cry', 'tears'],
  'morning-strength': ['morning', 'wake', 'start my day', 'new day', 'sunrise', 'energy', 'strength'],
  'evening-reflection': ['night', 'sleep', 'insomnia', 'bedtime', 'evening', 'rest', 'wind down', 'tonight'],
  'before-a-difficult-conversation': ['conversation', 'confront', 'argument', 'argue', 'talk to', 'speak to', 'meeting', 'interview', 'boss', 'difficult talk', 'words'],
  'patience-and-waiting': ['wait', 'patien', 'delay', 'slow', 'when will', 'how long', 'season', 'not yet'],
  'purpose-and-calling': ['purpose', 'calling', 'meaning', 'career', 'vocation', 'gifts', 'talent', 'focus', 'why am i here'],
  'family-and-relationships': ['marriage', 'spouse', 'husband', 'wife', 'family', 'friend', 'parent', 'child', 'kids', 'sibling', 'relationship', 'love', 'community'],
};
/** Ranks wells by how many lexicon words appear in the text. Empty when nothing matches (then the screen says so instead of guessing). */
export function wellsForText(text: string): Array<{ wellId: string; score: number }> {
  const t = ` ${text.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  const out: Array<{ wellId: string; score: number }> = [];
  for (const [wellId, words] of Object.entries(LEX)) {
    const score = words.reduce((n, w) => n + (t.includes(` ${w}`) ? 1 : 0), 0);
    if (score) out.push({ wellId, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
