const input=document.getElementById("token");
chrome.storage.local.get("token",v=>input.value=v.token||"");
document.getElementById("save").addEventListener("click",async()=>{
 await chrome.storage.local.set({token:input.value.trim()});
 document.getElementById("status").textContent="Token saved.";
});
