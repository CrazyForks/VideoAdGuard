export {};

document.addEventListener("DOMContentLoaded", async () => {
  const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
  const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
  const modelInput = document.getElementById("model") as HTMLInputElement;
  const saveButton = document.getElementById("save") as HTMLButtonElement;
  const messageDiv = document.getElementById("message");
  const resultDiv = document.getElementById("result");
  const localOllamaCheckbox = document.getElementById(
    "localOllama"
  ) as HTMLInputElement;
  localOllamaCheckbox.addEventListener('change', toggleOllamaField);
  function toggleOllamaField(e: Event) {
    const target = e.target as HTMLInputElement;
    (document.getElementsByClassName("apiKey-field")[0] as HTMLElement).style.display = target.checked? "none": "block";
  }
  if (
    !apiUrlInput ||
    !apiKeyInput ||
    !modelInput ||
    !saveButton ||
    !messageDiv ||
    !resultDiv
  )
    return;

  // 加载已保存的设置
  const settings = await chrome.storage.local.get([
    "apiUrl",
    "apiKey",
    "model",
    "enableLocalOllama",
  ]);
  if (settings.apiUrl) {
    apiUrlInput.value = settings.apiUrl;
  }
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  if (settings.model) {
    modelInput.value = settings.model;
  }

  if (settings.enableLocalOllama) {
    localOllamaCheckbox.checked = settings.enableLocalOllama;
    (document.getElementsByClassName("apiKey-field")[0] as HTMLElement).style.display = "none";
  }

  // 保存设置
  saveButton.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const enableLocalOllama = localOllamaCheckbox.checked;

    if (!apiUrl) {
      messageDiv.textContent = '请输入API地址';
      messageDiv.className = 'error';
      return;
    }

    if (!enableLocalOllama && !apiKey) {
      messageDiv.textContent = '请输入API密钥';
      messageDiv.className = 'error';
      return;
    }

    if (!model) {
      messageDiv.textContent = '请输入模型名称';
      messageDiv.className = 'error';
      return;
    }

    try {
      await chrome.storage.local.set({ apiUrl, apiKey, model, enableLocalOllama});
      messageDiv.textContent = '设置已保存';
      messageDiv.className = 'success';
    } catch (error) {
      messageDiv.textContent = '保存设置失败';
      messageDiv.className = 'error';
      console.error('保存设置失败:', error);
    }
  });

  // 获取当前标签页的广告检测结果
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (!currentTab || !currentTab.id) return;

    // 检查是否在B站视频页面
    if (!currentTab.url?.includes('bilibili.com/video/') && 
    !currentTab.url?.includes('bilibili.com/list/watchlater')) {
      resultDiv.textContent = '当前不在哔哩哔哩视频页面';
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, { type: 'GET_AD_INFO' }, (response) => {
      if (chrome.runtime.lastError) {
        resultDiv.textContent = '插件未完全加载，请等待或刷新';
        return;
      }

      if (response && response.adInfo) {
        resultDiv.textContent = `${response.adInfo}`;
      } else {
        resultDiv.textContent = '未检测到广告信息';
      }
    });
  });
});