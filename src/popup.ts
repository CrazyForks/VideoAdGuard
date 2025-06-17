export {};
import { WhitelistService } from './services/whitelist';  
import { BilibiliService } from './services/bilibili';    

document.addEventListener("DOMContentLoaded", async () => {
  const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement;
  const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
  const modelInput = document.getElementById("model") as HTMLInputElement;
  const messageDiv = document.getElementById("message") as HTMLInputElement;
  const resultDiv = document.getElementById("result") as HTMLInputElement;
  const enableExtensionCheckbox = document.getElementById("enableExtension") as HTMLInputElement;
  const localOllamaCheckbox = document.getElementById("localOllama") as HTMLInputElement;
  const autoSkipAdCheckbox = document.getElementById("autoSkipAd") as HTMLInputElement;
  const togglePasswordBtn = document.getElementById("toggleApiKey") as HTMLInputElement;

  // 自动保存函数
  async function autoSaveSettings() {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    const enableExtension = enableExtensionCheckbox.checked;
    const enableLocalOllama = localOllamaCheckbox.checked;
    const autoSkipAd = autoSkipAdCheckbox.checked;

    // 基本验证
    if (!apiUrl) {
      console.warn('API地址为空');
      return;
    }

    if (!enableLocalOllama && !apiKey) {
      console.warn('API密钥为空');
      return;
    }

    if (!model) {
      console.warn('模型名称为空');
      return;
    }

    try {
      await chrome.storage.local.set({ apiUrl, apiKey, model, enableExtension, enableLocalOllama, autoSkipAd });
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  }

  // 页面卸载时自动保存
  window.addEventListener('beforeunload', autoSaveSettings);
  
  // 页面隐藏时自动保存（用户切换标签页或关闭popup）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoSaveSettings();
    }
  });


  if (togglePasswordBtn && apiKeyInput) {
    togglePasswordBtn.addEventListener("click", () => {
      // 只需切换输入框类型，图标显示由CSS控制      
      const type = apiKeyInput.getAttribute("type") === "password" ? "text" : "password";
      apiKeyInput.setAttribute("type", type);
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

  // 加载已保存的设置
  const settings = await chrome.storage.local.get([
    "apiUrl",
    "apiKey",
    "model",
    "enableExtension",
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
  if (settings.enableExtension) {
    enableExtensionCheckbox.checked = settings.enableExtension;
  }
  if (settings.enableLocalOllama) {
    localOllamaCheckbox.checked = settings.enableLocalOllama;
    // 使用CSS类而不是直接修改样式
    document.body.classList.add('ollama-enabled');
  }
  if (settings.autoSkipAd) {
    autoSkipAdCheckbox.checked = settings.autoSkipAd;
  }



  if (localOllamaCheckbox.checked){
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
  }

  const enableWhitelistCheckbox = document.getElementById("enableWhitelist") as HTMLInputElement;
  const upUidInput = document.getElementById("upUid") as HTMLInputElement;
  const addToWhitelistButton = document.getElementById("addToWhitelist") as HTMLButtonElement;
  const whitelistList = document.querySelector(".whitelist-list") as HTMLDivElement;

  // 加载白名单配置
  const whitelistConfig = await WhitelistService.getConfig();
  enableWhitelistCheckbox.checked = whitelistConfig.enabled;
  document.body.classList.toggle('whitelist-enabled', whitelistConfig.enabled);

  // 渲染白名单列表
  function renderWhitelistItems() {
    whitelistList.innerHTML = whitelistConfig.whitelistedUPs.map(up => `
      <div class="whitelist-item">
        <span>${up.name} (UID: ${up.uid})</span>
        <button data-uid="${up.uid}">移除</button>
      </div>
    `).join('');
  }
  renderWhitelistItems();

  // 启用/禁用白名单
  enableWhitelistCheckbox.addEventListener('change', async () => {
    await WhitelistService.setEnabled(enableWhitelistCheckbox.checked);
    document.body.classList.toggle('whitelist-enabled', enableWhitelistCheckbox.checked);
  });

  // 添加UP主到白名单
  addToWhitelistButton.addEventListener('click', async () => {
    const uid = upUidInput.value.trim();
    if (!uid) {
      messageDiv.textContent = '请输入UP主UID';
      messageDiv.className = 'error';
      messageDiv.style.display = 'block';
      return;
    }

    try {
      // 获取UP主信息
      const upInfo = await BilibiliService.getUpInfo(uid);
      const added = await WhitelistService.addToWhitelist({
        uid: uid,
        name: upInfo.name
      });

      if (added) {
        messageDiv.textContent = '已添加到白名单';
        messageDiv.className = 'success';
        messageDiv.style.display = 'block';
        upUidInput.value = '';
        whitelistConfig.whitelistedUPs = (await WhitelistService.getConfig()).whitelistedUPs;
        renderWhitelistItems();
      } else {
        messageDiv.textContent = '该UP主已在白名单中';
        messageDiv.className = 'error';
        messageDiv.style.display = 'block';
      }
    } catch (error) {
      messageDiv.textContent = '添加失败：' + (error as Error).message;
      messageDiv.className = 'error';
      messageDiv.style.display = 'block';
    }
  });

  // 移除白名单中的UP主
  whitelistList.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON') {
      const uid = target.dataset.uid;
      if (uid) {
        await WhitelistService.removeFromWhitelist(uid);
        whitelistConfig.whitelistedUPs = (await WhitelistService.getConfig()).whitelistedUPs;
        renderWhitelistItems();
        messageDiv.textContent = '已从白名单移除';
        messageDiv.className = 'success';
        messageDiv.style.display = 'block';
      }
    }
  });
});