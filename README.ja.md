# Forger

[English](readme.md) | 日本語

ファイルエクスプローラー、コードエディター、AIチャット、Git操作、ターミナルが一体となった、スタンドアロン型のElectron製AIコーディングアシスタントです。

**Forger** の名前は以下の頭文字に由来します：

> **F**ile / **O**mni Chat / **R**epository / **G**enerative Agent / **E**ditor / **R**untime

パッケージ名・リポジトリ名は `forger-ide`（既存プロジェクトとの競合回避のため）。呼称・表示名は **Forger** です。

Author: Eiji Arai — Web Site: https://cuculhart.com

## 主な機能

### プロジェクト管理

- **プロジェクトを開く**: フォルダ選択ダイアログから任意のフォルダをプロジェクトとしてオープン
- **プロジェクト新規作成**: プロジェクト名と親フォルダを指定して新規作成
- **Recent Projects**: よく開く順（オープン回数+最近順）で一覧表示し、ワンクリックでオープン
- **セッション復元**: リロードや再起動後に、最後に開いていたプロジェクト・ファイル・チャット履歴を自動復元
- **ファイル/フォルダ作成**: エクスプローラーの📄+/📁+ボタンまたはメニューからインライン作成

### エディター

- **Monaco Editor**: 言語自動検出、ミニマップ、シンタックスハイライト
- **保存**: Ctrl+S / File > Save
- **Undo/Redo**: メニューおよびショートカット対応（Monaco内部履歴と連携）
- **差分ビュー**: Gitパネルの変更ファイルをクリックするとHEADとのside-by-side diffを表示
- **クイックオープン**: Ctrl+P（File > Quick Open）でファイル名ファジー検索、最近開いたファイル一覧表示
- **全文検索**: サイドバー「Search」タブでプロジェクト横断検索（正規表現対応）、結果クリックで該当行にジャンプ

### AIチャット

- **エージェントループ**: AIがファイル操作コマンドを発行し、結果をフィードバックしながら複数ステップで自律作業（一覧取得 → 読み込み → 編集）
- **自動コンテキスト管理**: プロジェクト全体を自動で読み込み、重要ファイルを優先し、長いファイルを分割してAIに提供（🧠ボタンで手動選択モードに切替可能）
- **安全な書き込み制御**: 書き込みはプロジェクトルート内に限定。外部への書き込みは拒否
- **プロジェクト別チャット永続化**: プロジェクトごとに会話をlocalStorageに保存し、再オープン時に復元
- **Retryボタン**: 最後の回答を再生成
- **キャンセル・タイムアウト・応答長制限** 対応済み

### Git

- **Source Controlパネル**: ブランチ表示、ahead/behindカウント、変更ファイル一覧（ステータスバッジ付き）
- **ステージ＆コミット**: チェックボックスで対象選択、または全変更を一括コミット
- **Push / Pull**: ツールバーから実行
- **リポジトリ初期化**: 非Gitフォルダに対して `git init` を実行可能

### ターミナル

- **コマンド実行**: プロジェクトルートをカレントディレクトリとしてコマンドを実行（`npm install`、`npm start`、`docker compose up` 等）
- **複数プロセス同時管理**: 長時間プロセスを動かしたまま別コマンドを実行可能
- **真のTTY（node-pty + xterm.js）**: 対話型CLIプログラム（入力待ちゲーム、REPL等）にキー入力を送信可能。ANSIカラー・カーソル操作も描画
- **プロセス停止**: Stopボタンでプロセスツリーごと終了（Windowsではtaskkill /T /F相当）
- **URL検出**: 出力中の `http://localhost:...` をクリックするとブラウザで開く
- **AIからのコマンド実行**: `// RUN_COMMAND:` コマンドを発行可能。必ずユーザー承認を挟み、stdout/stderrと終了コードをAIにフィードバック

### 外観・設定

- **テーマ**: System / Dark / Light（OS設定連動、nativeTheme経由）
- **フォント**: ファミリー・サイズをUI全体とMonacoエディターに反映
- **LLMプロバイダー**: Gemini API（クラウド）/ Ollama（ローカル・オフライン）を設定画面で切替。モデル選択・LiteLLMプロキシにも対応
- **UI言語**: Settings > Appearance > Language で切替。`lang/<code>.json` を追加すれば誰でも言語を追加可能
- **ネイティブメニュー**: File / Edit / View / Window / Help

## アーキテクチャ

```
Electron アプリ
├── メインプロセス (Node.js)
│   ├── ウィンドウ管理・ネイティブメニュー
│   ├── ファイルシステムアクセス
│   ├── フォルダ選択ダイアログ
│   ├── nativeTheme（テーマ連携）
│   └── Git操作 (simple-git)
├── レンダラープロセス (React/TypeScript)
│   ├── エクスプローラー / Gitパネル（サイドバータブ）
│   ├── エディターペイン (Monaco / DiffEditor)
│   ├── チャットペイン（エージェントループ）
│   └── コンテキスト管理サービス
└── LLM統合
    ├── Gemini API
    ├── ファイル操作コマンド（エージェントループ）
    ├── LiteLLMプロキシ（オプション）
    └── Ollama（ローカルLLM・オフライン対応）
```

