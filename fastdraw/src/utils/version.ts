import packageJson from '../../package.json';

export const getVersion = (): string => {
  return packageJson.version;
};
