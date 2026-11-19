/* Plain words for a new player: "Use jargon" off in the report critique swaps poker terms for what they mean.
   The critique is written with the terms; this runs on the finished text, so jargon on stays exactly as written.
   Longer phrases come first, so "flush draw" is replaced before "draw". */

type To = string | ((...g: string[]) => string);
const an = (r: string) => (/^(A|8)$/.test(r) ? 'an' : 'a');
const rank = (r: string) => (r === 'T' ? '10' : r);
const SUITS = '(?:heart|diamond|club|spade)s?';

const RULES: [RegExp, To][] = [
  // draws and the chance to win
  [/\bso a flush draw is possible\b/gi, 'so a player may be one card short of a flush'],
  [/\bstraight draws are possible\b/gi, 'a player may be one card short of a straight'],
  [/\bfew straight draws\b/gi, 'few chances of a straight'],
  [/\bsome value bets\b/gi, 'some bets that worse hands call'],
  [/\bre-raise (premium|strong)\b/gi, 'raise back with $1'],
  [/\b(a|the) draw card\b/gi, '$1 card that completes a flush or a straight'],
  [/\bthe draw that hit\b/gi, 'the flush or straight that came'],
  [/\ba straight or flush draw\b/gi, 'four cards to a straight or a flush'],
  [/\bno strong draw\b/gi, 'no good chance to improve'],
  [/\bstrong draw\b/gi, 'good chance to improve'],
  [/\bdeny (?:the )?draws their equity\b/gi, 'make players who need one more card pay to see it'],
  [/\bdeny the flush draw its equity\b/gi, 'make a player who needs one more card for a flush pay to see it'],
  [new RegExp(`\\b(?:a |the )?(${SUITS} )?flush draws?\\b`, 'gi'), (w) => `four ${w ? `${w.trim().replace(/s$/, '')} ` : ''}cards (one short of a flush)`],
  [/\b(?:a |the )?straight draws?\b/gi, 'four cards in a row (one short of a straight)'],
  [/\bsemi-bluffs?\b/gi, 'bet with a hand that can still improve'],
  [/\b(?:a |the )?missed draws?\b/gi, 'a hand that needed one more card and did not get it'],
  [/\bdraws\b/gi, 'hands that need one more card'],
  [/\b(a|the) draw\b/gi, '$1 hand that needs one more card'],
  [/\bdraw\b/gi, 'hand that needs one more card'],
  [/\bequity\b/gi, 'chance to win'],
  [/\bouts\b/gi, 'helping cards'],
  [/\ba made hand\b/gi, 'a hand that already has a pair or better'],
  [/\bmade hands\b/gi, 'hands that already have a pair or better'],
  // value and bluffs
  [/\bvalue hands\b/gi, 'hands that want to get paid'],
  [/\bvalue bets?\b/gi, 'bet that worse hands call'],
  [/\bfor value\b/gi, 'to get paid by worse hands'],
  [/\ban isolation raise\b/gi, 'a raise to play against one player'],
  [/\ba second bet \(a barrel\)/gi, 'a second bet in a row'],
  [/\ba barrel\b/gi, 'a second bet in a row'],
  [/\(a stab\)/gi, '(a bet to take a pot nobody wants)'],
  [/\ba stab\b/gi, 'a bet to take a pot nobody wants'],
  [/\(a donk bet\)/gi, '(a bet into the raiser before the raiser acts)'],
  [/\(a block bet\)/gi, '(a small bet that sets a cheap price)'],
  [/\(a flat call\)/gi, '(a call with no raise back)'],
  [/\(a (\d)-bet\)/gi, '(raise number $1 before the flop)'],
  [/\bthe higher kicker\b/gi, 'the higher side card'],
  [/\bkicker\b/gi, 'side card'],
  [/\bquads\b/gi, 'four of a kind'],
  [/\bheads-up\b/gi, 'against one player'],
  [/\bcontinuation bet\b/gi, 'follow-up bet from the player who raised before the flop'],
  [/\bc-bets?\b/gi, 'follow-up bet from the player who raised before the flop'],
  [/\boverbets?\b/gi, 'bet bigger than the pot'],
  [/\bpolarising\b/gi, 'all or nothing'],
  [/\bcheck-raise\b/gi, 'check, then raise'],
  [/\ba slowplay\b/gi, 'a strong hand played weakly'],
  [/\bslowplaying\b/gi, 'playing a strong hand weakly to trap'],
  [/\bslowplay\b/gi, 'play a strong hand weakly to trap'],
  // players
  [/\b(?:a )?calling station\b/gi, 'a player who calls too often'],
  [/\bstation\b/gi, 'player who calls too often'],
  [/\blimp behind\b/gi, 'call the BB too'],
  [/\blimpers\b/gi, 'players who only called the BB'],
  [/\blimper\b/gi, 'player who only called the BB'],
  [/\blimps\b/gi, 'only calls the BB'],
  [/\ba limp \(a call of the BB\)/gi, 'a call of only the BB'],
  [/\ba limp\b/gi, 'a call of only the BB'],
  [/\blimp\b/gi, 'call only the BB'],
  [/\bre-raise your\b/gi, 'raise back with your'],
  [/\bre-raises?\b/gi, 'raise back'],
  [/\bisolates\b/gi, 'leaves you against one player'],
  [/\bisolate\b/gi, 'play against one player alone'],
  [/\bsteal\b/gi, 'raise to win the blinds'],
  // hands
  [/\boverpair\b/gi, 'pocket pair higher than every board card'],
  [/\btop pair\b/gi, 'a pair with the highest board card'],
  [/\btrips\b/gi, 'three of a kind'],
  [/\btrip (\w+)/gi, 'three $1'],
  [/\ba set\b/gi, 'three of a kind (your pair plus one on the board)'],
  [/\ban overcard to the board\b/gi, 'a card higher than the rest of the board'],
  [/\ban overcard to\b/gi, 'a card higher than'],
  [/\bovercards?\b/gi, 'higher cards'],
  [/\bsuited connectors\b/gi, 'cards in a row of one suit'],
  [/\bconnectors\b/gi, 'cards in a row'],
  [/\bbroadways\b/gi, 'high cards (10 to A)'],
  [/\bsuited\b/gi, 'same-suit'],
  [/\bpremium\b/gi, 'very strong'],
  [/\b([2-9TJQKA])([2-9TJQKA])o\b/g, (a, b) => `${rank(a)}-${rank(b)} (two suits)`],
  [/\b([2-9TJQKA])([2-9TJQKA])s\b/g, (a, b) => `${rank(a)}-${rank(b)} (one suit)`],
  [/\b([Aa])ny ([AKQJ2-9]|10)x\b/g, (a, r) => `${a}ny hand with ${an(r)} ${r}`],
  [/\bStrong ([AKQJ2-9]|10)x is less likely\b/g, (r) => `A strong hand with ${an(r)} ${r} is less likely`],
  [/\b([AKQJ2-9]|10)x\b/g, (r) => `hands with ${an(r)} ${r}`],
  [/\ba capped hand\b/gi, 'a hand that is not very strong'],
  [/\bwide and capped\b/gi, 'wide, with no very strong hands'],
  [/\ba capped range\b/gi, 'a set of possible hands with no very strong ones'],
  [/\bcapped\b/gi, 'with no very strong hands'],
  [/\branges\b/gi, 'sets of possible hands'],
  [/\brange\b/gi, 'set of possible hands'],
  // the board and the table
  [/\bpaired board\b/gi, 'board with a pair on it'],
  [/\btexture\b/gi, 'kind of board'],
  [/\bwet\b/gi, 'connected (many hands can improve)'],
  [/\bdry\b/gi, 'unconnected (few hands can improve)'],
  [/\blead out\b/gi, 'bet first'],
  [/\bout of position\b/gi, 'acting first'],
  [/\bin position\b/gi, 'acting last'],
  [/\bpre-?flop\b/gi, 'before the flop'],
  [/\bstreets\b/gi, 'betting rounds'],
  [/\bstreet\b/gi, 'betting round'],
];

/** The number of capture groups in a pattern. */
const groups = (re: RegExp) => (new RegExp(`${re.source}|`).exec('') ?? []).length - 1;

/** Keeps a capital letter at the start of a sentence. */
const keepCase = (from: string, to: string) => (/^(?!(?:[AKQJ2-9]|10)x\b)[A-Z][a-z-]/.test(from) && /^[a-z]/.test(to) ? to[0].toUpperCase() + to.slice(1) : to);

/** The text with poker terms replaced by plain words. */
export function plainWords(text: string): string {
  let out = text;
  for (const [re, to] of RULES) {
    out = out.replace(re, (m: string, ...g: unknown[]) => {
      const caps = g.slice(0, groups(re)).map((x) => (typeof x === 'string' ? x : ''));
      return keepCase(m, typeof to === 'function' ? to(...caps) : to.replace(/\$(\d)/g, (_, i) => caps[Number(i) - 1] ?? ''));
    });
  }
  // a sentence that now starts with a lower-case word (a term at the start of a sentence was replaced)
  return out.replace(/(^|[.?!] )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}
