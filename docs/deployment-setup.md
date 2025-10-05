# Cloudflare Workers Deployment Setup

このドキュメントでは、GitHub Actionsを使用してCloudflare Workersへ自動デプロイするための設定方法を説明します。

## 必要なGitHub Secrets

以下の2つのシークレットをGitHubリポジトリに設定する必要があります：

### 1. CLOUDFLARE_API_TOKEN

Cloudflare APIトークンを作成し、設定します。

#### 作成手順:

1. [Cloudflareダッシュボード](https://dash.cloudflare.com/profile/api-tokens)にアクセス
2. 「Create Token」をクリック
3. 「Custom token」を選択し、以下の権限を設定:
   - **Account** → Cloudflare Workers Scripts:Edit
   - **Zone** → Zone:Read, Workers Routes:Edit (必要な場合)
4. トークンを作成し、コピー

### 2. CLOUDFLARE_ACCOUNT_ID

CloudflareアカウントIDを取得します。

#### 取得方法:

1. [Cloudflareダッシュボード](https://dash.cloudflare.com)にアクセス
2. 右サイドバーの「Account ID」をコピー

## GitHubでの設定

1. GitHubリポジトリの「Settings」タブを開く
2. 左メニューから「Secrets and variables」→「Actions」を選択
3. 「New repository secret」をクリック
4. 以下のシークレットを追加:
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: 作成したAPIトークン
5. 同様に`CLOUDFLARE_ACCOUNT_ID`も追加

## デプロイの流れ

1. `main`ブランチにpushまたはPRマージ
2. GitHub Actionsが自動的に起動
3. 以下の処理を実行:
   - 依存関係のインストール
   - Lintチェック
   - フォーマットチェック
   - ビルド
   - Cloudflare Workersへデプロイ

## 手動デプロイ

ローカルから手動でデプロイする場合:

```bash
pnpm run deploy
```

※ 事前に`wrangler login`でログインが必要です。

## トラブルシューティング

### デプロイが失敗する場合

1. APIトークンの権限を確認
2. Account IDが正しいか確認
3. `wrangler.jsonc`の設定を確認
4. GitHub Actionsのログを確認

### ローカルでテストする場合

```bash
# 開発サーバーを起動
pnpm run dev

# ビルドして確認
pnpm run preview
```
