// === Firebase Setup ===
const firebaseConfig = {
  apiKey: "AIzaSyCqoZkTVOpl84l5qlQF74R2CXdrh7ny7tA",
  authDomain: "thd-monitor.firebaseapp.com",
  databaseURL: "https://thd-monitor-default-rtdb.asia-southeast1.firebasedatabase.app/",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// === System Connection Status ===
const systemStatus = document.getElementById("system-status");
db.ref(".info/connected").on("value", (snap) => {
  if (snap.val() === true) {
    systemStatus.textContent = "Connected";
    systemStatus.style.color = "green";
  } else {
    systemStatus.textContent = "Disconnected";
    systemStatus.style.color = "red";
  }
});

// === Live Parameter Listeners ===
db.ref("data/AC/voltage").on("value", snap => {
  document.getElementById("voltage").textContent = snap.val() ?? "--";
});
db.ref("data/AC/current").on("value", snap => {
  document.getElementById("current").textContent = snap.val() ?? "--";
});
db.ref("data/AC/power").on("value", snap => {
  document.getElementById("power").textContent = snap.val() ?? "--";
});
db.ref("data/AC/frequency").on("value", snap => {
  document.getElementById("frequency").textContent = snap.val() ?? "--";
});
db.ref("data/AC/pf").on("value", snap => {
  document.getElementById("pf").textContent = snap.val() ?? "--";
});
db.ref("data/AC/thd").on("value", snap => {
  document.getElementById("thd").textContent = snap.val() ?? "--";
});

// === THD Control ===
document.getElementById("thd-set").addEventListener("click", () => {
  const value = document.getElementById("thd-input").value.trim();
  if (value !== "") {
    db.ref("command/thd").set(String(value));
  }
});
document.getElementById("thd-reset").addEventListener("click", () => {
  document.getElementById("thd-input").value = "";
  db.ref("command/thd").set("0");
});

// === Set 1 ===
function updateSet1() {
  const value = document.getElementById("set1-input").value.trim();
  if (value !== "") {
    db.ref("command/energyRate").set(String(value)); // Special case
  }
}
function resetSet1() {
  document.getElementById("set1-input").value = "";
  db.ref("command/energyRate").set("5.8");
}

// === Set 2 ===
function updateSet2() {
  const value = document.getElementById("set2-input").value.trim();
  if (value !== "") {
    db.ref("command/fixedCharge").set(String(value));
  }
}
function resetSet2() {
  document.getElementById("set2-input").value = "";
  db.ref("command/fixedCharge").set("145");
}

// === Set 3 ===
function updateSet3() {
  const value = document.getElementById("set3-input").value.trim();
  if (value !== "") {
    db.ref("command/surcharge").set(String(value));
  }
}
function resetSet3() {
  document.getElementById("set3-input").value = "";
  db.ref("command/surcharge").set("1.8");
}

// === Set 4 ===
function updateSet4() {
  const value = document.getElementById("set4-input").value.trim();
  if (value !== "") {
    db.ref("command/cess").set(String(value));
  }
}
function resetSet4() {
  document.getElementById("set4-input").value = "";
  db.ref("command/cess").set("0.5");
}

// === Set 5 ===
function updateSet5() {
  const value = document.getElementById("set5-input").value.trim();
  if (value !== "") {
    db.ref("command/set5").set(String(value));
  }
}
function resetSet5() {
  document.getElementById("set5-input").value = "";
  db.ref("command/set5").set("0");
}

// === Expose all functions to global scope ===
window.updateSet1 = updateSet1;
window.resetSet1 = resetSet1;
window.updateSet2 = updateSet2;
window.resetSet2 = resetSet2;
window.updateSet3 = updateSet3;
window.resetSet3 = resetSet3;
window.updateSet4 = updateSet4;
window.resetSet4 = resetSet4;
window.updateSet5 = updateSet5;
window.resetSet5 = resetSet5;
