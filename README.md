# Telegram 快取守衛 (Telegram Cache Guard)

> 一款專為解決 **Google Chrome 因 Telegram 網頁版累積數十萬個碎片檔案而頻繁當機卡死** 所研發的輕量級 Chrome 擴充外掛與系統急救工具組。

[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](#)
[![CI Validation](https://github.com/Isaacyang34/telegram-cache-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Isaacyang34/telegram-cache-guard/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](#)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#)

---

## 📖 緣由與背景故事（從實測數據出發，絕非憑空猜測）

### 1. 詭異的 Chrome 「卡死、無回應、等一陣子才恢復」
在日常使用 Google Chrome 時，瀏覽器經常無預警出現「視窗反白、滑鼠轉圈、標題顯示 (未回應)」，必須卡住等待 10～30 秒後才會突然恢復正常。常見的網路建議往往是盲目重灌瀏覽器、關閉硬體加速或更換擴充功能，但問題依然反覆出現。

### 2. 深入底層日誌與記憶體轉儲（Crashpad Dump）
為了徹底查出真兇，我們針對本機系統日誌與 Chrome 內部報告進行了深度排查：
* **鎖定凍結崩潰轉儲**：在 Chrome 的 Crashpad 報告目錄中，發現了時間點相符的 `.dmp` 記憶體轉儲檔案。
* **例外代碼解析**：解析 Minidump 例外碼為 `0x0517A7ED`。這是 Chromium 核心專用的 `kSimulatedExceptionCode`（`DumpWithoutCrashing`）。證實是 Chrome 內部的 Watchdog（看門狗監控緒）偵測到**工作執行緒或 UI 訊息迴圈嚴重卡死、凍結（Hang / Freeze）逾時**所留下的直接證據。
* **鎖定磁碟異常佔用**：檢查使用者設定檔目錄，赫然發現 `User Data\Default\Service Worker\CacheStorage` 目錄竟膨脹到了 **53.3 GB**，檔案數高達 **340,894 個**！

### 3. 破譯雜湊目錄，抓出真正元兇：`web.telegram.org`
* 解析該 53GB 快取的 SHA-1 雜湊資料夾 `ba00623a413aef1be0c65618db85f0b8176e803d` 及其 `index.txt`，確認對應來源（Origin）正是 **`https://web.telegram.org/`（Telegram 網頁版，專案代號 `telegram-tt`）**。
* 細部分析顯示：
  * `tt-media-progressive`（影片/串流分段快取）：**196,234 個檔案 (48.19 GB)**
  * `tt-media`（照片與預覽快取）：**102,046 個檔案 (3.76 GB)**
  * 兩者合計堆疊了 **超過 30 萬個碎片檔案**！

### 4. 為什麼會引發整個 Chrome 卡死？
* **雙方踢皮球的設計漏洞**：Telegram Web 為了提供極速串流，調用了 W3C `CacheStorage` API 將影片切成無數個幾十 KB 的小檔案；但 Telegram 網頁端**沒有編寫定期自動輪替過期快取的機制**，而 Chrome 的 QuotaManager 在硬碟空間充足時又「被動不介入」，任由檔案無限增生。
* **NTFS 檔案系統鎖定瓶頸**：單一資料夾塞入 30 萬個檔案時，目錄尋訪、檔案 Handle 鎖定耗時劇增。Chrome 的 Storage 執行緒在進行磁碟 I/O 時阻塞了 UI 主執行緒的 IPC 同步，導致整隻 Chrome 視窗直接「未回應」。

### 5. 全球討論與官方 Issue 印證
* **Reddit r/Telegram**：大量網友發文抱怨 Telegram 網頁版佔用 50GB～65GB 硬碟空間並造成瀏覽器凍結，唯一的社群解法是定期手動至開發者工具 Clear Site Data。
* **Telegram Web A 官方專案 (`Ajaxy/telegram-tt`)**：包含 Issue #380 等多個報告記錄了快取與 IndexedDB 過載導致的白屏與凍結問題。
* **Google Chromium 官方 Bug 庫 (`issues.chromium.org`)**：Issue 11205615 指出 Service Worker 串流快取造成的「嚴重膨脹現象」；Issue 40233601 指出快取項目過多時，清除與檢查會引發 UI 卡頓。

---

## 🛡️ 解決方案架構

本專案提供**「雙層防護體系」**，完美兼顧「歷史巨型快取瞬間抹除」與「未來全天候智慧守護」：

```text
┌─────────────────────────────────────────────────────────────┐
│                   Chrome 當機卡死終極解方                    │
├──────────────────────────────┬──────────────────────────────┤
│    急救層：Windows 批次腳本   │   防護層：Chrome 擴充外掛    │
│    (Fix_Chrome_Freeze.bat)   │   (Telegram Cache Guard)     │
├──────────────────────────────┼──────────────────────────────┤
│ • 採用 robocopy /purge 核心  │ • 支援 Chrome Manifest V3    │
│ • 3 秒內瞬間抹平 30 萬個檔案 │ • 即時容量與碎片檔案數雙指標 │
│ • 徹底清空 52GB 歷史快取     │ • 堅持「先看詳細報告再由您   │
│ • 免安裝、雙擊直接修復       │   決定清理」，絕不偷偷刪除   │
│                              │ • 100% 保留登入、文字與頭像  │
└──────────────────────────────┴──────────────────────────────┘
```

---

## ✨ 擴充外掛功能亮點 (Telegram Cache Guard)

1. **先出詳細報告，由使用者自主決策（透明原則）**
   * 點擊清理前，彈出清晰的詳細分析報告清單：
     * 🎬 **【預計清理】**：影片與串流分段 (`progressive`)、預覽媒體快取 (`tt-media`)。
     * 🛡️ **【完全保留】**：帳號登入狀態與 Token、對話文字與聊天紀錄、聯絡人與群組大頭貼、介面語言包。
     * 由使用者點擊 **`[確認清理並釋放]`** 後才真正執行，絕不自作主張硬刪。
2. **容量與分段檔案數即時雙指標監控**
   * 儀表板同時呈現「MB 容量佔用」與「當前串流碎片檔案數量」，直指效能卡頓核心。
3. **支援 Chrome 底層 `browsingData` 離線清理**
   * 即使 Telegram 網頁版當前**完全沒有開啟**，外掛也能直接呼叫瀏覽器原生儲存引擎完成清理。
4. **極致毛玻璃介面設計（Rich Aesthetics）**
   * 採用現代深色磨砂玻璃風（Dark Glassmorphism），提供可收合懸浮膠囊（避開 Telegram 原生滾動按鈕），不干擾日常聊天。
5. **靈活的超額處理機制**
   * 可設定 500MB / 1.0GB / 2.0GB / 5.0GB 上限門檻。
   * 支援兩種策略：
     * **超額時提醒我決定（預設推薦）**：超過門檻時自動彈出報告，讓您確認後才清理。
     * **超額時自動無感清理**：適合偏好全自動維護的使用者。

---

## 🚀 快速安裝與使用指引

### 方式一：安裝 Chrome 擴充外掛（長期守護）

1. 下載或複製本儲存庫至本機資料夾。
2. 開啟 Google Chrome，於網址列輸入並前往：
   ```text
   chrome://extensions/
   ```
3. 開啟右上角的 **「開發人員模式 (Developer mode)」**。
4. 點擊左上角的 **「載入未封裝項目 (Load unpacked)」**。
5. 選取本專案目錄（包含 `manifest.json` 的資料夾）。
6. 安裝完成！進入 Telegram 網頁版或點擊右上角工具列外掛圖示即可開始守護。

### 方式二：使用 Windows 系統急救批次檔（一鍵清出 52GB）

* 檔案位置：`tools/Fix_Chrome_Freeze.bat`
* 使用方式：
  1. 雙擊執行 `Fix_Chrome_Freeze.bat`。
  2. 若 Chrome 正在運行，腳本會提示按 `Y` 自動安全關閉。
  3. 腳本呼叫 Windows 多執行緒 `robocopy /purge` 核心，約 3～5 秒內即可徹底清除 30 萬個碎片檔案並釋放空間。
  4. 執行完畢後提示按 `Y` 自動重新開啟 Chrome，卡頓立竿見影消失！

---

## 📂 專案檔案結構

```text
telegram_cache_guard/
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions 自動化語法與規範驗證工作流
├── manifest.json         # Chrome Manifest V3 設定檔
├── content.js            # 網頁端即時監控、碎片計數與懸浮控制儀表板
├── content.css           # 懸浮膠囊與深色毛玻璃介面樣式
├── popup.html            # 工具列彈出視窗與詳細分析報告模態窗
├── popup.js              # 彈出視窗邏輯、離線 browsingData 原生清理與設定同步
├── generate_icons.py     # 高解析度盾牌圖標生成腳本
├── icons/                # 擴充功能圖示 (16px, 48px, 128px)
├── tools/
│   ├── Fix_Chrome_Freeze.bat   # Windows 極速抹除歷史快取批次工具
│   └── auto_github_sync.py     # GitHub 憑證偵測與自動建庫推送工具
└── README.md             # 本完整說明與緣由文檔
```

---

## 📄 授權條款 (License)

本專案採用 [MIT License](LICENSE) 授權，歡迎自由使用、修改與分享！
