# AGENT.md

このファイルは、このプロジェクトでコーディングエージェントに作業を依頼するときの基本ルールをまとめたものです。

## プロジェクト概要

- プロジェクト名: `rpn`
- 概要: 逆ポーランド記法(RPN)電卓のスマホ向けWebアプリ
- 主な利用者: 開発者のみ
- 完了条件: RealCalcというAndroidアプリのRPNモードと全く同じ動作をすること。

## 技術構成

- フロントエンド: HTML+CSS+Vanilla JS
- バックエンド: なし
- 使用言語: JavaScript
- 主要ファイル:
  - `public/index.html`
  - `public/index.css`
  - `public/index.js`
  - `public/service-worker.js`
  - `public/manifest.webmanifest`

## エージェントへの基本方針

- 真面目で几帳面な、よきプランナー・エンジニア・テスターとして振る舞う
- RealCalcの動作がすべての基準となる
- アプリのヘルプページのRPN Modeを参考にする
  - https://www.quartic-software.co.uk/help.html?site=desktop
- 細かい挙動の確認が必要な場合は、adb経由でAndroidエミュレータを操作しRealCalcの挙動を自動的に確認する
- エミュレータ操作は`./how_to_use_emulator.md`に書かれている。追加で必要な操作があれば、一度試して成功することを確認したうえで、ファイルに追記してよい。
- エミュレータにて確認した動作の詳細は`./original_spec.md`に追記し、あとから参照する
- 実装の段階ごとに、その時点でのWebアプリのデザインは挙動が想定通りか確認する
- Webアプリの検証にはPlaywrightを使う。セットアップはエージェントが行う。
- 開発は段階を踏んで、やろうとしていることがうまくいくか1つずつ確認しながら行う
- 1つうまく行ったら、gitでコミットする

## 起動・検証手順

- ローカル確認時はHTTPサーバー経由で開く。`file://` では確認しない。
- 表示確認では、少なくともスマホ相当の表示幅でレイアウト崩れがないか確認する
- Playwrightを使う場合は、エージェントが必要なセットアップを行ってよい
- PWA関連を変更した場合は、通常表示だけでなく、manifestとservice workerの影響も確認する
- 外部依存を追加・変更した場合は、読み込み失敗時の影響も意識する

### 起動方法

- この環境では `python -m http.server 4173 --directory public` で起動できた
- ブラウザ確認URLは `http://127.0.0.1:4173/`
- PowerShellで一時的に起動確認する例:

```powershell
$job = Start-Job -ScriptBlock { Set-Location 'c:\projects\html\rpn'; python -m http.server 4173 --directory public }
Start-Sleep -Seconds 3
try {
  (Invoke-WebRequest 'http://127.0.0.1:4173/' -UseBasicParsing).StatusCode
} finally {
  Stop-Job $job
  Remove-Job $job
}
```

### Playwright検証方法

- セットアップは以下で成功した

```powershell
npm init -y
npm install -D playwright
npx playwright install chromium
```

- PowerShellで一時サーバー起動と同時に検証する例:

```powershell
$job = Start-Job -ScriptBlock { Set-Location 'c:\projects\html\rpn'; python -m http.server 4173 --directory public }
Start-Sleep -Seconds 3
try {
@'
const { chromium, devices } = require('playwright');
(async() => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
  console.log(await page.title());
  await page.screenshot({ path: 'screenshots/playwright-home.png', fullPage: true });
  await browser.close();
})();
'@ | node -
} finally {
  Stop-Job $job
  Remove-Job $job
}
```

- 2026-03-20時点では、上記手順でタイトル `RPN Calculator` を取得でき、スクリーンショット `./screenshots/playwright-home.png` を保存できた

## 変更時のルール

- ファイル入出力は最も効率の良い方法で行う
- コマンドを実行した結果が期待どおりでない場合、代替手段を使おうとせず、一時停止してユーザーに報告する
- 自動生成ファイルがある場合は、適切な手段で自動生成し直す。
- 既存の未コミット変更は、エージェントが勝手に巻き戻さない
- 自分が触っていない差分は維持し、必要がある場合のみ影響範囲を明記して扱う

## 禁止事項

- 秘密情報や鍵を生成してコミットしない
- エラーを隠すためだけの修正をしない

## 追記メモ

- `screenshots/` は確認用なので削除しない

## `original_spec.md` の追記フォーマット

- 1項目ごとに「確認対象」「操作手順」「RealCalcの結果」を最低限書く
- 必要に応じて「補足」と「スクリーンショット保存先」を書く
- あいまいな表現を避け、再現できる粒度で書く

記載例:

```md
## 例: Enterキーの挙動

- 確認対象: Enterキーを押したときのスタック変化
- 操作手順:
  1. `1`
  2. `2`
  3. `Enter`
- RealCalcの結果: X=2, Y=2, ZとTは元の値を維持
- 補足: 連続入力直後かどうかでも挙動を追加確認する
- スクリーンショット保存先: `./screenshots/enter_behavior.png`
```
