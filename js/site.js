// ============================================================
//  DAGENS ORDEN — Homepage renderer
//  Fetches articles.json from GitHub and populates the page.
// ============================================================

(async function () {
  const cfg = window.DO_CONFIG;
  if (!cfg || cfg.githubOwner === 'YOUR_GITHUB_USERNAME') {
    // Config not set — leave the static placeholder content as-is
    return;
  }

  const url =
    `https://raw.githubusercontent.com/${cfg.githubOwner}/${cfg.githubRepo}` +
    `/${cfg.branch}/${cfg.dataFile}?t=${Date.now()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const published = data.articles
      .filter(a => a.status === 'published')
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const hero     = published.find(a => a.featured === 'hero') || published[0];
    const featured = published.filter(a => a.featured === 'featured').slice(0, 3);
    const rest     = published.filter(a => !a.featured);

    renderHero(hero);
    renderFeatured(featured);
    renderCategories(rest);
  } catch (err) {
    console.warn('Dagens Orden: Could not load articles from GitHub.', err);
    // Static fallback content remains visible
  }
})();

// ── Helpers ──────────────────────────────────────────────────

function articleUrl(id) {
  return `article.html?id=${id}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('no-NO', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── Hero ─────────────────────────────────────────────────────

function renderHero(a) {
  const el = document.getElementById('hero-inner');
  if (!el || !a) return;
  el.innerHTML = `
    <div class="hero-content">
      <div class="article-meta">
        <span class="category-tag">${a.category}</span>
        <span class="lens-label">Analysert gjennom ${a.lens}</span>
      </div>
      <h2 class="hero-title">
        <a href="${articleUrl(a.id)}">${a.title}</a>
      </h2>
      <p class="hero-excerpt">${a.excerpt}</p>
      <div class="byline-row">
        <span class="byline">Av ${a.author}</span>
        <span class="read-time">${a.readTime} minutters lesing</span>
      </div>
    </div>
    <div class="hero-image">
      <a href="${articleUrl(a.id)}">
        ${a.image
          ? `<div class="art-img"><img src="${a.image}" alt="${a.title}" loading="lazy"><span class="img-caption-overlay">${a.category}</span></div>`
          : `<div class="img-placeholder ${a.imageColor}"><span class="img-caption-overlay">${a.category}</span></div>`}
      </a>
    </div>`;
}

// ── Featured 3-column grid ────────────────────────────────────

function renderFeatured(articles) {
  const el = document.getElementById('featured-grid');
  if (!el || !articles.length) return;
  el.innerHTML = articles.map((a, i) => `
    <article class="feat-card${i === 1 ? ' feat-card-mid' : ''}">
      <a href="${articleUrl(a.id)}">
        <div class="feat-image">
          ${a.image
            ? `<div class="art-img"><img src="${a.image}" alt="${a.title}" loading="lazy"></div>`
            : `<div class="img-placeholder ${a.imageColor}"></div>`}
        </div>
      </a>
      <div class="feat-content">
        <span class="category-tag">${a.category}</span>
        <h3><a href="${articleUrl(a.id)}">${a.title}</a></h3>
        <p class="feat-excerpt">${a.excerpt}</p>
        <div class="byline-row">
          <span class="byline">Av ${a.author}</span>
          <span class="read-time">${a.readTime} min</span>
        </div>
      </div>
    </article>`).join('');
}

// ── Category sections ─────────────────────────────────────────

function renderCategories(articles) {
  document.querySelectorAll('.cat-section[data-category]').forEach(section => {
    const cat  = section.dataset.category;
    const list = section.querySelector('.article-list');
    if (!list) return;

    const items = articles.filter(a => a.category === cat).slice(0, 3);
    if (!items.length) return;

    list.innerHTML = items.map(a => `
      <article class="list-article">
        <a href="${articleUrl(a.id)}" class="list-thumb">
          ${a.image
            ? `<div class="art-img"><img src="${a.image}" alt="${a.title}" loading="lazy"></div>`
            : `<div class="img-placeholder ${a.imageColor}"></div>`}
        </a>
        <div class="list-content">
          <span class="category-tag">${a.category}</span>
          <h3><a href="${articleUrl(a.id)}">${a.title}</a></h3>
          <p>${a.excerpt}</p>
          <div class="byline-row">
            <span class="lens-tag">${a.lens}</span>
            <span class="read-time">${a.readTime} min</span>
          </div>
        </div>
      </article>`).join('');
  });
}
