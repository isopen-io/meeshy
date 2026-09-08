export type AppRouterBuildReport = {
  readonly built: boolean;
  readonly servesAppNotFound: boolean;
  readonly routes: readonly string[];
};

export declare const readEmittedAppRoutes: (manifestSource: string) => readonly string[];

export declare const inspectAppRouterBuild: (
  routes: readonly string[],
) => AppRouterBuildReport;
