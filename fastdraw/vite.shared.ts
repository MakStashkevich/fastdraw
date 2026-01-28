import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8'),
);

const { dependencies = {}, peerDependencies = {} } = packageJson;

export const externalPackages = [
  ...Object.keys(dependencies),
  ...Object.keys(peerDependencies),
];

export const isExternal = (id: string) =>
  externalPackages.some(
    (pkg) => id === pkg || id.startsWith(`${pkg}/`),
  );
