(function () {
  let issueIndex = -1;
  let escCount = 0;
  let searchIndex = -1;
  let keyBuffer = '';
  let keyTimer = null;
  let overlay;
  let isHelpOpen = false;
  let statusPalette;
  let recentPalette;
  let searchContextRequest;

  const isTyping = (el) =>
    el?.matches?.('input, textarea, select, [contenteditable="true"]');

  const click = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  const getProject = () => {
    const m = document.body.className.match(/project-([a-zA-Z0-9_-]+)/);
    return m && m[1];
  };

  const isIssueList = () => document.body.matches(
    '.controller-issues.action-index, .controller-welcome.action-index'
  );
  const isIssueDetailPage = () =>
    /^\/issues\/\d+$/.test(window.location.pathname);
  const isSearchResultPage = () => document.getElementById('search-results');


  const style = document.createElement('style');
  style.textContent = `
    @media screen and (min-width: 900px) {
      body:is(.controller-welcome.action-index, .controller-issues.action-index) #content table.issues > tbody > tr.issue.kbd-selected > td {
        border-radius: 0 !important;
      }
      body:is(.controller-welcome.action-index, .controller-issues.action-index) #content table.issues > tbody > tr.issue.kbd-selected > td {
        background-color: #f3f7ff !important;
        border-left: 0 !important;
        box-shadow: none !important;
      }
    }

  `;
  document.head.appendChild(style);

  function getRows(type) {
    if (type === 'issue') {
      if (!isIssueList()) return [];

      const selector = document.body.matches('.controller-welcome.action-index')
        ? '#my-page .block-issuequery table.issues tbody > tr.issue'
        : '#content table.issues tbody > tr.issue';

      return Array.from(document.querySelectorAll(selector))
        .filter(tr => tr.querySelector('a[href^="/issues/"]'))
        .filter(tr => tr.getClientRects().length > 0);
    }
    if (type === 'search') {
      const dl = document.getElementById('search-results');
      return dl
        ? Array.from(dl.querySelectorAll('dt')).filter(dt => dt.querySelector('a[href]'))
        : [];
    }
    return [];
  }

  function highlightRow(type, index) {
    getRows(type).forEach((row, i) => {
      const selected = i === index;
      row.classList.toggle('kbd-selected', selected);
      if (type === 'search') {
        const detail = row.nextElementSibling;
        if (detail?.tagName === 'DD') detail.classList.toggle('kbd-selected', selected);
      }
    });
  }

  function moveRow(type, index, delta) {
    const rows = getRows(type);
    if (!rows.length) return index;

    if (index === -1) {
      index = delta > 0 ? 0 : rows.length - 1;
    } else {
      index = Math.max(0, Math.min(rows.length - 1, index + delta));
    }

    highlightRow(type, index);
    rows[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return index;
  }

  function goUpOneLevel() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (!parts.length) return;

    parts.pop();
    window.location.href = parts.length ? `/${parts.join('/')}` : '/';
  }

  function submitIssueForm() {
    const form = document.getElementById('issue-form') ||
                 document.querySelector('form#issue-form') ||
                 document.querySelector('form.edit_issue');

    if (form) {
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  }

  function setupReplyShortcut() {
    if (!isIssueDetailPage() && !document.getElementById('issue_notes')) return;

    const editButton = document.querySelector('#content > .contextual a.icon-edit');
    if (!editButton) return;

    const beforeAssignedTo = $('#issue_assigned_to_id').val();

    function doReply() {
      let replyTo;
      if (typeof ViewCustomize !== 'undefined' &&
          ViewCustomize.context?.issue?.lastUpdatedBy) {
        replyTo = ViewCustomize.context.issue.lastUpdatedBy.id;
      } else if (typeof ViewCustomize !== 'undefined' &&
                 ViewCustomize.context?.issue?.author) {
        replyTo = ViewCustomize.context.issue.author.id;
      }

      if (replyTo) {
        $('#issue_assigned_to_id').val(replyTo);
      }

      if (typeof showAndScrollTo === 'function') {
        showAndScrollTo('update', 'issue_notes');
      }
    }


    $(editButton).on('click', function() {
      $('#issue_assigned_to_id').val(beforeAssignedTo);
    });

    window.doReplyAction = doReply;
  }

  $(document).ready(function() {
    if (document.querySelector('#content > .contextual a.icon-edit')) {
      setupReplyShortcut();
    }
  });

  function currentIssueLink() {
    const rows = getRows('issue');
    return issueIndex >= 0 ? rows[issueIndex]?.querySelector('a[href^="/issues/"]') : null;
  }

  function openIssue() {
    const rows = getRows('issue');
    if (!rows.length) return;

    const checkedIds = rows
      .map(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        const link = row.querySelector('a[href^="/issues/"]');
        if (cb?.checked && link) {
          const m = link.href.match(/\/issues\/(\d+)/);
          return m?.[1];
        }
      })
      .filter(Boolean);

    if (checkedIds.length >= 2) {
      location.href = `/issues/bulk_edit?${checkedIds.map(id => `ids[]=${id}`).join('&')}`;
      return;
    }

    const targetRow = checkedIds.length === 1
      ? rows.find(row => row.querySelector('input[type="checkbox"]')?.checked)
      : issueIndex >= 0 ? rows[issueIndex] : null;

    const link = targetRow?.querySelector('a[href^="/issues/"]');
    if (link) location.href = link.href;
  }

  function toggleIssueCheckbox() {
    const rows = getRows('issue');
    if (!rows.length) return;

    if (issueIndex === -1) {
      issueIndex = 0;
      highlightRow('issue', 0);
      rows[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    rows[issueIndex].querySelector('input[type="checkbox"]')?.click();
  }

  function clearIssueSelection(full = false) {
    issueIndex = -1;
    highlightRow('issue', -1);

    if (full) {
      getRows('issue').forEach(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        if (cb?.checked) cb.click();
      });
    }
  }

  function currentSearchLink() {
    const row = getRows('search')[searchIndex];
    if (!row) return null;

    if (row.classList.contains('project')) {
      return row.querySelector('a[href^="/projects/"]');
    }

    const selectors = [
      'a[href^="/attachments/"]',
      'a[href*="/wiki/"]',
      'a[href*="/repository/"]',
      'a.act-title[href^="/issues/"]',
      'a[href^="/issues/"]',
    ];

    for (const sel of selectors) {
      const link = row.querySelector(sel);
      if (link) return link;
    }

    return [...row.querySelectorAll('a[href]')]
      .filter(a => !a.closest('.project'))
      .at(-1) || null;
  }

  function clickDescToggle() {
    const el = document.getElementById('fast-desc-link') ||
               document.querySelector('a.icon-edit[onclick*="issue_description_and_toolbar"]') ||
               document.querySelector('.issue .description .contextual a.icon-edit');
    return el ? (click(el), true) : false;
  }

  function waitAndClickDescToggle() {
    return new Promise((resolve) => {
      if (clickDescToggle()) return resolve();

      const obs = new MutationObserver(() => {
        if (clickDescToggle()) {
          obs.disconnect();
          resolve();
        }
      });

      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        obs.disconnect();
        resolve();
      }, 1500);
    });
  }

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'shortcut-overlay';
    overlay.className = 'zenmine-shortcut-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;' +
      'background:rgba(0,0,0,.55);display:none;' +
      'align-items:center;justify-content:center;' +
      'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)';

    const modal = document.createElement('div');
    modal.className = 'zenmine-shortcut-modal';
    modal.style.cssText =
      'background:#fff;color:#222;padding:24px 28px;' +
      'border-radius:10px;min-width:520px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px';

    const userLanguage = navigator.language || navigator.userLanguage;
    const lang = userLanguage.startsWith('ja') ? 'ja' :
                 userLanguage.startsWith('fr') ? 'fr' : 'en';

    const i18n = {
      ja: {
        title: 'キーボードショートカット',
        subtitle: 'W.A.Cをより速く、快適に操作するためのショートカット一覧です。',
        navigationGroup: 'ナビゲーション',
        projectGroup: 'チケット・プロジェクト',
        issueGroup: 'チケット操作',
        selectionGroup: '選択・プレビュー',
        otherGroup: 'その他',
        hintTitle: '使い方のヒント',
        hintText: '一覧で j / k で移動し、Space でクイックプレビュー。Enter で開くことで、スムーズに作業できます。',
        key: 'キー',
        action: 'アクション',
        home: 'ホームへ移動',
        myPage: 'マイページへ移動',
        back: '前のページへ戻る',
        forward: '次のページへ進む',
        up: '1つ上の階層へ移動',
        newIssue: '新しいチケット',
        search: '検索',
        projectJump: 'プロジェクトジャンプ',
        issueList: 'チケット一覧',
        activity: 'アクティビティ',
        wiki: 'Wiki',
        sidebar: 'サイドバーを開く / 閉じる',
        scrollTop: '最上へスクロール',
        scrollBottom: '最下へスクロール',
        reply: '返信（チケット詳細ページ）',
        status: 'ステータスを変更（カーソルのチケット / xで選択したチケット）<br>複数選択時は共通候補のみ',
        recent: '最近見たチケットを開く',
        edit: '編集 + 説明編集',
        copy: 'チケットをコピー',
        preview: 'プレビュー切替',
        submit: '送信（フォーム）',
        navigation: '選択移動（チケット / 検索結果）<br>チケット詳細ではスクロール',
        quickLook: 'クイックプレビュー表示 / 非表示',
        toggle: 'チケット選択 ON / OFF',
        open: 'チェック1件 → 開く<br>チェック2件以上 → 一括編集',
        newTab: 'タブで開く',
        escape: '選択解除（2回で全解除）<br>入力中はフォーカス解除',
        help: 'ヘルプ表示'
      },
      en: {
        title: 'Keyboard Shortcuts',
        subtitle: 'Shortcuts for faster, more comfortable W.A.C operation.',
        navigationGroup: 'Navigation',
        projectGroup: 'Issues · Projects',
        issueGroup: 'Issue actions',
        selectionGroup: 'Selection · Preview',
        otherGroup: 'Other',
        hintTitle: 'Tips',
        hintText: 'Use j / k to move, Space for Quick Preview, and Enter to open items smoothly.',
        key: 'Key',
        action: 'Action',
        home: 'Go to home',
        myPage: 'Go to my page',
        back: 'Go back',
        forward: 'Go forward',
        up: 'Go up one level',
        newIssue: 'Create new issue',
        search: 'Search',
        projectJump: 'Project jump',
        issueList: 'Go to issues list',
        activity: 'Go to activity',
        wiki: 'Go to Wiki',
        sidebar: 'Open / close sidebar',
        scrollTop: 'Scroll to top',
        scrollBottom: 'Scroll to bottom',
        reply: 'Reply (issue detail page)',
        status: 'Change status (cursor issue / x-selected issues)<br>Only common options appear for multiple issues',
        recent: 'Open recently viewed issues',
        edit: 'Edit issue + description',
        copy: 'Copy issue',
        preview: 'Toggle Edit/Preview',
        submit: 'Submit form',
        navigation: 'Navigate (issues / search results)<br>Scroll on issue detail pages',
        quickLook: 'Show / hide Quick Preview',
        toggle: 'Toggle issue selection',
        open: '1 checked → open<br>2+ checked → bulk edit',
        newTab: 'Open in new tab',
        escape: 'Clear selection (twice to uncheck all)<br>Blur input field when focused',
        help: 'Show help'
      },
      fr: {
        title: 'Raccourcis clavier',
        subtitle: 'Les raccourcis pour utiliser W.A.C plus rapidement et confortablement.',
        navigationGroup: 'Navigation',
        projectGroup: 'Demandes · Projets',
        issueGroup: 'Actions sur les demandes',
        selectionGroup: 'Sélection · Aperçu',
        otherGroup: 'Autres',
        hintTitle: 'Conseils',
        hintText: 'Utilisez j / k pour vous déplacer, Space pour l’aperçu et Enter pour ouvrir.',
        key: 'Touche',
        action: 'Action',
        home: 'Aller à l\'accueil',
        myPage: 'Aller à ma page',
        back: 'Retourner à la page précédente',
        forward: 'Avancer à la page suivante',
        up: 'Remonter d\'un niveau',
        newIssue: 'Créer une nouvelle demande',
        search: 'Rechercher',
        projectJump: 'Saut de projet',
        issueList: 'Liste des demandes',
        activity: 'Activité',
        wiki: 'Wiki',
        sidebar: 'Ouvrir / fermer la barre latérale',
        scrollTop: 'Défiler vers le haut',
        scrollBottom: 'Défiler vers le bas',
        reply: 'Répondre (page détail)',
        status: 'Changer le statut (demande sous le curseur / sélection)<br>Options communes uniquement en sélection multiple',
        recent: 'Ouvrir les demandes récemment consultées',
        edit: 'Éditer + description',
        copy: 'Copier la demande',
        preview: 'Basculer Édition/Aperçu',
        submit: 'Soumettre le formulaire',
        navigation: 'Naviguer (demandes / résultats)<br>Défiler sur les pages de détail',
        quickLook: 'Afficher / masquer l’aperçu rapide',
        toggle: 'Sélectionner/désélectionner (x)',
        open: '1 cochée → ouvrir<br>2+ cochées → édition en masse',
        newTab: 'Ouvrir dans un nouvel onglet',
        escape: 'Effacer la sélection (2× pour tout décocher)<br>Perdre le focus en saisie',
        help: 'Afficher l\'aide'
      }
    };

    const t = i18n[lang];

    modal.innerHTML = `
      <header class="zenmine-shortcut-header">
        <div class="zenmine-shortcut-icon" aria-hidden="true"></div>
        <div class="zenmine-shortcut-heading">
          <h2>${t.title}</h2>
          <p>${t.subtitle}</p>
        </div>
        <button type="button" class="zenmine-shortcut-close" aria-label="Close">×</button>
      </header>
      <div class="zenmine-shortcut-grid">
        <section class="zenmine-shortcut-card">
          <h3>${t.navigationGroup}</h3>
          <div class="zenmine-shortcut-row"><kbd>h</kbd><span>${t.home}</span></div>
          <div class="zenmine-shortcut-row"><kbd>m</kbd><span>${t.myPage}</span></div>
          <div class="zenmine-shortcut-row"><kbd>[</kbd><span>${t.back}</span></div>
          <div class="zenmine-shortcut-row"><kbd>]</kbd><span>${t.forward}</span></div>
          <div class="zenmine-shortcut-row"><kbd>^</kbd><span>${t.up}</span></div>
          <div class="zenmine-shortcut-row"><kbd>n</kbd><span>${t.newIssue}</span></div>
          <div class="zenmine-shortcut-row"><kbd>/</kbd><span>${t.search}</span></div>
        </section>
        <section class="zenmine-shortcut-card">
          <h3>${t.projectGroup}</h3>
          <div class="zenmine-shortcut-row"><kbd>p</kbd><span>${t.projectJump}</span></div>
          <div class="zenmine-shortcut-row"><kbd>i</kbd><span>${t.issueList}</span></div>
          <div class="zenmine-shortcut-row"><kbd>a</kbd><span>${t.activity}</span></div>
          <div class="zenmine-shortcut-row"><kbd>w</kbd><span>${t.wiki}</span></div>
          <div class="zenmine-shortcut-row"><kbd>l</kbd><span>${t.sidebar}</span></div>
          <div class="zenmine-shortcut-row"><kbd>gg</kbd><span>${t.scrollTop}</span></div>
          <div class="zenmine-shortcut-row"><kbd>G</kbd><span>${t.scrollBottom}</span></div>
        </section>
        <section class="zenmine-shortcut-card">
          <h3>${t.issueGroup}</h3>
          <div class="zenmine-shortcut-row"><kbd>r</kbd><span>${t.reply}</span></div>
          <div class="zenmine-shortcut-row"><kbd>s → a / s / d / f</kbd><span>${t.status}</span></div>
          <div class="zenmine-shortcut-row"><kbd>o → 1〜9</kbd><span>${t.recent}</span></div>
          <div class="zenmine-shortcut-row"><kbd>e</kbd><span>${t.edit}</span></div>
          <div class="zenmine-shortcut-row"><kbd>c</kbd><span>${t.copy}</span></div>
          <div class="zenmine-shortcut-row"><kbd>Shift + Enter</kbd><span>${t.preview}</span></div>
          <div class="zenmine-shortcut-row"><kbd>⌘ / Option + Enter</kbd><span>${t.submit}</span></div>
          <div class="zenmine-shortcut-row"><kbd>ZZ</kbd><span>${t.submit}</span></div>
        </section>
        <section class="zenmine-shortcut-card">
          <h3>${t.selectionGroup}</h3>
          <div class="zenmine-shortcut-row"><kbd>j / k</kbd><span>${t.navigation}</span></div>
          <div class="zenmine-shortcut-row"><kbd>Space</kbd><span>${t.quickLook}</span></div>
          <div class="zenmine-shortcut-row"><kbd>x</kbd><span>${t.toggle}</span></div>
          <div class="zenmine-shortcut-row"><kbd>Enter</kbd><span>${t.open}</span></div>
          <div class="zenmine-shortcut-row"><kbd>t</kbd><span>${t.newTab}</span></div>
          <div class="zenmine-shortcut-row"><kbd>Esc</kbd><span>${t.escape}</span></div>
        </section>
        <section class="zenmine-shortcut-card zenmine-shortcut-card-small">
          <h3>${t.otherGroup}</h3>
          <div class="zenmine-shortcut-row"><kbd>?</kbd><span>${t.help}</span></div>
        </section>
        <aside class="zenmine-shortcut-hint">
          <strong>${t.hintTitle}</strong>
          <span>${t.hintText}</span>
        </aside>
      </div>
    `;

    overlay.appendChild(modal);
    modal.querySelector('.zenmine-shortcut-close').addEventListener('click', closeHelp);
    document.body.appendChild(overlay);
  }

  function openHelp() {
    if (!overlay) buildOverlay();
    overlay.style.display = 'flex';
    isHelpOpen = true;
  }

  function closeHelp() {
    if (!overlay) return;
    overlay.style.display = 'none';
    isHelpOpen = false;
  }

  function closeStatusPalette() {
    if (!statusPalette) return;
    statusPalette.remove();
    statusPalette = null;
  }

  function closeRecentPalette() {
    if (!recentPalette) return;
    recentPalette.remove();
    recentPalette = null;
  }

  function setPaletteSelection(palette, selector, index) {
    if (!palette) return;
    const rows = Array.from(palette.querySelectorAll(selector));
    const visibleRows = rows.filter(row => !row.hidden);
    palette.dataset.selectedIndex = String(index);
    rows.forEach(row => {
      const selected = visibleRows[index] === row;
      row.classList.toggle('zenmine-palette-row-selected', selected);
      row.style.background = selected ? '#f5f5f5' : 'transparent';
      row.style.boxShadow = selected ? 'inset 5px 0 0 #5ac8a1' : 'none';
    });
  }

  function movePaletteSelection(palette, selector, delta) {
    const rows = Array.from(palette?.querySelectorAll(selector) || [])
      .filter(row => !row.hidden);
    if (!rows.length) return;

    const current = Number(palette.dataset.selectedIndex);
    const index = Number.isInteger(current) && current >= 0
      ? Math.max(0, Math.min(rows.length - 1, current + delta))
      : (delta > 0 ? 0 : rows.length - 1);
    setPaletteSelection(palette, selector, index);
  }

  function activatePaletteSelection(palette, selector) {
    const index = Number(palette?.dataset.selectedIndex);
    if (!Number.isInteger(index) || index < 0) return false;
    const row = Array.from(palette.querySelectorAll(selector))
      .filter(candidate => !candidate.hidden)[index];
    if (!row) return false;
    row.click();
    return true;
  }

  function selectedRecentIssueId() {
    const index = Number(recentPalette?.dataset.selectedIndex);
    return Array.from(recentPalette?.querySelectorAll('[data-recent-index]') || [])
      .filter(candidate => !candidate.hidden)[index]?.dataset.issueId;
  }

  function recentIssueSubject(issueId) {
    try {
      const issue = JSON.parse(localStorage.getItem('recentIssues') || '[]')
        .find(candidate => String(candidate?.ID) === String(issueId));
      return String(issue?.Str || '')
        .replace(new RegExp(`^#${issueId}\\s*[:：]?\\s*`), '')
        .trim();
    } catch (_error) {
      return '';
    }
  }

  function previewRecentPaletteSelection(toggle = true) {
    const issueId = selectedRecentIssueId();
    if (!issueId || typeof window.zenmineQuickLookIssue !== 'function') return false;

    const issueLink = document.createElement('a');
    issueLink.href = `/issues/${issueId}`;
    return window.zenmineQuickLookIssue(issueLink, toggle);
  }

  function closeNativeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.style.display = 'none';
    menu.querySelectorAll('ul').forEach(list => {
      list.style.display = '';
    });
  }

  function selectedIssueRows() {
    return getRows('issue').filter(row =>
      row.querySelector('input[type="checkbox"]')?.checked
    );
  }

  function statusTargetIssueRows() {
    const checkedRows = selectedIssueRows();
    if (checkedRows.length) return checkedRows;

    const rows = getRows('issue');
    const currentRow = rows[issueIndex];
    return currentRow ? [currentRow] : [];
  }

  function statusTargetIssueInfo() {
    const rows = isSearchResultPage()
      ? getRows('search').slice(searchIndex >= 0 ? searchIndex : 0, (searchIndex >= 0 ? searchIndex : 0) + 1)
      : statusTargetIssueRows();
    if (rows.length !== 1) return null;

    const row = rows[0];
    const link = row.querySelector('td.subject a') || row.querySelector('a[href*="/issues/"]');
    const issueId = link?.href.match(/\/issues\/(\d+)/)?.[1];
    if (!issueId) return null;
    return { issueId, subject: link.textContent.trim() };
  }

  function nativeStatusActions(menu) {
    if (!menu) return [];

    // Redmine's context menu puts each nested action group in a `.folder`.
    // Prefer structural markers over translated labels. The status group is
    // the folder whose submenu contains status-id actions.
    const folders = Array.from(menu.querySelectorAll(':scope > ul > li.folder'));
    const statusFolder = folders.find(folder => {
      const submenu = folder.querySelector(':scope > ul');
      return submenu?.querySelector(
        'a[href*="status_id"], a[data-status-id], [data-status-id]'
      );
    });

    if (!statusFolder) return [];

    return Array.from(statusFolder.querySelectorAll(':scope > ul > li > a'))
      .filter(link => !link.classList.contains('disabled') && !link.closest('.disabled'))
      .map(link => ({
        label: link.textContent.trim(),
        activate: () => link.click(),
      }))
      .filter(action => action.label);
  }

  function loadSearchContextMenu(issueId, issueSubject) {
    if (!issueId) {
      const target = statusTargetIssueInfo();
      issueId = target?.issueId;
      issueSubject = target?.subject;
    }
    if (!issueId || searchContextRequest) return Boolean(issueId);

    searchContextRequest = $.ajax({
      url: '/issues/context_menu',
      data: {
        authenticity_token: document.querySelector('meta[name="csrf-token"]')?.content || '',
        'ids[]': issueId,
        back_url: window.location.href,
        'c[]': ['id', 'status'],
      },
      success: data => {
        let menu = document.getElementById('context-menu');
        if (!menu) {
          menu = document.createElement('div');
          menu.id = 'context-menu';
          document.body.appendChild(menu);
        }
        menu.innerHTML = data;
        menu.style.display = 'none';
        searchContextRequest = null;
        openStatusPalette(10, issueId, issueSubject);
      },
      error: () => { searchContextRequest = null; },
    });
    return true;
  }

  function showNativeContextMenuForSelection() {
    const rows = statusTargetIssueRows();
    if (!rows.length) return false;

    // Redmine's context-menu plugin uses this class as its source of
    // selected issue IDs. Keep the checkbox selection and native selection
    // state in sync before asking Redmine to build the menu.
    rows.forEach(selectedRow => {
      selectedRow.classList.add('context-menu-selection');
      const checkbox = selectedRow.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
    });

    const row = issueIndex >= 0 && rows.includes(getRows('issue')[issueIndex])
      ? getRows('issue')[issueIndex]
      : rows[0];
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(window.innerWidth / 2),
      clientY: Math.round(window.innerHeight / 2),
    });
    row.dispatchEvent(event);
    return true;
  }

  function applyStatusAction(action) {
    closeStatusPalette();
    closeNativeContextMenu();
    action.activate();
  }

  function openStatusPalette(retry = 0, issueId, issueSubject) {
    if (statusPalette) return true;
    if (isIssueList() && !issueId && !statusTargetIssueRows().length) return false;

    const isSearchStatusTarget = Boolean(isSearchResultPage() || issueId);
    if (isSearchStatusTarget && retry === 0) {
      closeNativeContextMenu();
      loadSearchContextMenu(issueId, issueSubject);
      return true;
    }

    if (isIssueList() && retry === 0) {
      closeNativeContextMenu();
      showNativeContextMenuForSelection();
    }

    const menu = document.getElementById('context-menu');
    const actions = (isIssueList() || isSearchStatusTarget)
      ? nativeStatusActions(menu)
      : (() => {
          const field = document.getElementById('issue_status_id');
          if (!field || field.disabled) return [];
          return Array.from(field.options)
            .filter(option => option.value && !option.disabled)
            .slice(0, 4)
            .map(option => ({
              label: option.text,
              activate: () => {
                field.value = option.value;
                $(field).trigger('change');
                const form = field.form || document.getElementById('issue-form');
                if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
              },
            }));
        })();

    let unavailable = false;
    if (!actions.length) {
      closeNativeContextMenu();
      if (isIssueList() && retry < 10) {
        window.setTimeout(() => openStatusPalette(retry + 1), 50);
        return true;
      }
      unavailable = true;
    }

    const statusKeys = ['a', 's', 'd', 'f'];
    const options = actions.slice(0, statusKeys.length);
    closeNativeContextMenu();

    statusPalette = document.createElement('div');
    statusPalette.id = 'status-palette-overlay';
    statusPalette.className = 'zenmine-command-palette-overlay';
    statusPalette.setAttribute('role', 'dialog');
    statusPalette.setAttribute('aria-modal', 'true');
    statusPalette.setAttribute('aria-label', 'ステータスを変更');
    statusPalette.style.cssText =
      'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);display:flex;' +
      'align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.className = 'zenmine-command-palette';
    modal.style.cssText =
      'background:#fff;color:#222;padding:24px 28px;border-radius:10px;min-width:520px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px';

    const title = document.createElement('h2');
    title.className = 'zenmine-command-palette-title';
    title.textContent = 'ステータスを変更';
    title.style.cssText = 'margin:0 0 12px;font-size:18px';
    modal.appendChild(title);
    const targetInfo = issueId
      ? { issueId, subject: issueSubject || recentIssueSubject(issueId) }
      : statusTargetIssueInfo();
    if (targetInfo) {
      const target = document.createElement('p');
      target.className = 'zenmine-command-palette-target';
      target.textContent = `#${targetInfo.issueId}${targetInfo.subject ? ` — ${targetInfo.subject}` : ''}`;
      target.style.cssText = 'margin:-4px 0 14px;color:#555;font-size:14px;font-weight:600';
      modal.appendChild(target);
    }

    const hint = document.createElement('p');
    hint.className = 'zenmine-command-palette-hint';
    hint.textContent = unavailable
      ? '選択したチケットに共通して変更できるステータスがありません。'
      : 'J / Kで移動、Enterで選択。A / S / D / Fでも選択できます。Escで閉じます。';
    hint.style.cssText = unavailable
      ? 'display:block !important;margin:0 0 12px;color:#555;line-height:1.7'
      : 'margin:0 0 12px;color:#555';
    modal.appendChild(hint);

    const table = document.createElement('table');
    table.className = 'zenmine-command-palette-table';
    table.style.cssText = 'width:100%;border-collapse:collapse';
    table.innerHTML = '<tr><th align="left">キー</th><th align="left">ステータス</th></tr>';

    options.forEach((option, index) => {
      const row = document.createElement('tr');
      row.className = 'zenmine-command-palette-row';
      row.dataset.statusIndex = index;
      row.style.cursor = 'pointer';

      const key = document.createElement('td');
      const keyLabel = document.createElement('b');
      keyLabel.className = 'zenmine-command-palette-key-badge';
      keyLabel.textContent = statusKeys[index];
      keyLabel.style.cssText =
        'display:inline-flex;min-width:38px;height:38px;box-sizing:border-box;align-items:center;justify-content:center;' +
        'border-radius:10px;background:#f1efff;color:#6255db;font-size:16px;font-weight:700;line-height:1';
      key.appendChild(keyLabel);

      const label = document.createElement('td');
      label.textContent = option.label;
      const action = document.createElement('td');
      action.className = 'zenmine-command-palette-row-action';
      action.textContent = '↵';
      row.append(key, label, action);
      row.addEventListener('mouseenter', () => {
        if (!row.classList.contains('zenmine-palette-row-selected')) row.style.background = '#f5f5f5';
      });
      row.addEventListener('mouseleave', () => {
        if (!row.classList.contains('zenmine-palette-row-selected')) row.style.background = 'transparent';
      });
      row.addEventListener('click', () => applyStatusAction(option));
      table.appendChild(row);
    });
    if (!unavailable) modal.appendChild(table);

    statusPalette.addEventListener('click', event => {
      if (event.target === statusPalette) closeStatusPalette();
    });
    const footer = document.createElement('div');
    footer.className = 'zenmine-command-palette-footer';
    footer.innerHTML = unavailable
      ? '<span><b>esc</b> 閉じる</span>'
      : '<span><b>↑ K</b><b>↓ J</b></span><span><b>↵</b> 選択</span><span><b>esc</b> 閉じる</span>';
    modal.appendChild(footer);
    statusPalette.appendChild(modal);
    document.body.appendChild(statusPalette);
    setPaletteSelection(statusPalette, '[data-status-index]', 0);
    return true;
  }

  window.zenmineOpenStatusPalette = function(issueId, issueSubject) {
    return openStatusPalette(0, issueId, issueSubject);
  };

  function openRecentPalette() {
    if (recentPalette) return true;

    let issues;
    try {
      issues = JSON.parse(localStorage.getItem('recentIssues') || '[]');
    } catch (_error) {
      issues = [];
    }

    const currentIssue = window.location.pathname.match(/^\/issues\/(\d+)\/?$/)?.[1];
    const candidates = issues
      .filter(issue => issue && /^\d+$/.test(String(issue.ID)) && String(issue.ID) !== currentIssue)
      .slice(0, 9);
    if (!candidates.length) return false;

    recentPalette = document.createElement('div');
    recentPalette.id = 'recent-palette-overlay';
    recentPalette.className = 'zenmine-command-palette-overlay zenmine-recent-palette-overlay';
    recentPalette.setAttribute('role', 'dialog');
    recentPalette.setAttribute('aria-modal', 'true');
    recentPalette.setAttribute('aria-label', '最近見たチケット');
    recentPalette.tabIndex = -1;
    recentPalette.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;' +
      'align-items:center;justify-content:center';

    const modal = document.createElement('div');
    modal.className = 'zenmine-command-palette';
    modal.style.cssText =
      'background:#fff;color:#222;padding:24px 28px;border-radius:10px;min-width:520px;' +
      'max-width:calc(100vw - 32px);box-shadow:0 20px 60px rgba(0,0,0,.35);font-size:14px';

    const title = document.createElement('h2');
    title.className = 'zenmine-command-palette-title';
    title.textContent = '最近見たチケット';
    title.style.cssText = 'margin:0 0 12px;font-size:18px';
    modal.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'zenmine-command-palette-hint';
    hint.textContent = 'J / Kで移動、Spaceでプレビュー、Sでステータス変更、Enterで開きます。1〜9でも選択できます。/で候補を絞り込みます。Escで閉じます。';
    hint.style.cssText = 'margin:0 0 12px;color:#555';
    modal.appendChild(hint);

    const filter = document.createElement('input');
    filter.className = 'zenmine-command-palette-search';
    filter.type = 'search';
    filter.placeholder = '最近見たチケットを検索';
    filter.setAttribute('aria-label', '最近見たチケットを検索');
    filter.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:0;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:14px';
    const searchBox = document.createElement('div');
    searchBox.className = 'zenmine-command-palette-search-box';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'zenmine-command-palette-search-icon';
    searchBox.append(searchIcon, filter);
    modal.appendChild(searchBox);

    const table = document.createElement('table');
    table.className = 'zenmine-command-palette-table';
    table.style.cssText = 'width:100%;border-collapse:collapse';
    table.innerHTML = '<tr><th align="left">キー</th><th align="left">チケット</th></tr>';
    candidates.forEach((issue, index) => {
      const row = document.createElement('tr');
      row.className = 'zenmine-command-palette-row';
      row.dataset.recentIndex = index;
      row.dataset.issueId = issue.ID;
      row.style.cursor = 'pointer';

      const key = document.createElement('td');
      const keyLabel = document.createElement('b');
      keyLabel.className = 'zenmine-command-palette-key-badge';
      keyLabel.textContent = String(index + 1);
      keyLabel.style.cssText =
        'display:inline-flex;min-width:38px;height:38px;box-sizing:border-box;align-items:center;justify-content:center;' +
        'border-radius:10px;background:#f1efff;color:#6255db;font-size:16px;font-weight:700;line-height:1';
      key.appendChild(keyLabel);

      const label = document.createElement('td');
      const issueNumber = `#${issue.ID}`;
      const storedLabel = String(issue.Str || '').trim();
      const subject = storedLabel
        .replace(new RegExp(`^${issueNumber.replace('#', '\\#')}\\s*[:：]?\\s*`), '')
        .trim();
      const numberBadge = document.createElement('span');
      numberBadge.className = 'zenmine-command-palette-issue-badge';
      numberBadge.textContent = issueNumber;
      numberBadge.style.cssText =
        'display:inline-flex;align-items:center;margin-right:18px;padding:8px 14px;border-radius:7px;' +
        'background:#43a657;box-shadow:0 3px 8px rgba(67,166,87,.24);color:#fff;font-weight:700;line-height:1';
      label.appendChild(numberBadge);
      if (subject) {
        const subjectLabel = document.createElement('span');
        subjectLabel.className = 'zenmine-command-palette-issue-subject';
        subjectLabel.textContent = subject;
        label.appendChild(subjectLabel);
      }
      const action = document.createElement('td');
      action.className = 'zenmine-command-palette-row-action';
      action.textContent = '↵';
      row.append(key, label, action);
      row.addEventListener('mouseenter', () => {
        if (!row.classList.contains('zenmine-palette-row-selected')) row.style.background = '#f5f5f5';
      });
      row.addEventListener('mouseleave', () => {
        if (!row.classList.contains('zenmine-palette-row-selected')) row.style.background = 'transparent';
      });
      row.addEventListener('click', () => { window.location.href = `/issues/${issue.ID}`; });
      table.appendChild(row);
    });
    modal.appendChild(table);
    const footer = document.createElement('div');
    footer.className = 'zenmine-command-palette-footer';
    footer.innerHTML = '<span><b>↑ K</b><b>↓ J</b></span><span><b>1–9</b> 選択</span><span><b>SPACE</b> プレビュー</span><span><b>S</b> ステータス</span><span><b>/</b> 検索</span><span><b>↵</b> 開く</span><span><b>T</b> タブで開く</span><span><b>esc</b> 閉じる</span>';
    modal.appendChild(footer);
    filter.addEventListener('input', () => {
      const terms = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      table.querySelectorAll('[data-recent-index]').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.hidden = terms.length > 0 && !terms.every(term => text.includes(term));
      });
      const visibleRows = Array.from(table.querySelectorAll('[data-recent-index]'))
        .filter(row => !row.hidden);
      visibleRows.forEach((row, visibleIndex) => {
        row.querySelector('td:first-child b').textContent = String(visibleIndex + 1);
      });
      setPaletteSelection(recentPalette, '[data-recent-index]', visibleRows.length === 1 ? 0 : -1);
      if (terms.length > 0 && visibleRows.length === 1) visibleRows[0].click();
    });

    recentPalette.addEventListener('click', event => {
      if (event.target === recentPalette) closeRecentPalette();
    });
    recentPalette.appendChild(modal);
    document.body.appendChild(recentPalette);
    setPaletteSelection(recentPalette, '[data-recent-index]', 0);
    recentPalette.focus();
    return true;
  }

  function handleStatusPaletteKey(event) {
    if (recentPalette && !statusPalette) {
      if (event.key === 'Escape') {
        // QuickLook closes before the recent-issues palette in the modal stack.
        if (document.body.classList.contains('zenmine-quick-look-open') && !event.defaultPrevented) return false;
        if (event.defaultPrevented) return true;
        event.preventDefault();
        closeRecentPalette();
        return true;
      }
      if (event.key === '/' && !isTyping(event.target)) {
        const filter = recentPalette.querySelector('input[type="search"]');
        if (filter) {
          filter.style.display = 'block';
          filter.focus();
          filter.select();
          event.preventDefault();
        }
        return true;
      }
      if (isTyping(event.target)) {
        if (event.key === 'Enter') {
          const visibleRows = Array.from(recentPalette.querySelectorAll('[data-recent-index]'))
            .filter(row => !row.hidden);
          event.preventDefault();
          if (visibleRows.length === 1) {
            visibleRows[0].click();
          } else {
            event.target.blur();
          }
        }
        return false;
      }
      if (event.key === 's' || event.key === 'S') {
        const issueId = selectedRecentIssueId();
        if (openStatusPalette(0, issueId)) event.preventDefault();
        return true;
      }
      if (event.key === 'p' || event.key === 'P') {
        closeRecentPalette();
        if (openProjectJump()) event.preventDefault();
        return true;
      }
      if (event.key === '?') {
        closeRecentPalette();
        openHelp();
        event.preventDefault();
        return true;
      }
      if (event.key === 'j' || event.key === 'J' || event.key === 'k' || event.key === 'K') {
        movePaletteSelection(recentPalette, '[data-recent-index]', event.key.toLowerCase() === 'j' ? 1 : -1);
        if (document.body.classList.contains('zenmine-quick-look-open')) previewRecentPaletteSelection(false);
        event.preventDefault();
        return true;
      }
      if (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (document.body.classList.contains('zenmine-quick-look-open') && typeof window.zenmineCloseQuickLook === 'function') {
          window.zenmineCloseQuickLook();
        } else {
          previewRecentPaletteSelection();
        }
        return true;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        activatePaletteSelection(recentPalette, '[data-recent-index]');
        return true;
      }
      if (event.key === 't' || event.key === 'T') {
        const index = Number(recentPalette.dataset.selectedIndex);
        const row = Array.from(recentPalette.querySelectorAll('[data-recent-index]'))
          .filter(candidate => !candidate.hidden)[index];
        if (row?.dataset.issueId) {
          window.open(`/issues/${row.dataset.issueId}`, '_blank', 'noopener');
          event.preventDefault();
        }
        return true;
      }
      const recentIndex = Number(event.key) - 1;
      const visibleRows = Array.from(recentPalette.querySelectorAll('[data-recent-index]'))
        .filter(row => !row.hidden);
      const recentRow = visibleRows[recentIndex];
      if (recentIndex >= 0 && recentRow) {
        recentRow.click();
        event.preventDefault();
        return true;
      }
      if (/^\d$/.test(event.key)) return true;
      if (event.key.length === 1) {
        event.preventDefault();
        closeRecentPalette();
      }
      return true;
    }

    if (!statusPalette) return false;

    if (event.key === 'o' || event.key === 'O') {
      closeStatusPalette();
      if (openRecentPalette()) event.preventDefault();
      return true;
    }
    if (event.key === 'p' || event.key === 'P') {
      closeStatusPalette();
      if (openProjectJump()) event.preventDefault();
      return true;
    }
    if (event.key === '?') {
      closeStatusPalette();
      openHelp();
      event.preventDefault();
      return true;
    }
    if (event.key === 'j' || event.key === 'J' || event.key === 'k' || event.key === 'K') {
      movePaletteSelection(statusPalette, '[data-status-index]', event.key.toLowerCase() === 'j' ? 1 : -1);
      event.preventDefault();
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activatePaletteSelection(statusPalette, '[data-status-index]');
      return true;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeStatusPalette();
      return true;
    }

    const statusKeys = ['a', 's', 'd', 'f'];
    const statusIndex = statusKeys.indexOf(String(event.key).toLowerCase());
    if (statusIndex >= 0) {
      const button = statusPalette.querySelector('[data-status-index="' + statusIndex + '"]');
      if (button) {
        button.click();
      } else {
        closeStatusPalette();
      }
      event.preventDefault();
      return true;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      closeStatusPalette();
    }
    return true;
  }

  function openProjectJump(toggle = false) {
    const pj = document.getElementById('project-jump');
    if (!pj) return false;

    if (toggle) {
      pj.classList.toggle('expanded');
    } else if (!pj.classList.contains('expanded')) {
      pj.classList.add('expanded');
    }
    if (!pj.classList.contains('expanded')) return true;

    setTimeout(() => {
      const input = pj.querySelector('#projects-quick-search');
      const content = pj.querySelector('.drdn-content');
      if (!input || !content) return;

      input.focus();
      input.select?.();

      const trySelect = () => {
        const links = Array.from(content.querySelectorAll('.drdn-items.projects a'))
          .filter(a => a.offsetParent !== null);
        if (links.length === 1) {
          obs.disconnect();
          links[0].click();
        }
      };

      input.addEventListener('input', () => setTimeout(trySelect, 0), { passive: true });
      setTimeout(trySelect, 0);
      const obs = new MutationObserver(() => setTimeout(trySelect, 0));
      obs.observe(content, { childList: true, subtree: true });
    }, 0);
    return true;
  }

  document.addEventListener(
    'keydown',
    async (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key;
      const project = getProject();

      if (isHelpOpen) {
        const ignoreKeys = [
          'Shift',
          'Control',
          'Alt',
          'Meta',
          'CapsLock',
          'NumLock',
          'ScrollLock',
        ];

        if (ignoreKeys.includes(key)) return;

        e.preventDefault();
        closeHelp();
        return;
      }

      if (handleStatusPaletteKey(e)) return;

      if (key === 'Escape' && isTyping(e.target)) {
        e.preventDefault();
        e.target.blur();
        return;
      }
      if (isTyping(e.target)) return;

      if (key === 'o' || key === 'O') {
        if (openRecentPalette()) e.preventDefault();
        return;
      }

      if (key === 's' || key === 'S') {
        if (openStatusPalette()) e.preventDefault();
        return;
      }

      if (key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }

      if (key === '[') {
        e.preventDefault();
        window.history.back();
        return;
      }

      if (key === ']') {
        e.preventDefault();
        window.history.forward();
        return;
      }

      if (key === '^' || (e.code === 'Digit6' && e.shiftKey)) {
        e.preventDefault();
        goUpOneLevel();
        return;
      }

      if (key === 'c' || key === 'C') {
        e.preventDefault();
        const btn = document.querySelector('a.icon.icon-copy, a.icon-copy, a[href$="/copy"]');
        if (btn) click(btn);
        return;
      }

      if (key === 'l' || key === 'L') {
        const sidebarToggle = document.querySelector('span.openclose[role="button"]');
        if (sidebarToggle) {
          e.preventDefault();
          click(sidebarToggle);
        }
        return;
      }

      if (typeof key === 'string' && key.length === 1) {
        keyBuffer += key;
        keyBuffer = keyBuffer.slice(-2);

        clearTimeout(keyTimer);
        keyTimer = setTimeout(() => (keyBuffer = ''), 400);
      }

      if (keyBuffer === 'gg') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        keyBuffer = '';
        return;
      }

      if (key === 'G') {
        e.preventDefault();
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        keyBuffer = '';
        return;
      }

      if (keyBuffer === 'ZZ' && !isTyping(e.target)) {
        e.preventDefault();
        submitIssueForm();
        keyBuffer = '';
        return;
      }

      if (key === 'Escape') {
        escCount++;
        if (escCount === 1 && issueIndex !== -1) {
          clearIssueSelection(false);
        } else {
          clearIssueSelection(true);
          escCount = 0;
        }
        return;
      }
      escCount = 0;

      if (isSearchResultPage() && !isIssueList()) {
        if (key === 'j' || key === 'k') {
          e.preventDefault();
          searchIndex = moveRow('search', searchIndex, key === 'j' ? 1 : -1);
          return;
        }

        if (key === 'Enter' || key === 't') {
          const link = currentSearchLink();
          if (link) {
            e.preventDefault();
            key === 'Enter' ? location.href = link.href : window.open(link.href, '_blank', 'noopener');
          }
          return;
        }
      }

      if (isIssueList()) {
        if (key === 'j' || key === 'k') {
          e.preventDefault();
          issueIndex = moveRow('issue', issueIndex, key === 'j' ? 1 : -1);
          return;
        }
        if (key === 'Enter') {
          e.preventDefault();
          openIssue();
          return;
        }
        if (key === 'x') {
          e.preventDefault();
          toggleIssueCheckbox();
          return;
        }
        if (key === 't') {
          const link = currentIssueLink();
          if (link) {
            e.preventDefault();
            window.open(link.href, '_blank', 'noopener');
          }
          return;
        }
      }

      if (isIssueDetailPage() && (key === 'j' || key === 'k')) {
        e.preventDefault();
        window.scrollBy({
          top: (key === 'j' ? 1 : -1) * Math.round(window.innerHeight * 0.7),
          behavior: 'smooth',
        });
        return;
      }

      if (key === 'r' || key === 'R') {
        if (typeof window.doReplyAction === 'function') {
          e.preventDefault();
          window.doReplyAction();
          return;
        }
      }

      if (key === 'e' || key === 'E') {
        const edit = document.querySelector('#content > .contextual a.icon-edit');
        if (!edit) return;

        e.preventDefault();
        click(edit);
        await waitAndClickDescToggle();
        return;
      }

      if (key === '/') {
        const search = document.querySelector('[accesskey="f"]');
        if (search) {
          e.preventDefault();
          search.focus();
          search.select?.();
        }
        return;
      }

      if (key === 'p' || key === 'P') {
        if (!openProjectJump(true)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      if (key === 'n' || key === 'N') {
        if (project) location.href = `/projects/${project}/issues/new`;
        return;
      }

      if (key === 'i' || key === 'I') {
        location.href = project ? `/projects/${project}/issues` : `/issues`;
        return;
      }

      if (key === 'w' || key === 'W') {
        if (project) location.href = `/projects/${project}/wiki`;
        return;
      }

      if (key === 'a' || key === 'A') {
        location.href = project ? `/projects/${project}/activity` : `/activity`;
        return;
      }

      if (key === 'h' || key === 'H') {
        location.href = '/';
        return;
      }

      if (key === 'm' || key === 'M') {
        location.href = '/my/page';
        return;
      }
    },
    true
  );

  window.KeyboardHelp = {
    open: openHelp,
    close: closeHelp,
    toggle: () => (isHelpOpen ? closeHelp() : openHelp())
  };

})();

