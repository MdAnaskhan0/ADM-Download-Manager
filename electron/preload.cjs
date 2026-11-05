const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adm", {
  listJobs: () => ipcRenderer.invoke("jobs:list"),
  addDownload: data => ipcRenderer.invoke("download:add", data),
  pause: id => ipcRenderer.invoke("download:pause", id),
  resume: id => ipcRenderer.invoke("download:resume", id),
  cancel: id => ipcRenderer.invoke("download:cancel", id),
  remove: id => ipcRenderer.invoke("download:remove", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: data => ipcRenderer.invoke("settings:update", data),
  chooseFolder: () => ipcRenderer.invoke("settings:choose-folder"),
  openPath: p => ipcRenderer.invoke("app:open-path", p),
  reveal: p => ipcRenderer.invoke("app:reveal", p),
  openDownloadFolder: () => ipcRenderer.invoke("app:open-download-folder"),
  onJobsUpdated: callback => {
    const listener = (_, jobs) => callback(jobs);
    ipcRenderer.on("jobs-updated", listener);
    return () => ipcRenderer.removeListener("jobs-updated", listener);
  },
  onEngineStatus: callback => {
    const listener = (_, status) => callback(status);
    ipcRenderer.on("engine-status", listener);
    return () => ipcRenderer.removeListener("engine-status", listener);
  }
});
