/**
 * The word count of the status bar (PLAN 4.1): runs of letters and digits, with apostrophes inside
 * words ("don't", "d’água") counted as one word. Markdown markers are not words.
 *
 * Talks to: nothing.
 */

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/**
 * Counts the words of a text.
 *
 * @param text - Any text.
 * @returns The number of words.
 */
export function countWords(text: string): number {
  let count = 0;
  for (const _ of text.matchAll(WORD)) count += 1;
  return count;
}
