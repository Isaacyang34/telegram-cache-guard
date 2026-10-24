// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const usageText = document.getElementById('usage-text');
  const usageBar = document.getElementById('usage-bar');
  const fileCountText = document.getElementById('file-count-text');
  const limitSelect = document.getElementById('limit-select');
  const policySelect = document.getElementById('policy-select');
  const btnOpenReport = document.getElementById('btn-open-report');
  const btnOpenTg = document.getElementById('btn-open-tg');

  // Modal elements
  const reportModal = document.getElementById('report-modal');
  const reportTotalSize = document.getElementById('report-total-size');
  const reportTotalFiles = document.getElementById('report-total-files');
  const reportTime = document.getElementById('report-time');
  const btnReportCancel = document.getElementById('btn-report-cancel');
  const btnReportConfirm = document.getElementById('btn-report-confirm');

  let currentSettings = {
    limitMB: 1024,
    policy: 'prompt' // 'prompt' (show report first) or 'auto'
  };

  let cachedStats = {
    usageMB: 0,
    fileCount: 0
  };

  // Load settings
  chrome.storage.local.get(['tg_limitMB', 'tg_policy'], (res) => {
    if (res.tg_limitMB !== undefined) {
      currentSettings.limitMB = Number(res.tg_limitMB);
      limitSelect.value = String(currentSettings.limitMB);
    }
    if (res.tg_policy !== undefined) {
      currentSettings.policy = res.tg_policy;
      policySelect.value = currentSettings.policy;
    }
  });

  // Query active Telegram tab
  function queryTelegramTab() {
    chrome.tabs.query({ url: '*://web.telegram.org/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_STATUS' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            usageText.textContent = '守護待命中';
            usageBar.style.width = '0%';
            fileCountText.textContent = '就緒';
          } else {
            cachedStats.usageMB = res.usageMB || 0;
            cachedStats.fileCount = res.fileCount || 0;
            const percent = Math.min(100, Math.round((cachedStats.usageMB / currentSettings.limitMB) * 100));
            usageText.innerHTML = `${cachedStats.usageMB} MB <span style="font-size: 11px; color: #8da4be;">(${percent}%)</span>`;
            usageBar.style.width = `${percent}%`;
            fileCountText.innerHTML = `<strong>${cachedStats.fileCount.toLocaleString()} 個分段檔案</strong>`;
            
            if (percent > 85) usageBar.style.background = 'linear-gradient(90deg, #f7a23b, #e53935)';
            else usageBar.style.background = 'linear-gradient(90deg, #2aabee, #2ebd85)';
          }
        });
      } else {
        usageText.innerHTML = `<span style="color: #2aabee;">待命 (可隨時檢視報告)</span>`;
        usageBar.style.width = '0%';
        fileCountText.textContent = '點擊下方檢視快取分析報告';
      }
    });
  }

  queryTelegramTab();

  // Settings change
  limitSelect.addEventListener('change', () => {
    currentSettings.limitMB = Number(limitSelect.value);
    chrome.storage.local.set({ tg_limitMB: currentSettings.limitMB });
    syncWithTabs();
  });

  policySelect.addEventListener('change', () => {
    currentSettings.policy = policySelect.value;
    chrome.storage.local.set({ tg_policy: currentSettings.policy });
    syncWithTabs();
  });

  function syncWithTabs() {
    chrome.tabs.query({ url: '*://web.telegram.org/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'UPDATE_SETTINGS',
          settings: currentSettings
        });
      });
    });
    queryTelegramTab();
  }

  // Open Report Modal
  btnOpenReport.addEventListener('click', () => {
    const now = new Date();
    reportTime.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} 報告`;
    reportTotalSize.textContent = `${cachedStats.usageMB} MB`;
    reportTotalFiles.textContent = cachedStats.fileCount.toLocaleString();
    reportModal.style.display = 'flex';
  });

  // Cancel in Modal
  btnReportCancel.addEventListener('click', () => {
    reportModal.style.display = 'none';
  });

  // Confirm Purge in Modal
  btnReportConfirm.addEventListener('click', () => {
    btnReportConfirm.disabled = true;
    btnReportConfirm.textContent = '正在清理中...';

    // 1. Tell active tab to purge if open
    chrome.tabs.query({ url: '*://web.telegram.org/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'PURGE_NOW' });
      }

      // 2. Direct browser-level browsingData wipe for the origin
      if (chrome.browsingData && chrome.browsingData.remove) {
        chrome.browsingData.remove(
          { origins: ["https://web.telegram.org"] },
          { cacheStorage: true },
          () => {
            onPurgeFinished();
          }
        );
      } else {
        setTimeout(onPurgeFinished, 1200);
      }
    });
  });

  function onPurgeFinished() {
    btnReportConfirm.disabled = false;
    btnReportConfirm.textContent = '確認清理並釋放';
    reportModal.style.display = 'none';

    usageText.innerHTML = '0 MB <span style="font-size: 11px; color: #2ebd85;">(已清空)</span>';
    usageBar.style.width = '0%';
    fileCountText.innerHTML = '<span style="color: #2ebd85;">0 個檔案 (乾淨)</span>';
    cachedStats.usageMB = 0;
    cachedStats.fileCount = 0;

    btnOpenReport.innerHTML = '<span>✅ 快取已成功釋放！</span>';
    setTimeout(() => {
      btnOpenReport.innerHTML = '<span>📋 查看詳細分析報告並清理</span>';
      queryTelegramTab();
    }, 2800);
  }

  // Open Telegram
  btnOpenTg.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.telegram.org/' });
  });
});
