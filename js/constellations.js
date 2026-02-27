const CHARACTER_DATA = [
  { id: "niko", name: "KNEEKO", source: "OneShot", image: "/images/constellations/nikoe.jpg", details: "STILL IN DEVELOPMENT" },
  { id: "ryo", name: "ROY", source: "Bocchi the Rock!", image: "/images/constellations/oy.jpg", details: "STILL IN DEVELOPMENT" },
];

const AVATAR_SIZE = 64;
const AVATAR_SIZE_MOBILE = 72;
const CARD_W = 200;
const CARD_H = 220;
const CARD_SAFE_TOP = 220;
const CARD_SAFE_BOTTOM = 50;
const CARD_PAD = 110;

function isMobileLayout() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function rectsOverlap(a, b, padding) {
  return !(a.x + a.w + padding < b.x || a.x > b.x + b.w + padding || a.y + a.h + padding < b.y || a.y > b.y + b.h + padding);
}

function computeCenters(layer, nodeEls) {
  const layerRect = layer.getBoundingClientRect();
  return nodeEls.map(function(el) {
    var r = el.getBoundingClientRect();
    return {
      id: el.dataset.id,
      x: r.left - layerRect.left + r.width / 2,
      y: r.top - layerRect.top + r.height / 2
    };
  });
}

function buildNearestTree(points) {
  var edges = [];
  for (var i = 1; i < points.length; i++) {
    var bestJ = 0, bestD = Infinity;
    for (var j = 0; j < i; j++) {
      var dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    edges.push([points[bestJ], points[i]]);
  }
  return edges;
}

function setSvgSize(svg) {
  svg.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
  svg.setAttribute("width", String(window.innerWidth));
  svg.setAttribute("height", String(window.innerHeight));
}

function drawConnections(svg, layer, nodeEls) {
  setSvgSize(svg);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var points = computeCenters(layer, nodeEls);
  var edges = buildNearestTree(points);
  var stroke = (getComputedStyle(document.documentElement).getPropertyValue("--purple") || "#78589d").trim();
  var light = (getComputedStyle(document.documentElement).getPropertyValue("--main-light") || "#EAE7DE").trim();

  edges.forEach(function(pair) {
    var a = pair[0], b = pair[1];
    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", stroke); line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-opacity", "0.52"); line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-dasharray", "4 6");
    svg.appendChild(line);
  });
  points.forEach(function(p) {
    var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", String(p.x)); dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", "2.5"); dot.setAttribute("fill", light); dot.setAttribute("fill-opacity", "0.45");
    svg.appendChild(dot);
  });
}

function showLines(svg, layer, nodeEls) {
  drawConnections(svg, layer, nodeEls);
  svg.classList.remove("constellation-lines-hidden");
  svg.classList.add("constellation-lines-visible");
}

function initModal() {
  var modal = document.getElementById("character-modal");
  var closeBtn = modal && modal.querySelector("[data-close]");
  var backdrop = modal && modal.querySelector(".backdrop");
  function close() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    var url = new URL(window.location.href);
    url.searchParams.delete("char");
    var clean = url.pathname + (url.search || "");
    window.history.replaceState({}, "", clean);
  }
  function open(character) {
    if (!modal) return;
    modal.querySelector("[data-name]").textContent = character.name;
    modal.querySelector("[data-source]").textContent = character.source;
    modal.querySelector("[data-details]").textContent = character.details || "";
    modal.querySelector("[data-portrait]").setAttribute("src", character.image);
    modal.querySelector("[data-portrait]").setAttribute("alt", character.name);
    var labelEl = modal.querySelector("[data-modal-label]");
    if (labelEl) labelEl.textContent = character.name + ".txt";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  window.addEventListener("keydown", function(e) { if (e.key === "Escape") close(); });
  return { open: open, close: close };
}

