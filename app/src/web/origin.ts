/**
 * Whether an answer about where the household is may be remembered.
 *
 * Deliberately its own file with no DOM in it, so the rule can be tested
 * without a browser.
 *
 * The app starts from a configured town when nobody has said where they are,
 * and labels that on screen as 「（既定）」. That label is the whole reason
 * starting from a default is honest rather than a guess about the household.
 *
 * Saving the default as if it were an answer quietly destroys that: the next
 * request carries an areaCode, the server correctly reports `chosen`, the label
 * disappears, and from then on the screen presents a town the household never
 * picked as their own. The default has to stay a default until someone chooses.
 */
export function areaCodeToRemember(
  originSource: 'gps' | 'chosen' | 'default',
  currentAreaCode: string | null,
  answeredAreaCode: string,
): string | null {
  return originSource === 'default' ? currentAreaCode : answeredAreaCode;
}
