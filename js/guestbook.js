
(function () {
    'use strict';

    var GUESTBOOK_API_BASE = typeof window !== 'undefined' && window.GUESTBOOK_API_URL ? window.GUESTBOOK_API_URL : '';


    var CANVAS_WIDTH = 400;
    var CANVAS_HEIGHT = 300;
    var MAX_STROKES = 80;
    var MAX_POINTS_PER_STROKE = 400;
    var MAX_TOTAL_POINTS = 8000;
    var DOWNSAMPLE_EVERY = 2;

    var drawing = {
        strokes: [],
        currentStroke: null,
        tool: 'pen',
        color: '#78589d',
        penWidth: 2,
        eraserWidth: 20,
        undoStack: []
    };

    var canvasEl = document.getElementById('gb-canvas');
    var ctx = canvasEl ? canvasEl.getContext('2d') : null;

    function getCanvasDrawing() {
        if (!drawing.strokes.length) return null;
        var strokes = drawing.strokes.map(function (s) {
            var points = s.points;
            if (DOWNSAMPLE_EVERY > 1) {
                points = points.filter(function (_, i) { return i % DOWNSAMPLE_EVERY === 0 || i === points.length - 1; });
            }
            return { color: s.color, width: s.width, points: points };
        });
        return {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: null,
            strokes: strokes
        };
    }

    function drawStroke(ctx, stroke) {
        if (!stroke.points.length) return;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (var i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }

    function redrawCanvas() {
        if (!ctx || !canvasEl) return;
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        drawing.strokes.forEach(function (s) { drawStroke(ctx, s); });
    }

    function getPos(e) {
        var rect = canvasEl.getBoundingClientRect();
        var scaleX = canvasEl.width / rect.width;
        var scaleY = canvasEl.height / rect.height;
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
            t: Date.now()
        };
    }

    function startStroke(x, y, t) {
        if (drawing.strokes.length >= MAX_STROKES) return;
        var color = drawing.tool === 'eraser' ? '#111111' : drawing.color;
        var width = drawing.tool === 'eraser' ? drawing.eraserWidth : drawing.penWidth;
        drawing.currentStroke = { color: color, width: width, points: [{ x: x, y: y, t: t }] };
    }

    function addPoint(x, y, t) {
        if (!drawing.currentStroke) return;
        var pts = drawing.currentStroke.points;
        if (pts.length >= MAX_POINTS_PER_STROKE) return;
        var total = drawing.strokes.reduce(function (sum, s) { return sum + s.points.length; }, 0) + pts.length;
        if (total >= MAX_TOTAL_POINTS) return;
        pts.push({ x: x, y: y, t: t });
        drawStroke(ctx, { color: drawing.currentStroke.color, width: drawing.currentStroke.width, points: pts.slice(-2) });
    }

    function endStroke() {
        if (drawing.currentStroke && drawing.currentStroke.points.length > 0) {
            drawing.strokes.push(drawing.currentStroke);
        }
        drawing.currentStroke = null;
    }

    function initCanvas() {
        if (!canvasEl || !ctx) return;
        redrawCanvas();

        canvasEl.addEventListener('mousedown', function (e) {
            e.preventDefault();
            var p = getPos(e);
            startStroke(p.x, p.y, p.t);
        });
        canvasEl.addEventListener('mousemove', function (e) {
            if (!drawing.currentStroke) return;
            e.preventDefault();
            var p = getPos(e);
            addPoint(p.x, p.y, p.t);
        });
        canvasEl.addEventListener('mouseup', endStroke);
        canvasEl.addEventListener('mouseleave', endStroke);
        canvasEl.addEventListener('touchstart', function (e) {
            e.preventDefault();
            var p = getPos(e);
            startStroke(p.x, p.y, p.t);
        }, { passive: false });
        canvasEl.addEventListener('touchmove', function (e) {
            if (!drawing.currentStroke) return;
            e.preventDefault();
            var p = getPos(e);
            addPoint(p.x, p.y, p.t);
        }, { passive: false });
        canvasEl.addEventListener('touchend', function (e) {
            e.preventDefault();
            endStroke();
        }, { passive: false });
    }


    function setTool(tool) {
        drawing.tool = tool;
        document.querySelectorAll('.gb-tool-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
        });
    }

    function setColor(color) {
        drawing.color = color;
        document.querySelectorAll('.color-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-color') === color);
        });
    }

    document.querySelectorAll('.gb-tool-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var t = btn.getAttribute('data-tool');
            if (t === 'undo') {
                if (drawing.strokes.length) {
                    drawing.undoStack.push(drawing.strokes.pop());
                    redrawCanvas();
                }
            } else if (t === 'clear') {
                drawing.undoStack = [];
                drawing.strokes = [];
                drawing.currentStroke = null;
                redrawCanvas();
            } else {
                setTool(t);
            }
        });
    });

    document.querySelectorAll('.color-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setColor(btn.getAttribute('data-color'));
            setTool('pen');
        });
    });


    var messageEl = document.getElementById('gb-message');
    var countEl = document.getElementById('message-count');
    if (messageEl && countEl) {
        function updateCount() {
            countEl.textContent = messageEl.value.length + ' / 2000';
        }
        messageEl.addEventListener('input', updateCount);
        updateCount();
    }


    function escapeHtml(text) {
        if (text == null || text === '') return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    function renderDrawingToCanvas(canvas, data, fit) {
        if (!data || !data.strokes || !data.strokes.length) return;
        var w = data.width || CANVAS_WIDTH;
        var h = data.height || CANVAS_HEIGHT;
        canvas.width = w;
        canvas.height = h;
        var c = canvas.getContext('2d');
        c.fillStyle = data.backgroundColor || '#111111';
        c.fillRect(0, 0, w, h);
        var scale = 1;
        var offsetX = 0, offsetY = 0;
        if (fit && canvas.parentElement) {
            var maxW = canvas.parentElement.clientWidth || w;
            var maxH = 200;
            scale = Math.min(maxW / w, maxH / h, 1);
            offsetX = (maxW - w * scale) / 2;
            offsetY = (maxH - h * scale) / 2;
        }
        c.save();
        c.translate(offsetX, offsetY);
        c.scale(scale, scale);
        data.strokes.forEach(function (s) { drawStroke(c, s); });
        c.restore();
    }


    var GUESTBOOK_JSON_URL = '/public/guestbook.json';

    function loadEntries() {
        var container = document.getElementById('guestbook-entries');
        var loading = document.getElementById('entries-loading');
        if (!container) return;

        function showError(msg) {
            if (loading) loading.remove();
            container.innerHTML = '<p class="entries-loading">' + escapeHtml(msg) + '</p>';
        }

        function renderEntries(entries) {
            if (loading) loading.remove();
            if (!entries || !entries.length) {
                container.innerHTML = '<p class="entries-loading">No messages yet. Be the first!</p>';
                return;
            }
            container.innerHTML = '';
            entries.forEach(function (entry) {
                var card = document.createElement('div');
                card.className = 'entry-card';
                var name = entry.displayName != null && entry.displayName !== '' ? entry.displayName : '';
                var date = entry.created_at ? entry.created_at : '';
                var msg = entry.message != null ? entry.message : '';
                var html = '<div class="entry-header">';
                html += '<span class="entry-name' + (name ? '' : ' empty') + '"></span>';
                if (date) html += '<span class="entry-date"></span>';
                html += '</div>';
                if (msg) html += '<p class="entry-message"></p>';
                if (entry.drawing && entry.drawing.strokes && entry.drawing.strokes.length) {
                    html += '<div class="entry-drawing-wrap">';
                    html += '<canvas class="entry-drawing-thumb" width="' + (entry.drawing.width || 400) + '" height="' + (entry.drawing.height || 300) + '" role="img" aria-label="User drawing"></canvas>';
                    html += '</div>';
                }
                if (entry.ownerReply && entry.ownerReply.text) {
                    html += '<div class="entry-reply">';
                    html += '<div class="entry-reply-label">Reply from me</div>';
                    html += '<div class="entry-reply-text"></div>';
                    html += '</div>';
                }
                card.innerHTML = html;
                var nameEl = card.querySelector('.entry-name');
                var dateEl = card.querySelector('.entry-date');
                var msgEl = card.querySelector('.entry-message');
                var replyEl = card.querySelector('.entry-reply-text');
                if (nameEl) nameEl.textContent = name || 'Anonymous';
                if (dateEl) dateEl.textContent = date;
                if (msgEl) msgEl.textContent = msg;
                if (replyEl) replyEl.textContent = entry.ownerReply.text;
                var thumb = card.querySelector('.entry-drawing-thumb');
                if (thumb && entry.drawing) {
                    renderDrawingToCanvas(thumb, entry.drawing, true);
                    thumb.addEventListener('click', function () {
                        if (thumb.classList.contains('expanded')) {
                            thumb.classList.remove('expanded');
                            renderDrawingToCanvas(thumb, entry.drawing, true);
                        } else {
                            thumb.classList.add('expanded');
                            renderDrawingToCanvas(thumb, entry.drawing, false);
                        }
                    });
                }
                container.appendChild(card);
            });
        }

        fetch(GUESTBOOK_JSON_URL, { cache: 'default' })
            .then(function (r) {
                if (!r.ok) throw new Error('Could not load guestbook.');
                return r.json();
            })
            .then(function (data) {
                var list = Array.isArray(data) ? data : (data.entries || []);
                renderEntries(list);
            })
            .catch(function () {
                showError('Could not load guestbook. Try again later.');
            });
    }


    var form = document.getElementById('guestbook-form');
    var submitBtn = document.getElementById('gb-submit');
    var formStatus = document.getElementById('form-status');

    function setStatus(msg, isError) {
        if (!formStatus) return;
        formStatus.textContent = msg;
        formStatus.className = 'form-status' + (isError ? ' error' : ' success');
        formStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            e.stopPropagation();
            doSubmit();
            return false;
        });
        if (submitBtn) submitBtn.addEventListener('click', function () { doSubmit(); });
    }

    function doSubmit() {
            if (!form) return;
            var name = (document.getElementById('gb-name') && document.getElementById('gb-name').value) || '';
            var message = (document.getElementById('gb-message') && document.getElementById('gb-message').value) || '';
            var visibility = form && form.querySelector('input[name="visibility"]:checked');
            var isPublic = visibility ? visibility.value === 'public' : true;
            var honeypot = document.getElementById('website_url');
            if (honeypot && honeypot.value) {
                setStatus('Submission ignored.', true);
                return;
            }

            var drawingData = getCanvasDrawing();
            if (!message.trim() && (!drawingData || !drawingData.strokes.length)) {
                setStatus('Please add a message and/or a drawing.', true);
                return;
            }

            var turnstileResponse = null;
            var tw = document.querySelector('[name="cf-turnstile-response"]');
            if (tw) turnstileResponse = tw.value;
            if (!turnstileResponse) {
                setStatus('Verification required. Complete the checkbox above. If it never appears or shows an error, add konerocat.github.io in Cloudflare Turnstile → Hostname Management, then refresh or try Chrome.', true);
                return;
            }

            if (submitBtn) submitBtn.disabled = true;
            setStatus('Sending...', false);

            var payload = {
                name: name.slice(0, 80),
                message: message.slice(0, 2000),
                public: isPublic,
                drawing: drawingData,
                'cf-turnstile-response': turnstileResponse
            };

            fetch(GUESTBOOK_API_BASE + '/api/guestbook/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; }); })
                .then(function (res) {
                    if (res.ok && res.json && res.json.success) {
                        setStatus('Thanks! Your entry was submitted.');
                        form.reset();
                        if (countEl) countEl.textContent = '0 / 2000';
                        drawing.strokes = [];
                        drawing.undoStack = [];
                        redrawCanvas();
                        if (typeof turnstile !== 'undefined' && turnstile.reset) turnstile.reset();
                    } else {
                        setStatus((res.json && res.json.error) || 'Submission failed. Try again.', true);
                    }
                })
                .catch(function (err) {
                    var msg = 'Request failed. ';
                    if (err && err.message) msg += err.message;
                    else msg += 'Check Network tab for CORS or connection errors.';
                    setStatus(msg, true);
                })
                .finally(function () {
                    if (submitBtn) submitBtn.disabled = false;
                });
    }


    initCanvas();
    loadEntries();
})();
