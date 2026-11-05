const input=document.getElementById("token");
browser.storage.local.get("token").then(v=>input.value=v.token||"");
document.getElementById("save").addEventListener("click",async()=>{
 await browser.storage.local.set({token:input.value.trim()});
 document.getElementById("status").textContent="Token saved.";
});
