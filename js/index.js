document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value.trim().toUpperCase();
    const password = document.getElementById("password").value.trim();
    const error = document.getElementById("error");

    if (username === "ADMIN" && password === "1234") {
        window.location.href = "admin.html";
    } else if (username === "USER" && password === "1234") {
        window.location.href = "user.html";
    } else {
        error.textContent = "❌ Invalid credentials. Please try again.";
    }
});
