$(document).ready(function() {
    $('.folder-click').on('click', function(e){
        e.preventDefault();
        const link = $(this).attr('href');
        $('.listtable').addClass('transitioning');

        setTimeout(() => {
            window.location.href = link;
        }, 150);
    });


    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            $('.listtable').removeClass('transitioning');
        }
    });

    const $marquee = $('.marquee-container');
    
    if ($marquee.length) {
        let touchTimer;
        
        $marquee.hover(
            function() {
                $(this).css('animation-play-state', 'paused');
            },
            function() {
                $(this).css('animation-play-state', 'running');
            }
        );


        $marquee.on('touchstart', function(e) {
            e.preventDefault();
            const $this = $(this);
            $this.css('animation-play-state', 'paused');
            
            touchTimer = setTimeout(() => {
                $this.css('animation-play-state', 'running');
            }, 3000);
        });

        $marquee.on('touchend touchcancel', function() {
            clearTimeout(touchTimer);
            $(this).css('animation-play-state', 'running');
        });
    }
})


