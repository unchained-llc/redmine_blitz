(function () {
  let issueIndex = -1;
  let escCount = 0;
  let searchIndex = -1;
  let keyBuffer = '';
  let keyTimer = null;
  let overlay;
  let isHelpOpen = false;

  const isTyping = (el) =>
    el?.matches?.('input, textarea, select, [contenteditable="true"]');

  const click = (el) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  const getProject = () => {
    const m = document.body.className.match(/project-([a-zA-Z0-9_-]+)/);
    return m && m[1];
  };

  const isIssueList = () => document.querySelector('table.issues');
  const isSearchResultPage = () => document.getElementById('search-results');

  const style = document.createElement('style');
  style.textContent = `
    tr.issue.kbd-selected {
      background: transparent;
    }
    tr.issue.kbd-selected > td:first-child {
      box-shadow: inset 4px 0 0 #1DC9A0;
    }
    #search-results dt.kbd-selected{
      border-radius: 6px;
      background-color: rgba(29, 201, 160, 0.69) !important;
    }
    #search-results dt.kbd-selected,
    #search-results dt.kbd-selected * {
      color: #fff !important;
      vertical-align: middle;
    }
    #search-results dt { position: relative; }
  `;
  document.head.appendChild(style);

  function getRows(type) {
    if (type === 'issue') {
      return isIssueList()
        ? Array.from(document.querySelectorAll('table.issues tbody tr'))
            .filter(tr => tr.querySelector('a[href^="/issues/"]'))
        : [];
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
      row.classList.toggle('kbd-selected', i === index);
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
    rows[index].scrollIntoView({ block: 'nearest' });
    return index;
  }

  function submitIssueForm() {
    const form = document.getElementById('issue-form') ||
                 document.querySelector('form#issue-form') ||
                 document.querySelector('form.edit_issue');

    if (form) {
      form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  }

  function setupReplyButton() {
    const editButton = document.querySelector('#content > .contextual a.icon-edit');
    if (!editButton) return;

    const beforeAssignedTo = $('#issue_assigned_to_id').val();

    const userLanguage = navigator.language || navigator.userLanguage;
    let replyText;
    if (userLanguage.startsWith('ja')) replyText = '返信';
    else if (userLanguage.startsWith('fr')) replyText = 'Répondre';
    else replyText = 'Reply';

    const replyButton = $('<a>')
      .addClass('icon icon-issue-note btn btn-sm btn-outline-dark')
      .text(replyText)
      .attr('href', editButton.getAttribute('href'))
      .attr('id', 'vc-reply-button');

    $(editButton).after(replyButton);

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

    replyButton.on('click', function() {
      doReply();
      return false;
    });

    $(editButton).on('click', function() {
      $('#issue_assigned_to_id').val(beforeAssignedTo);
    });

    window.doReplyAction = doReply;
  }

  $(document).ready(function() {
    if (document.querySelector('#content > .contextual a.icon-edit')) {
      setupReplyButton();
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
      rows[0].scrollIntoView({ block: 'nearest' });
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
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;' +
      'background:rgba(0,0,0,.55);display:none;' +
      'align-items:center;justify-content:center';

    const modal = document.createElement('div');
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
        key: 'キー',
        action: 'アクション',
        home: 'ホームへ移動',
        myPage: 'マイページへ移動',
        newIssue: '新しいチケット',
        search: '検索',
        projectJump: 'プロジェクトジャンプ',
        issueList: 'チケット一覧',
        activity: 'アクティビティ',
        wiki: 'Wiki',
        scrollTop: '最上へスクロール',
        scrollBottom: '最下へスクロール',
        reply: '返信（チケット詳細ページ）',
        edit: '編集 + 説明編集',
        copy: 'チケットをコピー',
        preview: 'プレビュー切替',
        submit: '送信（フォーム）',
        navigation: '選択移動（チケット / 検索結果）',
        toggle: 'チケット選択 ON / OFF',
        open: 'チェック1件 → 開く<br>チェック2件以上 → 一括編集',
        newTab: '新しいタブで開く',
        escape: '選択解除（2回で全解除）<br>入力中はフォーカス解除',
        help: 'ヘルプ表示'
      },
      en: {
        title: 'Keyboard Shortcuts',
        key: 'Key',
        action: 'Action',
        home: 'Go to home',
        myPage: 'Go to my page',
        newIssue: 'Create new issue',
        search: 'Search',
        projectJump: 'Project jump',
        issueList: 'Go to issues list',
        activity: 'Go to activity',
        wiki: 'Go to Wiki',
        scrollTop: 'Scroll to top',
        scrollBottom: 'Scroll to bottom',
        reply: 'Reply (issue detail page)',
        edit: 'Edit issue + description',
        copy: 'Copy issue',
        preview: 'Toggle Edit/Preview',
        submit: 'Submit form',
        navigation: 'Navigate (issues / search results)',
        toggle: 'Toggle issue selection',
        open: '1 checked → open<br>2+ checked → bulk edit',
        newTab: 'Open in new tab',
        escape: 'Clear selection (twice to uncheck all)<br>Blur input field when focused',
        help: 'Show help'
      },
      fr: {
        title: 'Raccourcis clavier',
        key: 'Touche',
        action: 'Action',
        home: 'Aller à l\'accueil',
        myPage: 'Aller à ma page',
        newIssue: 'Créer une nouvelle demande',
        search: 'Rechercher',
        projectJump: 'Saut de projet',
        issueList: 'Liste des demandes',
        activity: 'Activité',
        wiki: 'Wiki',
        scrollTop: 'Défiler vers le haut',
        scrollBottom: 'Défiler vers le bas',
        reply: 'Répondre (page détail)',
        edit: 'Éditer + description',
        copy: 'Copier la demande',
        preview: 'Basculer Édition/Aperçu',
        submit: 'Soumettre le formulaire',
        navigation: 'Naviguer (demandes / résultats)',
        toggle: 'Sélectionner/désélectionner',
        open: '1 cochée → ouvrir<br>2+ cochées → édition en masse',
        newTab: 'Ouvrir dans un nouvel onglet',
        escape: 'Effacer la sélection (2× pour tout décocher)<br>Perdre le focus en saisie',
        help: 'Afficher l\'aide'
      }
    };

    const t = i18n[lang];

    modal.innerHTML = `
      <h2 style="margin:0 0 12px;font-size:18px;">${t.title}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><th align="left">${t.key}</th><th align="left">${t.action}</th></tr>

        <tr><td><b>h</b></td><td>${t.home}</td></tr>
        <tr><td><b>m</b></td><td>${t.myPage}</td></tr>
        <tr><td><b>n</b></td><td>${t.newIssue}</td></tr>
        <tr><td><b>/</b></td><td>${t.search}</td></tr>
        <tr><td><b>p</b></td><td>${t.projectJump}</td></tr>
        <tr><td><b>i</b></td><td>${t.issueList}</td></tr>
        <tr><td><b>a</b></td><td>${t.activity}</td></tr>
        <tr><td><b>w</b></td><td>${t.wiki}</td></tr>
        <tr><td><b>gg</b></td><td>${t.scrollTop}</td></tr>
        <tr><td><b>G</b></td><td>${t.scrollBottom}</td></tr>

        <tr><td colspan="2"><hr></td></tr>

        <tr><td><b>r</b></td><td>${t.reply}</td></tr>
        <tr><td><b>e</b></td><td>${t.edit}</td></tr>
        <tr><td><b>c</b></td><td>${t.copy}</td></tr>
        <tr><td><b>Shift + Enter</b></td><td>${t.preview}</td></tr>
        <tr><td><b>⌘ / Option + Enter</b></td><td>${t.submit}</td></tr>
        <tr><td><b>ZZ</b></td><td>${t.submit}</td></tr>

        <tr><td colspan="2"><hr></td></tr>

        <tr><td><b>j / k</b></td><td>${t.navigation}</td></tr>
        <tr><td><b>x / Space</b></td><td>${t.toggle}</td></tr>
        <tr>
          <td><b>Enter</b></td>
          <td>${t.open}</td>
        </tr>
        <tr><td><b>t</b></td><td>${t.newTab}</td></tr>
        <tr>
          <td><b>Esc</b></td>
          <td>${t.escape}</td>
        </tr>

        <tr><td colspan="2"><hr></td></tr>

        <tr><td><b>?</b></td><td>${t.help}</td></tr>
      </table>
    `;

    overlay.appendChild(modal);
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

      if (key === 'Escape' && isTyping(e.target)) {
        e.preventDefault();
        e.target.blur();
        return;
      }
      if (isTyping(e.target)) return;

      if (key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        openHelp();
        return;
      }

      if (key === 'c' || key === 'C') {
        e.preventDefault();
        const btn = document.querySelector('a.icon.icon-copy, a.icon-copy, a[href$="/copy"]');
        if (btn) click(btn);
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
        if (key === 'x' || key === ' ') {
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
        const pj = document.getElementById('project-jump');
        if (!pj) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        pj.classList.toggle('expanded');
        if (!pj.classList.contains('expanded')) return;

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
