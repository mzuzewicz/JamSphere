//home screen popups
const openBtn = document.getElementById("join-session");
const closeBtn = document.getElementById("close-hover");
const hoverBox = document.getElementById("hover-box");

openBtn.addEventListener("click", () => {
    hoverBox.classList.add("open");
});

closeBtn.addEventListener("click", () => {
    hoverBox.classList.remove("open");
});