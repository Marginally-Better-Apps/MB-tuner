/**
 * Half-width of the "in tune" band in cents (±). Much narrower than this is
 * unrealistically strict for a phone mic on plucked strings; ~±8¢ is a
 * practical band where the note still sounds acceptably in tune.
 */
export const IN_TUNE_CENTS = 8;
