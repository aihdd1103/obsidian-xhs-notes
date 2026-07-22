chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "xhs-collect-image",
    title: "采集这张图片到小红书收件箱",
    contexts: ["image"]
  });
  chrome.contextMenus.create({
    id: "xhs-collect-page",
    title: "采集当前页/花瓣主图到小红书收件箱",
    contexts: ["page", "link", "selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "xhs-collect-page") {
    await chrome.storage.session.set({
      pendingAction: {
        action: /^https?:\/\/huaban\.com\/pins\/\d+/i.test(tab?.url || "") ? "huaban-main" : "page-images",
        pageUrl: tab?.url || info.pageUrl || "",
        pageTitle: tab?.title || "",
        capturedFrom: "context-menu"
      }
    });
    await chrome.action.openPopup().catch(() => {});
    return;
  }

  await chrome.storage.session.set({
    pendingImage: {
      imageUrl: info.srcUrl,
      pageUrl: info.pageUrl || tab?.url || "",
      pageTitle: tab?.title || "",
      capturedFrom: "context-menu"
    }
  });
  await chrome.action.openPopup().catch(() => {});
});
