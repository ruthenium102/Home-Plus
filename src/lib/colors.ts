import type { MemberColor } from '@/types';

/**
 * Color palette for family members. Each color has a 'base' (the dot/avatar bg)
 * and 'soft' (event chips, pills) variant for both light and dark themes.
 *
 * Designed to look good side-by-side, distinguishable for ~6 family members,
 * and readable as event blocks on a calendar.
 */
export const MEMBER_COLORS: Record<
  MemberColor,
  { base: string; soft: string; text: string; dark: { base: string; soft: string; text: string } }
> = {
  terracotta: {
    base: '#c44d2e',
    soft: '#fae0d4',
    text: '#fff',
    dark: { base: '#e07450', soft: '#3a261e', text: '#fff' }
  },
  sage: {
    base: '#5b8a72',
    soft: '#dfeae2',
    text: '#fff',
    dark: { base: '#7da793', soft: '#243029', text: '#fff' }
  },
  sand: {
    base: '#d4a574',
    soft: '#f5e8d6',
    text: '#1a1815',
    dark: { base: '#e0b486', soft: '#3a2e21', text: '#1a1815' }
  },
  'dusty-blue': {
    base: '#6b7fa8',
    soft: '#dde3ee',
    text: '#fff',
    dark: { base: '#8b9fc4', soft: '#252b3a', text: '#fff' }
  },
  plum: {
    base: '#8a6a8a',
    soft: '#ebdfeb',
    text: '#fff',
    dark: { base: '#a98ba9', soft: '#332633', text: '#fff' }
  },
  rose: {
    base: '#c47089',
    soft: '#f5dde4',
    text: '#fff',
    dark: { base: '#d990a4', soft: '#3a2530', text: '#fff' }
  },
  olive: {
    base: '#8a8a4a',
    soft: '#ececd0',
    text: '#fff',
    dark: { base: '#a8a868', soft: '#2e2e1c', text: '#fff' }
  },
  slate: {
    base: '#5a6470',
    soft: '#dde0e4',
    text: '#fff',
    dark: { base: '#7c8693', soft: '#22262b', text: '#fff' }
  }
};

export const COLOR_OPTIONS: MemberColor[] = [
  'terracotta',
  'sage',
  'sand',
  'dusty-blue',
  'plum',
  'rose',
  'olive',
  'slate'
];

/** Get the right shade for current theme. */
export function getColorTokens(color: MemberColor, isDark: boolean) {
  const c = MEMBER_COLORS[color];
  return isDark ? c.dark : { base: c.base, soft: c.soft, text: c.text };
}
