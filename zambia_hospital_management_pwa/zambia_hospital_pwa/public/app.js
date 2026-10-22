const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let currentUser = null;
let summaryData = null;
let deferredInstallPrompt = null;
const ZM = { lat: -15.4167, lon: 28.2833, name: "Lusaka, Zambia" };

async function api(url, options={}) {
  const response = await fetch(url, {credentials:"same-origin", headers:{"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function notice(message, error=false) {
  const n=$("#notice"); n.textContent=message; n.classList.remove("hidden","error-notice");
  if(error) n.classList.add("error-notice");
  clearTimeout(notice.timer); notice.timer=setTimeout(()=>n.classList.add("hidden"),5000);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fmtDate(value, opts={dateStyle:"medium",timeStyle:"short"}) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-ZM",{...opts,timeZone:"Africa/Lusaka"}).format(d);
}
function updateClock() {
  const now = new Date();
  $("#clock").textContent = new Intl.DateTimeFormat("en-ZM",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Africa/Lusaka"}).format(now);
  $("#todayLabel").textContent = new Intl.DateTimeFormat("en-ZM",{weekday:"long",day:"numeric",month:"long",timeZone:"Africa/Lusaka"}).format(now).toUpperCase();
  $("#year").textContent = new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"Africa/Lusaka"}).format(now);
}
updateClock(); setInterval(updateClock,15000);
window.addEventListener("online",()=>{ $("#networkState").textContent="Online"; $("#networkState").classList.remove("network-offline"); });
window.addEventListener("offline",()=>{ $("#networkState").textContent="Offline"; $("#networkState").classList.add("network-offline"); });
$("#networkState").textContent = navigator.onLine ? "Online" : "Offline";

$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); $("#loginError").textContent="";
  const form=new FormData(e.currentTarget);
  try { const data=await api("/api/login",{method:"POST",body:JSON.stringify({email:form.get("email"),password:form.get("password")})}); currentUser=data.user; showApp(); }
  catch(err){ $("#loginError").textContent=err.message; }
});
$("#logoutBtn").addEventListener("click", async()=>{ try{await api("/api/logout",{method:"POST",body:"{}"});}catch{} currentUser=null; $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden"); $("#sidebar").classList.remove("open"); });
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(!b)return; $$(".nav-item").forEach(n=>n.classList.toggle("active",n===b));$("#sidebar").classList.remove("open");renderPage(b.dataset.page);});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;$("#installBtn").classList.remove("hidden");});
$("#installBtn").addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("#installBtn").classList.add("hidden");});

