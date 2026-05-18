/* ═══════════════════════════════════════
   EFFECTS — Particles + Mouse Glow + Banner + Skeleton
   ═══════════════════════════════════════ */

// ── Canvas Particle System ──────────
let rafId = null;
export function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  const isMobile = window.innerWidth < 768;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ★ Reduce particles on mobile for performance
  const divisor = isMobile ? 40000 : 15000;
  const count = Math.min(isMobile ? 20 : 60, Math.floor((w * h) / divisor));
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
      r: Math.random() * 1.4 + .3,
      alpha: Math.random() * .4 + .1,
      hue: Math.random() > .5 ? 270 : 250,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},70%,65%,${p.alpha})`;
      ctx.fill();
    }
    // ★ Skip N² distance lines on mobile
    if (!isMobile) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(168,85,247,${.04 * (1 - dist / 100)})`;
            ctx.lineWidth = .5;
            ctx.stroke();
          }
        }
      }
    }
    rafId = requestAnimationFrame(draw);
  }
  draw();

  // ★ Pause when tab hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      if (!rafId) draw();
    }
  });
}

// ── Mouse Glow Effect ──────────────
export function initMouseGlow() {
  const glow = document.getElementById('mouseGlow');
  if (!glow) return;
  let ticking = false;
  document.addEventListener('mousemove', (e) => {
    if (!ticking) {
      requestAnimationFrame(() => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
        glow.style.opacity = '1';
        ticking = false;
      });
      ticking = true;
    }
  });
  document.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });
}

// ── Skeleton Loading ────────────────
export function showSkeleton() {
  const grid = document.getElementById('skeletonGrid');
  if (!grid) return;
  const heights = [180, 240, 160, 280, 200, 220, 170, 260, 190, 210, 250, 180];
  grid.style.display = '';
  grid.innerHTML = heights.map(h => `
    <div class="skeleton-card">
      <div class="skeleton-img" style="height:${h}px"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text short"></div>
    </div>
  `).join('');
  document.getElementById('gallery').style.display = 'none';
}

export function hideSkeleton() {
  const grid = document.getElementById('skeletonGrid');
  if (grid) grid.style.display = 'none';
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.style.display = '';
}

// ── Banner Carousel ────────────────
let bannerTimer = null, bannerIdx = 0;
export async function initBanners() {
  const section = document.getElementById('bannerSection');
  try {
    const res = await fetch('/api/admin/banners');
    const banners = await res.json();
    const active = (banners || []).filter(b => b.is_active);
    if (!active.length) { section.style.display = 'none'; return; }
    section.style.display = '';

    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    track.innerHTML = active.map(b => `
      <a class="banner-slide" href="${b.link_url || '#'}" target="${b.link_url ? '_self' : '_self'}">
        <img src="${b.image_url}" alt="${b.title}" loading="lazy" />
        ${b.title ? `<div class="banner-info"><h3>${b.title}</h3></div>` : ''}
      </a>
    `).join('');
    dots.innerHTML = active.map((_, i) => `<span class="banner-dot${i===0?' active':''}" data-i="${i}"></span>`).join('');

    function goTo(i) {
      bannerIdx = (i + active.length) % active.length;
      track.style.transform = `translateX(-${bannerIdx * 100}%)`;
      dots.querySelectorAll('.banner-dot').forEach((d, j) => d.classList.toggle('active', j === bannerIdx));
    }

    document.getElementById('bannerPrev').addEventListener('click', () => { goTo(bannerIdx - 1); resetTimer(); });
    document.getElementById('bannerNext').addEventListener('click', () => { goTo(bannerIdx + 1); resetTimer(); });
    dots.addEventListener('click', (e) => {
      const dot = e.target.closest('.banner-dot');
      if (dot) { goTo(parseInt(dot.dataset.i)); resetTimer(); }
    });

    function resetTimer() { clearInterval(bannerTimer); bannerTimer = setInterval(() => goTo(bannerIdx + 1), 5000); }
    resetTimer();
  } catch { section.style.display = 'none'; }
}

// ── Featured Wallpapers ──────────────
export async function initFeatured() {
  const section = document.getElementById('featuredSection');
  try {
    const res = await fetch('/api/photos?sort=popular&per_page=8');
    const data = await res.json();
    const photos = (data.photos || []).slice(0, 4);
    if (!photos.length) { section.style.display = 'none'; return; }
    section.style.display = '';

    document.getElementById('featuredGrid').innerHTML = photos.map((p, i) => {
      let src = p.url || '/uploads/' + p.filename;
      if (src.includes('cloudinary.com') && src.includes('/upload/')) {
        src = src.replace('/upload/', '/upload/w_600,c_scale,q_auto,f_auto/');
      } else if (p.thumbnail && p.thumbnail.startsWith('http')) {
        src = p.thumbnail;
      } else if (p.thumbnail) {
        src = '/uploads/thumbs/' + p.thumbnail;
      }
      return `
        <a href="/wallpaper.html?id=${p.id}" class="featured-card">
          <span class="fc-badge">#${i + 1} 推荐</span>
          <img src="${src}" alt="${p.title || p.original_name}" loading="lazy" />
          <div class="fc-info">
            <h4>${p.title || p.original_name}</h4>
            <span>${p.width}×${p.height} · ⬇ ${p.download_count || 0}</span>
          </div>
        </a>`;
    }).join('');
  } catch { section.style.display = 'none'; }
}

// ── Trending Tags ────────────────────
export async function initTrendingTags() {
  const container = document.getElementById('heroTags');
  try {
    const res = await fetch('/api/tags/trending');
    const data = await res.json();
    const tags = data.tags || [];
    if (!tags.length) return;
    container.innerHTML = tags.map(t =>
      `<a href="/?search=${encodeURIComponent(t.name)}" class="hero-tag">${t.name}<span style="font-size:.64rem;opacity:.5;margin-left:3px">${t.count}</span></a>`
    ).join('');
  } catch (e) { console.error('[trendingTags]', e); }
}
