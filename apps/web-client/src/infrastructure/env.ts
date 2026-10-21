export interface WebClientEnv {
  mode: string;
  dev: boolean;
}

export const env: WebClientEnv = {
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
};
