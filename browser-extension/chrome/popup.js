let currentUrl = "";
chrome.tabs.query({active:true,currentWindow:true}, tabs => {
  currentUrl = tabs[0]?.url || "";
  document.getElementById("page").textContent = currentUrl;
});
document.getElementById("send").addEventListener("click", async () => {
  const {token} = await chrome.storage.local.get("token");
  const status = document.getElementById("status");
  try {
    const r = await fetch("http://127.0.0.1:43821/api/download", {
      method:"POST", headers:{"Content-Type":"application/json","X-ADM-Token":token||""},
      body:JSON.stringify({url:currentUrl,type:"video"})
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || "Could not connect");
    status.textContent = "Sent to ADM!";
  } catch(e) { status.textContent = e.message; }
});
