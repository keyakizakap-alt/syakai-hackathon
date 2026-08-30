/** プロバイダ非依存のエラークラス。app/api 配下の route.ts が instanceof で判定する。 */

export class NoCredentialsError extends Error {
  constructor(envVar: string) {
    super(`${envVar} が設定されていません`);
    this.name = "NoCredentialsError";
  }
}

export class RefusalError extends Error {
  constructor(provider: string, category: string | null) {
    super(`モデルが応答を拒否しました（${provider}${category ? `: ${category}` : ""}）`);
    this.name = "RefusalError";
  }
}
