//code that answerer inputs to join a session
const answerButton = document.getElementById("confirm-session-code");

//home screen popups
const createSessionBtn = document.getElementById("create-session");
const openBtn = document.getElementById("join-session");
const closeBtn = document.getElementById("close-hover");
const hoverBox = document.getElementById("hover-box");

openBtn.addEventListener("click", () => {
    hoverBox.classList.add("open");
});

closeBtn.addEventListener("click", () => {
    hoverBox.classList.remove("open");
});

createSessionBtn.addEventListener('click', () =>{
    location.href = "index.html";
});

answerButton.addEventListener('click', () => searchForOfferCode(offers));

function searchForOfferCode(offers){
    var answererCode = document.getElementById("answer").value;
    offers.forEach(o => {
        if(answererCode === o.offererUserName){
            location.href="index.html";
            answerOffer(o);
        };
    })  
};