function initStarfield(canvas) {
  var ctx = canvas.getContext("2d");
  if (!ctx) return function() {};
  var stars = [];
  var density = 0.0001;
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars.length = 0;
    var count = Math.max(80, Math.floor(window.innerWidth * window.innerHeight * density));
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        base: 1 + Math.floor(Math.random() * 3),
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        a: 0.15 + Math.random() * 0.6
      });
    }
  }
  var last = performance.now();
  function tick(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    var light = (getComputedStyle(document.documentElement).getPropertyValue("--main-light") || "#EAE7DE").trim();
    ctx.fillStyle = light;
    stars.forEach(function(s) {
      s.phase += dt * s.speed;
      var tw = 0.55 + 0.45 * Math.sin(s.phase);
      var size = clamp(s.base + tw * 0.9, 1, 4);
      ctx.globalAlpha = clamp(s.a * (0.5 + 0.5 * tw), 0.05, 0.9);
      var x = Math.floor(s.x), y = Math.floor(s.y), w = Math.max(1, Math.round(size));
      ctx.fillRect(x, y, w, w);
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }
  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(tick);
  return function() { window.removeEventListener("resize", resize); };
}

function layoutNodes(layer, nodes) {
  var rect = layer.getBoundingClientRect();
  var avatarSize = isMobileLayout() ? AVATAR_SIZE_MOBILE : AVATAR_SIZE;
  var pad = CARD_PAD;
  var safeTop = CARD_SAFE_TOP;
  var safeBottom = CARD_SAFE_BOTTOM;
  var maxX = Math.max(pad, rect.width - avatarSize - pad);
  var maxY = Math.max(pad, rect.height - avatarSize - pad);
  var placed = [];
  nodes.forEach(function(node) {
    var ok = false;
    for (var attempt = 0; attempt < 200; attempt++) {
      var x = pad + Math.random() * (maxX - pad);
      var y = safeTop + Math.random() * (maxY - safeTop - safeBottom);
      var r = { x: x, y: y, w: avatarSize, h: avatarSize };
      ok = placed.every(function(p) { return !rectsOverlap(r, p, 40); });
      if (ok) {
        placed.push(r);
        node.style.left = Math.round(x) + "px";
        node.style.top = Math.round(y) + "px";
        break;
      }
    }
    if (!ok) {
      node.style.left = Math.round(pad + Math.random() * (maxX - pad)) + "px";
      node.style.top = Math.round(safeTop + Math.random() * (maxY - safeTop - safeBottom)) + "px";
    }
  });
}

function buildNode(character) {
  var node = document.createElement("div");
  node.className = "constellation-node";
  node.dataset.id = character.id;
  node.innerHTML =
    '<div class="constellation-avatar"><img src="' + character.image + '" alt="' + character.name + '" draggable="false"></div>' +
    '<div class="constellation-card">' +
      '<div class="topbar"><div class="name">' + character.name + '</div><div class="tag">(*)</div></div>' +
      '<div class="imgwrap"><img src="' + character.image + '" alt="' + character.name + '" draggable="false"></div>' +
      '<div class="meta"><div class="from">' + character.source + '</div><div class="hint"></div></div>' +
    '</div>';
  return node;
}

function boot() {
  var canvas = document.getElementById("starfield");
  var layer = document.getElementById("cards-layer");
  var svg = document.getElementById("constellation-lines");
  if (!canvas || !layer || !svg) return;

  initStarfield(canvas);
  var modal = initModal();
  var data = shuffleInPlace(CHARACTER_DATA.slice());
  var nodeEls = data.map(buildNode);

  nodeEls.forEach(function(el, i) {
    el.addEventListener("click", function(e) {
      if (!(e.target.closest(".constellation-card") || e.target.closest(".constellation-avatar"))) return;
      var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      if (isTouch) {
        if (el.classList.contains("card-open")) {
          el.classList.remove("card-open");
          modal.open(data[i]);
        } else {
          el.classList.add("card-open");
        }
        return;
      }

      modal.open(data[i]);
    });
    layer.appendChild(el);
  });

  
  document.addEventListener("click", function(e) {
    if (!e.target.closest(".constellation-node")) {
      nodeEls.forEach(function(node) { node.classList.remove("card-open"); });
    }
  });


  var originalOpen = modal.open;
  modal.open = function(character) {
    nodeEls.forEach(function(node) { node.classList.remove("card-open"); });
    originalOpen(character);
  };

  requestAnimationFrame(function() {
    layoutNodes(layer, nodeEls);
    setTimeout(function() { showLines(svg, layer, nodeEls); }, 350);


    var params = new URLSearchParams(window.location.search);
    var charId = (params.get("char") || "").toLowerCase();
    if (charId) {
      var idx = data.findIndex(function(c) { return c.id === charId; });
      if (idx >= 0) setTimeout(function() { modal.open(data[idx]); }, 400);
    }
  });

  var resizeTimer;
  window.addEventListener("resize", function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      layoutNodes(layer, nodeEls);
      if (svg.classList.contains("constellation-lines-visible")) {
        drawConnections(svg, layer, nodeEls);
        setSvgSize(svg);
      }
    }, 120);
  });

  window.addEventListener("pageshow", function(event) {
    if (event.persisted) {
      document.body.classList.remove("transitioning");
      if (svg.classList.contains("constellation-lines-visible"))
        drawConnections(svg, layer, nodeEls);
    }
  });
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot);
else
  boot();
