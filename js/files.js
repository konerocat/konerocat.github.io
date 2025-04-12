$(document).ready(function() {
    $('.folder-click').on('click', function(e){
        e.preventDefault();
        const link = $(this).attr('href');
        $('.listtable').addClass('transitioning')

        setTimeout(() => {
            window.location.href = link;
        }, 150);
    })

})