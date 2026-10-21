import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === '__tests__') {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }
    if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('console', () => {
  it('no usa console fuera de logger.ts', () => {
    const sourceRoot = path.resolve(__dirname, '..');
    const offenders = walk(sourceRoot).filter((file) => {
      if (file.endsWith(`${path.sep}infrastructure${path.sep}logger.ts`)) {
        return false;
      }
      return /console\./.test(readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });
});
