(function () {
    'use strict';

    var API_BASE = (typeof window !== 'undefined' && window.GUESTBOOK_API_URL) ? window.GUESTBOOK_API_URL : '';

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        var CANVAS_W = 400;
        var CANVAS_H = 250;
        var CANVAS_H_EXP = 400;
        var MAX_STROKES = 100;
        var MAX_POINTS = 400;
        var MAX_TOTAL = 10000;
        var DOWNSAMPLE = 3;

        var expanded = false;
        var MAX_IMAGES = 3;
        var IMG_MAX_DIM = 200;
        var IMG_QUALITY = 0.6;
        var HANDLE_SIZE = 8;

        var drawing = {
            strokes: [],
            current: null,
            tool: 'pen',
            color: '#EAE7DE',
            bgColor: '#111111',
            penWidth: 2,
            eraserWidth: 20,
            undoStack: [],
            images: [],
            selectedImage: -1,
            imgDrag: null
        };

        var canvasEl = document.getElementById('gb-canvas');
        var ctx = canvasEl ? canvasEl.getContext('2d') : null;



        var modal = document.getElementById('gb-modal');
        var openBtn = document.getElementById('gb-open-form');
        var closeBtn = modal ? modal.querySelector('[data-close]') : null;
        var backdrop = modal ? modal.querySelector('.gb-modal-backdrop') : null;

        function openModal() {
            if (!modal) return;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
        }

        function closeModal() {
            if (!modal) return;
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }

        if (openBtn) openBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (backdrop) backdrop.addEventListener('click', closeModal);
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });



        function getCanvasDrawing() {
            if (!drawing.strokes.length && !drawing.images.length) return null;
            var out = drawing.strokes.map(function (s) {
                var pts = s.points;
                if (DOWNSAMPLE > 1) {
                    pts = pts.filter(function (_, i) { return i % DOWNSAMPLE === 0 || i === pts.length - 1; });
                }
                pts = pts.map(function (p) { return { x: Math.round(p.x), y: Math.round(p.y) }; });
                return { color: s.color, width: s.width, points: pts };
            });
            var imgs = drawing.images.map(function (img) {
                return { src: img.src, x: Math.round(img.x), y: Math.round(img.y), w: Math.round(img.w), h: Math.round(img.h) };
            });
            return { width: canvasEl.width, height: canvasEl.height, backgroundColor: drawing.bgColor, strokes: out, images: imgs };
        }

        function drawStroke(c, s) {
            if (!s.points || !s.points.length) return;
            c.strokeStyle = s.color;
            c.lineWidth = s.width;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.beginPath();
            c.moveTo(s.points[0].x, s.points[0].y);
            for (var i = 1; i < s.points.length; i++) c.lineTo(s.points[i].x, s.points[i].y);
            c.stroke();
        }

        function drawImages(c, imgs) {
            imgs.forEach(function (img) {
                if (img._el && img._el.complete) {
                    c.drawImage(img._el, img.x, img.y, img.w, img.h);
                }
            });
        }

        function drawSelectionUI(c, img) {
            c.save();
            c.strokeStyle = '#EAE7DE';
            c.lineWidth = 1;
            c.setLineDash([4, 3]);
            c.strokeRect(img.x, img.y, img.w, img.h);
            c.setLineDash([]);
            c.fillStyle = '#78589d';
            var corners = [
                [img.x, img.y],
                [img.x + img.w, img.y],
                [img.x, img.y + img.h],
                [img.x + img.w, img.y + img.h]
            ];
            corners.forEach(function (p) {
                c.fillRect(p[0] - HANDLE_SIZE / 2, p[1] - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                c.strokeStyle = '#EAE7DE';
                c.strokeRect(p[0] - HANDLE_SIZE / 2, p[1] - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
            });
            c.restore();
        }

        function redraw() {
            if (!ctx || !canvasEl) return;
            ctx.fillStyle = drawing.bgColor;
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
            drawImages(ctx, drawing.images);
            drawing.strokes.forEach(function (s) { drawStroke(ctx, s); });
            if (drawing.selectedImage >= 0 && drawing.selectedImage < drawing.images.length) {
                drawSelectionUI(ctx, drawing.images[drawing.selectedImage]);
            }
        }

        function getPos(e) {
            var rect = canvasEl.getBoundingClientRect();
            var sx = canvasEl.width / rect.width;
            var sy = canvasEl.height / rect.height;
            var cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
            var cy = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
            var x = (cx - rect.left) * sx;
            var y = (cy - rect.top) * sy;
            return {
                x: Math.max(0, Math.min(canvasEl.width, x)),
                y: Math.max(0, Math.min(canvasEl.height, y))
            };
        }

        function beginStroke(x, y) {
            if (drawing.strokes.length >= MAX_STROKES) return;
            var col = drawing.tool === 'eraser' ? drawing.bgColor : drawing.color;
            var w = drawing.tool === 'eraser' ? drawing.eraserWidth : drawing.penWidth;
            drawing.current = { color: col, width: w, points: [{ x: x, y: y }] };
        }

        function extendStroke(x, y) {
            if (!drawing.current) return;
            var pts = drawing.current.points;
            if (pts.length >= MAX_POINTS) return;
            var total = drawing.strokes.reduce(function (n, s) { return n + s.points.length; }, 0) + pts.length;
            if (total >= MAX_TOTAL) return;
            pts.push({ x: x, y: y });
            drawStroke(ctx, { color: drawing.current.color, width: drawing.current.width, points: pts.slice(-2) });
        }

        function finishStroke() {
            if (drawing.current && drawing.current.points.length > 0) {
                drawing.strokes.push(drawing.current);
                drawing.undoStack = [];
            }
            drawing.current = null;
        }



        function hitTestImage(px, py) {
            for (var i = drawing.images.length - 1; i >= 0; i--) {
                var img = drawing.images[i];
                if (px >= img.x && px <= img.x + img.w && py >= img.y && py <= img.y + img.h) return i;
            }
            return -1;
        }

        function hitTestHandle(px, py, img) {
            var corners = [
                { cx: img.x, cy: img.y, corner: 'tl' },
                { cx: img.x + img.w, cy: img.y, corner: 'tr' },
                { cx: img.x, cy: img.y + img.h, corner: 'bl' },
                { cx: img.x + img.w, cy: img.y + img.h, corner: 'br' }
            ];
            for (var i = 0; i < corners.length; i++) {
                if (Math.abs(px - corners[i].cx) <= HANDLE_SIZE && Math.abs(py - corners[i].cy) <= HANDLE_SIZE) {
                    return corners[i].corner;
                }
            }
            return null;
        }

        var activePointerId = null;

        function canvasPointerDown(e) {
            e.preventDefault();
            if (activePointerId != null && e.pointerId != null && e.pointerId !== activePointerId) return;
            if (e.pointerId != null) {
                activePointerId = e.pointerId;
                canvasEl.setPointerCapture(e.pointerId);
            }
            var p = getPos(e);

            if (drawing.selectedImage >= 0 && drawing.selectedImage < drawing.images.length) {
                var sel = drawing.images[drawing.selectedImage];
                var handle = hitTestHandle(p.x, p.y, sel);
                if (handle) {
                    drawing.imgDrag = { type: 'resize', corner: handle, startX: p.x, startY: p.y, origX: sel.x, origY: sel.y, origW: sel.w, origH: sel.h };
                    return;
                }
            }

            var hit = hitTestImage(p.x, p.y);
            if (hit >= 0) {
                drawing.selectedImage = hit;
                var img = drawing.images[hit];
                drawing.imgDrag = { type: 'move', offsetX: p.x - img.x, offsetY: p.y - img.y };
                redraw();
                return;
            }

            drawing.selectedImage = -1;
            drawing.imgDrag = null;
            beginStroke(p.x, p.y);
            redraw();
        }

        function canvasPointerMove(e) {
            if (e.pointerId != null && e.pointerId !== activePointerId) return;
            if (drawing.imgDrag) {
                e.preventDefault();
                var p = getPos(e);
                var img = drawing.images[drawing.selectedImage];
                if (!img) return;

                if (drawing.imgDrag.type === 'move') {
                    img.x = p.x - drawing.imgDrag.offsetX;
                    img.y = p.y - drawing.imgDrag.offsetY;
                    redraw();
                } else if (drawing.imgDrag.type === 'resize') {
                    var d = drawing.imgDrag;
                    var aspect = d.origW / d.origH;
                    var dx = p.x - d.startX;
                    var dy = p.y - d.startY;

                    var newW, newH;
                    if (d.corner === 'br') {
                        newW = Math.max(16, d.origW + dx);
                    } else if (d.corner === 'bl') {
                        newW = Math.max(16, d.origW - dx);
                    } else if (d.corner === 'tr') {
                        newW = Math.max(16, d.origW + dx);
                    } else {
                        newW = Math.max(16, d.origW - dx);
                    }
                    newH = newW / aspect;

                    if (d.corner === 'tl') {
                        img.x = d.origX + d.origW - newW;
                        img.y = d.origY + d.origH - newH;
                    } else if (d.corner === 'tr') {
                        img.y = d.origY + d.origH - newH;
                    } else if (d.corner === 'bl') {
                        img.x = d.origX + d.origW - newW;
                    }
                    img.w = newW;
                    img.h = newH;
                    redraw();
                }
                return;
            }
            if (!drawing.current) return;
            e.preventDefault();
            var p = getPos(e);
            extendStroke(p.x, p.y);
        }

        function canvasPointerUp(e) {
            if (e.pointerId != null && e.pointerId !== activePointerId) return;
            activePointerId = null;
            if (drawing.imgDrag) {
                drawing.imgDrag = null;
                return;
            }
            finishStroke();
            if (e.pointerId != null) canvasEl.releasePointerCapture(e.pointerId);
        }

        function initCanvas() {
            if (!canvasEl || !ctx) return;
            redraw();

            if (window.PointerEvent) {
                canvasEl.addEventListener('pointerdown', canvasPointerDown);
                canvasEl.addEventListener('pointermove', canvasPointerMove);
                canvasEl.addEventListener('pointerup', canvasPointerUp);
                canvasEl.addEventListener('pointercancel', function () {
                    activePointerId = null;
                    drawing.imgDrag = null;
                    finishStroke();
                });
            } else {
                canvasEl.addEventListener('mousedown', canvasPointerDown);
                document.addEventListener('mousemove', canvasPointerMove);
                document.addEventListener('mouseup', canvasPointerUp);
                canvasEl.addEventListener('touchstart', function (e) {
                    canvasPointerDown(e);
                }, { passive: false });
                canvasEl.addEventListener('touchmove', function (e) {
                    canvasPointerMove(e);
                }, { passive: false });
                canvasEl.addEventListener('touchend', function (e) {
                    e.preventDefault();
                    canvasPointerUp(e);
                }, { passive: false });
            }

            document.addEventListener('keydown', function (e) {
                if (drawing.selectedImage >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
                    var target = e.target;
                    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
                    e.preventDefault();
                    drawing.images.splice(drawing.selectedImage, 1);
                    drawing.selectedImage = -1;
                    updateImgCount();
                    redraw();
                }
            });
        }



        function setActiveTool(name) {
            drawing.tool = name;
            document.querySelectorAll('.gb-tool[data-tool]').forEach(function (b) {
                if (b.dataset.tool === 'pen' || b.dataset.tool === 'eraser') {
                    b.classList.toggle('active', b.dataset.tool === name);
                }
            });
        }

        function setActiveColor(color) {
            drawing.color = color;
            document.querySelectorAll('.gb-color').forEach(function (b) {
                b.classList.toggle('active', b.dataset.color === color);
            });
        }

        var bgPreview = document.getElementById('gb-bg-preview');

        function updateBgPreview() {
            if (bgPreview) bgPreview.style.background = drawing.bgColor;
        }

        function updateImgCount() {
            var el = document.getElementById('gb-img-count');
            if (el) el.textContent = drawing.images.length + '/' + MAX_IMAGES;
        }

        document.querySelectorAll('.gb-tool[data-tool]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var t = btn.dataset.tool;
                if (t === 'undo') {
                    if (drawing.strokes.length) {
                        drawing.undoStack.push(drawing.strokes.pop());
                        redraw();
                    }
                } else if (t === 'clear') {
                    drawing.undoStack = [];
                    drawing.strokes = [];
                    drawing.current = null;
                    drawing.images = [];
                    drawing.selectedImage = -1;
                    drawing.imgDrag = null;
                    updateImgCount();
                    redraw();
                } else if (t === 'bg') {
                    drawing.bgColor = drawing.color;
                    updateBgPreview();
                    redraw();
                } else {
                    setActiveTool(t);
                }
            });
        });

        document.querySelectorAll('.gb-color').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setActiveColor(btn.dataset.color);
                setActiveTool('pen');
            });
        });

        var sizeSlider = document.getElementById('gb-pen-size');
        var sizeVal = document.getElementById('gb-pen-size-val');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', function () {
                drawing.penWidth = parseInt(sizeSlider.value, 10);
                if (sizeVal) sizeVal.textContent = sizeSlider.value;
            });
        }



        var expandBtn = document.getElementById('gb-expand');
        if (expandBtn && canvasEl) {
            expandBtn.addEventListener('click', function () {
                expanded = !expanded;
                canvasEl.height = expanded ? CANVAS_H_EXP : CANVAS_H;
                expandBtn.textContent = expanded ? 'shrink' : 'expand';
                redraw();
            });
        }



        var palette = document.querySelector('.gb-palette');
        if (palette) {
            var wrap = document.createElement('div');
            wrap.className = 'gb-custom-color-wrap';
            var swatch = document.createElement('div');
            swatch.className = 'gb-custom-color-swatch';
            var picker = document.createElement('input');
            picker.type = 'color';
            picker.value = '#ff69b4';
            picker.title = 'Custom color';
            wrap.appendChild(picker);
            wrap.appendChild(swatch);
            palette.appendChild(wrap);

            picker.addEventListener('input', function () {
                drawing.color = picker.value;
                swatch.style.background = picker.value;
                document.querySelectorAll('.gb-color').forEach(function (b) { b.classList.remove('active'); });
                setActiveTool('pen');
            });
        }



        var imgBtn = document.getElementById('gb-img-btn');
        var imgInput = document.getElementById('gb-img-input');
        if (imgBtn && imgInput) {
            imgBtn.addEventListener('click', function () {
                if (drawing.images.length >= MAX_IMAGES) return;
                imgInput.click();
            });
            imgInput.addEventListener('change', function () {
                if (!imgInput.files || !imgInput.files[0]) return;
                if (drawing.images.length >= MAX_IMAGES) { imgInput.value = ''; return; }
                var file = imgInput.files[0];
                var reader = new FileReader();
                reader.onload = function () {
                    var img = new Image();
                    img.onload = function () {
                        var w = img.width, h = img.height;
                        if (w > IMG_MAX_DIM || h > IMG_MAX_DIM) {
                            var ratio = Math.min(IMG_MAX_DIM / w, IMG_MAX_DIM / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                        }
                        var oc = document.createElement('canvas');
                        oc.width = w;
                        oc.height = h;
                        var octx = oc.getContext('2d');
                        octx.drawImage(img, 0, 0, w, h);

                        var isGif = file.type === 'image/gif';
                        var src;
                        if (isGif && file.size <= 40960) {
                            src = reader.result;
                        } else {
                            src = oc.toDataURL('image/jpeg', IMG_QUALITY);
                        }

                        if (src.length > 55000) {
                            src = oc.toDataURL('image/jpeg', 0.4);
                        }

                        var cx = (canvasEl.width - w) / 2;
                        var cy = (canvasEl.height - h) / 2;

                        var el = new Image();
                        el.onload = function () {
                            drawing.images.push({ src: src, x: cx, y: cy, w: w, h: h, _el: el });
                            drawing.selectedImage = drawing.images.length - 1;
                            updateImgCount();
                            redraw();
                        };
                        el.src = src;
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
                imgInput.value = '';
            });
        }

        var messageEl = document.getElementById('gb-message');
        var countEl = document.getElementById('message-count');
        if (messageEl && countEl) {
            messageEl.addEventListener('input', function () {
                countEl.textContent = messageEl.value.length + ' / 2000';
            });
        }


        function renderDrawingToCanvas(canvas, data) {
            if (!data) return;
            var hasStrokes = data.strokes && data.strokes.length;
            var hasImages = data.images && data.images.length;
            if (!hasStrokes && !hasImages) return;
            var w = data.width || CANVAS_W;
            var h = data.height || CANVAS_H;
            canvas.width = w;
            canvas.height = h;
            var c = canvas.getContext('2d');

            function paintAll(loadedImgs) {
                c.fillStyle = data.backgroundColor || '#111111';
                c.fillRect(0, 0, w, h);
                if (loadedImgs) {
                    loadedImgs.forEach(function (item) {
                        if (item.el) c.drawImage(item.el, item.x, item.y, item.w, item.h);
                    });
                }
                if (hasStrokes) data.strokes.forEach(function (s) { drawStroke(c, s); });
            }

            if (!hasImages) { paintAll(null); return; }

            var pending = data.images.length;
            var loaded = [];
            data.images.forEach(function (imgData, idx) {
                var el = new Image();
                el.onload = el.onerror = function () {
                    loaded[idx] = { el: el.complete && el.naturalWidth ? el : null, x: imgData.x, y: imgData.y, w: imgData.w, h: imgData.h };
                    pending--;
                    if (pending <= 0) paintAll(loaded);
                };
                el.src = imgData.src;
            });
            paintAll(null);
        }

        function buildEntryEl(entry, idx, chronoNum) {
            var el = document.createElement('div');
            el.className = 'gb-entry';
            el.style.animationDelay = Math.min(idx * 0.04, 0.24) + 's';

            var name = entry.displayName || '';
            var date = entry.created_at || '';

            var bar = document.createElement('div');
            bar.className = 'gb-entry-bar';
            bar.setAttribute('data-num', '#' + (chronoNum < 10 ? '0' : '') + chronoNum);

            var nameSpan = document.createElement('span');
            nameSpan.className = 'gb-entry-name' + (name ? '' : ' anon');
            nameSpan.textContent = name || 'anonymous';
            bar.appendChild(nameSpan);

            if (date) {
                var dateSpan = document.createElement('span');
                dateSpan.className = 'gb-entry-date';
                dateSpan.textContent = date;
                bar.appendChild(dateSpan);
            }
            el.appendChild(bar);

            var body = document.createElement('div');
            body.className = 'gb-entry-body';

            if (entry.message) {
                var msgP = document.createElement('p');
                msgP.className = 'gb-entry-message';
                msgP.textContent = entry.message;
                body.appendChild(msgP);
            }

            var hasDrawContent = entry.drawing && ((entry.drawing.strokes && entry.drawing.strokes.length) || (entry.drawing.images && entry.drawing.images.length));
            if (hasDrawContent) {
                var dWrap = document.createElement('div');
                dWrap.className = 'gb-entry-drawing';
                var cv = document.createElement('canvas');
                cv.className = 'gb-entry-canvas';
                cv.setAttribute('role', 'img');
                cv.setAttribute('aria-label', 'Drawing by ' + (name || 'anonymous'));
                dWrap.appendChild(cv);

                var hint = document.createElement('span');
                hint.className = 'gb-drawing-hint';

                dWrap.appendChild(hint);

                body.appendChild(dWrap);
                renderDrawingToCanvas(cv, entry.drawing);

                cv.addEventListener('click', function () {
                    openLightbox(entry.drawing);
                });
            }

            var hasReplyText = entry.ownerReply && entry.ownerReply.text;
            var hasReplyImages = entry.ownerReply && entry.ownerReply.images && entry.ownerReply.images.length;
            if (hasReplyText || hasReplyImages) {
                var reply = document.createElement('div');
                reply.className = 'gb-entry-reply';
                var label = document.createElement('div');
                label.className = 'gb-entry-reply-label';
                label.textContent = 'konero:';
                reply.appendChild(label);
                if (hasReplyText) {
                    var rtxt = document.createElement('div');
                    rtxt.className = 'gb-entry-reply-text';
                    rtxt.textContent = entry.ownerReply.text;
                    reply.appendChild(rtxt);
                }
                if (hasReplyImages) {
                    entry.ownerReply.images.forEach(function (src) {
                        var img = document.createElement('img');
                        img.className = 'gb-reply-img';
                        img.src = src;
                        img.alt = 'reply image';
                        img.loading = 'lazy';
                        reply.appendChild(img);
                    });
                }
                body.appendChild(reply);
            }

            el.appendChild(body);
            return el;
        }

        var lightbox = null;

        function openLightbox(drawingData) {
            if (!lightbox) {
                lightbox = document.createElement('div');
                lightbox.className = 'gb-lightbox';
                lightbox.innerHTML = '<div class="gb-lightbox-backdrop"></div>';
                document.body.appendChild(lightbox);
                lightbox.addEventListener('click', function () {
                    lightbox.classList.remove('is-open');
                });
            }
            var old = lightbox.querySelector('canvas');
            if (old) old.remove();

            var cv = document.createElement('canvas');
            lightbox.appendChild(cv);
            renderDrawingToCanvas(cv, drawingData);
            lightbox.classList.add('is-open');
        }

        var form = document.getElementById('guestbook-form');
        var submitBtn = document.getElementById('gb-submit');
        var formStatus = document.getElementById('form-status');

        function setStatus(msg, isError) {
            var el = formStatus || document.getElementById('form-status');
            if (el) {
                el.textContent = msg;
                el.className = 'gb-status' + (isError ? ' error' : ' success');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        function doSubmit() {
            try { setStatus('Checking…', false); } catch (_) {}
            try {
                if (!form) { setStatus('Form not found.', true); return; }

                var name = (document.getElementById('gb-name') || {}).value || '';
                var message = (document.getElementById('gb-message') || {}).value || '';
                var vis = form.querySelector('input[name="visibility"]:checked');
                var isPublic = vis ? vis.value === 'public' : true;

                var hp = document.getElementById('website_url');
                if (hp && hp.value) { setStatus('Submission ignored.', true); return; }

                var drawingData = getCanvasDrawing();
                var hasDrawing = drawingData && (drawingData.strokes.length || (drawingData.images && drawingData.images.length));
                if (!message.trim() && !hasDrawing) {
                    setStatus('Please add a message and/or a drawing.', true);
                    return;
                }

                var token = null;
                var tw = document.querySelector('[name="cf-turnstile-response"]');
                if (tw) token = tw.value;
                if (!token && typeof window.__gbTurnstileToken === 'string') token = window.__gbTurnstileToken;
                if (!token) {
                    setStatus('Verification required. If it never appears, try Chrome or disable extensions.', true);
                    return;
                }

                if (submitBtn) submitBtn.disabled = true;
                setStatus('Sending...', false);

                var url = API_BASE + '/api/guestbook/submit';
                var payload = {
                    name: name.slice(0, 80),
                    message: message.slice(0, 2000),
                    public: isPublic,
                    drawing: drawingData,
                    'cf-turnstile-response': token
                };

                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                .then(function (r) {
                    return r.text().then(function (t) {
                        try { return { ok: r.ok, status: r.status, json: JSON.parse(t) }; }
                        catch (_) { return { ok: false, status: r.status, json: null, raw: t }; }
                    });
                })
                .then(function (res) {
                    if (res.ok && res.json && res.json.success) {
                        setStatus('Thank you! Your message was submitted.', false);
                        form.reset();
                        if (countEl) countEl.textContent = '0 / 2000';
                        drawing.strokes = [];
                        drawing.undoStack = [];
                        drawing.images = [];
                        drawing.selectedImage = -1;
                        drawing.imgDrag = null;
                        drawing.bgColor = '#111111';
                        updateBgPreview();
                        updateImgCount();
                        redraw();
                        if (typeof turnstile !== 'undefined' && turnstile.reset) turnstile.reset();
                    } else {
                        var msg = (res.json && res.json.error) ? res.json.error : ('Server returned ' + res.status);
                        setStatus(msg, true);
                    }
                })
                .catch(function (err) {
                    setStatus('Request failed. ' + (err && err.message ? err.message : 'Check your connection.'), true);
                })
                .finally(function () {
                    if (submitBtn) submitBtn.disabled = false;
                });
            } catch (e) {
                setStatus('Error: ' + (e && e.message ? e.message : 'Something went wrong'), true);
                if (submitBtn) submitBtn.disabled = false;
            }
        }

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                e.stopPropagation();
                doSubmit();
                return false;
            });
            if (submitBtn) submitBtn.addEventListener('click', doSubmit);
        }



        var legacyEntries = [
            { displayName: 'Shaymihgn', message: '😯 Hhhhhhh', created_at: '2026-02-15' },
            { displayName: 'OLA', message: 'asdfasdfasdfasdf', created_at: '2026-01-02' },
            { displayName: ';3', message: 'wow 😯', created_at: '2025-05-19' },
            { displayName: 'rat', message: 'squeak', created_at: '2025-05-15' },
            { displayName: ':D', message: '😡😡😡😡😡:😡[😡😡😡😡😡😡😡😁😁😁😁😁', created_at: '2025-04-20' },
            { displayName: 'kat', message: 'wadadsaa hi 😯😯😯', created_at: '2025-03-27' },
            { displayName: 'ME', message: 'HIP😁😁😁', created_at: '2025-03-27' }
        ];

        function loadStats(entryCount) {
            var statsEl = document.getElementById('gb-stats');
            if (!statsEl) return;

            fetch(API_BASE + '/api/guestbook/stats', { cache: 'default' })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var visitors = data.visitors;
                    var legacyMsgs = data.legacy_messages || 0;
                    var totalMsgs = legacyMsgs + entryCount;
                    var parts = [];
                    if (visitors != null) {
                        parts.push('<span class="gb-stats-num">' + visitors + '</span> visitors');
                    }
                    parts.push('<span class="gb-stats-num">' + totalMsgs + '</span> messages');
                    statsEl.innerHTML = parts.join(' &middot; ');
                })
                .catch(function () {
                    statsEl.innerHTML = '<span class="gb-stats-num">' + entryCount + '</span> messages';
                });
        }

        var PER_PAGE = 10;
        var allEntries = [];
        var currentPage = 0;

        function renderPage(page) {
            var container = document.getElementById('guestbook-entries');
            var paginationEl = document.getElementById('gb-pagination');
            if (!container) return;

            var totalPages = Math.max(1, Math.ceil(allEntries.length / PER_PAGE));
            page = Math.max(0, Math.min(page, totalPages - 1));
            currentPage = page;

            var start = page * PER_PAGE;
            var pageEntries = allEntries.slice(start, start + PER_PAGE);

            var total = allEntries.length;
            container.innerHTML = '';
            pageEntries.forEach(function (entry, idx) {
                var chronoNum = total - (start + idx);
                container.appendChild(buildEntryEl(entry, idx, chronoNum));
            });

            if (paginationEl) {
                paginationEl.innerHTML = '';
                if (totalPages > 1) {
                    var prev = document.createElement('button');
                    prev.className = 'gb-page-btn';
                    prev.textContent = '<';
                    prev.disabled = page === 0;
                    prev.addEventListener('click', function () { renderPage(page - 1); });
                    paginationEl.appendChild(prev);

                    for (var i = 0; i < totalPages; i++) {
                        var btn = document.createElement('button');
                        btn.className = 'gb-page-btn' + (i === page ? ' active' : '');
                        btn.textContent = i + 1;
                        btn.addEventListener('click', (function (p) {
                            return function () { renderPage(p); };
                        })(i));
                        paginationEl.appendChild(btn);
                    }

                    var next = document.createElement('button');
                    next.className = 'gb-page-btn';
                    next.textContent = '>';
                    next.disabled = page === totalPages - 1;
                    next.addEventListener('click', function () { renderPage(page + 1); });
                    paginationEl.appendChild(next);
                }
            }
        }

        function loadEntriesAndStats() {
            var container = document.getElementById('guestbook-entries');
            var loading = document.getElementById('entries-loading');
            if (!container) return;

            fetch('/public/guestbook.json', { cache: 'default' })
                .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
                .then(function (data) {
                    var list = Array.isArray(data) ? data : (data.entries || []);
                    list.reverse();
                    allEntries = list.concat(legacyEntries);
                    if (loading) loading.remove();
                    if (!allEntries.length) {
                        container.innerHTML = '<p class="gb-entries-empty">no transmissions received yet.</p>';
                    } else {
                        renderPage(0);
                    }
                    loadStats(list.length);
                })
                .catch(function () {
                    if (loading) loading.remove();
                    allEntries = legacyEntries.slice();
                    renderPage(0);
                    loadStats(0);
                });
        }

        initCanvas();
        loadEntriesAndStats();
    }
})();
