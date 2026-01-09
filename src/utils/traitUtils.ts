/**
 * Trait utility functions for checking derived/implied traits
 */

/**
 * Check if a unit has the Mechanical trait (including derived traits)
 *
 * From traits.json:
 * - Vehicle: "has all the benefits of the Mechanical trait"
 * - LivingMetal: "This unit is also Mechanical"
 *
 * @param traits Array of trait IDs
 * @returns true if unit should be treated as Mechanical
 */
export function hasMechanicalTrait(traits: string[] | undefined): boolean {
  if (!traits) return false;
  return traits.includes('Mechanical') ||
         traits.includes('Vehicle') ||
         traits.includes('LivingMetal');
}