## セキュリティアーキテクチャ

APIキーを安全に管理するために、LiteLLMプロキシを使用することを推奨します：

```
Forger → ダミーAPIキー → LiteLLM (VPS等) → 本物のAPIキー → Google AI Studio
```

### LiteLLMプロキシの設定

1. **LiteLLMサーバーのセットアップ**（VPSなど）:
```bash
pip install litellm
litellm --model gemini/gemini-3.8-flash --api_key YOUR_REAL_API_KEY
```

2. **Forgerの設定**:
   - 設定画面で「Use Proxy」を有効化
   - プロキシURLを入力（例: `http://your-vps:4000`）
   - ダミーAPIキーを入力（実際には使用されません）

3. **利点**:
   - 本物のAPIキーがクライアントに保存されない
   - APIキーのローテーションが容易
   - 使用量の監視と制限が可能
   - 複数のAIプロバイダーの統合が可能

## 配布・運用モデル

このアプリはソース公開型（source-available）ソフトウェアとしてスタンドアロン配布することを想定しています（ライセンスは FSL-1.1-MIT。詳細は「ライセンス」節を参照）。

- **開発時**: `npm run dev` で Vite dev server（localhost:5173）+ Electron を起動
- **配布時**: Electron Forgeでパッケージ化。ユーザーはインストーラー/zipをローカルにダウンロードして実行（dev server不要）

### CSPポリシーについて

`index.html` のContent Security Policyは `localhost` への接続を許可していますが、これは「許可リスト」であり接続を必須にするものではありません。パッケージ版では使われないだけで害はなく、将来のOllama（`http://localhost:11434`）対応でもそのまま利用できます。

### チャットとプロジェクトの関係

現在は「1プロジェクト : 1チャット」で、会話はlocalStorageにプロジェクト単位で保存されます。内部的にはプロジェクト→会話リストの構造で保持しているため、複数チャットタブ（1プロジェクト : nチャット）への拡張が容易です。

### パッケージ化

`npm run package` で `out/Forger-win32-x64/Forger.exe`（ポータブル実行ファイル）、`npm run make` でインストーラー（Squirrel）を生成します。

実施済みの対応：

- `electron/main.js` — `app.isPackaged` 時は `dist/index.html` を `loadFile` で読み込み
- CSP — 本番ビルドのみ厳格化（`vite.config.ts` の transformIndexHtml で差し替え。`'unsafe-inline'`スクリプト・CDN・`ws:`を除去）
- Monaco Editor — `monaco-editor` をローカルバンドル化（`src/monacoSetup.ts` でworkerを同梱、CDN依存解消・オフライン動作）
- node-pty — `asar.unpack` で `.node` バイナリをasar外に展開
- メインプロセスの致命的エラーを `%TEMP%/forger-crash.log` に記録（パッケージ版はコンソールが無いため）

## ロードマップ

### 実装済み（最近の追加分）

- ✅ **真のTTY** — node-pty（ConPTY）+ xterm.js。対話型CLI・ANSIカラー・キー入力・リサイズ対応
- ✅ **AIコマンド実行** — `// RUN_COMMAND:` + 必須承認モーダル、結果をAIへフィードバック
- ✅ **書き込み承認フロー** — WRITE_FILE実行前にMonaco差分で承認/却下
- ✅ **パネルリサイズ** — サイドバー/ターミナル/チャット境界をドラッグで可変
- ✅ **AI用検索ツール** — `// GREP:`（内容検索）/ `// FIND_FILES:`（パス検索）で狙い撃ち読み込み
- ✅ **差分適用編集（EDIT_FILE）** — SEARCH/REPLACEブロックで部分編集。全量上書きより出力トークンを大幅節約
- ✅ **チェックポイント/ロールバック** — AI書き込み前のスナップショットを保持し「↩ Rollback」で復元。git不要・AIが触ったファイルのみ戻す（ユーザーの未コミット変更は無傷）
- ✅ **Ctrl+Pクイックオープン** — ファイル名ファジー検索 + 最近開いたファイル一覧（File > Quick Open）
- ✅ **プロジェクト内検索UI** — サイドバー「Search」タブで全文検索、結果クリックで該当行にジャンプ
- ✅ **Markdownプレビュー / PDF・HTML出力** — .mdファイルのPreviewトグル（marked+DOMPurify、GFM対応）、File > Export Markdown to PDF（Electron printToPDF）/ HTML（スタイル埋め込みの単一ファイル）— Marketplace不要
- ✅ **パッケージ化** — `npm run package` で `Forger.exe` ポータブルビルド（Monacoローカルバンドル・厳格CSP・node-pty unpack済み）。`npm run make` でSquirrelインストーラー
- ✅ **フォルダD&D / CLIでプロジェクトを開く** — exeにフォルダをドロップ、ウィンドウへドロップ、`Forger.exe <path>` で即オープン（二重起動は既存インスタンスに引き渡し）
- ✅ **コンテキスト最適化** — 自動コンテキストはファイルツリー（パス一覧）のみ送信。中身はAIがREAD_FILE/GREPで必要分だけ取得 → メッセージ毎のトークンを大幅節約。Settings > AI Context でモード（tree/full）とツリー上限数を調整可能（手動ファイル選択モードは従来通り全内容を送信）

