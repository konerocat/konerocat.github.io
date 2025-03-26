var navbarHTML = `
<div id="path"></div>
<div id="status">WIP</div>
`



// var footerHTML = `
// <a href="/about">/about</a>
// <a href="/files">/files</a>
// <a href="/logs">/logs</a>
// <a href="/links">/links</a>
// <a href="/home">/home</a>
// `;

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


// function setStatusBar(){
//     var date = new Date();

//     var yr = addZero(date.getFullYear() % 100);
//     var mon = date.getMonth();
//     var dtday = addZero(date.getDate());
//     var day = date.getDay();
//     var h = addZero(date.getHours());
//     var m = addZero(date.getMinutes());
//     var s = addZero(date.getSeconds());
//     var ms = addZero(date.getMilliseconds() % 100);

//     var time = h + ":" + m + ":" + s + ":" + ms;
//     var date = weekday[day] + " " + dtday + " " + month[mon] + " " + yr;

//     $("#status").text(date + " - " + time);
// }

// function addZero(n){
//     if(n<10) return '0'+n;
//     return n;
// }

// var weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
// var month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];



function toggleById(id, speed=0){
    $("#"+id).toggle(speed);
}