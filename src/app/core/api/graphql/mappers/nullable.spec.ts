import { blankToNull } from './nullable';

describe('blankToNull', () => {
  it('turns an empty or whitespace-only string into null', () => {
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull('\n\t')).toBeNull();
  });

  it('turns an absent value into null rather than leaving it undefined', () => {
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
  });

  it('passes a real value through untouched, whitespace and all', () => {
    expect(blankToNull('Bantry')).toBe('Bantry');
    expect(blankToNull(' Bantry ')).toBe(' Bantry ');
  });
});
