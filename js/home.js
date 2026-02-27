var navbarHTML = `
<div id="path"></div>
<div id="status">date</div>
`


var footerHTML = `
    <a href="/foyer" class="footer-button" onclick="reloadPrevious()">
        <img src="/images/window_button.png" class="footer-icon">
    </a>
`;



function reloadPrevious() {
    try {
        const ref = document.referrer;
        if (ref && new URL(ref).origin === window.location.origin) {
            location.replace(ref);
            return false;
        }
    } catch (_) {}
    return true;
}


$(document).ready(function(){
    $("nav").html(navbarHTML);
    buildNavbarPath();
    $(".botbar").html(footerHTML);


    setInterval(setStatusBar, 1000);
    
    $(".mainwindow").focus();
    $('.folder-icon').on('click', function (e) {
        e.preventDefault();
        const link = $(this).attr('href');


        $('.folder-icon').css('pointer-events', 'none');
        

        $('.fact-text .fact').text("Opening...");
        $('.fact-titlebar').text("See you soon!");
        $('.fact-text .fact-source').text("");


        $('body').addClass('transitioning');

        window.location.href = link;
        setTimeout(() => {
            document.body.classList.remove('transitioning');
            
        }, 150);
    });


    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            $('.folder-icon').css('pointer-events', '');
            document.body.classList.remove('transitioning');
        }
    });
});

const farewellMessages = [
    "See you soon!",
    "Come back later, okay?",
    "Goodbye... for now!"
];

function showFarewellMessage() {
    const message = farewellMessages[Math.floor(Math.random() * farewellMessages.length)];
    $('.fact-titlebar').text("Bye bye!")
    $('.fact-text .fact').text(message);
}




if (typeof facts !== 'undefined'){
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

        document.querySelector('.fact-image img').src = `/images/${randomFact.image}`;
        document.querySelector('.fact-text p').textContent = randomFact.text;
        
        let sourceText = randomFact.source;
        if (sourceText.includes("# ex")) {
            const randomNum = Math.floor(Math.random() * 50) + 1;
            sourceText = sourceText.replace("# ex", "# " + randomNum);
        }
        document.querySelector('.fact-source').textContent = sourceText;
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

        let nikoClickTimes = []
        let nikoTotalClicks = 0
        let nikoHasLeft = false
        let introTimeoutId = null
        const NIKO_LEAVE_RAPID = 8
        const NIKO_LEAVE_RAPID_MS = 4000
        const NIKO_LEAVE_TOTAL = 14

        const NIKO_LEAVE_QUOTES = [
            "I'm getting out of here...",
            "I have to go.",
            "This is too much... I'm leaving.",
            "Sorry, I can't stay.",
            "I'm going. Bye.",
            "I don't want to be here anymore.",
            "I have to leave. Take care of the sun.",
            "Sorry, I'm leaving.",
            "I'm out.",
            "...I'm going home.",
        ]

        function playHitSound() {
            try {
                var ctx = new (window.AudioContext || window.webkitAudioContext)()
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = "square";
                osc.frequency.setValueAtTime(80, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.06);
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.08);
            } catch (e) {}
        }

        function nikoLeave() {
            if (nikoHasLeft) return
            nikoHasLeft = true
            clearInterval(factInterval)
            clearTimeout(resetTimeout)
            if (introTimeoutId != null) clearTimeout(introTimeoutId)
            var quote = NIKO_LEAVE_QUOTES[Math.floor(Math.random() * NIKO_LEAVE_QUOTES.length)]
            $('.fact-titlebar').text('...')
            $factText.text(quote)
            $factSource.text("")
            $image.attr('src', '/images/Niko.png')
            var $factBox = $('.fact-box')
            $factBox.css('pointer-events', 'none')
            setTimeout(function() {
                $factBox.addClass('niko-leaving')
                var leaveDone = false
                function finishLeave() {
                    if (leaveDone) return
                    leaveDone = true
                    $factBox.off('animationend webkitAnimationEnd')
                    $factBox.removeClass('niko-leaving').addClass('niko-left')
                    $factText.text("")
                    $factSource.text("Niko has left.")
                    $factBox.css('pointer-events', 'auto')
                }
                $factBox.on('animationend webkitAnimationEnd', function(e) {
                    if (e.animationName === 'fact-box-glitch-out') finishLeave()
                })
                setTimeout(finishLeave, 500)
            }, 1800)
        }
    
        setTimeout(() => {
            $('.explorer-window').addClass('ready');
            introTimeoutId = setTimeout(() => {
                introTimeoutId = null
                $('.fact-titlebar').html('Did You Know?')
                showRandomFact();
                startFactInterval();
            }, 2000);
        }, 1500);
    
        function startFactInterval() {
            clearInterval(factInterval);
            factInterval = setInterval(showRandomFact, 7000);
        }
    
    
        $image.on('click', function() { // SCOLDING THE CAT
            if (nikoHasLeft) return
            if (introTimeoutId != null) {
                clearTimeout(introTimeoutId)
                introTimeoutId = null
            }
            nikoTotalClicks++
            var now = Date.now()
            nikoClickTimes.push(now)
            nikoClickTimes = nikoClickTimes.filter(function(t) { return now - t < NIKO_LEAVE_RAPID_MS })
            if (nikoClickTimes.length >= NIKO_LEAVE_RAPID || nikoTotalClicks >= NIKO_LEAVE_TOTAL) {
                nikoLeave()
                return
            }

            playHitSound()

            clearTimeout(resetTimeout);
            clearInterval(factInterval);
    
            let newMessage;
            do {
                newMessage = scoldMessages[Math.floor(Math.random() * scoldMessages.length)];
            } while (newMessage === $factText.text());
    
            $factText.text(newMessage);
            $factSource.text("");
    
            const newImage = `/images/${images[Math.floor(Math.random() * images.length)]}`;
            $image.attr('src', newImage);
    
            if (!isAnimating) {
                isAnimating = true;
                $explorer.css('animation', 'shake 0.32s steps(4, end) both');
    
                setTimeout(() => {
                    $explorer.css('animation', 'none');
                    isAnimating = false;
                }, 320);
            }
    
            resetTimeout = setTimeout(() => {
                $('.fact-titlebar').html('Did You Know?');
                showRandomFact();
                startFactInterval();
            }, 5000);
        });
    });
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



