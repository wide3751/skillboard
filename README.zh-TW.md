<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
    <img src="assets/logo.svg" width="360" alt="skillboard">
  </picture>
</p>

[English](README.md) | 繁體中文

# skillboard：Claude Code 的 Skills 面板（Claude Code mod）

這是一個 **Claude Code plugin**，以 **Claude Code mods** 打造。當你從許多 plugin 裝了好幾百個 skill，它會在對話旁開一個 **Skills Pane**，列出目前 session 能用的每個 skill，各附一行簡介，讓你不用翻文件就找得到合適的那一個。如果你提供 TypeSafe Jev 的 API key，它也會依你剛送出的 prompt 建議適合的 skill。

Claude Desktop 的 Code 分頁和終端機裡的 `claude` 都能用。

https://github.com/user-attachments/assets/4e2d2cb6-3677-441f-bb95-adb55453b98b

Pane 由上到下分成三部分：

| 部分 | 顯示什麼 | 例子 |
|---|---|---|
| **建議** | 最多 3 個符合上一個 prompt 的 skill，各附信心度。設定了 Jev API key 才會出現 | 你說要先寫測試，就出現 `tdd 62%` |
| **工具列** | 搜尋框、「重新整理」、語言選單、「全部展開／全部收合」 | 輸入 `review` 找出所有 review 類的 skill |
| **Skill Catalog** | 所有 skill，依 Source 分組：每個 plugin 一組並附版本號，接著是使用者層、專案層、內建 | `[ ▸ mattpocock-skills ]  1.3.1 · 27` |

## 快速開始

```bash
claude plugin marketplace add wide3751/skillboard
claude plugin install skillboard@skillboard
```

接著開一個新的 session（Desktop 或終端機都可以），輸入 `/skillboard`。安裝前就已經開著的 session 讀不到新安裝的 plugin，跑 `/reload-plugins` 也一樣。

這個 repo 是 private：你必須是 GitHub 上的協作者，而且電腦已經設定好 GitHub 存取（例如執行過 `gh auth login`）。

也可以把下面這句貼給 Claude Code，讓它幫你安裝：

> 照 https://github.com/wide3751/skillboard/blob/main/README.zh-TW.md 安裝 skillboard

## 使用

| 指令 | 說明 |
|---|---|
| `/skillboard` | 在這個 session 開啟或關閉 Skills Pane |

**Pane 裡的操作：**

- **分組**：每個 Source 是一個按鈕，點一下就展開或收合。版本號和 skill 數量靠右顯示。
- **Skill**：每個 skill 顯示名稱，下面一行是說明的第一句（有譯文時用譯文）。點 skill 會展開完整說明和按鈕。
- **填入**：把 `/skill名稱` 放在輸入框最前面，原本打好的文字接在後面，當成 skill 的參數。輸入框無法填入時，改成複製到剪貼簿。
- **翻譯**：用 Claude Haiku 把說明翻成介面語言，存進你的 Translation File。「原文」切回原本的文字。原文改過的譯文會標成「已過期」。
- **翻譯此分類（N）**：展開的分組第一列。一次翻譯這組裡還沒有譯文、或譯文已過期的 N 個 skill，最多同時 3 個，翻好一個就顯示一個。
- **隱藏**：把 skill 從 Catalog、搜尋和 Jev 請求中拿掉，跨 session 保留。Catalog 底部的「顯示已隱藏（N）」會把隱藏的 skill 以淡色列回來，展開後可以「取消隱藏」。
- **建議**：點一個建議，會打開它的分組並在 Catalog 裡展開。「重新建議」會用目前的 prompt 再問一次 Jev。
- **窄終端機**：pane 在輸入框上方時，只顯示一行一個的建議、搜尋框和「全部」。按「全部」才會在約 6 列的範圍內顯示 Catalog，用 ▲／▼ 捲動。

**終端機鍵盤操作**（終端機不回報滑鼠點擊時使用）：

| 按鍵 | 動作 |
|---|---|
| `ctrl+x tab` | 從輸入框移進 pane |
| `tab` / `shift+tab` | 在按鈕和搜尋框之間移動 |
| `enter` | 按下選取的按鈕 |
| `esc` | 回到輸入框，pane 保持開啟 |
| `ctrl+x x` | 關閉 pane |

## 設定

執行 `/plugin configure skillboard@skillboard`。四個選項都有預設值，要用建議功能時再設定就好。

| 選項 | 預設 | 說明 |
|---|---|---|
| `jevApiKey` | 空白 | TypeSafe Jev 的 API key，存在安全儲存區。留空就不做建議 |
| `threshold` | `0.1` | 建議要顯示的最低機率。沒有任何一個達標時，顯示「沒有特別適合的 skill」 |
| `autoRecommend` | 開 | 每次送出 prompt 後自動問 Jev。關掉後只在按「重新建議」時才問 |
| `language` | `auto` | 介面語言：English、繁體中文、日本語、简体中文。`auto` 依序參考 Claude Code 的 `language` 設定、`LC_ALL`、`LANG`、macOS 的偏好語言，都沒有就用 English。也可以直接在 pane 上切換 |

