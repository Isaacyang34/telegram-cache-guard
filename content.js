// Telegram Cache Guard - Content Script
(function () {
  if (window.__tgCacheGuardLoaded) return;
  window.__tgCacheGuardLoaded = true;

  const DEFAULT_SETTINGS = {
    limitMB: 1024,
    policy: 'prompt', // 'prompt' (show report first) or 'auto'
    collapsed: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let currentUsageMB = 0;
  let currentFileCount = 0;
  let rootEl = null;
  let isPurging = false;
  let isShowingReport = false;

  // Load Settings
  function loadSettings(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['tg_limitMB', 'tg_policy', 'tg_collapsed'], (res) => {
        if (res.tg_limitMB !== undefined) currentSettings.limitMB = Number(res.tg_limitMB);
        if (res.tg_policy !== undefined) currentSettings.policy = res.tg_policy;
        if (res.tg_collapsed !== undefined) currentSettings.collapsed = res.tg_collapsed;
        if (callback) callback();
      });
    } else {
      const stored = localStorage.getItem('__tg_guard_settings');
      if (stored) {
        try { Object.assign(currentSettings, JSON.parse(stored)); } catch (e) {}
      }
      if (callback) callback();
    }
  }

  function saveSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        tg_limitMB: currentSettings.limitMB,
        tg_policy: currentSettings.policy,
        tg_collapsed: currentSettings.collapsed
      });
    }
    localStorage.setItem('__tg_guard_settings', JSON.stringify(currentSettings));
  }

  function isTargetMediaCache(key) {
    const k = key.toLowerCase();
    const isMedia = k.includes('progressive') || k.includes('media') || k.includes('video') || k.includes('chunk');
    const isProtected = k.includes('avatar') || k.includes('lang') || k.includes('asset') || k.includes('auth') || k.includes('bundle');
    return isMedia && !isProtected;
  }

  async function getStorageStats() {
    let usageMB = 0;
    let quotaMB = 0;
    let fileCount = 0;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usageMB = Math.round((est.usage || 0) / (1024 * 1024));
        quotaMB = Math.round((est.quota || 0) / (1024 * 1024));
      } catch (e) {}
    }

    if (window.caches) {
      try {
        const keys = await window.caches.keys();
        for (const k of keys) {
          if (isTargetMediaCache(k)) {
            try {
              const c = await window.caches.open(k);
              const reqs = await c.keys();
              fileCount += reqs.length;
            } catch (err) {}
          }
        }
      } catch (e) {}
    }

    return { usageMB, quotaMB, fileCount };
  }

  async function purgeMediaCaches(isAuto = false) {
    if (!window.caches || isPurging) return;
    isPurging = true;

    try {
      const keys = await window.caches.keys();
      let deletedCaches = 0;
      const initialFileCount = currentFileCount;

      for (const k of keys) {
        if (isTargetMediaCache(k)) {
          await window.caches.delete(k);
          deletedCaches++;
        }
      }

      currentFileCount = 0;
      isShowingReport = false;
      renderUI();

      setTimeout(async () => {
        await updateUsage();
        isPurging = false;
        showToast(`⚡ 已成功清理 ${deletedCaches} 個媒體庫 (${initialFileCount.toLocaleString()} 個分段檔案)，空間已釋放！`);
      }, 400);

      setTimeout(updateUsage, 1200);

    } catch (e) {
      console.error('[Cache Guard] Purge failed:', e);
      isPurging = false;
      showToast('⚠️ 清理暫存時發生錯誤');
    }
  }

  function showToast(msg) {
    const existing = document.querySelector('.tg-guard-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'tg-guard-toast';
    toast.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function ensureMounted() {
    if (!rootEl || !document.body.contains(rootEl)) {
      rootEl = document.createElement('div');
      rootEl.id = 'tg-cache-guard-root';
      document.body.appendChild(rootEl);
    }
  }

  function renderUI() {
    ensureMounted();

    const percent = Math.min(100, Math.round((currentUsageMB / currentSettings.limitMB) * 100));
    let statusClass = '';
    if (percent > 85) statusClass = 'danger';
    else if (percent > 65) statusClass = 'warning';

    if (currentSettings.collapsed) {
      rootEl.innerHTML = `
        <div class="tg-guard-pill" title="點擊檢視快取詳細分析報告 (分段檔案: ${currentFileCount.toLocaleString()} 個)">
          <span class="tg-guard-pill-icon">🛡️</span>
          <span class="tg-guard-pill-text">${currentUsageMB} MB</span>
          <span class="tg-guard-pill-limit">/ ${currentSettings.limitMB >= 1024 ? (currentSettings.limitMB/1024).toFixed(1) + ' GB' : currentSettings.limitMB + ' MB'}</span>
          <span class="tg-guard-pill-dot ${statusClass}"></span>
        </div>
      `;

      rootEl.querySelector('.tg-guard-pill').addEventListener('click', () => {
        currentSettings.collapsed = false;
        isShowingReport = true;
        saveSettings();
        renderUI();
        updateUsage();
      });
    } else {
      // Expanded Card with Detailed Report
      rootEl.innerHTML = `
        <div class="tg-guard-card">
          <div class="tg-guard-header">
            <div class="tg-guard-title-group">
              <span style="font-size: 16px;">📋</span>
              <span class="tg-guard-title">快取詳細分析報告</span>
            </div>
            <button class="tg-guard-btn-close" title="收合面板">✕</button>
          </div>

          <div class="tg-guard-meter-box">
            <div class="tg-guard-meter-header">
              <span class="tg-guard-meter-label">目前已佔用空間</span>
              <span class="tg-guard-meter-val">${currentUsageMB} MB <span style="font-size: 11px; color: #8da4be;">(${percent}%)</span></span>
            </div>
            <div class="tg-guard-bar-bg">
              <div class="tg-guard-bar-fill ${statusClass}" style="width: ${percent}%;"></div>
            </div>
            <div class="tg-guard-file-stat">
              <span>零碎串流分段：</span>
              <strong>${currentFileCount.toLocaleString()} 個檔案</strong>
            </div>
          </div>

          <!-- Report Breakdown -->
          <div style="background: rgba(14, 22, 33, 0.6); border-radius: 10px; padding: 10px; margin-bottom: 12px; font-size: 11.5px; border: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="color: #8da4be; font-weight: 700; margin-bottom: 6px;">【預計清理項目】</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #ff8a80;">
              <span>• 影片與串流分段 (progressive)</span>
              <span style="font-weight: 700;">可安全清除</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #ff8a80;">
              <span>• 預覽照片快取 (tt-media)</span>
              <span style="font-weight: 700;">可安全清除</span>
            </div>

            <div style="color: #8da4be; font-weight: 700; margin-bottom: 6px; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 6px;">【完全保留不受影響】</div>
            <div style="display: flex; justify-content: space-between; color: #81c784;">
              <span>• 帳號登入 Session / 文字聊天 / 大頭貼</span>
              <span style="font-weight: 700;">100% 保留</span>
            </div>
          </div>

          <div class="tg-guard-row">
            <span>超額處理機制</span>
            <select class="tg-guard-select" id="tg-guard-policy-select">
              <option value="prompt" ${currentSettings.policy === 'prompt' ? 'selected' : ''}>超額時提醒我決定 (推薦)</option>
              <option value="auto" ${currentSettings.policy === 'auto' ? 'selected' : ''}>超額時自動清理</option>
            </select>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button class="tg-guard-clean-btn" id="tg-guard-btn-keep" style="background: rgba(255, 255, 255, 0.1); box-shadow: none; flex: 1;">
              <span>暫不清理</span>
            </button>
            <button class="tg-guard-clean-btn" id="tg-guard-btn-confirm" style="background: linear-gradient(135deg, #e53935 0%, #d32f2f 100%); box-shadow: 0 4px 12px rgba(229, 57, 53, 0.35); flex: 1.4;" ${isPurging ? 'disabled' : ''}>
              <span>${isPurging ? '⏳ 清理中...' : '確認清理並釋放'}</span>
            </button>
          </div>
        </div>
      `;

      rootEl.querySelector('.tg-guard-btn-close').addEventListener('click', () => {
        currentSettings.collapsed = true;
        isShowingReport = false;
        saveSettings();
        renderUI();
      });

      rootEl.querySelector('#tg-guard-btn-keep').addEventListener('click', () => {
        currentSettings.collapsed = true;
        isShowingReport = false;
        saveSettings();
        renderUI();
      });

      rootEl.querySelector('#tg-guard-policy-select').addEventListener('change', (e) => {
        currentSettings.policy = e.target.value;
        saveSettings();
      });

      rootEl.querySelector('#tg-guard-btn-confirm').addEventListener('click', () => {
        purgeMediaCaches(false);
      });
    }
  }

  async function updateUsage() {
    const stats = await getStorageStats();
    currentUsageMB = stats.usageMB;
    currentFileCount = stats.fileCount;
    renderUI();
    return stats;
  }

  async function checkThreshold() {
    const stats = await updateUsage();
    if (stats.usageMB >= currentSettings.limitMB) {
      if (currentSettings.policy === 'prompt') {
        // Show report and prompt user
        if (currentSettings.collapsed) {
          currentSettings.collapsed = false;
          saveSettings();
          renderUI();
          showToast(`📋 快取已達門檻 (${stats.usageMB} MB)！已為您展開詳細報告，請決定是否清理。`);
        }
      } else {
        // Auto clean
        await purgeMediaCaches(true);
      }
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'GET_STATUS') {
        getStorageStats().then(stats => {
          sendResponse({
            usageMB: stats.usageMB,
            quotaMB: stats.quotaMB,
            fileCount: stats.fileCount,
            settings: currentSettings
          });
        });
        return true;
      } else if (msg.action === 'PURGE_NOW') {
        purgeMediaCaches(false).then(() => {
          sendResponse({ success: true, usageMB: currentUsageMB, fileCount: currentFileCount });
        });
        return true;
      } else if (msg.action === 'UPDATE_SETTINGS') {
        Object.assign(currentSettings, msg.settings);
        saveSettings();
        renderUI();
        checkThreshold();
        sendResponse({ success: true });
        return true;
      }
    });
  }

  loadSettings(() => {
    updateUsage();
    checkThreshold();

    setInterval(checkThreshold, 3 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updateUsage();
      }
    });
  });

})();
