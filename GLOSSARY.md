# Skillboard

Skillboard 是 Claude Desktop 與 Claude Code CLI 的 mod，讓使用者在對話旁看到目前可用的 skill、它們的說明，以及針對手上工作建議使用哪些 skill。

## Language

**Skills Pane**:
Skillboard 在對話旁停靠的獨立 pane，與 App 內建的 Plan pane 並列，而非其一部分。
_Avoid_: Plan、Plan 面板、側邊欄

**Recommendation**:
針對使用者當下的 prompt，從可用 skill 中排出最可能派上用場的幾個，每個附一個信心度。
_Avoid_: 推薦清單、Suggestion

**Skill Catalog**:
目前 session 可用的全部 skill。同名 skill 若來自不同 Source，會各列一筆、不合併；不論有沒有 Recommendation 都會顯示。
_Avoid_: Skill 清單、Skills 列表

**Source**:
提供某個 skill 的地方：某個 plugin（及其版本）、使用者層、專案層或內建。
_Avoid_: 出處、provider

**Translation File**:
使用者層的本地文件，一種語言一份，保存 skill 說明的譯文；可以手動修改，原文改變後對應的譯文就算過期。
_Avoid_: 翻譯快取、cache、字典檔
