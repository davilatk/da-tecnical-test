export const browserNavigation = {
  redirectTo(path: string): void {
    window.location.assign(path);
  },
  currentPath(): string {
    return window.location.pathname;
  },
};
