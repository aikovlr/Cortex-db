import { createHash } from 'node:crypto';

/**
 * Calculates the MD5 hash of a given string.
 * @param content The string to be hashed.
 * @returns The MD5 hash in hexadecimal format.
 */
export function calculateMd5Hash(content: string): string {
  return createHash('md5')
    .update(content)
    .digest('hex');
}