async function showApp(){
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#userName").textContent=currentUser.name; $("#userRole").textContent=currentUser.role; $("#avatar").textContent=currentUser.name.split(/\s+/).map(s=>s[0]).join("").slice(0,2).toUpperCase();
  const allowed = currentUser.role;
  $$('.nav-item').forEach(b=>{
    const page=b.dataset.page;
    b.classList.toggle("hidden",(page==="patients"&&!["admin","doctor","nurse"].includes(allowed))||(page==="payments"&&allowed==="nurse"));
  });
  await renderPage("overview");
}
async function renderPage(page){
  const titles={overview:"Overview",appointments:"Appointments",patients:"Patients",services:"Local services",payments:"Payments"};
  $("#pageTitle").textContent=titles[page]||"Overview";
  try {
    if(page==="overview") await renderOverview();
    else if(page==="appointments") await renderAppointments();
    else if(page==="patients") await renderPatients();
    else if(page==="services") await renderServices();
    else if(page==="payments") renderPayments();
  } catch(e){ $("#pageContent").innerHTML=`<div class="panel"><strong>Something went wrong</strong><p class="muted">${escapeHtml(e.message)}</p><button class="primary" onclick="renderPage('${page}')">Try again</button></div>`; }
}
async function renderOverview(){
  summaryData=await api("/api/summary");
  const c=summaryData.counts, appts=summaryData.appointments;
  $("#pageContent").innerHTML=`
    <div class="page-heading"><div><h1>Good day, ${escapeHtml(currentUser.name.split(" ")[0])} 👋</h1><p>Here is your hospital workspace at a glance.</p></div><button class="primary" id="bookBtn">＋ Book appointment</button></div>
    <div class="stats-grid">
      ${stat("Patients",c.patients,"♡","Registered patient records")}
      ${stat("Appointments",c.appointments,"▣","Visible appointments")}
      ${stat("Awaiting action",c.pending,"◷","Pending confirmation")}
      ${stat("Medical team",c.doctors,"✚","Registered doctors")}
    </div>
    <div class="content-grid"><div class="panel"><div class="panel-head"><div><h3>Upcoming appointments</h3><p>Scheduled care and follow-ups</p></div><button class="text-link" id="viewAll">View all →</button></div>${appointmentsTable(appts.slice(0,5))}</div>
      <div class="right-column"><div class="weather-card" id="weatherCard"><div class="weather-top"><strong>Weather in Lusaka</strong><small>LIVE FORECAST</small></div><div class="weather-main"><span class="weather-icon">☀</span><div><div class="weather-temp">--°</div><div class="weather-desc">Loading forecast…</div></div></div><div class="weather-bottom"><span>Central Province</span><span>Open-Meteo</span></div></div>
      <div class="panel"><div class="panel-head"><div><h3>Quick actions</h3><p>Common tasks</p></div></div><div class="quick-grid"><button class="quick-action" data-quick="appointments"><span>▣</span><strong>Appointments</strong><small>View schedule</small></button><button class="quick-action" data-quick="services"><span>⌖</span><strong>Find services</strong><small>Weather & map</small></button></div></div>
      ${currentUser.role==="admin"&&summaryData.recentActivity.length?`<div class="panel"><div class="panel-head"><h3>Recent activity</h3></div>${summaryData.recentActivity.map(a=>`<p class="muted">• ${escapeHtml(a.name||"System")} — ${escapeHtml(a.action)} <small>${escapeHtml(fmtDate(a.created_at))}</small></p>`).join("")}</div>`:""}
      </div></div>`;
  $("#bookBtn").onclick=()=>openAppointmentModal();
  $("#viewAll").onclick=()=>{setActive("appointments");renderPage("appointments")};
  $$("[data-quick]").forEach(b=>b.onclick=()=>{setActive(b.dataset.quick);renderPage(b.dataset.quick)});
  loadWeather();
}
function stat(title,value,icon,foot){return `<div class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon}</span></div><div class="stat-number">${value}</div><div class="stat-foot">${foot}</div></div>`}
function setActive(page){$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));}
function appointmentsTable(rows){
  if(!rows.length)return `<div class="empty-state"><strong>No appointments yet</strong>Appointments will appear here when booked.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Patient</th><th>Date & time</th><th>Doctor</th><th>Status</th></tr></thead><tbody>${rows.map(a=>`<tr><td><div class="patient-cell"><span class="mini-avatar">${escapeHtml((a.patient_name||"P")[0])}</span><strong>${escapeHtml(a.patient_name)}</strong></div></td><td>${escapeHtml(fmtDate(a.appointment_at))}</td><td>${escapeHtml(a.doctor_name||"To be assigned")}</td><td><span class="status ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span></td></tr>`).join("")}</tbody></table></div>`;
}
async function loadWeather(){
  try{
    const d=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ZM.lat}&longitude=${ZM.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Africa%2FLusaka`).then(r=>{if(!r.ok)throw Error("Weather unavailable");return r.json()});
    const c=d.current; const labels={0:["Clear sky","☀"],1:["Mainly clear","🌤"],2:["Partly cloudy","⛅"],3:["Overcast","☁"],45:["Foggy","🌫"],48:["Foggy","🌫"],51:["Light drizzle","🌦"],61:["Rain","🌧"],63:["Moderate rain","🌧"],65:["Heavy rain","🌧"],80:["Rain showers","🌦"],95:["Thunderstorm","⛈"]};
    const info=labels[c.weather_code]||["Current conditions","🌤"];
    $("#weatherCard").querySelector(".weather-icon").textContent=info[1];
    $("#weatherCard").querySelector(".weather-temp").textContent=`${Math.round(c.temperature_2m)}°C`;
    $("#weatherCard").querySelector(".weather-desc").textContent=`${info[0]} · Feels like ${Math.round(c.apparent_temperature)}°C`;
    $("#weatherCard").querySelector(".weather-bottom").innerHTML=`<span>Humidity ${c.relative_humidity_2m}%</span><span>Wind ${Math.round(c.wind_speed_10m)} km/h</span>`;
  }catch{$("#weatherCard").querySelector(".weather-desc").textContent="Forecast currently unavailable";}
}
async function renderAppointments(){
  const data=await api("/api/appointments");
  $("#pageContent").innerHTML=`<div class="page-heading"><div><h1>Appointments</h1><p>Manage upcoming visits and appointment status.</p></div>${["admin","patient"].includes(currentUser.role)?'<button id="newAppointment" class="primary">＋ Book appointment</button>':""}</div><div class="panel"><div class="panel-head"><div><h3>Appointment schedule</h3><p>All times shown in Zambia Central Africa Time (CAT).</p></div></div>${appointmentsTable(data.appointments)}${["admin","doctor"].includes(currentUser.role)?`<div class="table-wrap"><table><thead><tr><th>Actions</th><th>Appointment</th><th>Purpose</th><th></th></tr></thead><tbody>${data.appointments.map(a=>`<tr><td>${escapeHtml(a.patient_name)}</td><td>${escapeHtml(fmtDate(a.appointment_at))}</td><td>${escapeHtml(a.purpose)}</td><td>${a.status==="Pending"?`<button class="outline" data-status="${a.id}" data-value="Confirmed">Confirm</button> <button class="outline" data-status="${a.id}" data-value="Cancelled">Cancel</button>`:"—"}</td></tr>`).join("")}</tbody></table></div>`:""}</div>`;
  const btn=$("#newAppointment");if(btn)btn.onclick=openAppointmentModal;
  $$("[data-status]").forEach(b=>b.onclick=async()=>{try{await api(`/api/appointments/${b.dataset.status}/status`,{method:"PATCH",body:JSON.stringify({status:b.dataset.value})});notice(`Appointment ${b.dataset.value.toLowerCase()}.`);renderAppointments()}catch(e){notice(e.message,true)}});
}
async function renderPatients(){
  const data=await api("/api/patients");
  $("#pageContent").innerHTML=`<div class="page-heading"><div><h1>Patients</h1><p>Patient directory and contact information.</p></div>${currentUser.role==="admin"?'<button id="addPatient" class="primary">＋ Add patient</button>':""}</div><div class="panel"><div class="panel-head"><div><h3>Patient directory</h3><p>${data.patients.length} records</p></div><input id="patientSearch" placeholder="Search patients…" aria-label="Search patients" style="max-width:220px;padding:10px;border:1px solid var(--line);border-radius:9px"></div><div class="table-wrap"><table><thead><tr><th>Patient</th><th>Contact</th><th>Record created</th></tr></thead><tbody id="patientRows">${data.patients.map(p=>`<tr data-search="${escapeHtml((p.name+" "+p.contact).toLowerCase())}"><td><div class="patient-cell"><span class="mini-avatar">${escapeHtml(p.name[0])}</span><strong>${escapeHtml(p.name)}</strong></div></td><td>${escapeHtml(p.contact||"Not provided")}</td><td>${escapeHtml(fmtDate(p.created_at,{dateStyle:"medium"}))}</td></tr>`).join("")}</tbody></table></div></div>`;
  $("#patientSearch").oninput=e=>$$("[data-search]").forEach(r=>r.classList.toggle("hidden",!r.dataset.search.includes(e.target.value.toLowerCase())));
  if($("#addPatient"))$("#addPatient").onclick=openPatientModal;
}
async function renderServices(){
  $("#pageContent").innerHTML=`<div class="page-heading"><div><h1>Local services</h1><p>Weather and map information for Lusaka, Zambia.</p></div></div><div class="service-grid"><div class="service-card"><h3>🌦 Current weather</h3><p>Current conditions and forecast from Open-Meteo for Lusaka.</p><div id="serviceWeather" class="stat-number">Loading…</div><p id="serviceWeatherDetail">Forecast data may be unavailable if you are offline.</p><button id="refreshWeather" class="outline">Refresh weather</button></div><div class="service-card"><h3>🕒 Zambia date & time</h3><p>Local time displayed in the Africa/Lusaka time zone (CAT, UTC+2).</p><div id="serviceClock" class="stat-number">--:--</div><p id="serviceDate"></p></div></div><div class="panel" style="margin-top:18px"><div class="panel-head"><div><h3>Map of Lusaka</h3><p>OpenStreetMap data · zoom and move around the map.</p></div><a class="text-link" href="https://www.openstreetmap.org/#map=12/-15.4167/28.2833" target="_blank" rel="noreferrer">Open full map ↗</a></div><div id="map" role="application" aria-label="Map of Lusaka, Zambia"></div><p class="muted">This map is centred on Lusaka. Add verified hospital and clinic coordinates before using it as a healthcare directory.</p></div>`;
  const update=()=>{const d=new Date();$("#serviceClock").textContent=new Intl.DateTimeFormat("en-ZM",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:"Africa/Lusaka"}).format(d);$("#serviceDate").textContent=new Intl.DateTimeFormat("en-ZM",{dateStyle:"full",timeZone:"Africa/Lusaka"}).format(d)};update();setInterval(update,1000);
  $("#refreshWeather").onclick=async()=>{await loadServiceWeather()};
  await loadServiceWeather();
  if(window.L){const map=L.map("map").setView([ZM.lat,ZM.lon],12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);L.marker([ZM.lat,ZM.lon]).addTo(map).bindPopup("Lusaka, Zambia").openPopup();setTimeout(()=>map.invalidateSize(),100);}
  else $("#map").innerHTML="<p>Map library unavailable. Use the OpenStreetMap link above.</p>";
}
async function loadServiceWeather(){try{const d=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ZM.lat}&longitude=${ZM.lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Africa%2FLusaka`).then(r=>r.json());$("#serviceWeather").textContent=`${Math.round(d.current.temperature_2m)}°C`;$("#serviceWeatherDetail").textContent=`Humidity ${d.current.relative_humidity_2m}% · Updated ${fmtDate(d.current.time)}`;}catch{$("#serviceWeather").textContent="Unavailable";$("#serviceWeatherDetail").textContent="Check your internet connection and try again."}}
function renderPayments(){
  $("#pageContent").innerHTML=`<div class="page-heading"><div><h1>Payments</h1><p>Record a demo payment request in Zambian Kwacha (ZMW).</p></div></div><div class="content-grid"><div class="panel"><div class="panel-head"><div><h3>Payment request</h3><p>Demo mode does not move real money.</p></div><span class="status">Demo mode</span></div><form id="paymentForm" class="form-grid"><label class="wide">Payment description<input name="description" required maxlength="100" placeholder="e.g. Consultation fee"></label><label>Amount (ZMW)<input name="amount" type="number" min="1" max="1000000" step="0.01" required placeholder="150.00"></label><label>Payment method<select name="method"><option>MTN Mobile Money</option><option>Airtel Money</option><option>Bank transfer</option><option>Cash at facility</option></select></label><div class="wide form-actions"><button class="primary" type="submit">Create payment request</button></div></form><div id="paymentResult"></div></div><div class="panel"><div class="panel-head"><h3>Before going live</h3></div><div class="payment-warning">A real payment provider account and server-side API integration are required. This starter does not collect money or verify a real transaction.</div><p class="muted">Use the official developer portal and merchant agreement for the chosen provider. Verify payment callbacks and reconcile transactions on the server.</p></div></div>`;
  $("#paymentForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await api("/api/payments/checkout",{method:"POST",body:JSON.stringify({amount:Number(f.get("amount")),description:f.get("description"),method:f.get("method")})});$("#paymentResult").innerHTML=`<div class="payment-warning" style="margin-top:18px">${escapeHtml(r.message)}<br><strong>Amount: ZMW ${Number(r.amount).toFixed(2)}</strong></div>`;}catch(err){notice(err.message,true)}};
}
function modal(title,body){
  const root=$("#modalRoot");root.innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><button class="modal-close" id="modalClose" aria-label="Close">✕</button><h2>${escapeHtml(title)}</h2>${body}</div></div>`;
  $("#modalClose").onclick=()=>root.innerHTML="";
  $("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")root.innerHTML=""};
}
async function openPatientModal(){
  modal("Add patient",`<form id="patientForm" class="form-grid"><label class="wide">Full name<input name="name" required minlength="2" maxlength="100" placeholder="Patient full name"></label><label class="wide">Contact number<input name="contact" maxlength="40" placeholder="+260…"></label><div class="wide form-actions"><button type="button" id="cancelModal" class="outline">Cancel</button><button class="primary">Save patient</button></div></form>`);
  $("#cancelModal").onclick=()=>$("#modalRoot").innerHTML="";
  $("#patientForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/api/patients",{method:"POST",body:JSON.stringify({name:f.get("name"),contact:f.get("contact")})});$("#modalRoot").innerHTML="";notice("Patient record created.");renderPatients()}catch(err){notice(err.message,true)}};
}
async function openAppointmentModal(){
  const patients=currentUser.role==="admin"?await api("/api/patients").catch(()=>({patients:[]})):null;
  const doctors=await api("/api/summary").catch(()=>({}));
  let doctorOptions="";
  try{ // demo app exposes only known doctor role in the seeded data; list is fetched from a safe, role-restricted endpoint below.
    const res=await fetch("/api/doctors",{credentials:"same-origin"});if(res.ok){const d=await res.json();doctorOptions=d.doctors.map(x=>`<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("")}
  }catch{}
  modal("Book appointment",`<form id="appointmentForm" class="form-grid">${currentUser.role==="admin"?`<label class="wide">Patient<select name="patientId" required>${(patients?.patients||[]).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select></label>`:""}<label class="wide">Doctor<select name="doctorId"><option value="">Assign later</option>${doctorOptions}</select></label><label class="wide">Date and time<input name="appointmentAt" type="datetime-local" required></label><label class="wide">Purpose<textarea name="purpose" maxlength="250" required placeholder="Brief reason for appointment"></textarea></label><div class="wide form-actions"><button type="button" id="cancelModal" class="outline">Cancel</button><button class="primary">Submit booking</button></div></form>`);
  const input=$('#appointmentForm [name="appointmentAt"]');const min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);input.min=min;
  $("#cancelModal").onclick=()=>$("#modalRoot").innerHTML="";
  $("#appointmentForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api("/api/appointments",{method:"POST",body:JSON.stringify({patientId:f.get("patientId"),doctorId:f.get("doctorId"),appointmentAt:new Date(f.get("appointmentAt")).toISOString(),purpose:f.get("purpose")})});$("#modalRoot").innerHTML="";notice("Appointment request submitted.");renderPage("appointments")}catch(err){notice(err.message,true)}};
}
(async function init(){
  if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").catch(()=>{});}
  try{const data=await api("/api/me");if(data.user){currentUser=data.user;await showApp();}}
  catch{}
})();