## 支援環境

| `claude` 在哪裡執行 | Pane | 已測試 |
|---|---|---|
| Claude Desktop 的 Code 分頁 | 停靠在右側，和其他 pane 並列成分頁 | ✓ |
| 終端機，全螢幕且寬度至少 110 欄 | 停靠在對話旁 | ✓ |
| 較窄的終端機 | 在輸入框上方，精簡模式 | ✓ |
| VS Code、手機 | 畫得出來，但沒有特別調整版面；手機沒有搜尋框 | 尚未 |

## 隱私與安全

**會讀取的**

- 目前 session 的 skill 清單，以及硬碟上每個 skill 的 `SKILL.md`（取說明）
- `~/.claude/plugins/installed_plugins.json` 和 `enabledPlugins` 設定（取 plugin 版本）
- 你的輸入框，只在按「填入」時

**會送出的**

- 給 **TypeSafe Jev**，只在設定了 API key 時：你送出的 prompt 文字（超過 4000 字會截斷），以及每個顯示中 skill 的名稱與說明。不送檔案內容，也不送對話紀錄。斜線指令、隱藏的 prompt、背景工作通知與其他 session 的訊息都不會送出
- 給 **Claude Haiku**，只在按翻譯按鈕時：那個 skill 的說明。會用到你的 Claude 額度

**會寫入的**

- `~/.claude/skillboard/translations/<語言>.md`：每種語言一份 Markdown。可以手動修改，pane 會顯示你改過的版本
- 隱藏清單和你選的語言，存在 Claude Code 的 plugin 儲存區

**會執行的指令**

- `defaults read -g AppleLanguages`：只在 macOS、`language` 為 `auto` 時，用來找你的偏好語言

## 需求

- 支援 mod 的 Claude Code，在 Claude Desktop 的 Code 分頁或終端機的 `claude`。已在 Claude Code v2.1.301 與 Claude Desktop 測試
- 選用：[TypeSafe](https://docs.typesafe.ai/introduction) Jev 的 API key，用於建議功能

## 更新、停用或解除安裝

**更新**：

```bash
claude plugin marketplace update skillboard
claude plugin update skillboard@skillboard
```

**暫時停用**（保留安裝，用 `enable` 重新開啟）：

```bash
claude plugin disable skillboard@skillboard
```

**完全移除**：

```bash
claude plugin uninstall skillboard@skillboard
claude plugin marketplace remove skillboard
rm -rf ~/.claude/skillboard
```

最後一行會刪除你的 Translation File，移除 plugin 時它們會留下來。更新、停用或移除後，開一個新的 session 才會生效。

## 限制

- **沒有 Jev 就沒有建議**：不會退回關鍵字比對。沒有 API key 時，pane 只是一個目錄。
- **多個 pane 共用一個停靠區**：同時開著其他 mod 的 pane（例如 switchboard）時，兩者會變成分頁，一次只顯示一個。
- **沒有右鍵選單**：隱藏 skill 要在展開後按「隱藏」。
- **Desktop 的語言偵測**：macOS 偏好語言是用指令讀取的，在 Desktop session 裡可能無法執行。如果 pane 顯示英文，請設定 `language`，或在 pane 上切換。
- **翻譯會用到 Claude 額度**：翻譯一個大分組，每個 skill 都是一次 Haiku 呼叫。

## 疑難排解

| 狀況 | 怎麼處理 |
|---|---|
| 找不到 `/skillboard` | 這個 session 在安裝前就開著，或 `/reload-plugins` 卸載了熱載入的 mod。開一個新的 session |
| Skills 分頁顯示 `skillboard has not drawn in this pane` | 這個 session 已經沒有載入 mod。關掉分頁，開一個新的 session |
| 某個 plugin 顯示的 skill 比它實際提供的少 | 停用的 plugin 不會列出。檢查設定裡的 `enabledPlugins` |
| 沒有建議區 | 用 `/plugin configure skillboard@skillboard` 設定 `jevApiKey` |
| 顯示「Jev 拒絕了 API key」或「Jev 額度已用完」 | 到 TypeSafe console 檢查 key 和額度 |
| Pane 是英文 | 設定 `language`，或在 pane 上選語言 |

## 參與貢獻

歡迎提 issue 和 pull request。修改行為前，請先讀 [GLOSSARY.md](GLOSSARY.md) 的用語，以及 [docs/adr/](docs/adr/) 的決策紀錄。新增或修改介面文字時，請同時更新 [hooks/i18n.ts](hooks/i18n.ts) 裡的四種語言。

在這個資料夾開發與測試：

```bash
claude --plugin-dir .
claude plugin validate .
claude plugin test .
```
