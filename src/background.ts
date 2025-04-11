export {};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { url, headers, body } = message;

  // 简单校验请求结构，保证是合法的 API 请求
  if (url && headers && body) {
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
      .then((res) => res.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.toString() });
      });

    return true; // 表示异步响应
  }

  // 如果不符合结构，直接返回错误
  sendResponse({ success: false, error: "Invalid message structure" });
  return false;
});
