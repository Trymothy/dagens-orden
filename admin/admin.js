// ============================================================
//  DAGENS ORDEN — Admin Panel
//  GitHub-backed CMS: reads/writes data/articles.json
// ============================================================

// ── State ──────────────────────────────────────────────────

let STATE = {
  token:    null,
  owner:    null,
  repo:     null,
  fileSHA:  null,   // SHA of articles.json needed for GitHub PUT
  data:     null,   // { articles: [], submissions: [] }
  editingId: null,  // ID of article being edited (null = new)
};

// ── Bootstrap ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Restore session
  const saved = sessionStorage.getItem('do_session');
  if (saved) {
    const s = JSON.parse(saved);
    STATE.token = s.token;
    STATE.owner = s.owner;
    STATE.repo  = s.repo;
    showApp();
    loadData();
  }

  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); switchView(el.dataset.view); });
  });
  document.querySelectorAll('[data-view]').forEach(el => {
    if (!el.classList.contains('nav-item')) {
      el.addEventListener('click', () => switchView(el.dataset.view));
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Editor save/publish
  document.getElementById('save-draft-btn').addEventListener('click', () => saveArticle('draft'));
  document.getElementById('publish-btn').addEventListener('click',    () => saveArticle('published'));

  // Image colour preview
  document.getElementById('ed-imagecolor').addEventListener('change', updateColorPreview);

  // Filters
  document.getElementById('filter-status').addEventListener('change',   renderArticleTable);
  document.getElementById('filter-category').addEventListener('change', renderArticleTable);
});

// ── Auth ───────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const repoInput  = document.getElementById('repo-input').value.trim();
  const tokenInput = document.getElementById('token-input').value.trim();
  const errEl      = document.getElementById('login-error');
  const btn        = document.getElementById('login-btn');

  if (!repoInput.includes('/')) {
    showLoginError('Skriv inn repo-navn på formatet bruker/repo'); return;
  }

  const [owner, repo] = repoInput.split('/');
  btn.textContent = 'Logger inn…';
  btn.disabled = true;
  errEl.style.display = 'none';

  try {
    // Verify token by fetching user info
    const userRes = await ghFetch('https://api.github.com/user', tokenInput);
    if (!userRes.ok) throw new Error('Ugyldig token eller ingen tilgang.');

    STATE.token = tokenInput;
    STATE.owner = owner;
    STATE.repo  = repo;

    sessionStorage.setItem('do_session', JSON.stringify({ token: tokenInput, owner, repo }));
    showApp();
    await loadData();
  } catch (err) {
    showLoginError(err.message || 'Pålogging mislyktes.');
  } finally {
    btn.textContent = 'Logg inn';
    btn.disabled = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function logout() {
  sessionStorage.removeItem('do_session');
  STATE = { token: null, owner: null, repo: null, fileSHA: null, data: null, editingId: null };
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'grid';
}

// ── GitHub API ─────────────────────────────────────────────

function ghFetch(url, token, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token || STATE.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function contentsUrl() {
  return `https://api.github.com/repos/${STATE.owner}/${STATE.repo}/contents/data/articles.json`;
}

async function loadData() {
  showSpinner('Laster data…');
  try {
    const res = await ghFetch(contentsUrl());
    if (!res.ok) {
      if (res.status === 404) {
        // File doesn't exist yet — start fresh
        STATE.data = { articles: [], submissions: [] };
        STATE.fileSHA = null;
      } else {
        throw new Error(`GitHub svarte med ${res.status}`);
      }
    } else {
      const file = await res.json();
      STATE.fileSHA = file.sha;
      STATE.data = JSON.parse(decodeBase64Unicode(file.content));
    }

    // Fetch authenticated user for sidebar display
    try {
      const userRes = await ghFetch('https://api.github.com/user');
      const user = await userRes.json();
      document.getElementById('sidebar-user').textContent = `@${user.login}`;
    } catch { /* non-fatal */ }

    renderDashboard();
    renderArticleTable();
    renderSubmissions();
    updateSubmissionBadge();
  } catch (err) {
    alert('Kunne ikke laste data: ' + err.message);
  } finally {
    hideSpinner();
  }
}

async function persistData(commitMessage) {
  const content = encodeBase64Unicode(JSON.stringify(STATE.data, null, 2));
  const body = { message: commitMessage, content };
  if (STATE.fileSHA) body.sha = STATE.fileSHA;

  const res = await ghFetch(contentsUrl(), null, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub svarte med ${res.status}`);
  }

  const result = await res.json();
  STATE.fileSHA = result.content.sha;
}

// ── Views ──────────────────────────────────────────────────

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewId = `view-${name}`;
  const viewEl = document.getElementById(viewId);
  if (viewEl) viewEl.style.display = 'block';

  const navEl = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (navEl) navEl.classList.add('active');

  if (name === 'new-article' && !STATE.editingId) resetEditor();
}

// ── Dashboard ──────────────────────────────────────────────

function renderDashboard() {
  if (!STATE.data) return;
  const { articles, submissions } = STATE.data;

  const published = articles.filter(a => a.status === 'published').length;
  const drafts    = articles.filter(a => a.status === 'draft').length;
  const pending   = (submissions || []).filter(s => s.status === 'pending').length;

  document.getElementById('stat-published').textContent   = published;
  document.getElementById('stat-drafts').textContent      = drafts;
  document.getElementById('stat-submissions').textContent = pending;

  const recent = [...articles]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 5);

  document.getElementById('recent-articles').innerHTML = recent.length
    ? recent.map(a => `
        <div class="recent-row">
          <span class="recent-title">${a.title}</span>
          <span class="recent-meta">
            <span>${a.category}</span>
            <span><span class="status-pill status-${a.status}">${a.status === 'published' ? 'Publisert' : 'Utkast'}</span></span>
          </span>
        </div>`).join('')
    : '<p class="empty-state">Ingen artikler ennå.</p>';
}

// ── Article table ──────────────────────────────────────────

function renderArticleTable() {
  if (!STATE.data) return;
  const statusFilter   = document.getElementById('filter-status').value;
  const categoryFilter = document.getElementById('filter-category').value;

  let articles = [...STATE.data.articles]
    .filter(a => !statusFilter   || a.status === statusFilter)
    .filter(a => !categoryFilter || a.category === categoryFilter)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const tbody = document.getElementById('article-table-body');
  tbody.innerHTML = articles.length
    ? articles.map(a => `
        <tr>
          <td class="title-cell" title="${a.title}">${a.title}</td>
          <td>${a.category}</td>
          <td><span class="status-pill status-${a.status}">${a.status === 'published' ? 'Publisert' : 'Utkast'}</span></td>
          <td>${a.featured ? `<span class="featured-pill">${featuredLabel(a.featured)}</span>` : '—'}</td>
          <td>${formatDate(a.publishedAt)}</td>
          <td class="td-actions">
            <button class="btn-edit" onclick="editArticle('${a.id}')">Rediger</button>
            <button class="btn-danger" onclick="deleteArticle('${a.id}')">Slett</button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="empty-state">Ingen artikler funnet.</td></tr>';
}

function featuredLabel(f) {
  return f === 'hero' ? 'Heltearitikkel' : f === 'featured' ? 'Fremhevet' : f;
}

// ── Editor ─────────────────────────────────────────────────

function resetEditor() {
  STATE.editingId = null;
  document.getElementById('editor-heading').textContent = 'Ny artikkel';
  document.getElementById('ed-title').value      = '';
  document.getElementById('ed-excerpt').value    = '';
  document.getElementById('ed-body').value       = '';
  document.getElementById('ed-lens').value       = '';
  document.getElementById('ed-author').value     = 'Redaksjonen';
  document.getElementById('ed-readtime').value   = '8';
  document.getElementById('ed-category').value   = 'Ordenen';
  document.getElementById('ed-imagecolor').value = 'img-dark';
  document.getElementById('ed-featured').value   = '';
  document.getElementById('ed-id-group').style.display = 'none';
  document.getElementById('editor-feedback').style.display = 'none';
  updateColorPreview();
}

function editArticle(id) {
  const article = STATE.data.articles.find(a => a.id === id);
  if (!article) return;

  STATE.editingId = id;
  document.getElementById('editor-heading').textContent = 'Rediger artikkel';
  document.getElementById('ed-title').value      = article.title;
  document.getElementById('ed-excerpt').value    = article.excerpt;
  document.getElementById('ed-body').value       = article.body || '';
  document.getElementById('ed-lens').value       = article.lens || '';
  document.getElementById('ed-author').value     = article.author || 'Redaksjonen';
  document.getElementById('ed-readtime').value   = article.readTime || 8;
  document.getElementById('ed-category').value   = article.category;
  document.getElementById('ed-imagecolor').value = article.imageColor || 'img-dark';
  document.getElementById('ed-featured').value   = article.featured || '';
  document.getElementById('ed-id').value         = article.id;
  document.getElementById('ed-id-group').style.display = 'block';
  document.getElementById('editor-feedback').style.display = 'none';
  updateColorPreview();
  switchView('new-article');
}

function updateColorPreview() {
  const val = document.getElementById('ed-imagecolor').value;
  const box = document.getElementById('color-preview-box');
  box.className = `img-preview ${val}`;
}

async function saveArticle(status) {
  const title    = document.getElementById('ed-title').value.trim();
  const excerpt  = document.getElementById('ed-excerpt').value.trim();
  const body     = document.getElementById('ed-body').value.trim();
  const lens     = document.getElementById('ed-lens').value.trim();
  const author   = document.getElementById('ed-author').value.trim() || 'Redaksjonen';
  const readTime = parseInt(document.getElementById('ed-readtime').value) || 8;
  const category = document.getElementById('ed-category').value;
  const imgColor = document.getElementById('ed-imagecolor').value;
  const featured = document.getElementById('ed-featured').value || null;

  if (!title) { showEditorFeedback('Tittelen kan ikke være tom.', 'error'); return; }
  if (!excerpt) { showEditorFeedback('Ingressen kan ikke være tom.', 'error'); return; }

  const id = STATE.editingId || slugify(title);
  const now = new Date().toISOString();

  const article = {
    id, status, featured,
    title, category, lens, excerpt,
    body: body || '<p>Artikkelen er under utarbeidelse.</p>',
    author, readTime, imageColor: imgColor,
    publishedAt: now
  };

  showSpinner(status === 'published' ? 'Publiserer…' : 'Lagrer utkast…');

  try {
    if (STATE.editingId) {
      const idx = STATE.data.articles.findIndex(a => a.id === STATE.editingId);
      if (idx >= 0) {
        article.publishedAt = STATE.data.articles[idx].publishedAt;
        if (status === 'published' && STATE.data.articles[idx].status === 'draft') {
          article.publishedAt = now;
        }
        STATE.data.articles[idx] = article;
      }
    } else {
      STATE.data.articles.unshift(article);
    }

    STATE.data.lastUpdated = now;
    await persistData(`${status === 'published' ? 'Publiser' : 'Utkast'}: ${title}`);

    showEditorFeedback(
      status === 'published' ? '✓ Artikkelen er publisert.' : '✓ Utkast lagret.',
      'success'
    );
    STATE.editingId = null;
    renderDashboard();
    renderArticleTable();
  } catch (err) {
    showEditorFeedback('Feil: ' + err.message, 'error');
  } finally {
    hideSpinner();
  }
}

function showEditorFeedback(msg, type) {
  const el = document.getElementById('editor-feedback');
  el.textContent = msg;
  el.className = `feedback-msg ${type}`;
  el.style.display = 'block';
}

async function deleteArticle(id) {
  const article = STATE.data.articles.find(a => a.id === id);
  if (!article) return;
  if (!confirm(`Slett "${article.title}"? Dette kan ikke angres.`)) return;

  showSpinner('Sletter…');
  try {
    STATE.data.articles = STATE.data.articles.filter(a => a.id !== id);
    STATE.data.lastUpdated = new Date().toISOString();
    await persistData(`Slett artikkel: ${article.title}`);
    renderDashboard();
    renderArticleTable();
  } catch (err) {
    alert('Sletting mislyktes: ' + err.message);
  } finally {
    hideSpinner();
  }
}

// ── Submissions ────────────────────────────────────────────

function renderSubmissions() {
  if (!STATE.data) return;
  const subs = STATE.data.submissions || [];
  const el   = document.getElementById('submissions-list');

  el.innerHTML = subs.length
    ? subs.map(s => `
        <div class="submission-card">
          <div class="submission-header">
            <h4>${s.title || '(Uten tittel)'}</h4>
            <span class="status-pill status-${s.status === 'pending' ? 'draft' : 'published'}">${s.status === 'pending' ? 'Venter' : 'Behandlet'}</span>
          </div>
          <div class="submission-meta">
            Fra: <strong>${s.name || 'Ukjent'}</strong>
            ${s.email ? `&lt;${s.email}&gt;` : ''}
            · ${formatDate(s.submittedAt)}
          </div>
          <div class="submission-excerpt">${(s.excerpt || s.body || '').substring(0, 300)}…</div>
          <div class="submission-actions">
            <button class="btn-edit" onclick="importSubmission('${s.id}')">Importer til editor</button>
            <button class="btn-danger" onclick="dismissSubmission('${s.id}')">Avvis</button>
          </div>
        </div>`).join('')
    : '<p class="empty-state">Ingen innsendte artikler ennå.</p>';
}

function importSubmission(id) {
  const sub = (STATE.data.submissions || []).find(s => s.id === id);
  if (!sub) return;
  resetEditor();
  document.getElementById('ed-title').value   = sub.title || '';
  document.getElementById('ed-excerpt').value = sub.excerpt || '';
  document.getElementById('ed-body').value    = sub.body || '';
  document.getElementById('ed-author').value  = sub.name || 'Bidragsyter';
  switchView('new-article');
}

async function dismissSubmission(id) {
  if (!confirm('Merk innsendingen som behandlet?')) return;
  const sub = (STATE.data.submissions || []).find(s => s.id === id);
  if (sub) sub.status = 'dismissed';
  showSpinner('Lagrer…');
  try {
    await persistData('Avvis innsendt artikkel');
    renderSubmissions();
    updateSubmissionBadge();
  } finally {
    hideSpinner();
  }
}

function updateSubmissionBadge() {
  const pending = (STATE.data?.submissions || []).filter(s => s.status === 'pending').length;
  const badge = document.getElementById('submission-badge');
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// ── Spinner ────────────────────────────────────────────────

function showSpinner(msg) {
  document.getElementById('spinner-msg').textContent = msg || 'Laster…';
  document.getElementById('global-spinner').style.display = 'block';
}

function hideSpinner() {
  document.getElementById('global-spinner').style.display = 'none';
}

// ── Utilities ──────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function decodeBase64Unicode(b64) {
  return decodeURIComponent(
    atob(b64.replace(/\s/g, ''))
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

function encodeBase64Unicode(str) {
  return btoa(
    encodeURIComponent(str)
      .replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
  );
}