- ✅ **多言語対応の基盤** — `lang/<code>.json` に英語原文→訳文の対応表を置くだけで言語追加可能（`_name`が言語表示名）。devはプロジェクト直下`lang/`、パッケージ版は`resources/lang/`（exe隣、ユーザー編集可）。Settings > Appearance > Languageで切替。UI側は `useT()` フック + `t('Explorer')` で参照
- ✅ **Ollama対応** — Settings > LLM Provider で `Gemini / Ollama` 切替。OllamaはOpenAI互換API（`/v1/chat/completions`）をfetch直叩き（新規依存なし）。エンドポイント・モデルは設定可能、`/api/tags`からインストール済みモデルを自動検出。完全オフライン動作可

### 今後の計画（実装優先度順）

1. **エディタタブ** — 優先度低（AI編集中心なら不要かも。必要になったら検討）

## 技術スタック

- **フレームワーク**: Electron + React + TypeScript
- **エディター**: Monaco Editor
- **Git**: simple-git
- **LLM**: Gemini API / Ollama（ローカル）
- **ビルドツール**: Vite
- **設定管理**: ConfigService + localStorage
- **プロキシ**: LiteLLM（オプション）
- **Node.js**: v22 LTS推奨

## はじめに

### 前提条件

- Node.js v22 LTS（推奨）
- npm
- Git（Gitパネル使用時）

### インストール

```bash
# 依存関係のインストール
npm install

# 開発モードの実行
npm run dev
```

## 使用方法

### プロジェクトを開く / 作成する

1. アプリを起動
2. Explorerの📂ボタンをクリック
3. 「Select Folder」で既存フォルダを選択、または「New Project」で新規作成
4. Recent Projectsから過去のプロジェクトを再オープンすることも可能

### AIチャットを使用する

1. 設定画面（⚙️）を開く
2. LLM Providerを選択:
   - **Gemini API**: APIキーを入力しモデルを選択（デフォルト: gemini-3.8-flash）。必要に応じてLiteLLMプロキシを設定
   - **Ollama**: ローカルでOllamaを起動し、エンドポイントとモデルを選択（インストール済みモデルは自動検出）
3. チャットでメッセージを送信

### コンテキスト管理

- **自動モード**: プロジェクト全体を自動で読み込み、重要ファイルを優先
- **手動モード**: エクスプローラーのファイル選択ボタンでAIコンテキストに追加
- 🧠ボタンで自動/手動モードを切り替え

### AIによるファイル操作

AIに「ファイルを作成して」「○○を編集して」と指示すると、AIがファイル操作コマンドを発行し、アプリ側で実行します。

- `// LIST_FILES: <dir>` — ディレクトリ内のファイル一覧を取得
- `// READ_FILE: <path>` — ファイルを読み込み
- `// GREP: <pattern>` — プロジェクト全体を正規表現（または部分一致）で内容検索。`file:line: text`形式で返却
- `// FIND_FILES: <pattern>` — ファイル名/パスをglob（`*.ts`等）または部分一致で検索
- `// WRITE_FILE: <path>` + `// END_WRITE_FILE` — ファイルを作成・上書き（承認ダイアログ経由）
- `// EDIT_FILE: <path>` + `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` + `// END_EDIT_FILE` — 部分差分編集（複数ブロック可、承認ダイアログ経由）
- `// RUN_COMMAND: <command>` — シェルコマンドを実行（承認ダイアログ経由、PTYで対話型も可）

実行結果はAIにフィードバックされるため、AIは複数ステップで自律的に作業し、完了後に自然言語の要約を返します。

**安全性**: 書き込みはプロジェクトルート内のパスに限定されます。プロジェクト外への書き込みは拒否されます。

### Git操作

1. サイドバーの「Git」タブを開く
2. 変更ファイル一覧を確認（ファイル名クリックでdiff表示）
3. コミットメッセージを入力してCommit（チェックしたファイルのみ、または全変更）
4. ↑/↓ボタンでPush/Pull

## 開発

```bash
# 開発モード
npm run dev

# 本番用ビルド
npm run build

# プレビュー
npm run preview
```

## ライセンス

FSL-1.1-MIT（Functional Source License）— Copyright 2025 Eiji Arai（[LICENSE](LICENSE) を参照）

- **ソース利用可（source-available）**: 閲覧・改変・フォーク・個人/社内利用は自由です
- **禁止事項**: Forgerと競合する商用製品・サービスとして利用すること（例: リネームしたクローンの販売）
- **MITへの転換**: 各リリースから2年後に自動的にMITライセンスへ移行します
- 「Forger」の名称はライセンスとは独立して管理されます（商標条項参照）

Forgerはオープンソースコンポーネント（Monaco Editor、Electron、React、xterm.js等）を利用しています。各コンポーネントのライセンスと権利者は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) を参照してください。パッケージ版ではこれらのファイルが `resources/` に同梱されます。
