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

const facts = [
    {
        image: "Niko.png",
        text: "A group of cats is called a 'clowder' or a 'glaring'.",
        source: "- Feline Etymology"
    },
    {
        image: "Niko.png",
        text: "Cats can rotate their ears 180 degrees to pinpoint sounds.",
        source: "- Biological Marvels"
    },
    {
        image: "Niko.png",
        text: "The record for the longest cat ever is 48.5 inches (Fenrir the Maine Coon).",
        source: "- Guinness Records"
    },
    {
        image: "Niko.png",
        text: "A cat's purr vibrates at 25-150Hz, which may promote bone and tissue healing.",
        source: "- Scientific Studies"
    },
    {
        image: "Niko.png",
        text: "Cats have 32 muscles in each ear, compared to humans' 6.",
        source: "- Comparative Anatomy"
    },
    {
        image: "Niko.png",
        text: "The richest cat in history had £7 million left to him by his owner (Blackie, 1988).",
        source: "- Wealth Felines"
    },
    {
        image: "Niko.png",
        text: "A cat's whiskers are roughly as wide as its body - they use them to gauge spaces.",
        source: "- Sensory Science"
    },
    {
        image: "Niko.png",
        text: "Cats sleep 70% of their lives, but remain alert to sounds even while napping.",
        source: "- Sleep Research"
    },
    {
        image: "Niko.png",
        text: "The first cat in space was French (Félicette, 1963). She survived the trip.",
        source: "- Astro-Feline History"
    },
    {
        image: "Niko.png",
        text: "Cats can drink seawater to survive - their kidneys filter out the salt.",
        source: "- Survival Adaptations"
    },
    {
        image: "Niko.png",
        text: "A cat's nose leather is unique like a human fingerprint - no two are alike.",
        source: "- Fine Print"
    },
    {
        image: "Niko.png",
        text: "Cats walk like camels and giraffes - both right feet then both left feet.",
        source: "- Gait Patterns"
    },
    {
        image: "Niko.png",
        text: "The oldest cat video dates to 1894.",
        source: "- Film Archives"
    },
    {
        image: "Niko.png",
        text: "Cats can jump up to six times their body length in a single leap.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "Unlike dogs, cats do not have a sweet tooth due to a genetic mutation.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "The first known pet cat was buried 9,500 years ago in Cyprus.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "Cats can make over 90 different sounds, including purrs, growls, and chirps.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "A cat’s whiskers are not just on its face - they also have them on their front legs.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "In Britain and Australia, black cats are considered lucky.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "Cats have a third eyelid called a 'haw' that helps protect their eyes.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "The world's oldest cat, Creme Puff, lived to be 38 years old (1967-2005).",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko.png",
        text: "A cat's brain is 90% similar to a human's, more than a dog's brain.",
        source: "- some random website i looked up # ex"
    },
    {
        image: "Niko4.png",
        text: "'I am not a cat!'",
        source: "- Niko (OneShot)"
    },
    {
        image: "Niko_what.png",
        text: "'*confused cat noises*'",
        source: "- Niko (OneShot)"
    }
];


function showRandomFact() {
    const randomFact = facts[Math.floor(Math.random() * facts.length)];
    document.querySelector('.fact-image img').src = `../images/${randomFact.image}`;
    document.querySelector('.fact-text p').textContent = randomFact.text;
    document.querySelector('.fact-source').textContent = randomFact.source;

    const RandomNum = Math.floor(Math.random() * 50) + 1;
    let sourceText = randomFact.source;
    if (sourceText.includes("# ex")) {
        sourceText = sourceText.replace("# ex", "# " + RandomNum);
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