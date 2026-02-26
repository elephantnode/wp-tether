# まとめ：データの流れの整理 / 次のステップ

[← ハンズオン目次](README.md)

## まとめ：データの流れの整理

1. **データの元**：`data/sites.json`（と `data/deploy-targets.json`）
2. **型**：`src/types/index.ts` の `Site`, `SiteConfig`, `DeployTarget` など
3. **読み書き**：`src/lib/sites.ts`, `src/lib/deploy-targets.ts`
4. **API**：`src/app/api/sites/route.ts`（GET/POST）、`src/app/api/sites/[id]/start|stop|...`
5. **画面**：`src/app/page.tsx`（Server Component で getSites）、`src/app/sites/new/page.tsx`（フォーム → POST）
6. **サイト実体**：指定 path の下のディレクトリ + `docker-compose.yml` など（`src/lib/docker-compose.ts` が生成）

問題が起きたときは、「どの層で失敗しているか」（JSON の形・API の戻り値・Docker のログ）を切り分けられると、AI に頼るにしても的確に質問できます。

---

## 次のステップ（自分で試すとよいこと）

- **第3章の応用**：`Site` にフィールドを1つ追加し、型 → sites.ts の読み書き → API の返却 → 画面表示まで一通り変えてみる。
- **第7章の応用**：`docker-compose.ts` に、例えば「常に追加する環境変数」を1つ入れて、生成される `docker-compose.yml` を確認する。
- **テンプレート**：`templates/` に新しい YAML を追加し、API とフォームで使われるまでを追う。
- **ファイル同期**：1サイト + 1ターゲットで、ファイル同期だけ実行し、リモートのディレクトリがどう変わるか確認する。
- **DB 同期**：ファイル同期に加えて DB 同期（Pull）を実行し、ローカルに本番データを持ってくる。URL 置換が正しく行われているか確認する。
- **トンネル**：cloudflared または ngrok をインストールし、トンネルを開始してスマホからローカルサイトにアクセスしてみる。
- **セキュリティスキャン**：外部からダウンロードしたテーマ/プラグインを入れた状態でスキャンし、不審なパターンが検出されるか試す。

以上で、wp-tether を「手を動かして再現・変更できる」ための道筋がそろっています。不明な章があれば、その章の該当ファイル名と「どこまで理解したか」をメモしておくと、あとから調べたり質問したりしやすくなります。
