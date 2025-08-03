// ==== Firebase Setup ====
const firebaseConfig = {
  apiKey: "AIzaSyCqoZkTVOpl84l5qlQF74R2CXdrh7ny7tA",
  authDomain: "thd-monitor.firebaseapp.com",
  databaseURL: "https://thd-monitor-default-rtdb.asia-southeast1.firebasedatabase.app/",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ==== HTML Elements ====
const voltageEl = document.getElementById("voltage");
const currentEl = document.getElementById("current");
const powerEl = document.getElementById("power");
const pfEl = document.getElementById("pf");
const freqEl = document.getElementById("frequency");
const thdEl = document.getElementById("thd");
const statusEl = document.getElementById("system-status");

const energyWhEl = document.getElementById("energy-wh");
const tariffHourEl = document.getElementById("tariff-hour");
const tariffTotalEl = document.getElementById("tariff-total");

const parameterSelect = document.getElementById("parameter-select");
const alertParam = document.getElementById("alert-param");
const alertMax = document.getElementById("alert-max");
const alertWarn = document.getElementById("alert-warning");
const alertStatus = document.getElementById("alert-status").querySelector("span");

const logStatus = document.getElementById("log-status");

// ==== Global Vars ====
let energyWh = 0;
let tariffRate = 7.0;
let tariffTimer = null;
let graphData = {};
let chart;
let logging = false;
let logBuffer = [];
let alertSettings = {};
let powerVal = 0;
let lastAlert = {};

// ==== Auth and Start ====
auth.signInWithEmailAndPassword("dashboard@thd.com", "ESP@2580")
  .then(() => {
    initChart();
    startFetching();
    watchStatus();
    statusEl.textContent = "ONLINE";
    statusEl.style.color = "#00ff00";
  })
  .catch(err => {
    console.error("Login failed:", err);
    statusEl.textContent = "Login Failed";
    statusEl.style.color = "#ff5555";
  });

// ==== Push Notifications ====
function pushNotify(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

// ==== Modal Notification ====
function showNotificationPopup(title, message) {
  const modal = document.getElementById("notification-modal");
  const titleEl = document.getElementById("notification-title");
  const messageEl = document.getElementById("notification-message");
  const closeBtn = document.getElementById("notification-close");

  titleEl.innerText = title;
  messageEl.innerText = message;
  modal.classList.remove("hidden");

  closeBtn.onclick = () => {
    modal.classList.add("hidden");
  };

  setTimeout(() => {
    modal.classList.add("hidden");
  }, 7000);
}

// ==== Periodic OFFLINE writer ====
setInterval(() => {
  db.ref("data/AC/status").set("OFFLINE");
}, 5000);

// ==== Watch Status from Firebase ====
function watchStatus() {
  db.ref("data/AC/status").on("value", snap => {
    const val = snap.val();
    statusEl.textContent = val || "Unknown";
    statusEl.style.color = (val === "ONLINE") ? "#00ff00" : "#ff5555";
  });
}

// ==== Data Fetching ====
function startFetching() {
  updateValue("data/AC/voltage", voltageEl, "V");
  updateValue("data/AC/current", currentEl, "A");
  updateValue("data/AC/power", powerEl, "W");
  updateValue("data/AC/frequency", freqEl, "Hz");
  updateValue("data/AC/pf", pfEl);
  updateValue("data/AC/thd", thdEl, "%");
}

function updateValue(refPath, element, unit = "") {
  db.ref(refPath).on("value", snap => {
    const val = snap.val();
    if (val !== null) {
      const value = parseFloat(val).toFixed(2);
      element.textContent = `${value} ${unit}`;
      updateGraph(refPath, parseFloat(val));
      checkAlerts(refPath.split("/").pop(), parseFloat(val));
      if (refPath.includes("power")) powerVal = parseFloat(val);
      if (logging) {
        logBuffer.push([
          new Date().toISOString(),
          voltageEl.textContent,
          currentEl.textContent,
          freqEl.textContent,
          pfEl.textContent,
          powerEl.textContent,
          thdEl.textContent
        ]);
      }
    }
  });
}

// ==== Chart ====
function initChart() {
  const ctx = document.getElementById("dataChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { display: true, title: { display: true, text: "Time" }},
        y: { beginAtZero: true }
      }
    }
  });
}

function updateGraph(param, value) {
  const shortName = param.split("/").pop();
  const time = new Date().toLocaleTimeString();

  if (!graphData[shortName]) {
    graphData[shortName] = {
      label: shortName.toUpperCase(),
      data: [],
      borderColor: getRandomColor(),
      fill: false,
      tension: 0.3
    };
    chart.data.datasets.push(graphData[shortName]);
  }

  graphData[shortName].data.push({ x: time, y: value });
  if (graphData[shortName].data.length > 50) graphData[shortName].data.shift();

  chart.data.labels.push(time);
  if (chart.data.labels.length > 50) chart.data.labels.shift();

  const selected = Array.from(parameterSelect.selectedOptions).map(o => o.value);
  chart.data.datasets = selected.map(key => graphData[key]);
  chart.update();
}

function getRandomColor() {
  return `hsl(${Math.random() * 360}, 100%, 70%)`;
}

// ==== Tariff Monitor ====
let startTime = null;
let harmonicUptime = 0;
let energyRate = 7.0;
let fixedCharge = 0;
let surcharge = 0;
let cess = 0;

const fixedToggle = document.getElementById("toggle-fixed");
const trendRate = document.getElementById("trend-energy-rate");
const trendFixed = document.getElementById("trend-fixed");
const trendSurcharge = document.getElementById("trend-surcharge");
const trendCess = document.getElementById("trend-cess");
const uptimeEl = document.getElementById("tariff-uptime");
const harmonicUptimeEl = document.getElementById("harmonic-uptime");

