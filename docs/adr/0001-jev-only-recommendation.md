# Recommendation 只交給 Jev，沒有 Jev 就不做建議

Recommendation 只由 TypeSafe 的 Jev（System One 模型）排序。每個 skill 是一個 Choice 選項，取機率前 3 名中 ≥ 門檻（預設 10%）的。這代表使用者的 prompt 會送到第三方：只送當次 prompt 的文字，而且可以關閉自動建議。沒設定 Jev API key 或呼叫失敗時，Skills Pane 只顯示 Skill Catalog，不退回關鍵字比對，也不改用 Claude 模型。

## Considered Options

- **Claude Haiku 排序**：可以附上文字理由，但會用掉使用者的 Claude 額度；不選它，是因為 Jev 回傳的是校準過的機率，比較適合「要不要建議」這種決策。
- **關鍵字比對作為備援**：品質不穩，與 Jev 的結果並列會讓人分不出建議的可信度；使用者決定沒有 Jev 時寧可不建議。

## Consequences

- 名稱去掉 `plugin:` 前綴後相同的 skill，評分時合併成一個候選，否則會互相分掉機率；建議指向版本最新的那一個。
- 合併後候選超過 255 個（Jev 的 Choice 上限）時，分兩階段淘汰，會多一次呼叫。
- Skill 說明的翻譯不能交給 Jev（它不生成文字），改由 Claude Haiku 按需翻譯。
