// Turns simple LaTeX and math symbols into words a voice can say. Covers the common cases, not all of LaTeX.

const GREEK: Record<string, string> = { alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', theta: 'theta', lambda: 'lambda', mu: 'mu', pi: 'pi', rho: 'rho', sigma: 'sigma', tau: 'tau', phi: 'phi', omega: 'omega', Delta: 'delta', Sigma: 'sigma', Omega: 'omega', Pi: 'pi', Phi: 'phi' };
const WORDS: Record<string, string> = {
  leq: 'less than or equal to', le: 'less than or equal to', geq: 'greater than or equal to', ge: 'greater than or equal to', neq: 'not equal to', ne: 'not equal to',
  approx: 'approximately', times: 'times', cdot: 'times', div: 'divided by', pm: 'plus or minus', infty: 'infinity', to: 'goes to', rightarrow: 'goes to', Rightarrow: 'implies',
  sum: 'the sum of', prod: 'the product of', int: 'the integral of', partial: 'partial', nabla: 'del', in: 'in', forall: 'for all', exists: 'there exists', ldots: 'and so on', dots: 'and so on', cdots: 'and so on',
  sin: 'sine of', cos: 'cosine of', tan: 'tangent of', log: 'log of', ln: 'natural log of', lim: 'the limit', max: 'the maximum', min: 'the minimum', mathbb: '', mathrm: '', text: '', mathbf: '', operatorname: '',
};
const UNICODE: Record<string, string> = { '≤': ' less than or equal to ', '≥': ' greater than or equal to ', '≠': ' not equal to ', '≈': ' approximately ', '±': ' plus or minus ', '×': ' times ', '÷': ' divided by ', '√': ' the square root of ', 'π': ' pi ', '∞': ' infinity ', '∑': ' the sum of ', '∫': ' the integral of ', '²': ' squared', '³': ' cubed', '→': ' goes to ', 'Δ': ' delta ', 'µ': ' mu ', 'θ': ' theta ', 'λ': ' lambda ', 'σ': ' sigma ' };

/** Reads {...} starting at index i (which must be '{'). Returns the inside text and the index after the closing brace. */
function group(s: string, i: number): { body: string; end: number } | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return { body: s.slice(i + 1, k), end: k + 1 };
  }
  return null;
}

function replaceCommands(s: string): string {
  let out = s;
  for (let guard = 0; guard < 50; guard++) {
    const f = out.indexOf('\\frac');
    if (f >= 0) {
      const a = group(out, f + 5), b = a && group(out, a.end);
      if (a && b) { out = `${out.slice(0, f)} ${a.body} over ${b.body} ${out.slice(b.end)}`; continue; }
    }
    const r = /\\sqrt(\[(\w+)\])?/.exec(out);
    if (r) {
      const g = group(out, r.index + r[0].length);
      if (g) { const root = r[2] ? (r[2] === '3' ? 'the cube root of' : `the ${r[2]}th root of`) : 'the square root of'; out = `${out.slice(0, r.index)} ${root} ${g.body} ${out.slice(g.end)}`; continue; }
    }
    break;
  }
  return out;
}

export function mathToSpeech(latex: string): string {
  let s = latex.trim().replace(/^\${1,2}|\${1,2}$/g, '').replace(/^\\\[|\\\]$/g, '');
  s = replaceCommands(s);
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_m, p: string) => (p === '2' ? ' squared ' : p === '3' ? ' cubed ' : ` to the power ${p} `));
  s = s.replace(/\^\s*(\w)/g, (_m, p: string) => (p === '2' ? ' squared ' : p === '3' ? ' cubed ' : ` to the power ${p} `));
  s = s.replace(/_\s*\{([^{}]*)\}/g, ' sub $1 ').replace(/_\s*(\w)/g, ' sub $1 ');
  s = s.replace(/\\([A-Za-z]+)/g, (_m, name: string) => (name in GREEK ? ` ${GREEK[name]} ` : name in WORDS ? ` ${WORDS[name]} ` : ` ${name} `));
  s = s.replace(/\\[,;:! ]|\\left|\\right/g, ' ');
  s = s.replace(/[≤≥≠≈±×÷√π∞∑∫²³→Δµθλσ]/g, (c) => UNICODE[c] ?? c);
  s = s.replace(/[{}]/g, ' ').replace(/=/g, ' equals ').replace(/\+/g, ' plus ').replace(/(\w|\)|\s)-(\w|\()/g, '$1 minus $2').replace(/</g, ' is less than ').replace(/>/g, ' is greater than ').replace(/\//g, ' over ').replace(/\*/g, ' times ');
  return s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

// Opening $ must touch text, closing $ must too and must not be followed by a digit, so "$5 and $10" is never read as math.
const INLINE = /(?<![\\$])\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

export function replaceInlineMath(text: string, mode: 'off' | 'symbols'): string {
  return text.replace(INLINE, (_m, inner: string) => (mode === 'symbols' ? mathToSpeech(inner) : 'an equation'));
}
