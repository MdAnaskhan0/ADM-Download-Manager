chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "adm-send-link", title: "Send link to ADM", contexts: ["link"] });
});
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "adm-send-link" && info.linkUrl) {
    const { token } = await chrome.storage.local.get("token");
    await fetch("http://127.0.0.1:43821/api/download", {
      method: "POST", headers: { "Content-Type": "application/json", "X-ADM-Token": token || "" },
      body: JSON.stringify({ url: info.linkUrl, type: "file" })
    });
  }
});
