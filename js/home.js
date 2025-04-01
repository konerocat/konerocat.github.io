

var navbarHTML = `
<div id="path"></div>
<div id="status">date</div>

`

// <a href="/about">/about</a>
// <a href="/files">/files</a>
// <a href="/logs">/logs</a>
// <a href="/foyer">/foyer</a>

var footerHTML = `
    <a href="/foyer" class="footer-button"><img src ="../images/window_button.png" class="footer-icon" 
    ></a>
`;

$(document).ready(function(){
    $("nav").html(navbarHTML);
    buildNavbarPath();
    $(".botbar").html(footerHTML);

    // $(".folder").click(function(){
    //     console.log("ok");
    //     var folder = $(this).attr("folder");
    //     $("[infolder=" + folder + "]").toggle();
    // });
    
    setInterval(setStatusBar, 1);
    
    $(".mainwindow").focus();
});




let previousFacts = [];
let factPool = [...facts];
function showRandomFact() {

    if (factPool.length < 3) {
        factPool = [...facts.filter(f => !previousFacts.includes(f))];
    }


    const randomIndex = Math.floor(Math.random() * factPool.length);
    const randomFact = factPool[randomIndex];


    previousFacts.unshift(randomFact);
    if (previousFacts.length > 5) {
        previousFacts.pop();
    }


    factPool.splice(randomIndex, 1);

    document.querySelector('.fact-image img').src = `../images/${randomFact.image}`;
    document.querySelector('.fact-text p').textContent = randomFact.text;
    
    let sourceText = randomFact.source;
    if (sourceText.includes("# ex")) {
        const randomNum = Math.floor(Math.random() * 50) + 1;
        sourceText = sourceText.replace("# ex", "# " + randomNum);
    }
    document.querySelector('.fact-source').textContent = sourceText;
}




function buildNavbarPath(){
    currentPath = window.location.pathname;
    currentPath = `${(currentPath[0]=="/") ? "":"/"}${currentPath}${(currentPath[currentPath.length-1]=="/") ? "":"/"}`.split("/");
    currentPath = currentPath.slice(1, -1);
    if(currentPath[currentPath.length-1] == "index.html"){
        currentPath = currentPath.slice(0, -1);
    }
    parsedPath = "";
    navPathHTML = `[ <a href="/">entrance</a>:/`
    currentPath.slice(0, -1).forEach(p => {
        parsedPath = `${parsedPath}/${p}`;
        navPathHTML = `${navPathHTML}/<a href="${parsedPath}">${p}</a>`
    })
    navPathHTML = `${navPathHTML}/${currentPath[currentPath.length-1]} ]`;

    $("#path").html(navPathHTML);
}


function setStatusBar(){
    var date = new Date();

    var yr = addZero(date.getFullYear() % 100);
    var mon = date.getMonth();
    var dtday = addZero(date.getDate());
    var day = date.getDay();
    var h = addZero(date.getHours());
    var m = addZero(date.getMinutes());


    var time = h + ":" + m;
    var date = weekday[day] + " " + dtday + " " + month[mon] + " " + yr;

    $("#status").html('<span style="color: var(--purple); text-align: center">' + time + '</span>');
}

function addZero(n){
    if(n<10) return '0'+n;
    return n;
}

var weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
var month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];



function toggleById(id, speed=0){
    $("#"+id).toggle(speed);
}


$(function() {
    const scoldMessages = [
        "Hey! Stop that!",
        "Rude!",
        "Not cool!",
        "Please don't do that...",
        "Ouch!"
    ];

    const images = [
        "Niko_wtf.png",
        "Niko_wtf2.png",
        "Niko_distressed_talk.png",
        "Niko_what.png"
    ];

    const $factText = $('.fact')
    const $factSource = $('.fact-source')
    const $explorer = $('.explorer-window')
    const $image = $('.fact-image img')

    let resetTimeout
    let isAnimating = false
    let factInterval

    showRandomFact()
    startFactInterval()

    function startFactInterval() {
        clearInterval(factInterval);
        factInterval = setInterval(showRandomFact, 7000);
    }


    $image.on('click', function() { // SCOLDING THE CAT
        clearTimeout(resetTimeout);
        clearInterval(factInterval);

        let newMessage;
        do {
            newMessage = scoldMessages[Math.floor(Math.random() * scoldMessages.length)];
        } while (newMessage === $factText.text());

        $factText.text(newMessage);
        $factSource.text("");

        const newImage = `../images/${images[Math.floor(Math.random() * images.length)]}`;
        $image.attr('src', newImage);

        if (!isAnimating) {
            isAnimating = true;
            $explorer.css('animation', 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both');

            setTimeout(() => {
                $explorer.css('animation', 'none');
                isAnimating = false;
            }, 500);
        }

        resetTimeout = setTimeout(() => {
            showRandomFact();
            startFactInterval();
        }, 5000);
    });
});

