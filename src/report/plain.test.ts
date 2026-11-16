import { describe, expect, it } from 'vitest';
import { plainWords } from './plain';

describe('plain words (Use jargon off)', () => {
  it('replaces draws, outs and equity with what they mean', () => {
    expect(plainWords('Bet about 60% of the pot to deny the draws their equity.')).toBe('Bet about 60% of the pot to make players who need one more card pay to see it.');
    expect(plainWords('Your 9 outs give about 19%.')).toBe('Your 9 helping cards give about 19%.');
    expect(plainWords('Flop 8-2-5: two diamonds, so a flush draw is possible, straight draws are possible.')).toBe('Flop 8-2-5: two diamonds, so a player may be one card short of a flush, a player may be one card short of a straight.');
  });
  it('keeps a capital at the start of a sentence and reads hand shorthand', () => {
    expect(plainWords('Re-raise to about 24.')).toBe('Raise back to about 24.');
    expect(plainWords('Any Qx now has a pair.')).toBe('Any hand with a Q now has a pair.');
    expect(plainWords('With T7o, do you limp behind or raise?')).toBe('With 10-7 (two suits), do you call the BB too or raise?');
  });
  it('leaves text with no terms unchanged', () => {
    expect(plainWords('Check. Take the free card.')).toBe('Check. Take the free card.');
  });
});
