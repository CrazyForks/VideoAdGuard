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
  const autoSkipAdCheckbox = document.getElementById("autoSkipAd") as HTMLInputElement;
  const togglePasswordBtn = document.getElementById("toggleApiKey");
  const apiKeyField = document.getElementsByClassName("apiKey-field")[0] as HTMLElement;

  if (togglePasswordBtn && apiKeyInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const type = apiKeyInput.getAttribute("type") === "password" ? "text" : "password";
      apiKeyInput.setAttribute("type", type);
      
      // 切换眼睛图标
      const eyeOpen = togglePasswordBtn.querySelector(".eye-open") as HTMLElement;
      const eyeClosed = togglePasswordBtn.querySelector(".eye-closed") as HTMLElement;
      
      if (type === "text") {
        // 显示密码时，显示闭眼图标，隐藏睁眼图标
        eyeOpen.style.display = "none";
        eyeClosed.style.display = "block";
      } else {
        // 隐藏密码时，显示睁眼图标，隐藏闭眼图标
        eyeOpen.style.display = "block";
        eyeClosed.style.display = "none";
      }
    });
  }

  localOllamaCheckbox.addEventListener('change', toggleOllamaField);
  function toggleOllamaField(e: Event) {
    const target = e.target as HTMLInputElement;
    
    // 使用CSS类来控制显示/隐藏，而不是直接修改display属性
    if (target.checked) {
      document.body.classList.add('ollama-enabled');
    } else {
      document.body.classList.remove('ollama-enabled');
    }
  }

  if (
    !apiUrlInput ||
    !apiKeyInput ||
    !modelInput ||
    !saveButton ||
    !messageDiv ||
    !resultDiv ||
    !autoSkipAdCheckbox
  )
    return;

  // 加载已保存的设置
  const settings = await chrome.storage.local.get([
    "apiUrl",
    "apiKey",
    "model",
    "enableLocalOllama",
    "autoSkipAd",
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
    // 使用CSS类而不是直接修改样式
    document.body.classList.add('ollama-enabled');
  }

  // 新增: 加载自动跳过设置
  if (settings.autoSkipAd) {
    autoSkipAdCheckbox.checked = settings.autoSkipAd;
  }

  // 保存设置
  saveButton.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const enableLocalOllama = localOllamaCheckbox.checked;
    const autoSkipAd = autoSkipAdCheckbox.checked;

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
      await chrome.storage.local.set({ apiUrl, apiKey, model, enableLocalOllama, autoSkipAd });
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