// ⌘/Option-Enter to submit form
$(function($){
  $(window).keydown(function(e){
    if ((e.metaKey || e.altKey) && e.keyCode === 13) {
      const form = document.getElementById('issue-form');
      if (form) {
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.submit();
        }
      }
      return false;
    }
  });
});

// Shift+Enter to toggle Edit/Preview tabs
$(function($){
  $(window).keydown(function(e){
    if (!e.shiftKey || e.keyCode !== 13) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const $notes = $('#issue_notes');
    const $description = $('#issue_description');
    const notesEmpty = $notes.length && !$notes.val().trim();
    const preferDescription = notesEmpty && $description.length && $('.tab-preview:visible').length > 1;
    const $editorRoot = (preferDescription ? $description : $notes).closest('.jstBlock');
    const $scope = $editorRoot.length ? $editorRoot : $(document);
    const $previewTarget = $scope.find('.tab-preview:visible').last();
    const $editTarget = $scope.find('.tab-edit:visible').last();
    const $previewPanel = $scope.find('.wiki-preview').last();
    const isPreviewMode = () => {
      if ($previewPanel.length) {
        return $previewPanel.is(':visible') || !$previewPanel.hasClass('hidden');
      }
      return $previewTarget.hasClass('selected') || $previewTarget.closest('.selected').length > 0;
    };
    const clickTab = ($tab) => {
      const $link = $tab.is('a') ? $tab : $tab.find('a').first();
      ($link.length ? $link : $tab).click();
    };

    if (isPreviewMode()) {
      clickTab($editTarget);
    } else {
      clickTab($previewTarget);
    }

    return false;
  });
});
