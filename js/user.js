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
    statusEl.textContent = "Online";
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

// ==== Periodic OFFLINE writer ====
setInterval(() => {
  db.ref("data/AC/status").set("OFFLINE");
}, 5000);

// ==== Watch Status from Firebase ====
function watchStatus() {
  db.ref("data/AC/status").on("value", snap => {
    const val = snap.val();
    statusEl.textContent = val || "Unknown";
    statusEl.style.color = (val === "Online") ? "#00ff00" : "#ff5555";
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

// ==== Graph Setup ====
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
document.getElementById("start-tariff").onclick = () => {
  if (!tariffTimer) {
    energyWh = 0;
    tariffTimer = setInterval(() => {
      energyWh += powerVal / 3600;
      const kWh = energyWh / 1000;
      energyWhEl.textContent = energyWh.toFixed(2);
      tariffHourEl.textContent = tariffRate.toFixed(2);
      tariffTotalEl.textContent = (kWh * tariffRate).toFixed(2);
    }, 1000);
  }
};

document.getElementById("reset-tariff").onclick = () => {
  clearInterval(tariffTimer);
  tariffTimer = null;
  energyWh = 0;
  energyWhEl.textContent = "0";
  tariffHourEl.textContent = "0.00";
  tariffTotalEl.textContent = "0.00";
};

// ==== Custom Alerts ====
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
      lastAlert[param] = "max";
    }
  } else if (value >= settings.warn) {
    alertStatus.textContent = `⚠️ ${param.toUpperCase()} approaching limit (${value})`;
    alertStatus.style.color = "#ffaa00";
    if (lastAlert[param] !== "warn") {
      pushNotify("⚠️ Warning", `${param.toUpperCase()} is approaching limit (${value})`);
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
