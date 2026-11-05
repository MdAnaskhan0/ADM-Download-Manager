import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, CheckCircle2, CircleAlert, Clock3, Download,
  FolderOpen, Gauge, Globe, HardDrive, History, Link2, ListVideo, Moon,
  Pause, Play, Plus, Search, Settings, Sun, Trash2, Video, X, Zap
} from "lucide-react";

const fmtBytes = n => {
  if (!n) return "—";
  const units = ["B","KB","MB","GB","TB"]; let i=0, v=n;
  while(v>=1024 && i<units.length-1){v/=1024;i++;}
  return `${v.toFixed(i===0?0:1)} ${units[i]}`;
};
const fmtSpeed = n => n ? `${fmtBytes(n)}/s` : "—";

export default function App() {
  const [jobs,setJobs] = useState([]);
  const [settings,setSettings] = useState({theme:"dark",downloadDir:""});
  const [tab,setTab] = useState("All Downloads");
  const [query,setQuery] = useState("");
  const [url,setUrl] = useState("");
  const [kind,setKind] = useState("file");
  const [format,setFormat] = useState("bv*+ba/b");
  const [audioOnly,setAudioOnly] = useState(false);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [showSettings,setShowSettings] = useState(false);
  const [engine,setEngine] = useState({aria2:true});

  useEffect(()=>{
    window.adm.listJobs().then(setJobs);
    window.adm.getSettings().then(setSettings);
    const off = window.adm.onJobsUpdated(setJobs);
    const offEngine = window.adm.onEngineStatus(setEngine);
    return ()=>{off();offEngine();};
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.theme||"dark";},[settings.theme]);

  const counts = useMemo(()=>({
    all:jobs.length, active:jobs.filter(j=>j.status==="active").length,
    completed:jobs.filter(j=>j.status==="completed").length,
    queued:jobs.filter(j=>["queued","interrupted"].includes(j.status)).length,
    failed:jobs.filter(j=>["failed","cancelled"].includes(j.status)).length
  }),[jobs]);
  const filtered = useMemo(()=>{
    let list = [...jobs];
    if(tab==="Active") list=list.filter(j=>j.status==="active");
    if(tab==="Completed") list=list.filter(j=>j.status==="completed");
    if(tab==="Queue") list=list.filter(j=>["queued","interrupted","paused"].includes(j.status));
    if(tab==="Failed") list=list.filter(j=>["failed","cancelled"].includes(j.status));
    if(query) list=list.filter(j=>(j.name+j.url).toLowerCase().includes(query.toLowerCase()));
    return list.sort((a,b)=>b.createdAt-a.createdAt);
  },[jobs,tab,query]);

  async function submit(e){
    e?.preventDefault(); if(!url.trim()) return;
    setBusy(true);setNotice("");
    try{
      await window.adm.addDownload({url:url.trim(),type:kind,format,audioOnly});
      setUrl("");setNotice("Download added successfully.");
    }catch(err){setNotice(err.message||"Could not add download.");}
    finally{setBusy(false);}
  }
  async function updateTheme(theme){
    const next=await window.adm.updateSettings({theme});setSettings(next);
  }
  const nav = [
    {name:"All Downloads",icon:Download,count:counts.all},
    {name:"Active",icon:Activity,count:counts.active},
    {name:"Queue",icon:Clock3,count:counts.queued},
    {name:"Completed",icon:CheckCircle2,count:counts.completed},
    {name:"Failed",icon:CircleAlert,count:counts.failed}
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ArrowDownToLine size={23}/></div><div><b>ADM</b><small>ANAS DOWNLOAD MANAGER</small></div></div>
      <button className="primary side-add" onClick={()=>document.getElementById("url-input")?.focus()}><Plus size={17}/> New download</button>
      <div className="nav-label">LIBRARY</div>
      {nav.map(n=><button key={n.name} className={`nav-item ${tab===n.name?"selected":""}`} onClick={()=>setTab(n.name)}><n.icon size={17}/><span>{n.name}</span><em>{n.count}</em></button>)}
      <div className="nav-label tools-label">TOOLS</div>
      <button className={`nav-item ${tab==="Video Downloader"?"selected":""}`} onClick={()=>{setTab("Video Downloader");setKind("video");}}><Video size={17}/><span>Video downloader</span></button>
      <button className="nav-item" onClick={()=>window.adm.openDownloadFolder()}><FolderOpen size={17}/><span>Open download folder</span></button>
      <div className="sidebar-bottom">
        <div className="engine-status"><span className="status-dot"/> aria2 engine <small>{engine.aria2===false?"Missing":"Local"}</small></div>
        <button className="nav-item" onClick={()=>setShowSettings(true)}><Settings size={17}/><span>Settings</span></button>
        <div className="version">ADM v1.0.0 · Linux edition</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">DOWNLOAD CENTER</div><h1>{tab}</h1></div>
        <div className="top-actions">
          <label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search downloads..."/></label>
          <button className="icon-btn" title="Toggle theme" onClick={()=>updateTheme(settings.theme==="dark"?"light":"dark")}>{settings.theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button>
          <button className="icon-btn" title="Settings" onClick={()=>setShowSettings(true)}><Settings size={18}/></button>
        </div>
      </header>

      <section className="stats-grid">
        <Stat icon={Download} label="Total downloads" value={counts.all}/>
        <Stat icon={Activity} label="In progress" value={counts.active}/>
        <Stat icon={CheckCircle2} label="Completed" value={counts.completed}/>
        <Stat icon={Gauge} label="Queued" value={counts.queued}/>
      </section>

      <section className="add-panel">
        <div className="panel-heading"><div className="panel-icon"><Link2 size={18}/></div><div><b>Add a download</b><small>Paste a file or supported video URL</small></div></div>
        <form className="add-form" onSubmit={submit}>
          <div className="url-wrap"><Link2 size={17}/><input id="url-input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/file.zip or video URL" /></div>
          <select value={kind} onChange={e=>setKind(e.target.value)}><option value="file">File</option><option value="video">Video / audio</option></select>
          {kind==="video"&&<select value={format} onChange={e=>setFormat(e.target.value)}><option value="bv*+ba/b">Best quality</option><option value="bv[height<=1080]+ba/b[height<=1080]">Up to 1080p</option><option value="bv[height<=720]+ba/b[height<=720]">Up to 720p</option><option value="bv[height<=480]+ba/b[height<=480]">Up to 480p</option></select>}
          <button className="primary submit-btn" disabled={busy||!url.trim()}>{busy?"Adding...":<><Plus size={17}/> Add</>}</button>
        </form>
        {kind==="video"&&<label className="audio-check"><input type="checkbox" checked={audioOnly} onChange={e=>setAudioOnly(e.target.checked)}/> Extract audio only (requires FFmpeg)</label>}
        {notice&&<div className="notice">{notice}</div>}
        <div className="add-hint"><Zap size={14}/> Multi-connection acceleration for compatible direct downloads · Video extraction via yt-dlp</div>
      </section>

      <section className="downloads-section">
        <div className="section-head"><div><h2>Downloads</h2><p>Monitor and manage your transfers</p></div><button className="subtle-btn" onClick={()=>window.adm.openDownloadFolder()}><FolderOpen size={15}/> Open folder</button></div>
        <div className="table-head"><span>FILE NAME</span><span>STATUS</span><span>PROGRESS</span><span>SIZE / SPEED</span><span>ACTIONS</span></div>
        {filtered.length===0?<div className="empty"><div className="empty-icon"><HardDrive size={27}/></div><b>No downloads found</b><p>Add a URL above to get started.</p></div>:
          <div className="download-list">{filtered.map(job=><DownloadRow key={job.id} job={job}/>)}</div>}
      </section>
      <footer>ADM · Built for Linux <span>Downloads are stored in {settings.downloadDir||"~/Downloads/ADM"}</span></footer>
    </main>
    {showSettings&&<SettingsModal settings={settings} onClose={()=>setShowSettings(false)} onSave={async p=>setSettings(await window.adm.updateSettings(p))}/>}
  </div>;
}
function Stat({icon:Icon,label,value}){return <div className="stat-card"><div className="stat-icon"><Icon size={18}/></div><div><strong>{value}</strong><small>{label}</small></div></div>}
function DownloadRow({job}){
  const [menu,setMenu]=useState(false);
  const statusColor=job.status==="completed"?"green":job.status==="failed"||job.status==="cancelled"?"red":job.status==="paused"?"yellow":"blue";
  return <div className="download-row">
    <div className="file-cell"><div className="file-icon">{job.type==="video"?<Video size={19}/>:<Download size={19}/>}</div><div className="file-meta"><b title={job.name}>{job.name}</b><small title={job.url}>{job.url}</small></div></div>
    <div><span className={`status-pill ${statusColor}`}>{job.status}</span></div>
    <div className="progress-cell"><div className="progress-track"><div style={{width:`${Math.max(0,Math.min(100,job.progress||0))}%`}}/></div><small>{(job.progress||0).toFixed(1)}%</small></div>
    <div className="size-cell"><b>{job.total?`${fmtBytes(job.downloaded)} / ${fmtBytes(job.total)}`:fmtBytes(job.downloaded)}</b><small>{job.speed?fmtSpeed(job.speed):job.speedText||job.error||" "}</small></div>
    <div className="row-actions">
      {job.status==="active"?<button title="Pause" onClick={()=>window.adm.pause(job.id)}><Pause size={16}/></button>:["paused","queued","interrupted"].includes(job.status)?<button title="Resume" onClick={()=>window.adm.resume(job.id)}><Play size={16}/></button>:null}
      {job.file&&<button title="Show in folder" onClick={()=>window.adm.reveal(job.file)}><FolderOpen size={16}/></button>}
      {job.status!=="completed"&&job.status!=="cancelled"&&<button title="Cancel" onClick={()=>window.adm.cancel(job.id)}><X size={16}/></button>}
      <button title="Remove from list" onClick={()=>window.adm.remove(job.id)}><Trash2 size={16}/></button>
    </div>
  </div>;
}
function SettingsModal({settings,onClose,onSave}){
  const [folder,setFolder]=useState(settings.downloadDir);
  const [limit,setLimit]=useState(settings.speedLimit||0);
  const [concurrent,setConcurrent]=useState(settings.maxConcurrent||3);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="modal-title"><div><h2>Settings</h2><p>Configure your ADM experience</p></div><button className="icon-btn" onClick={onClose}><X/></button></div>
    <label className="field-label">Download location</label><div className="folder-picker"><input value={folder} readOnly/><button className="subtle-btn" onClick={async()=>{const p=await window.adm.chooseFolder();if(p)setFolder(p);}}>Browse</button></div>
    <label className="field-label">Maximum simultaneous downloads <b>{concurrent}</b></label><input className="range" type="range" min="1" max="10" value={concurrent} onChange={e=>setConcurrent(Number(e.target.value))}/>
    <label className="field-label">Speed limit (KB/s, 0 = unlimited)</label><input className="text-input" type="number" min="0" value={limit} onChange={e=>setLimit(Number(e.target.value))}/>
    <label className="field-label">Browser pairing token</label>
    <div className="folder-picker"><input value={settings.bridgeToken || ""} readOnly/><button className="subtle-btn" onClick={()=>navigator.clipboard.writeText(settings.bridgeToken || "")}>Copy token</button></div>
    <p className="pairing-note">Paste this token into the ADM extension Options page in Chrome or Firefox. Keep it private.</p>
    <label className="field-label">Appearance</label><div className="theme-options"><button className={settings.theme==="dark"?"chosen":""} onClick={()=>onSave({theme:"dark"})}><Moon size={16}/> Dark</button><button className={settings.theme==="light"?"chosen":""} onClick={()=>onSave({theme:"light"})}><Sun size={16}/> Light</button></div>
    <div className="modal-actions"><button className="subtle-btn" onClick={onClose}>Cancel</button><button className="primary" onClick={async()=>{await onSave({downloadDir:folder,speedLimit:limit,maxConcurrent:concurrent});onClose();}}>Save settings</button></div>
  </div></div>;
}
