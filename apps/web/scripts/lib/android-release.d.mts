export declare const ANDROID_APPLICATION_ID: string;
export declare const ANDROID_RELEASE_API_BASE: string;

export type AndroidReleaseInputs = Readonly<{
  readonly apiBase: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly localKeystoreProperties: boolean;
  readonly googleServicesJson: string | null;
}>;

export declare function auditAndroidReleaseInputs(inputs: AndroidReleaseInputs): readonly string[];

export declare function androidReleaseGradleArgs(buildNumber: number): readonly string[];

export declare const androidReleaseArtifacts: Readonly<{
  readonly bundle: string;
  readonly apk: string;
  readonly apkMetadata: string;
}>;
