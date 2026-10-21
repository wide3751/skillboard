<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img src="assets/logo.svg" width="360" alt="skillboard">
  </picture>
</p>

# Skillboard

Skillboard 是 Claude Code 的 mod。它在對話旁開一個 Skills Pane，列出目前 session 可用的全部 skill，並在你送出 prompt 時建議可能用得上的 skill。

- **Skill Catalog**：依 Source 分組（每個 plugin 一組，加上使用者層、專案層、內建），plugin 分組附版本號。可以收合分組，語言選單右邊的「全部展開／全部收合」一次開關所有顯示中的分組，也可以用關鍵字搜尋名稱、plugin 名稱、原文說明與譯文。
- **Recommendation**：設定 TypeSafe Jev 的 API key 後，每次送出 prompt 會在 Catalog 上方列出最多 3 個 skill，各附信心度。沒有 key 就只顯示 Catalog。
- 點一個 skill 會展開說明，並有「翻譯」與「填入」兩個按鈕。「翻譯」用 Claude Haiku 把說明翻成介面語言，存進 Translation File；「填入」把 `/skill名稱` 放進輸入框，由你決定何時送出。
- 打開的分組第一列是「翻譯此分類（N）」：一次翻譯該組還沒有譯文或譯文已過期的 skill（不含已隱藏的），最多同時 3 個，翻好一個就顯示一個。
- 展開的 skill 另有「隱藏」按鈕：隱藏的 skill 不列在 Catalog、搜尋不到，也不會送給 Jev，跨 session 保留。Catalog 底部的「顯示已隱藏（N）」會把它們以淡色列回原分組，展開後按「取消隱藏」即可還原。
- 介面支援繁體中文、English、日本語、简体中文。

## 安裝

在終端機的 Claude Code prompt 輸入：

```
/plugin install skillboard --marketplace wide3751/skillboard
```

接著按 `y` 加入 marketplace，再選安裝範圍。從 shell 安裝則用：

```
claude plugin install skillboard --marketplace wide3751/skillboard
```

## 使用

輸入 `/skillboard` 開啟或關閉 Skills Pane。

終端機夠寬時，pane 停靠在對話旁；太窄時改到輸入框上方，進入精簡模式，只顯示一行建議、搜尋框與「全部」按鈕，按「全部」才會在約 6 列的範圍內顯示 Catalog，用 ▲／▼ 捲動。

## 設定

在 `/config` 或安裝時的設定畫面調整：

| 選項 | 預設 | 說明 |
|---|---|---|
| `jevApiKey` | 空白 | TypeSafe Jev 的 API key，存在安全儲存區，不會以明文顯示。留空就不做建議。 |
| `threshold` | `0.1` | 建議的最低機率。低於門檻的 skill 不顯示；全部低於門檻時顯示「沒有特別適合的 skill」。 |
| `autoRecommend` | 開 | 每次送出 prompt 時自動向 Jev 要建議。關掉後只在按「重新建議」時才送出。 |
| `language` | `auto` | 介面語言。`auto` 依序參考 Claude Code 的 `language` 設定、`LC_ALL`、`LANG`、macOS 的偏好語言，都沒有就用 English。也可以直接在 pane 上切換。 |

## 隱私

送給 TypeSafe Jev 的只有這次 prompt 的文字（超過 4000 字會截斷），加上每個 skill 的名稱與說明。不會送出檔案內容或對話紀錄。斜線指令、隱藏的 prompt 與背景工作通知不會送出。關掉 `autoRecommend` 後，只有按「重新建議」時才會送出。

翻譯由 Claude Haiku 處理，只送出該 skill 的說明。譯文存在 `~/.claude/skillboard/translations/<語言>.md`，可以手動修改，Skills Pane 會顯示你改過的版本；原文改變後，舊譯文會標成「已過期」。

## 開發

```
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
