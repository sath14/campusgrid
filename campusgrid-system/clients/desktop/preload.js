const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CampusDesktop', {
  openCampus(url) {
    return ipcRenderer.invoke('open-campus', url);
  }
});
