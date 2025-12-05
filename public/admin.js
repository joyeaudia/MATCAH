const STORAGE_KEY = "verent_booths_v1";

const monthsShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${parseInt(d, 10)} ${monthsShort[parseInt(m, 10) - 1]}`;
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  // timeStr: "HH:MM"
  return timeStr; // simple: 08:00, 10:30, dll
}

function buildDisplayText(b) {
  const startD = formatDate(b.startDate);
  const endD   = formatDate(b.endDate);
  const startT = formatTime(b.startTime);
  const endT   = formatTime(b.endTime);

  let datePart = "";
  if (startD && endD) datePart = `${startD} — ${endD}`;
  else if (startD)     datePart = startD;
  else if (endD)       datePart = endD;

  let timePart = "";
  if (startT && endT) timePart = `${startT} — ${endT}`;
  else if (startT)     timePart = startT;
  else if (endT)       timePart = endT;

  if (datePart && timePart) return `${datePart} | ${timePart}`;
  if (datePart)             return datePart;
  if (timePart)             return timePart;
  return ""; // fallback kalau kosong
}

function getInputs() {
  const titles    = Array.from(document.querySelectorAll('.title'));
  const dateFroms = Array.from(document.querySelectorAll('.date-from'));
  const dateTos   = Array.from(document.querySelectorAll('.date-to'));
  const timeFroms = Array.from(document.querySelectorAll('.time-from'));
  const timeTos   = Array.from(document.querySelectorAll('.time-to'));
  const links     = Array.from(document.querySelectorAll('.link'));

  const arr = [];
  for (let i = 0; i < 4; i++) {
    const booth = {
      title:     (titles[i]?.value || "").trim(),
      startDate: dateFroms[i]?.value || "",
      endDate:   dateTos[i]?.value   || "",
      startTime: timeFroms[i]?.value || "",
      endTime:   timeTos[i]?.value   || "",
      link:      (links[i]?.value || "").trim()
    };
    booth.small = buildDisplayText(booth); // text yang dipakai di Home
    arr.push(booth);
  }
  return arr;
}

function setInputs(data) {
  const titles    = Array.from(document.querySelectorAll('.title'));
  const dateFroms = Array.from(document.querySelectorAll('.date-from'));
  const dateTos   = Array.from(document.querySelectorAll('.date-to'));
  const timeFroms = Array.from(document.querySelectorAll('.time-from'));
  const timeTos   = Array.from(document.querySelectorAll('.time-to'));
  const links     = Array.from(document.querySelectorAll('.link'));

  for (let i = 0; i < 4; i++) {
    const b = data[i] || {};
    titles[i].value    = b.title || "";
    dateFroms[i].value = b.startDate || "";
    dateTos[i].value   = b.endDate   || "";
    timeFroms[i].value = b.startTime || "";
    timeTos[i].value   = b.endTime   || "";
    links[i].value     = b.link || "";
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr;
  } catch (e) {
    console.warn("Failed to parse stored booths", e);
    return null;
  }
}

document.getElementById("btn-save").onclick = () => {
  const data = getInputs();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  alert("Saved!");
};

// default kalau belum ada data sama sekali
const defaultData = [
  { title: "IPEKA Puri" },
  { title: "Emporium Pluit Mall" },
  { title: "Big Bad Wolf, PIK" },
  { title: "UPH" }
];

const existing = loadFromStorage();
setInputs(existing || defaultData);