// Utility to safely parse string or number input
function safeParseFloat(val, fallback = 0) {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
}

function fetchTariffTrends() {
  db.ref("command/energyRate").on("value", snap => {
    energyRate = safeParseFloat(snap.val(), 7.0);
    trendRate.textContent = `${energyRate.toFixed(2)} ₹/kWh`;
  });

  db.ref("command/fixedCharge").on("value", snap => {
    fixedCharge = safeParseFloat(snap.val());
    trendFixed.textContent = `${fixedCharge.toFixed(2)} ₹`;
  });

  db.ref("command/surcharge").on("value", snap => {
    surcharge = safeParseFloat(snap.val());
    trendSurcharge.textContent = `${surcharge.toFixed(2)} ₹`;
  });

  db.ref("command/cess").on("value", snap => {
    cess = safeParseFloat(snap.val());
    trendCess.textContent = `${cess.toFixed(2)} ₹`;
  });
}

fetchTariffTrends();

document.getElementById("start-tariff").onclick = () => {
  if (!tariffTimer) {
    energyWh = 0;
    startTime = Date.now();
    tariffTimer = setInterval(() => {
      energyWh += powerVal / 3600;
      const kWh = energyWh / 1000;
      let cost = kWh * energyRate;

      const thd = safeParseFloat(thdEl.textContent) || 0;

      if (fixedToggle.checked) cost += fixedCharge;

      if (thd > 5) {
        cost += surcharge;
        const thdExcess = Math.floor((thd - 5) / 5);
        cost += thdExcess * cess;
        harmonicUptime++;
      }

      energyWhEl.textContent = energyWh.toFixed(2);
      tariffHourEl.textContent = energyRate.toFixed(2);
      tariffTotalEl.textContent = cost.toFixed(2);

      const uptimeMins = Math.floor((Date.now() - startTime) / 60000);
      uptimeEl.textContent = `${uptimeMins} min`;
      harmonicUptimeEl.textContent = `${Math.floor(harmonicUptime / 60)} min`;
    }, 1000);
  }
};

document.getElementById("reset-tariff").onclick = () => {
  clearInterval(tariffTimer);
  tariffTimer = null;
  energyWh = 0;
  startTime = null;
  harmonicUptime = 0;
  energyWhEl.textContent = "0";
  tariffHourEl.textContent = "0.00";
  tariffTotalEl.textContent = "0.00";
  uptimeEl.textContent = "0 min";
  harmonicUptimeEl.textContent = "0 min";
};

const harmonicWarning = document.getElementById("harmonic-warning");

db.ref("data/AC/thd").on("value", snap => {
  const thd = parseFloat(snap.val());
  if (!isNaN(thd) && thd > 5) {
    harmonicWarning.classList.remove("hidden");
  } else {
    harmonicWarning.classList.add("hidden");
  }
});


// ==== Alerts ====
document.getElementById("set-alert").onclick = () => {
  const param = alertParam.value;
  const max = parseFloat(alertMax.value);
  const warnPercent = parseFloat(alertWarn.value) || 80;
  if (isNaN(max)) {
    alertStatus.textContent = "Invalid Max Value";
    return;
  }
  alertSettings[param] = {
    max: max,
    warn: (max * warnPercent) / 100
  };
  alertStatus.textContent = `Alert set for ${param.toUpperCase()} → Max: ${max}, Warn: ${alertSettings[param].warn.toFixed(2)}`;
  alertStatus.style.color = "#00ffe1";
};

document.getElementById("cancel-alert").onclick = () => {
  const param = alertParam.value;
  delete alertSettings[param];
  alertStatus.textContent = `Alert for ${param.toUpperCase()} canceled`;
  alertStatus.style.color = "#888";
};

function checkAlerts(param, value) {
  const settings = alertSettings[param];
  if (!settings) return;

  if (value >= settings.max) {
    alertStatus.textContent = `🚨 ${param.toUpperCase()} reached MAX (${value})`;
    alertStatus.style.color = "#ff0000";
    if (lastAlert[param] !== "max") {
      pushNotify("⚠️ Alert", `${param.toUpperCase()} has reached MAX (${value})`);
      showNotificationPopup("⚠️ Alert", `${param.toUpperCase()} has reached MAX (${value})`);
      lastAlert[param] = "max";
    }
  } else if (value >= settings.warn) {
    alertStatus.textContent = `⚠️ ${param.toUpperCase()} approaching limit (${value})`;
    alertStatus.style.color = "#ffaa00";
    if (lastAlert[param] !== "warn") {
      pushNotify("⚠️ Warning", `${param.toUpperCase()} is approaching limit (${value})`);
      showNotificationPopup("⚠️ Warning", `${param.toUpperCase()} is approaching limit (${value})`);
      lastAlert[param] = "warn";
    }
  } else {
    alertStatus.style.color = "#00ffe1";
    lastAlert[param] = "normal";
  }
}

// ==== Logging ====
document.getElementById("start-log").onclick = () => {
  logging = true;
  logBuffer = [];
  logStatus.textContent = "Recording...";
};

document.getElementById("stop-log").onclick = () => {
  logging = false;
  logStatus.textContent = "Saving...";
  const headers = ["Timestamp", "Voltage", "Current", "Frequency", "PF", "Power", "THD"];
  const rows = [headers, ...logBuffer];
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `power_log_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  a.click();
  logStatus.textContent = "Idle";
};
