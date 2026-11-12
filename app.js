(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
  const escapeHTML = (s = '') => s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  const colorMap = {
    yellow: '#D4BE9D',
    tobacco: '#8F6448',
    oxblood: '#67343A',
    green: '#8ed6a5',
    blue: '#81b8ee',
    purple: '#bda0eb'
  };
  const GLOBAL_NOTEBOOK_ID = '__reader_studio_global__';
  const COLLECTIONS_NOTEBOOK_ID = '__reader_studio_collections__';
  const LIBRARY_PREFS_NOTEBOOK_ID = '__reader_studio_library_prefs__';
  const LEGACY_DB_NAME = 'ReaderStudioDB';
  const SYNC_STORES = ['books', 'annotations', 'bookmarks', 'notebooks'];

  const state = {
    db: null,
    legacyDb: null,
    activeDbName: LEGACY_DB_NAME,
    books: [],
    currentBook: null,
    pdfDoc: null,
    epubBook: null,
    rendition: null,
    currentPage: 1,
    pdfZoom: 1,
    epubFontSize: 100,
    spread: false,
    annotations: [],
    bookmarks: [],
    selection: null,
    selectionHoldUntil: 0,
    epubSelectionTimer: null,
    mobileGestureBound: new WeakSet(),
    epubRenditionGesture: null,
    lastSwipeAt: 0,
    currentEditingAnnotation: null,
    searchBusy: false,
    renderToken: 0,
    epubLocationReady: false,
    notebookSaveTimer: null,
    globalNotebookSaveTimer: null,
    globalNotebookBookId: GLOBAL_NOTEBOOK_ID,
    globalNotebookLoaded: false,
    collections: [],
    pinnedBookId: null,
    activeCollectionId: 'all',
    activeAuthor: 'all',
    libraryGridColumns: clamp(Number(localStorage.getItem('reader-library-grid-columns')) || 4, 1, 5),
    editingCollectionId: null,
    collectionReturnBookId: null,
    editingBookId: null,
    pendingCover: null,
    pendingCoverMode: null,
    notebookRanges: new WeakMap(),
    progressSaveTimer: null,
    readerLayoutTimer: null,
    readerResizeObserver: null,
    librarySidebarCollapsed: localStorage.getItem('reader-library-sidebar-collapsed') === '1',
    libraryCollectionsCollapsed: localStorage.getItem('reader-library-collections-collapsed') === '1',
    libraryAuthorsCollapsed: localStorage.getItem('reader-library-authors-collapsed') === '1',
    supabase: null,
    cloudUser: null,
    cloudConfigured: false,
    syncing: false,
    syncTimer: null,
    syncInterval: null,
    applyingRemote: false,
    authSwitching: false,
    authRecoveryMode: false,
    settings: {
      theme: localStorage.getItem('reader-theme') || 'light',
      sourceLang: localStorage.getItem('reader-source-lang') || 'en',
      targetLang: localStorage.getItem('reader-target-lang') || 'vi',
      uiScale: (() => {
        const stored = Number(localStorage.getItem('reader-ui-scale'));
        if (Number.isFinite(stored) && stored >= 80 && stored <= 110) return stored;
        return window.innerWidth <= 780 ? 100 : 90;
      })()
    }
  };

  const els = {};
  const cacheEls = () => {
    [
      'libraryView','readerView','bookGrid','libraryEmpty','addBookBtn','emptyAddBtn','bookFileInput','librarySearch','collectionsBar','collectionsChips','authorsBar','libraryHero','libraryResultCount',
      'librarySidebar','librarySidebarHideBtn','librarySidebarShowBtn','librarySidebarMobileBtn',
      'collectionFilterSelect','collectionFilterMeta','authorFilterSelect','authorFilterMeta','manageCollectionsBtn',
      'libraryBooksPanel','libraryStatusPanel','statusCompletedBooks','statusCompletionTotal','statusNeverCompleted','statusCompletedBadge','statusIncompleteBadge','statusCompletedList','statusIncompleteList','globalNotebookPanel','globalNotebookList','globalNotebookCount','globalNotebookTitle','globalNotebookOpenBookBtn',
      'globalNotebookToolbar','globalNotebookEditor','globalNotebookSaveState',
      'syncStatus','accountBtn','libraryThemeBtn','settingsBtn','backBtn','leftSidebarBtn','rightSidebarBtn','readerTitle','readerAuthor','locationLabel',
      'zoomOutBtn','zoomInBtn','fitWidthBtn','savePlaceBtn','returnPlaceBtn','readerSearchBtn','bookmarkBtn','spreadBtn','readerThemeBtn','fullscreenBtn',
      'leftSidebar','rightSidebar','readerMain','pdfReader','pdfPages','epubReader','epubArea','mobileSelectionBtn','prevPageBtn','nextPageBtn',
      'footerPrevBtn','footerNextBtn','progressBar','progressText','mobileZoomControls','mobileZoomOutBtn','mobileZoomInBtn','mobileZoomLabel','readerLoading','tocList','bookmarkList','bookmarkCount',
      'notesList','highlightsList','bookNotebookToolbar','notebookEditor','notebookSaveState','selectionToolbar','translationPopover',
      'translationSource','translationResult','translationCopyBtn','translationNotebookBtn','modalBackdrop','noteModal','noteQuote',
      'noteInput','saveNoteBtn','deleteAnnotationBtn','searchModal','bookSearchInput','searchStatus','searchResults','settingsModal','sourceLang','targetLang','uiScaleRange','uiScaleValue','uiScalePresets',
      'saveSettingsBtn','bookSettingsModal','bookCoverPreview','customCoverInput','chooseCoverBtn','restoreCoverBtn','bookTitleInput','bookAuthorInput',
      'bookCollectionChoices','bookCreateCollectionBtn','deleteBookFromSettingsBtn','saveBookSettingsBtn','collectionModal','collectionModalTitle',
      'collectionNameInput','deleteCollectionBtn','saveCollectionBtn','authModal','cloudNotConfigured','signedOutPanel','signedInPanel','authEmail','authPassword','authMessage',
      'signUpBtn','signInBtn','forgotPasswordBtn','resetPasswordPanel','resetPasswordIntro','newPassword','confirmNewPassword','resetPasswordMessage',
      'saveNewPasswordBtn','cancelResetPasswordBtn','changePasswordBtn','accountEmail','syncDetail','syncNowBtn','legacyMigrationBox','legacyMigrationText','migrateLocalBtn','signOutBtn','toast'
    ].forEach(id => els[id] = document.getElementById(id));
  };

  // ---------- IndexedDB ----------
  function openDB(name = LEGACY_DB_NAME) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('annotations')) {
          const store = db.createObjectStore('annotations', { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }
        if (!db.objectStoreNames.contains('notebooks')) db.createObjectStore('notebooks', { keyPath: 'bookId' });
        if (!db.objectStoreNames.contains('syncQueue')) db.createObjectStore('syncQueue', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode = 'readonly', database = state.db) {
    return database.transaction(storeName, mode).objectStore(storeName);
  }

  function dbGet(store, key, database = state.db) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readonly', database).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGetAll(store, database = state.db) {
    return new Promise((resolve, reject) => {
      const req = tx(store, 'readonly', database).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbGetAllByBook(store, bookId, database = state.db) {
    return new Promise((resolve, reject) => {
      const os = tx(store, 'readonly', database);
      const req = os.index('bookId').getAll(bookId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(store, value, options = {}) {
    const database = options.database || state.db;
    if (SYNC_STORES.includes(store) && !value.updatedAt) value.updatedAt = value.createdAt || Date.now();
    await new Promise((resolve, reject) => {
      const req = tx(store, 'readwrite', database).put(value);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
    if (!options.skipSync) await queueSyncChange(store, value, 'put', database);
    return value;
  }

  async function dbDelete(store, key, options = {}) {
    const database = options.database || state.db;
    const previous = SYNC_STORES.includes(store) ? await dbGet(store, key, database).catch(() => null) : null;
    await new Promise((resolve, reject) => {
      const req = tx(store, 'readwrite', database).delete(key);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
    if (!options.skipSync) await queueSyncChange(store, previous || { id:key, bookId:key }, 'delete', database);
  }

  async function deleteByBook(storeName, bookId) {
    const rows = await dbGetAllByBook(storeName, bookId);
    await Promise.all(rows.map(row => dbDelete(storeName, row.id)));
  }

  // ---------- Account & cloud sync ----------
  function recordId(store, value) {
    return store === 'notebooks' ? value.bookId : value.id;
  }

  function recordTimestamp(value) {
    return Number(value?.updatedAt || value?.createdAt || 0);
  }

  function cloudConfig() {
    const raw = window.READER_STUDIO_CONFIG || {};
    const url = String(raw.supabaseUrl || '').trim();
    const key = String(raw.supabasePublishableKey || raw.supabaseAnonKey || '').trim();
    const placeholder = /YOUR_|PASTE_|example|project-url/i;
    return { url, key, configured: /^https?:\/\//.test(url) && key.length > 20 && !placeholder.test(`${url} ${key}`) };
  }

  function freshCloudFetch(input, init = {}) {
    // Do not let the browser HTTP cache reuse a cloud response. The service
    // worker separately ignores every cross-origin request.
    return fetch(input, { ...init, cache:'no-store' });
  }

  async function clearLegacyCloudCache() {
    if (!('caches' in window)) return;
    // v14 was the version that accidentally cached Supabase GET responses.
    await caches.delete('reader-studio-v17').catch(() => {});
  }

  function userDbName(userId) {
    return `ReaderStudioDB-user-${userId}`;
  }

  function cloudBookPath(book) {
    const ext = book?.type === 'pdf' ? 'pdf' : 'epub';
    return `${state.cloudUser.id}/${book.id}/book.${ext}`;
  }

  async function queueSyncChange(store, value, operation, database) {
    if (!SYNC_STORES.includes(store) || state.applyingRemote || !state.cloudUser) return;
    if (database !== state.db || state.activeDbName === LEGACY_DB_NAME) return;
    const itemId = recordId(store, value);
    if (!itemId) return;
    const change = {
      key: `${store}:${itemId}`,
      store,
      itemId,
      bookId: store === 'books' ? itemId : (value.bookId || null),
      operation,
      updatedAt: operation === 'delete' ? Date.now() : (recordTimestamp(value) || Date.now()),
      filePath: store === 'books' ? (value.cloudFilePath || cloudBookPath(value)) : null
    };
    await dbPut('syncQueue', change, { database, skipSync:true });
    setSyncStatus('pending', 'Chờ đồng bộ');
    scheduleCloudFlush();
  }

  function scheduleCloudFlush(delay = 900) {
    if (!state.cloudUser || !navigator.onLine) return;
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(runQueuedSync, delay);
  }

  async function initCloud() {
    const config = cloudConfig();
    state.cloudConfigured = config.configured;
    updateAccountUI();
    if (!config.configured) return;
    try {
      if (!window.supabase?.createClient) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'Supabase');
      }
      if (!window.supabase?.createClient) throw new Error('Không tải được thư viện Supabase.');
      state.supabase = window.supabase.createClient(config.url, config.key, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
        global: { fetch:freshCloudFetch }
      });
      state.supabase.auth.onAuthStateChange((event, session) => {
        setTimeout(async () => {
          if (event === 'PASSWORD_RECOVERY') state.authRecoveryMode = true;
          if (session?.user) await activateCloudUser(session.user);
          else if (event === 'SIGNED_OUT') await deactivateCloudUser();
          if (event === 'PASSWORD_RECOVERY') showPasswordResetPanel();
        }, 0);
      });
      const { data, error } = await state.supabase.auth.getSession();
      if (error) throw error;
      if (data.session?.user) {
        await activateCloudUser(data.session.user);
        if (isPasswordRecoveryUrl()) {
          state.authRecoveryMode = true;
          showPasswordResetPanel();
        }
      }
      else updateAccountUI();
      state.syncInterval = setInterval(() => {
        if (document.visibilityState === 'visible' && state.cloudUser && navigator.onLine) syncNow({ quiet:true });
      }, 45000);
    } catch (error) {
      console.error(error);
      setSyncStatus('error', 'Lỗi cấu hình sync');
      updateAccountUI(error.message);
    }
  }

  async function activateCloudUser(user) {
    if (state.authSwitching) return;
    if (state.cloudUser?.id === user.id && state.activeDbName === userDbName(user.id)) return;
    state.authSwitching = true;
    try {
      state.cloudUser = user;
      state.activeDbName = userDbName(user.id);
      state.db = await openDB(state.activeDbName);
      state.lastSyncAt = 0;
      state.globalNotebookLoaded = false;
      state.globalNotebookBookId = GLOBAL_NOTEBOOK_ID;
      await showLibraryPanel('books');
      await refreshLibrary();
      updateAccountUI();
      await syncNow({ quiet:true });
      await updateLegacyMigrationUI();
    } finally {
      state.authSwitching = false;
    }
  }

  async function deactivateCloudUser() {
    clearTimeout(state.syncTimer);
    state.cloudUser = null;
    state.lastSyncAt = 0;
    state.activeDbName = LEGACY_DB_NAME;
    state.db = state.legacyDb;
    state.globalNotebookLoaded = false;
    state.globalNotebookBookId = GLOBAL_NOTEBOOK_ID;
    await showLibraryPanel('books');
    await refreshLibrary();
    updateAccountUI();
  }

  function setSyncStatus(mode, text) {
    if (!els.syncStatus) return;
    els.syncStatus.className = `sync-status ${mode || ''}`.trim();
    $('span', els.syncStatus).textContent = text;
    if (els.syncDetail) els.syncDetail.textContent = text;
  }

  function updateAccountUI(errorMessage = '') {
    if (!els.accountBtn) return;
    const recovering = state.cloudConfigured && state.authRecoveryMode;
    els.cloudNotConfigured.classList.toggle('hidden', state.cloudConfigured);
    els.signedOutPanel.classList.toggle('hidden', !state.cloudConfigured || !!state.cloudUser || recovering);
    els.signedInPanel.classList.toggle('hidden', !state.cloudUser || recovering);
    els.resetPasswordPanel.classList.toggle('hidden', !recovering);
    els.accountBtn.textContent = state.cloudUser ? 'Tài khoản' : 'Đăng nhập';
    if (state.cloudUser) {
      els.accountEmail.textContent = state.cloudUser.email || 'Tài khoản Reader Studio';
      if (!state.syncing) setSyncStatus('online', state.lastSyncAt ? 'Đã đồng bộ' : 'Đã đăng nhập');
    } else if (state.cloudConfigured) {
      setSyncStatus('', 'Chưa đăng nhập');
    } else {
      setSyncStatus('', 'Chỉ lưu trên máy');
    }
    if (errorMessage) els.authMessage.textContent = errorMessage;
  }

  async function openAccountModal() {
    els.authMessage.textContent = '';
    updateAccountUI();
    openModal(els.authModal);
    if (state.cloudUser) await updateLegacyMigrationUI();
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || error || 'Không thể đăng nhập.');
    if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
    if (/email not confirmed/i.test(message)) return 'Bạn cần xác nhận email trước khi đăng nhập.';
    if (/user already registered/i.test(message)) return 'Email này đã có tài khoản. Hãy bấm Đăng nhập.';
    if (/email rate limit exceeded|rate limit.*email/i.test(message)) return 'Bạn đã yêu cầu quá nhiều email. Hãy chờ khoảng 1 giờ rồi thử lại một lần.';
    if (/same password|different from the old/i.test(message)) return 'Mật khẩu mới cần khác mật khẩu cũ.';
    if (/session.*missing|invalid.*token|expired/i.test(message)) return 'Liên kết đã hết hạn. Hãy yêu cầu một email khôi phục mới.';
    if (/password/i.test(message) && /least|short/i.test(message)) return 'Mật khẩu cần có ít nhất 6 ký tự.';
    return message;
  }

  function isPasswordRecoveryUrl() {
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    return params.get('reset') === 'password' || params.get('type') === 'recovery' || hash.get('type') === 'recovery';
  }

  function passwordRecoveryRedirect() {
    const url = new URL(location.href);
    return `${url.origin}${url.pathname}`;
  }

  function clearPasswordRecoveryUrl() {
    const url = new URL(location.href);
    ['reset', 'code', 'type', 'token', 'token_hash'].forEach(key => url.searchParams.delete(key));
    url.hash = '';
    history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  function showPasswordResetPanel() {
    state.authRecoveryMode = true;
    els.newPassword.value = '';
    els.confirmNewPassword.value = '';
    els.resetPasswordMessage.textContent = '';
    els.resetPasswordIntro.textContent = state.cloudUser?.email
      ? `Nhập mật khẩu mới cho ${state.cloudUser.email}. Sách và ghi chú của bạn vẫn được giữ nguyên.`
      : 'Nhập mật khẩu mới cho tài khoản Reader Studio của bạn.';
    updateAccountUI();
    openModal(els.authModal);
    setTimeout(() => els.newPassword.focus(), 80);
  }

  function cancelPasswordReset() {
    state.authRecoveryMode = false;
    clearPasswordRecoveryUrl();
    updateAccountUI();
    closeModals();
  }

  async function requestPasswordRecovery() {
    const email = els.authEmail.value.trim();
    if (!email) {
      els.authMessage.textContent = 'Hãy nhập email của tài khoản trước.';
      els.authEmail.focus();
      return;
    }
    els.forgotPasswordBtn.disabled = true;
    els.authMessage.textContent = 'Đang gửi email khôi phục...';
    try {
      const { error } = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo:passwordRecoveryRedirect() });
      if (error) throw error;
      els.authMessage.textContent = 'Đã gửi email. Hãy mở liên kết trong email để đặt mật khẩu mới.';
    } catch (error) {
      els.authMessage.textContent = friendlyAuthError(error);
    } finally {
      els.forgotPasswordBtn.disabled = false;
    }
  }

  async function saveNewPassword() {
    const password = els.newPassword.value;
    const confirmation = els.confirmNewPassword.value;
    if (password.length < 6) return (els.resetPasswordMessage.textContent = 'Mật khẩu mới cần có ít nhất 6 ký tự.');
    if (password !== confirmation) return (els.resetPasswordMessage.textContent = 'Hai lần nhập mật khẩu chưa giống nhau.');
    if (!state.supabase || !state.cloudUser) return (els.resetPasswordMessage.textContent = 'Phiên khôi phục đã hết hạn. Hãy yêu cầu một email mới.');
    els.saveNewPasswordBtn.disabled = true;
    els.resetPasswordMessage.textContent = 'Đang lưu mật khẩu mới...';
    try {
      const { error } = await state.supabase.auth.updateUser({ password });
      if (error) throw error;
      state.authRecoveryMode = false;
      clearPasswordRecoveryUrl();
      updateAccountUI();
      closeModals();
      toast('Đã đổi mật khẩu · dữ liệu được giữ nguyên', 3200);
    } catch (error) {
      els.resetPasswordMessage.textContent = friendlyAuthError(error);
    } finally {
      els.saveNewPasswordBtn.disabled = false;
    }
  }

  async function handleSignIn() {
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    if (!email || !password) return (els.authMessage.textContent = 'Hãy nhập email và mật khẩu.');
    els.signInBtn.disabled = true;
    els.authMessage.textContent = 'Đang đăng nhập...';
    try {
      const { error } = await state.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      els.authMessage.textContent = '';
      closeModals();
      toast('Đã đăng nhập · đang tải dữ liệu');
    } catch (error) {
      els.authMessage.textContent = friendlyAuthError(error);
    } finally {
      els.signInBtn.disabled = false;
    }
  }

  async function handleSignUp() {
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    if (!email || password.length < 6) return (els.authMessage.textContent = 'Nhập email cá nhân và mật khẩu từ 6 ký tự.');
    els.signUpBtn.disabled = true;
    els.authMessage.textContent = 'Đang tạo tài khoản...';
    try {
      const redirect = `${location.origin}${location.pathname}`;
      const { data, error } = await state.supabase.auth.signUp({ email, password, options:{ emailRedirectTo:redirect } });
      if (error) throw error;
      els.authMessage.textContent = data.session
        ? 'Đã tạo tài khoản và đăng nhập.'
        : 'Đã tạo tài khoản. Hãy mở email xác nhận rồi quay lại đăng nhập.';
    } catch (error) {
      els.authMessage.textContent = friendlyAuthError(error);
    } finally {
      els.signUpBtn.disabled = false;
    }
  }

  async function handleSignOut() {
    if (!state.supabase) return;
    if (state.globalNotebookLoaded) await saveGlobalNotebook();
    els.signOutBtn.disabled = true;
    const { error } = await state.supabase.auth.signOut();
    els.signOutBtn.disabled = false;
    if (error) return toast(friendlyAuthError(error), 3500);
    closeModals();
    toast('Đã đăng xuất · dữ liệu tài khoản đã được ẩn');
  }

  function serializeRecord(store, value) {
    if (store !== 'books') return value;
    const { fileData, ...metadata } = value;
    return metadata;
  }

  async function uploadBookFile(book) {
    if (book.cloudFilePath) return book.cloudFilePath;
    if (!book.fileData) throw new Error(`Thiếu file của “${book.title}”.`);
    const path = cloudBookPath(book);
    const mime = book.type === 'pdf' ? 'application/pdf' : 'application/epub+zip';
    const body = new Blob([book.fileData], { type:mime });
    const { error } = await state.supabase.storage.from('reader-books').upload(path, body, {
      upsert:true,
      contentType:mime,
      cacheControl:'3600'
    });
    if (error) throw error;
    book.cloudFilePath = path;
    await dbPut('books', book, { skipSync:true });
    return path;
  }

  async function flushSyncQueue() {
    if (!state.cloudUser || !state.supabase || !navigator.onLine) return;
    const changes = (await dbGetAll('syncQueue')).sort((a,b) => a.updatedAt - b.updatedAt);
    for (const change of changes) {
      if (change.operation === 'delete') {
        const payload = {
          user_id:state.cloudUser.id, store:change.store, item_id:change.itemId,
          book_id:change.bookId, data:null, file_path:change.filePath,
          updated_at:change.updatedAt, deleted:true
        };
        const { error } = await state.supabase.from('reader_records').upsert(payload, { onConflict:'user_id,store,item_id' });
        if (error) throw error;
        if (change.store === 'books' && change.filePath) {
          const removed = await state.supabase.storage.from('reader-books').remove([change.filePath]);
          if (removed.error) console.warn('Không xóa được file cloud cũ:', removed.error);
        }
        await completeQueuedChange(change);
        continue;
      }

      const value = await dbGet(change.store, change.itemId);
      if (!value) {
        change.operation = 'delete';
        change.updatedAt = Date.now();
        await dbPut('syncQueue', change, { skipSync:true });
        scheduleCloudFlush(200);
        continue;
      }
      let filePath = value.cloudFilePath || null;
      if (change.store === 'books') filePath = await uploadBookFile(value);
      const payload = {
        user_id:state.cloudUser.id,
        store:change.store,
        item_id:change.itemId,
        book_id:change.store === 'books' ? change.itemId : (value.bookId || null),
        data:serializeRecord(change.store, value),
        file_path:filePath,
        updated_at:recordTimestamp(value) || Date.now(),
        deleted:false
      };
      const { error } = await state.supabase.from('reader_records').upsert(payload, { onConflict:'user_id,store,item_id' });
      if (error) throw error;
      await completeQueuedChange(change);
    }
  }

  async function completeQueuedChange(processed) {
    const latest = await dbGet('syncQueue', processed.key).catch(() => null);
    if (!latest) return;
    if (latest.operation === processed.operation && Number(latest.updatedAt) <= Number(processed.updatedAt)) {
      await dbDelete('syncQueue', processed.key, { skipSync:true });
    }
  }

  async function fetchRemoteRecords() {
    const rows = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await state.supabase.from('reader_records')
        .select('*').eq('user_id', state.cloudUser.id)
        .order('store', { ascending:true }).order('item_id', { ascending:true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  async function applyRemoteRecord(remote) {
    state.applyingRemote = true;
    try {
      if (remote.deleted) {
        await dbDelete(remote.store, remote.item_id, { skipSync:true });
        return;
      }
      const value = { ...(remote.data || {}) };
      if (remote.store === 'books') {
        const local = await dbGet('books', remote.item_id).catch(() => null);
        value.id = remote.item_id;
        value.cloudFilePath = remote.file_path || value.cloudFilePath || null;
        if (local?.fileData) value.fileData = local.fileData;
      } else if (remote.store === 'notebooks') {
        value.bookId = remote.item_id;
      } else {
        value.id = remote.item_id;
      }
      await dbPut(remote.store, value, { skipSync:true });
    } finally {
      state.applyingRemote = false;
    }
  }

  async function reconcileCloud() {
    const remoteRows = await fetchRemoteRecords();
    const remote = new Map(remoteRows.map(row => [`${row.store}:${row.item_id}`, row]));
    for (const store of SYNC_STORES) {
      const localRows = await dbGetAll(store);
      for (const value of localRows) {
        const itemId = recordId(store, value);
        const key = `${store}:${itemId}`;
        const cloud = remote.get(key);
        if (!cloud) {
          await queueSyncChange(store, value, 'put', state.db);
          continue;
        }
        remote.delete(key);
        const localTime = recordTimestamp(value);
        const remoteTime = Number(cloud.updated_at || 0);
        if (cloud.deleted) {
          if (localTime > remoteTime) await queueSyncChange(store, value, 'put', state.db);
          else await applyRemoteRecord(cloud);
        } else if (remoteTime > localTime) {
          await applyRemoteRecord(cloud);
        } else if (localTime > remoteTime) {
          await queueSyncChange(store, value, 'put', state.db);
        } else if (store === 'books' && !value.cloudFilePath && cloud.file_path) {
          await applyRemoteRecord(cloud);
        }
      }
    }
    for (const cloud of remote.values()) await applyRemoteRecord(cloud);
  }

  async function verifyCloudMirror() {
    const remoteRows = await fetchRemoteRecords();
    const remote = new Map(remoteRows.map(row => [`${row.store}:${row.item_id}`, row]));
    const missing = [];
    for (const store of SYNC_STORES) {
      for (const value of await dbGetAll(store)) {
        const itemId = recordId(store, value);
        const cloud = remote.get(`${store}:${itemId}`);
        if (!cloud || cloud.deleted || Number(cloud.updated_at || 0) < recordTimestamp(value)) {
          missing.push(`${store}:${itemId}`);
        }
      }
    }
    const queued = await dbGetAll('syncQueue');
    if (missing.length || queued.length) {
      throw new Error(`Cloud còn thiếu ${missing.length || queued.length} mục. Hãy bấm Đồng bộ ngay lần nữa.`);
    }
  }

  function recordsSignature(rows) {
    return rows.map(row => `${row.id || row.bookId}:${recordTimestamp(row)}:${row.type || ''}:${row.color || ''}`)
      .sort().join('|');
  }

  async function refreshOpenReaderAfterSync() {
    if (!state.currentBook) return;
    const bookId = state.currentBook.id;
    const nextAnnotations = await dbGetAllByBook('annotations', bookId);
    const nextBookmarks = await dbGetAllByBook('bookmarks', bookId);
    const annotationsChanged = recordsSignature(nextAnnotations) !== recordsSignature(state.annotations);
    const bookmarksChanged = recordsSignature(nextBookmarks) !== recordsSignature(state.bookmarks);
    if (annotationsChanged) {
      const previous = state.annotations;
      if (state.currentBook.type === 'epub') previous.forEach(removeEPUBAnnotation);
      state.annotations = nextAnnotations;
      if (state.currentBook.type === 'epub') state.annotations.forEach(applyEPUBAnnotation);
      else await renderPDFSpread();
      renderAnnotationPanels();
    }
    if (bookmarksChanged) {
      state.bookmarks = nextBookmarks;
      renderBookmarks();
      updateBookmarkButton();
    }
  }

  async function runQueuedSync() {
    if (state.syncing || !state.cloudUser || !navigator.onLine) return scheduleCloudFlush(1800);
    state.syncing = true;
    setSyncStatus('syncing', 'Đang đồng bộ...');
    try {
      await flushSyncQueue();
      state.lastSyncAt = Date.now();
      setSyncStatus('online', 'Đã đồng bộ');
    } catch (error) {
      console.error(error);
      setSyncStatus('error', 'Chưa đồng bộ được');
    } finally {
      state.syncing = false;
    }
  }

  async function syncNow(options = {}) {
    if (!state.cloudUser || !state.supabase) return;
    if (!navigator.onLine) {
      setSyncStatus('error', 'Đang ngoại tuyến');
      if (!options.quiet) toast('Không có kết nối Internet');
      return;
    }
    if (state.syncing) return;
    state.syncing = true;
    els.syncNowBtn && (els.syncNowBtn.disabled = true);
    setSyncStatus('syncing', 'Đang đồng bộ...');
    try {
      await flushSyncQueue();
      await reconcileCloud();
      await flushSyncQueue();
      if (!options.quiet) await verifyCloudMirror();
      state.lastSyncAt = Date.now();
      await refreshLibrary();
      await refreshOpenReaderAfterSync();
      setSyncStatus('online', 'Đã đồng bộ');
      if (!options.quiet) toast('Đã đồng bộ xong');
    } catch (error) {
      console.error(error);
      setSyncStatus('error', 'Đồng bộ gặp lỗi');
      if (!options.quiet) toast(`Không thể đồng bộ: ${error.message || 'lỗi không xác định'}`, 4200);
    } finally {
      state.syncing = false;
      els.syncNowBtn && (els.syncNowBtn.disabled = false);
    }
  }

  async function ensureLocalBookFile(book) {
    if (book.fileData) return book;
    if (!state.cloudUser || !state.supabase || !book.cloudFilePath) throw new Error('File sách chưa có trên thiết bị này.');
    if (!navigator.onLine) throw new Error('Hãy kết nối Internet để tải sách lần đầu trên thiết bị này.');
    const { data, error } = await state.supabase.storage.from('reader-books').download(book.cloudFilePath);
    if (error) throw error;
    book.fileData = await data.arrayBuffer();
    await dbPut('books', book, { skipSync:true });
    return book;
  }

  async function updateLegacyMigrationUI() {
    if (!state.cloudUser || !state.legacyDb || state.db === state.legacyDb) {
      els.legacyMigrationBox?.classList.add('hidden');
      return;
    }
    const migrationKey = `reader-migrated:${location.origin}:${state.cloudUser.id}`;
    if (localStorage.getItem(migrationKey) === '1') {
      els.legacyMigrationBox.classList.add('hidden');
      return;
    }
    const counts = {};
    for (const store of SYNC_STORES) counts[store] = (await dbGetAll(store, state.legacyDb)).length;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    els.legacyMigrationBox.classList.toggle('hidden', total === 0);
    els.legacyMigrationText.textContent = `${counts.books} sách · ${counts.annotations} đánh dấu · ${counts.bookmarks} bookmark · ${counts.notebooks} notebook đang chờ chuyển.`;
  }

  async function queueAllLocalData() {
    for (const store of SYNC_STORES) {
      for (const value of await dbGetAll(store)) await queueSyncChange(store, value, 'put', state.db);
    }
  }

  async function migrateLegacyData() {
    if (!state.cloudUser || state.db === state.legacyDb) return;
    els.migrateLocalBtn.disabled = true;
    els.migrateLocalBtn.textContent = 'Đang chuyển dữ liệu...';
    try {
      for (const store of SYNC_STORES) {
        const sourceRows = await dbGetAll(store, state.legacyDb);
        for (const source of sourceRows) {
          const itemId = recordId(store, source);
          const target = await dbGet(store, itemId).catch(() => null);
          if (!target || recordTimestamp(source) > recordTimestamp(target)) {
            const copy = { ...source };
            if (store === 'books') delete copy.cloudFilePath;
            await dbPut(store, copy, { skipSync:true });
          }
        }
      }
      await queueAllLocalData();
      localStorage.setItem(`reader-migrated:${location.origin}:${state.cloudUser.id}`, '1');
      await refreshLibrary();
      await syncNow();
      els.legacyMigrationBox.classList.add('hidden');
      toast('Đã chuyển dữ liệu cũ vào tài khoản');
    } catch (error) {
      console.error(error);
      toast(`Chưa chuyển xong: ${error.message || 'lỗi không xác định'}`, 4200);
    } finally {
      els.migrateLocalBtn.disabled = false;
      els.migrateLocalBtn.textContent = 'Đồng bộ dữ liệu hiện có';
    }
  }


  const enginePromises = {};
  function loadScript(src, key) {
    if (enginePromises[key]) return enginePromises[key];
    enginePromises[key] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${key} engine chưa tải. Kiểm tra kết nối Internet.`));
      document.head.appendChild(script);
      setTimeout(() => reject(new Error(`${key} engine tải quá lâu. Kiểm tra kết nối Internet.`)), 12000);
    });
    return enginePromises[key];
  }

  async function ensurePDFEngine() {
    if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'PDF');
    if (!window.pdfjsLib) throw new Error('PDF engine chưa sẵn sàng.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  async function ensureEpubEngine() {
    if (!window.ePub) await loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js', 'EPUB');
    if (!window.ePub) throw new Error('EPUB engine chưa sẵn sàng.');
  }

  // ---------- App shell ----------
  async function init() {
    cacheEls();
    // Password managers sometimes mistake the first text input on the page for
    // the account username. Keep library search locked and empty until a real
    // pointer/keyboard interaction happens.
    els.librarySearch.value = '';
    els.librarySearch.readOnly = true;
    state.legacyDb = await openDB(LEGACY_DB_NAME);
    state.db = state.legacyDb;
    applyTheme();
    applyUIScale(state.settings.uiScale);
    applyLibraryGridSettings();
    applyLibrarySidebarState();
    bindUI();
    await refreshLibrary();
    await clearLegacyCloudCache();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      await navigator.serviceWorker.register('./service-worker.js?v=1.7.2', { updateViaCache:'none' }).catch(() => {});
    }
    await initCloud();
  }

  function bindUI() {
    els.addBookBtn.addEventListener('click', () => els.bookFileInput.click());
    els.emptyAddBtn.addEventListener('click', () => els.bookFileInput.click());
    els.bookFileInput.addEventListener('change', handleFileInput);
    const unlockLibrarySearch = () => {
      const hadCredentialAutofill = /@/.test(els.librarySearch.value);
      els.librarySearch.readOnly = false;
      if (hadCredentialAutofill) {
        els.librarySearch.value = '';
        renderLibrary();
      }
    };
    els.librarySearch.addEventListener('pointerdown', unlockLibrarySearch);
    els.librarySearch.addEventListener('keydown', unlockLibrarySearch);
    els.librarySearch.addEventListener('input', renderLibrary);
    [80, 350, 1200].forEach(delay => setTimeout(() => {
      if (els.librarySearch.readOnly && els.librarySearch.value) {
        els.librarySearch.value = '';
        renderLibrary();
      }
    }, delay));
    els.chooseCoverBtn.addEventListener('click', () => els.customCoverInput.click());
    els.customCoverInput.addEventListener('change', handleCustomCoverInput);
    els.restoreCoverBtn.addEventListener('click', restoreOriginalCoverPreview);
    els.saveBookSettingsBtn.addEventListener('click', saveBookSettings);
    els.deleteBookFromSettingsBtn.addEventListener('click', async () => {
      const bookId = state.editingBookId;
      closeModals();
      if (bookId) await deleteBook(bookId);
    });
    els.bookCreateCollectionBtn.addEventListener('click', () => openCollectionModal());
    $('[data-create-collection-main]')?.addEventListener('click', () => openCollectionModal());
    els.manageCollectionsBtn?.addEventListener('click', () => {
      const editable = state.collections.some(item => item.id === state.activeCollectionId) ? state.activeCollectionId : null;
      openCollectionModal(editable);
    });
    els.collectionFilterSelect?.addEventListener('change', () => {
      state.activeCollectionId = els.collectionFilterSelect.value;
      showLibraryPanel('books');
    });
    els.authorFilterSelect?.addEventListener('change', () => {
      state.activeAuthor = els.authorFilterSelect.value;
      showLibraryPanel('books');
    });
    els.saveCollectionBtn.addEventListener('click', saveCollectionFromModal);
    els.deleteCollectionBtn.addEventListener('click', deleteCurrentCollection);
    els.collectionNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveCollectionFromModal();
    });
    $$('.library-nav-tab').forEach(tab => tab.addEventListener('click', () => showLibraryPanel(tab.dataset.libraryPanel)));
    $$('.segmented [data-filter]').forEach(btn => btn.addEventListener('click', () => {
      $$('.segmented [data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderLibrary();
    }));
    $$('[data-grid-cols]').forEach(button => button.addEventListener('click', () => {
      state.libraryGridColumns = clamp(Number(button.dataset.gridCols), 1, 5);
      localStorage.setItem('reader-library-grid-columns', String(state.libraryGridColumns));
      applyLibraryGridSettings();
    }));

    els.libraryThemeBtn.addEventListener('click', toggleTheme);
    els.readerThemeBtn.addEventListener('click', toggleTheme);
    els.accountBtn.addEventListener('click', openAccountModal);
    els.settingsBtn.addEventListener('click', openSettings);
    els.saveSettingsBtn.addEventListener('click', saveSettings);
    els.uiScaleRange.addEventListener('input', () => applyUIScale(els.uiScaleRange.value, true));
    $$('[data-ui-scale]', els.uiScalePresets).forEach(button => button.addEventListener('click', () => applyUIScale(button.dataset.uiScale, true)));
    els.backBtn.addEventListener('click', closeReader);
    els.librarySidebarHideBtn.addEventListener('click', () => setLibrarySidebar(true));
    els.librarySidebarShowBtn.addEventListener('click', () => setLibrarySidebar(false));
    els.librarySidebarMobileBtn.addEventListener('click', toggleLibrarySidebarMobile);
    $$('[data-library-section]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.librarySection === 'collectionsPanel' ? 'collections' : 'authors';
      const panel = document.getElementById(button.dataset.librarySection);
      const collapsed = !panel.classList.contains('is-collapsed');
      setLibrarySection(key, collapsed);
    }));
    els.leftSidebarBtn.addEventListener('click', () => toggleSidebar('left'));
    els.rightSidebarBtn.addEventListener('click', () => toggleSidebar('right'));
    $$('[data-close="left"]').forEach(b => b.addEventListener('click', () => setSidebar('left', false)));
    $$('[data-close="right"]').forEach(b => b.addEventListener('click', () => setSidebar('right', false)));

    [els.prevPageBtn, els.footerPrevBtn].forEach(b => b.addEventListener('click', () => navigate(-1)));
    [els.nextPageBtn, els.footerNextBtn].forEach(b => b.addEventListener('click', () => navigate(1)));
    els.zoomOutBtn.addEventListener('click', () => zoomBy(-0.1));
    els.zoomInBtn.addEventListener('click', () => zoomBy(0.1));
    els.mobileZoomOutBtn.addEventListener('click', () => zoomBy(-0.1));
    els.mobileZoomInBtn.addEventListener('click', () => zoomBy(0.1));
    els.fitWidthBtn.addEventListener('click', fitWidth);
    els.spreadBtn.addEventListener('click', toggleSpread);
    els.savePlaceBtn.addEventListener('click', saveReadingPlace);
    els.returnPlaceBtn.addEventListener('click', returnToReadingPlace);
    els.bookmarkBtn.addEventListener('click', toggleBookmark);
    els.readerSearchBtn.addEventListener('click', openSearch);
    els.fullscreenBtn.addEventListener('click', toggleFullscreen);

    $$('.panel-tab').forEach(tab => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
    document.addEventListener('mouseup', handlePDFSelection);
    document.addEventListener('touchend', () => setTimeout(handlePDFSelection, 80), { passive:true });
    document.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setTimeout(handlePDFSelection, 60);
    }, { passive:true });
    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    document.addEventListener('keyup', e => {
      if (e.key === 'Shift' || e.key.startsWith('Arrow')) handlePDFSelection();
    });
    els.selectionToolbar.addEventListener('mousedown', e => e.preventDefault());
    els.selectionToolbar.addEventListener('pointerdown', () => {
      // iOS may collapse the native selection before the following click fires.
      // Keep the captured EPUB selection alive long enough to run the action.
      state.selectionHoldUntil = Date.now() + 1200;
    });
    els.selectionToolbar.addEventListener('touchstart', () => {
      state.selectionHoldUntil = Date.now() + 1200;
    }, { passive:true });
    els.selectionToolbar.addEventListener('click', handleSelectionAction);
    const openMobileSelectionTools = e => {
      e.preventDefault();
      state.selectionHoldUntil = Date.now() + 1400;
      if (!captureCurrentReaderSelection()) toast('Hãy quét một đoạn chữ trước');
    };
    els.mobileSelectionBtn.addEventListener('touchstart', openMobileSelectionTools, { passive:false });
    els.mobileSelectionBtn.addEventListener('mousedown', openMobileSelectionTools);

    els.saveNoteBtn.addEventListener('click', saveNoteFromModal);
    els.deleteAnnotationBtn.addEventListener('click', async () => {
      const ann = state.currentEditingAnnotation;
      if (!ann) return;
      closeModals();
      await deleteAnnotation(ann);
    });
    $$('.modal-close, .modal-cancel').forEach(btn => btn.addEventListener('click', closeModals));
    els.modalBackdrop.addEventListener('click', closeModals);

    els.bookSearchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') searchBook(els.bookSearchInput.value.trim());
    });

    els.translationCopyBtn.addEventListener('click', async () => {
      const text = els.translationResult.textContent;
      if (text && !text.includes('Đang dịch')) {
        await navigator.clipboard.writeText(text).catch(() => {});
        toast('Đã copy');
      }
    });
    els.translationNotebookBtn.addEventListener('click', addTranslationToNotebook);
    els.signInBtn.addEventListener('click', handleSignIn);
    els.signUpBtn.addEventListener('click', handleSignUp);
    els.forgotPasswordBtn.addEventListener('click', requestPasswordRecovery);
    els.changePasswordBtn.addEventListener('click', showPasswordResetPanel);
    els.cancelResetPasswordBtn.addEventListener('click', cancelPasswordReset);
    els.saveNewPasswordBtn.addEventListener('click', saveNewPassword);
    els.signOutBtn.addEventListener('click', handleSignOut);
    els.syncNowBtn.addEventListener('click', () => syncNow());
    els.migrateLocalBtn.addEventListener('click', migrateLegacyData);
    els.authPassword.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSignIn();
    });
    [els.newPassword, els.confirmNewPassword].forEach(input => input.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveNewPassword();
    }));

    bindNotebookEditor(els.bookNotebookToolbar, els.notebookEditor, scheduleNotebookSave);
    bindNotebookEditor(els.globalNotebookToolbar, els.globalNotebookEditor, scheduleGlobalNotebookSave);
    els.globalNotebookOpenBookBtn.addEventListener('click', async () => {
      const bookId = els.globalNotebookOpenBookBtn.dataset.bookId;
      if (!bookId) return;
      await saveGlobalNotebook();
      await openBook(bookId);
    });

    window.addEventListener('resize', debounce(() => refreshReaderLayout(), 160));
    if ('ResizeObserver' in window) {
      state.readerResizeObserver = new ResizeObserver(debounce(() => refreshReaderLayout(), 120));
      state.readerResizeObserver.observe(els.readerMain);
    }

    document.addEventListener('keydown', handleShortcuts);
    document.addEventListener('pointerdown', e => {
      if (!isSelectionToolTarget(e.target)) hideSelectionTools();
    }, true);
    els.pdfReader.addEventListener('wheel', () => hideSelectionTools(), { passive:true });
    els.pdfReader.addEventListener('touchmove', () => hideSelectionTools(), { passive:true });
    bindMobileReaderGestures(els.pdfReader);
    window.addEventListener('online', () => syncNow({ quiet:true }));
    window.addEventListener('offline', () => state.cloudUser && setSyncStatus('error', 'Đang ngoại tuyến'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.cloudUser) syncNow({ quiet:true });
    });
  }

  function isSelectionToolTarget(target) {
    return els.selectionToolbar.contains(target) || els.translationPopover.contains(target);
  }

  function handleDocumentSelectionChange() {
    requestAnimationFrame(() => {
      if (state.selection?.format === 'epub') return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) {
        if (state.currentBook?.type === 'pdf') handlePDFSelection();
        return;
      }
      hideSelectionTools();
    });
  }

  function applyTheme() {
    document.body.classList.toggle('dark', state.settings.theme === 'dark');
    els.libraryThemeBtn && (els.libraryThemeBtn.textContent = state.settings.theme === 'dark' ? '☀' : '☾');
    els.readerThemeBtn && (els.readerThemeBtn.textContent = state.settings.theme === 'dark' ? '☀' : '☾');
    applyEpubTheme();
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('reader-theme', state.settings.theme);
    applyTheme();
  }

  function applyUIScale(value, persist = false) {
    const scale = clamp(Math.round(Number(value || 100) / 5) * 5, 80, 110);
    const factor = scale / 100;
    state.settings.uiScale = scale;
    if (els.libraryView) {
      els.libraryView.style.zoom = String(factor);
      // CSS zoom already recalculates the layout viewport. Expanding the
      // element to 100 / factor too makes Chrome/Safari count that extra
      // width twice and creates a page-wide horizontal scrollbar.
      els.libraryView.style.width = '100%';
      // Compensate height only: 100vh at 80% zoom is visually just 80vh.
      // This keeps the sidebar flush with the bottom without widening the page.
      els.libraryView.style.minHeight = `${100 / factor}vh`;
      els.libraryView.style.setProperty('--ui-viewport-height', `${100 / factor}vh`);
    }
    if (els.uiScaleRange) els.uiScaleRange.value = String(scale);
    if (els.uiScaleValue) els.uiScaleValue.textContent = `${scale}%`;
    if (els.uiScalePresets) {
      $$('[data-ui-scale]', els.uiScalePresets).forEach(button => button.classList.toggle('active', Number(button.dataset.uiScale) === scale));
    }
    if (persist) localStorage.setItem('reader-ui-scale', String(scale));
  }

  function openSettings() {
    els.sourceLang.value = state.settings.sourceLang;
    els.targetLang.value = state.settings.targetLang;
    applyUIScale(state.settings.uiScale);
    openModal(els.settingsModal);
  }

  function saveSettings() {
    state.settings.sourceLang = els.sourceLang.value;
    state.settings.targetLang = els.targetLang.value;
    state.settings.uiScale = Number(els.uiScaleRange.value || state.settings.uiScale);
    localStorage.setItem('reader-source-lang', state.settings.sourceLang);
    localStorage.setItem('reader-target-lang', state.settings.targetLang);
    applyUIScale(state.settings.uiScale, true);
    closeModals();
    toast('Đã lưu cài đặt');
  }

  // ---------- Library ----------
  function applyLibraryGridSettings() {
    if (!els.libraryView) return;
    els.libraryView.style.setProperty('--library-cols', String(state.libraryGridColumns));
    els.libraryView.dataset.gridColumns = String(state.libraryGridColumns);
    $$('[data-grid-cols]').forEach(button => button.classList.toggle('active', Number(button.dataset.gridCols) === state.libraryGridColumns));
  }

  async function refreshLibrary() {
    state.books = (await dbGetAll('books')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    await loadCollections();
    await loadLibraryPreferences();
    renderLibrary();
    renderStatusPanel();
    if (!els.globalNotebookPanel.classList.contains('hidden')) await renderGlobalNotebookList();
  }

  async function loadLibraryPreferences() {
    const row = await dbGet('notebooks', LIBRARY_PREFS_NOTEBOOK_ID).catch(() => null);
    state.pinnedBookId = row?.pinnedBookId && state.books.some(book => book.id === row.pinnedBookId) ? row.pinnedBookId : null;
  }

  async function saveLibraryPreferences() {
    await dbPut('notebooks', { bookId:LIBRARY_PREFS_NOTEBOOK_ID, pinnedBookId:state.pinnedBookId || null, updatedAt:Date.now() });
  }

  async function pinBook(bookId) {
    state.pinnedBookId = state.pinnedBookId === bookId ? null : bookId;
    await saveLibraryPreferences();
    renderLibraryHero();
    renderLibrary();
    toast(state.pinnedBookId ? 'Đã ghim sách lên đầu thư viện' : 'Đã bỏ ghim sách');
  }

  function completionCount(book) {
    return Math.max(Number(book.completedCount || 0), Number(book.progress || 0) >= 99.5 ? 1 : 0);
  }

  async function restartBook(bookId, openAfter = true) {
    const book = await dbGet('books', bookId);
    if (!book) return;
    book.completedCount = completionCount(book);
    book.progress = 0;
    book.lastLocation = null;
    book.readingPlace = null;
    book.updatedAt = Date.now();
    await dbPut('books', book);
    await refreshLibrary();
    if (openAfter) await openBook(bookId);
  }

  async function loadCollections() {
    const row = await dbGet('notebooks', COLLECTIONS_NOTEBOOK_ID).catch(() => null);
    const collections = Array.isArray(row?.collections) ? row.collections : [];
    state.collections = collections.map(item => ({
      id:String(item.id || uid()),
      name:String(item.name || 'Nhóm chưa đặt tên').trim().slice(0, 60),
      bookIds:[...new Set(Array.isArray(item.bookIds) ? item.bookIds.map(String) : [])],
      createdAt:Number(item.createdAt || Date.now())
    }));
    if (!['all','unfiled'].includes(state.activeCollectionId)
      && !state.collections.some(item => item.id === state.activeCollectionId)) state.activeCollectionId = 'all';
  }

  async function saveCollections() {
    await dbPut('notebooks', {
      bookId:COLLECTIONS_NOTEBOOK_ID,
      collections:state.collections,
      updatedAt:Date.now()
    });
  }

  function collectionCount(collection) {
    const existing = new Set(state.books.map(book => book.id));
    return collection.bookIds.filter(id => existing.has(id)).length;
  }

  function bookCollectionIds(bookId) {
    return state.collections.filter(item => item.bookIds.includes(bookId)).map(item => item.id);
  }

  function renderCollectionsBar() {
    const assigned = new Set(state.collections.flatMap(item => item.bookIds));
    const unfiledCount = state.books.filter(book => !assigned.has(book.id)).length;
    const filter = (id, label, count) => `<button class="collection-pill${state.activeCollectionId === id ? ' active' : ''}" data-collection-filter="${escapeHTML(id)}"><span>${escapeHTML(label)}</span><b>${count}</b></button>`;
    els.collectionsBar.innerHTML = '';
    els.collectionsChips.innerHTML = [
      filter('all', 'Tất cả sách', state.books.length),
      ...state.collections.map(item => filter(item.id, item.name, collectionCount(item)))
    ].join('');
    if (els.collectionFilterSelect) {
      els.collectionFilterSelect.innerHTML = [
        `<option value="all">Tất cả sách (${state.books.length})</option>`,
        `<option value="unfiled">Chưa phân nhóm (${unfiledCount})</option>`,
        ...state.collections.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)} (${collectionCount(item)})</option>`)
      ].join('');
      els.collectionFilterSelect.value = state.activeCollectionId;
      const selected = state.activeCollectionId === 'all' ? state.books.length : state.activeCollectionId === 'unfiled' ? unfiledCount : collectionCount(state.collections.find(item => item.id === state.activeCollectionId) || {bookIds:[]});
      els.collectionFilterMeta.textContent = `${selected} cuốn sách`;
    }
    [els.collectionsChips].forEach(container => {
      $$('[data-collection-filter]', container).forEach(button => button.addEventListener('click', () => {
        state.activeCollectionId = button.dataset.collectionFilter;
        els.libraryView.classList.remove('library-sidebar-mobile-open');
        els.libraryBooksPanel.classList.remove('hidden');
        els.libraryStatusPanel.classList.add('hidden');
        els.globalNotebookPanel.classList.add('hidden');
        $$('.library-nav-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.libraryPanel === 'books'));
        if (state.globalNotebookLoaded) saveGlobalNotebook().catch(() => {});
        renderLibrary();
      }));
      $('[data-create-collection]', container)?.addEventListener('click', () => openCollectionModal());
    });
  }

  function renderAuthorsBar() {
    const countByAuthor = new Map();
    state.books.forEach(book => {
      const author = String(book.author || 'Không rõ tác giả').trim() || 'Không rõ tác giả';
      countByAuthor.set(author, (countByAuthor.get(author) || 0) + 1);
    });
    const authors = [...countByAuthor.keys()].sort((a, b) => a.localeCompare(b, 'vi'));
    els.authorsBar.innerHTML = '';
    if (els.authorFilterSelect) {
      els.authorFilterSelect.innerHTML = [
        `<option value="all">Tất cả tác giả (${authors.length})</option>`,
        ...authors.map(author => `<option value="${escapeHTML(author)}">${escapeHTML(author)} (${countByAuthor.get(author)})</option>`)
      ].join('');
      els.authorFilterSelect.value = state.activeAuthor;
      els.authorFilterMeta.textContent = state.activeAuthor === 'all' ? `${authors.length} tác giả` : `${countByAuthor.get(state.activeAuthor) || 0} cuốn sách`;
    }
  }

  function renderLibraryHero() {
    const book = state.books.find(item => item.id === state.pinnedBookId);
    if (!book) {
      els.libraryHero.innerHTML = `<div class="library-hero-empty"><span class="hero-pin-symbol">⌖</span><div><div class="library-hero-eyebrow">KỆ SÁCH CỦA BẠN</div><h2>Ghim một cuốn sách</h2><p>Dùng nút ghim trên thẻ sách để đưa cuốn bạn muốn đọc lên đây.</p></div></div>`;
      els.libraryHero.classList.remove('hidden');
      return;
    }
    const progress = Math.round(book.progress || 0);
    const isDone = progress >= 100;
    const actionLabel = isDone ? 'Đọc lại từ đầu' : progress > 0 ? 'Đọc tiếp' : 'Bắt đầu đọc';
    const cover = book.cover
      ? `<img src="${book.cover}" alt="" />`
      : `<div class="hero-cover-fallback"><small>${escapeHTML(book.author || 'Reader Studio')}</small><strong>${escapeHTML(book.title)}</strong><span>${book.type.toUpperCase()}</span></div>`;
    els.libraryHero.innerHTML = `<div class="library-hero-copy">
        <div class="library-hero-eyebrow">⌖ &nbsp; SÁCH ĐÃ GHIM</div>
        <h2>${escapeHTML(book.title)}</h2>
        <p>${escapeHTML(book.author || 'Không rõ tác giả')}</p>
        <div class="library-hero-actions"><button class="hero-continue" ${isDone ? 'data-hero-restart' : 'data-hero-open'}="${escapeHTML(book.id)}">▶ <span>${actionLabel}</span></button><b>${progress}% đã đọc</b></div>
      </div>
      <div class="library-hero-stage"><div class="library-hero-reflection" aria-hidden="true">${cover}</div><div class="library-hero-cover">${cover}</div><div class="hero-progress-card"><span>Tiến độ</span><b>${progress}%</b><i><em style="width:${progress}%"></em></i></div></div>`;
    els.libraryHero.classList.remove('hidden');
    $('[data-hero-open]', els.libraryHero)?.addEventListener('click', () => openBook(book.id));
    $('[data-hero-restart]', els.libraryHero)?.addEventListener('click', () => restartBook(book.id));
  }

  function renderLibrary() {
    const query = els.librarySearch.value.trim().toLowerCase();
    const filter = $('.segmented [data-filter].active')?.dataset.filter || 'all';
    const assigned = new Set(state.collections.flatMap(item => item.bookIds));
    const activeCollection = state.collections.find(item => item.id === state.activeCollectionId);
    if (state.activeAuthor !== 'all' && !state.books.some(book => (String(book.author || 'Không rõ tác giả').trim() || 'Không rõ tác giả') === state.activeAuthor)) {
      state.activeAuthor = 'all';
    }
    const books = state.books.filter(book => {
      const matchesFilter = filter === 'all' || book.type === filter;
      const matchesQuery = !query || `${book.title} ${book.author || ''}`.toLowerCase().includes(query);
      const author = String(book.author || 'Không rõ tác giả').trim() || 'Không rõ tác giả';
      const matchesAuthor = state.activeAuthor === 'all' || author === state.activeAuthor;
      const matchesCollection = state.activeCollectionId === 'all'
        || (state.activeCollectionId === 'unfiled' ? !assigned.has(book.id)
          : !!activeCollection?.bookIds.includes(book.id));
      return matchesFilter && matchesQuery && matchesCollection && matchesAuthor;
    });

    renderCollectionsBar();
    renderAuthorsBar();
    renderLibraryHero();
    els.libraryResultCount.textContent = `${books.length} cuốn sách`;
    els.libraryEmpty.classList.toggle('hidden', state.books.length > 0 || query || filter !== 'all');
    els.bookGrid.innerHTML = books.length ? books.map(book => {
      const progress = Math.round(book.progress || 0);
      const cover = book.cover
        ? `<img src="${book.cover}" alt="" />`
        : `<div class="cover-fallback"><strong>${escapeHTML(book.title)}</strong><span>${escapeHTML(book.author || 'Reader Studio')}</span></div>`;
      return `<article class="book-card" data-book-id="${book.id}" tabindex="0">
        <div class="book-cover">${cover}</div>
        <div class="book-card-actions"><button class="card-pin${state.pinnedBookId === book.id ? ' active' : ''}" title="${state.pinnedBookId === book.id ? 'Bỏ ghim' : 'Ghim sách'}" aria-label="${state.pinnedBookId === book.id ? 'Bỏ ghim' : 'Ghim sách'}" aria-pressed="${state.pinnedBookId === book.id}" data-pin-book><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-1-1 4-4-2-2 5-1 4-4 1-3Z"/></svg></button><button class="card-menu" title="Đổi bìa và sắp xếp sách" aria-label="Tùy chỉnh sách">•••</button></div>
        <div class="book-meta"><div class="book-title">${escapeHTML(book.title)}</div><div class="book-author">${escapeHTML(book.author || 'Không rõ tác giả')}</div>
          <div class="mini-progress"><div class="mini-progress-track"><span style="width:${progress}%"></span></div><span>${progress}%</span></div>
        </div>
      </article>`;
    }).join('') : `<div class="collection-empty"><strong>Chưa có sách phù hợp</strong><span>Hãy đổi bộ lọc hoặc thêm sách vào reading list này.</span></div>`;

    $$('.book-card', els.bookGrid).forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.card-menu,.card-pin')) return;
        if (state.libraryGridColumns >= 4 && matchMedia('(hover:none)').matches && !card.classList.contains('info-visible')) {
          $$('.book-card.info-visible', els.bookGrid).forEach(item => item.classList.remove('info-visible'));
          card.classList.add('info-visible');
          return;
        }
        openBook(card.dataset.bookId);
      });
      $('.card-menu', card).addEventListener('click', e => {
        e.stopPropagation();
        openBookSettings(card.dataset.bookId);
      });
      $('.card-pin', card).addEventListener('click', e => {
        e.stopPropagation();
        pinBook(card.dataset.bookId);
      });
    });
  }

  function renderStatusPanel() {
    if (!els.libraryStatusPanel) return;
    const completed = state.books.filter(book => completionCount(book) > 0);
    const incomplete = state.books.filter(book => completionCount(book) === 0);
    const total = completed.reduce((sum, book) => sum + completionCount(book), 0);
    els.statusCompletedBooks.textContent = String(completed.length);
    els.statusCompletionTotal.textContent = String(total);
    els.statusNeverCompleted.textContent = String(incomplete.length);
    els.statusCompletedBadge.textContent = String(completed.length);
    els.statusIncompleteBadge.textContent = String(incomplete.length);
    els.statusCompletedList.innerHTML = completed.length ? completed.map(book => {
      return `<article class="status-book-row" data-status-open="${escapeHTML(book.id)}"><span class="status-dot"></span><div class="status-book-copy"><strong>${escapeHTML(book.title)}</strong><span>${escapeHTML(book.author || 'Không rõ tác giả')}</span></div></article>`;
    }).join('') : '<div class="status-empty">Chưa có cuốn sách nào được đọc xong.</div>';
    els.statusIncompleteList.innerHTML = incomplete.length ? incomplete.map(book => `<article class="status-book-row" data-status-open="${escapeHTML(book.id)}"><span class="status-dot"></span><div class="status-book-copy"><strong>${escapeHTML(book.title)}</strong><span>${escapeHTML(book.author || 'Không rõ tác giả')}</span></div></article>`).join('') : `<div class="status-empty">${state.books.length ? 'Tất cả sách đều đã được hoàn thành ít nhất một lần.' : 'Chưa có sách trong thư viện.'}</div>`;
    $$('[data-status-open]', els.libraryStatusPanel).forEach(row => row.addEventListener('click', e => {
      openBook(row.dataset.statusOpen);
    }));
  }

  function renderBookCoverPreview(cover, title) {
    els.bookCoverPreview.innerHTML = cover
      ? `<img src="${cover}" alt="Bìa ${escapeHTML(title || '')}" />`
      : `<div class="cover-fallback"><strong>${escapeHTML(title || 'Sách')}</strong><span>Reader Studio</span></div>`;
  }

  function renderBookCollectionChoices(bookId) {
    if (!state.collections.length) {
      els.bookCollectionChoices.innerHTML = '<span class="empty-choice">Chưa có nhóm nào. Bạn có thể tạo reading list mới.</span>';
      return;
    }
    els.bookCollectionChoices.innerHTML = state.collections.map(item => `<label class="collection-check"><input type="checkbox" value="${escapeHTML(item.id)}" ${item.bookIds.includes(bookId) ? 'checked' : ''} /><span>${escapeHTML(item.name)}</span></label>`).join('');
  }

  function openBookSettings(bookId) {
    const book = state.books.find(item => item.id === bookId);
    if (!book) return;
    state.editingBookId = bookId;
    state.pendingCover = null;
    state.pendingCoverMode = null;
    els.bookTitleInput.value = book.title || '';
    els.bookAuthorInput.value = book.author || '';
    renderBookCoverPreview(book.cover, book.title);
    renderBookCollectionChoices(bookId);
    els.customCoverInput.value = '';
    els.restoreCoverBtn.disabled = !book.customCover && !book.originalCover;
    openModal(els.bookSettingsModal);
  }

  async function imageFileToCover(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Hãy chọn file PNG, JPG hoặc WEBP.');
    if (file.size > 18 * 1024 * 1024) throw new Error('Ảnh bìa phải nhỏ hơn 18 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Không đọc được ảnh bìa.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1080;
      const targetRatio = canvas.width / canvas.height;
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
      if (sourceRatio > targetRatio) {
        sw = sh * targetRatio;
        sx = (image.naturalWidth - sw) / 2;
      } else {
        sh = sw / targetRatio;
        sy = (image.naturalHeight - sh) / 2;
      }
      canvas.getContext('2d').drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .86);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handleCustomCoverInput() {
    const file = els.customCoverInput.files?.[0];
    if (!file) return;
    try {
      state.pendingCover = await imageFileToCover(file);
      state.pendingCoverMode = 'custom';
      renderBookCoverPreview(state.pendingCover, els.bookTitleInput.value);
    } catch (error) {
      toast(error.message || 'Không thể dùng ảnh này', 3600);
    }
  }

  function restoreOriginalCoverPreview() {
    const book = state.books.find(item => item.id === state.editingBookId);
    if (!book) return;
    state.pendingCover = book.originalCover || (book.customCover ? '' : book.cover || '');
    state.pendingCoverMode = 'restore';
    renderBookCoverPreview(state.pendingCover, els.bookTitleInput.value);
  }

  async function saveBookSettings() {
    const book = state.books.find(item => item.id === state.editingBookId);
    if (!book) return;
    const title = els.bookTitleInput.value.trim();
    if (!title) return toast('Tên sách không được để trống');
    book.title = title;
    book.author = els.bookAuthorInput.value.trim();
    if (state.pendingCoverMode === 'custom' && state.pendingCover) {
      if (!book.originalCover) book.originalCover = book.cover || '';
      book.cover = state.pendingCover;
      book.customCover = true;
    } else if (state.pendingCoverMode === 'restore') {
      book.cover = state.pendingCover || '';
      book.customCover = false;
    }
    const selected = new Set($$('input[type="checkbox"]:checked', els.bookCollectionChoices).map(input => input.value));
    state.collections.forEach(item => {
      const hasBook = item.bookIds.includes(book.id);
      if (selected.has(item.id) && !hasBook) item.bookIds.push(book.id);
      if (!selected.has(item.id) && hasBook) item.bookIds = item.bookIds.filter(id => id !== book.id);
    });
    book.updatedAt = Date.now();
    await dbPut('books', book);
    await saveCollections();
    closeModals();
    await refreshLibrary();
    toast('Đã cập nhật sách');
  }

  function openCollectionModal(collectionId = null) {
    const collection = state.collections.find(item => item.id === collectionId);
    state.collectionReturnBookId = !els.bookSettingsModal.classList.contains('hidden') ? state.editingBookId : null;
    state.editingCollectionId = collection?.id || null;
    els.collectionModalTitle.textContent = collection ? 'Chỉnh sửa nhóm sách' : 'Tạo reading list';
    els.collectionNameInput.value = collection?.name || '';
    els.deleteCollectionBtn.classList.toggle('hidden', !collection);
    openModal(els.collectionModal);
    setTimeout(() => els.collectionNameInput.focus(), 40);
  }

  async function saveCollectionFromModal() {
    const name = els.collectionNameInput.value.trim();
    if (!name) return toast('Hãy nhập tên nhóm');
    if (state.editingCollectionId) {
      const collection = state.collections.find(item => item.id === state.editingCollectionId);
      if (collection) collection.name = name;
    } else {
      state.collections.push({ id:uid(), name, bookIds:[], createdAt:Date.now() });
    }
    await saveCollections();
    const bookId = state.collectionReturnBookId;
    closeModals();
    await refreshLibrary();
    if (bookId) openBookSettings(bookId);
    toast('Đã lưu reading list');
  }

  async function deleteCurrentCollection() {
    const collection = state.collections.find(item => item.id === state.editingCollectionId);
    if (!collection || !confirm(`Xóa nhóm “${collection.name}”? Sách bên trong vẫn được giữ lại.`)) return;
    state.collections = state.collections.filter(item => item.id !== collection.id);
    if (state.activeCollectionId === collection.id) state.activeCollectionId = 'all';
    await saveCollections();
    closeModals();
    await refreshLibrary();
    toast('Đã xóa nhóm · sách vẫn còn trong thư viện');
  }

  async function showLibraryPanel(name) {
    els.libraryView.classList.remove('library-sidebar-mobile-open');
    const showNotebooks = name === 'notebooks';
    const showStatus = name === 'status';
    $$('.library-nav-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.libraryPanel === name));
    els.libraryBooksPanel.classList.toggle('hidden', showNotebooks || showStatus);
    els.libraryStatusPanel.classList.toggle('hidden', !showStatus);
    els.globalNotebookPanel.classList.toggle('hidden', !showNotebooks);
    if (showStatus) {
      renderStatusPanel();
      if (state.globalNotebookLoaded) await saveGlobalNotebook();
      return;
    }
    if (!showNotebooks) {
      renderLibrary();
      if (state.globalNotebookLoaded) await saveGlobalNotebook();
      return;
    }
    if (state.globalNotebookLoaded) await saveGlobalNotebook();
    await renderGlobalNotebookList();
    await loadGlobalNotebook(state.globalNotebookBookId, false);
  }

  async function renderGlobalNotebookList() {
    const rows = await dbGetAll('notebooks');
    const byBook = new Map(rows.map(row => [row.bookId, row]));
    els.globalNotebookCount.textContent = String(state.books.length + 1);
    const items = [
      { id:GLOBAL_NOTEBOOK_ID, title:'Ghi chú chung', type:'Không thuộc riêng sách nào', icon:'N' },
      ...state.books.map(book => ({ id:book.id, title:book.title, type:book.type.toUpperCase(), icon:book.type === 'pdf' ? 'P' : 'E' }))
    ];
    els.globalNotebookList.innerHTML = items.map(item => {
      const hasNote = !!byBook.get(item.id)?.html?.replace(/<[^>]*>|&nbsp;/g, '').trim();
      return `<button class="global-notebook-item${item.id === state.globalNotebookBookId ? ' active' : ''}" data-notebook-book-id="${escapeHTML(item.id)}">
        <span class="global-notebook-item-icon">${item.icon}</span>
        <span class="global-notebook-item-text"><strong>${escapeHTML(item.title)}</strong><span>${hasNote ? 'Đã có ghi chú' : item.type}</span></span>
      </button>`;
    }).join('');
    $$('.global-notebook-item', els.globalNotebookList).forEach(button => button.addEventListener('click', async () => {
      const bookId = button.dataset.notebookBookId;
      if (bookId === state.globalNotebookBookId) return;
      await loadGlobalNotebook(bookId, true);
      $$('.global-notebook-item', els.globalNotebookList).forEach(item => item.classList.toggle('active', item.dataset.notebookBookId === bookId));
    }));
  }

  async function loadGlobalNotebook(bookId, saveCurrent = true) {
    if (saveCurrent && state.globalNotebookLoaded) await saveGlobalNotebook();
    const book = state.books.find(item => item.id === bookId);
    if (bookId !== GLOBAL_NOTEBOOK_ID && !book) bookId = GLOBAL_NOTEBOOK_ID;
    state.globalNotebookBookId = bookId;
    const row = await dbGet('notebooks', bookId);
    els.globalNotebookEditor.innerHTML = row?.html || '';
    state.notebookRanges.delete(els.globalNotebookEditor);
    state.globalNotebookLoaded = true;
    els.globalNotebookSaveState.textContent = 'Đã lưu';
    els.globalNotebookTitle.textContent = bookId === GLOBAL_NOTEBOOK_ID ? 'Ghi chú chung' : book.title;
    els.globalNotebookEditor.dataset.placeholder = bookId === GLOBAL_NOTEBOOK_ID
      ? 'Viết những ghi chú không thuộc riêng cuốn sách nào ở đây...'
      : `Viết notebook cho “${book.title}”...`;
    els.globalNotebookOpenBookBtn.classList.toggle('hidden', bookId === GLOBAL_NOTEBOOK_ID);
    els.globalNotebookOpenBookBtn.dataset.bookId = bookId === GLOBAL_NOTEBOOK_ID ? '' : bookId;
  }

  async function handleFileInput() {
    const file = els.bookFileInput.files?.[0];
    els.bookFileInput.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'epub'].includes(ext)) return toast('Hiện hỗ trợ PDF và EPUB');
    showGlobalLoading(`Đang thêm ${file.name}...`);
    try {
      const data = await file.arrayBuffer();
      const base = {
        id: uid(), type: ext, fileName: file.name, fileData: data,
        title: file.name.replace(/\.(pdf|epub)$/i, ''), author: '', cover: '', progress: 0,
        lastLocation: null, completedCount:0, lastCompletedAt:null, createdAt: Date.now(), updatedAt: Date.now()
      };
      const enriched = ext === 'pdf' ? await inspectPDF(base) : await inspectEPUB(base);
      await dbPut('books', enriched);
      await refreshLibrary();
      hideGlobalLoading();
      await openBook(enriched.id);
    } catch (err) {
      console.error(err);
      hideGlobalLoading();
      toast(`Không thể mở file: ${err.message || 'lỗi không xác định'}`, 3800);
    }
  }

  async function inspectPDF(book) {
    await ensurePDFEngine();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(book.fileData.slice(0)) }).promise;
    try {
      const meta = await doc.getMetadata().catch(() => null);
      const info = meta?.info || {};
      if (info.Title && String(info.Title).trim()) book.title = String(info.Title).trim();
      if (info.Author && String(info.Author).trim()) book.author = String(info.Author).trim();
      book.pageCount = doc.numPages;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(0.8, 380 / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      await page.render({ canvasContext: ctx, viewport }).promise;
      book.cover = canvas.toDataURL('image/jpeg', .82);
    } finally {
      await doc.destroy().catch(() => {});
    }
    return book;
  }

  async function inspectEPUB(book) {
    await ensureEpubEngine();
    const epub = ePub(book.fileData.slice(0));
    try {
      const meta = await epub.loaded.metadata;
      if (meta?.title) book.title = meta.title;
      if (meta?.creator) book.author = meta.creator;
      const coverUrl = await epub.coverUrl().catch(() => null);
      if (coverUrl) book.cover = await urlToDataURL(coverUrl).catch(() => '');
    } finally {
      epub.destroy();
    }
    return book;
  }

  function urlToDataURL(url) {
    return fetch(url).then(r => r.blob()).then(blob => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }));
  }

  async function deleteBook(id) {
    const book = state.books.find(b => b.id === id);
    if (!book) return;
    if (!confirm(`Xóa “${book.title}” khỏi thư viện?`)) return;
    await dbDelete('books', id);
    await deleteByBook('annotations', id);
    await deleteByBook('bookmarks', id);
    await dbDelete('notebooks', id).catch(() => {});
    let collectionsChanged = false;
    state.collections.forEach(item => {
      if (item.bookIds.includes(id)) {
        item.bookIds = item.bookIds.filter(bookId => bookId !== id);
        collectionsChanged = true;
      }
    });
    if (collectionsChanged) await saveCollections();
    if (state.pinnedBookId === id) {
      state.pinnedBookId = null;
      await saveLibraryPreferences();
    }
    if (state.globalNotebookBookId === id) {
      state.globalNotebookBookId = GLOBAL_NOTEBOOK_ID;
      state.globalNotebookLoaded = false;
    }
    await refreshLibrary();
    toast('Đã xóa sách');
  }

  // ---------- Reader lifecycle ----------
  async function openBook(id) {
    let book = await dbGet('books', id);
    if (!book) return;
    if (!book.fileData) {
      showGlobalLoading(`Đang tải “${book.title}” về thiết bị...`);
      try {
        book = await ensureLocalBookFile(book);
      } catch (error) {
        hideGlobalLoading();
        return toast(`Không thể tải sách: ${error.message || 'lỗi không xác định'}`, 4200);
      }
      hideGlobalLoading();
    }
    hideSelectionTools();
    state.currentBook = book;
    state.annotations = await dbGetAllByBook('annotations', id);
    state.bookmarks = await dbGetAllByBook('bookmarks', id);
    state.currentPage = book.lastLocation?.page || 1;
    state.pdfZoom = 1;
    state.epubFontSize = book.epubFontSize || 100;
    state.spread = !!book.spread;
    state.epubLocationReady = false;
    updateZoomIndicators();

    els.libraryView.classList.add('hidden');
    els.readerView.classList.remove('hidden');
    els.readerTitle.textContent = book.title;
    els.readerAuthor.textContent = book.author || '';
    els.spreadBtn.classList.toggle('active', state.spread);
    setSidebar('left', window.innerWidth > 780 && localStorage.getItem('reader-left-sidebar-collapsed') !== '1', false);
    setSidebar('right', window.innerWidth > 1100 && localStorage.getItem('reader-right-sidebar-collapsed') !== '1', false);
    await loadNotebook();
    renderAnnotationPanels();
    renderBookmarks();
    updateReadingPlaceButtons();
    showReaderLoading(true);

    try {
      if (book.type === 'pdf') await openPDF(book);
      else await openEPUB(book);
    } catch (err) {
      console.error(err);
      toast(`Không thể mở sách: ${err.message || 'lỗi không xác định'}`, 4200);
      await closeReader();
      return;
    } finally {
      showReaderLoading(false);
    }
    updateBookmarkButton();
  }

  async function closeReader() {
    hideSelectionTools();
    await saveNotebook();
    await saveCurrentProgress(true);
    if (state.pdfDoc) {
      await state.pdfDoc.destroy().catch(() => {});
      state.pdfDoc = null;
    }
    if (state.rendition) {
      try { state.rendition.destroy(); } catch (_) {}
      state.rendition = null;
    }
    if (state.epubBook) {
      try { state.epubBook.destroy(); } catch (_) {}
      state.epubBook = null;
    }
    state.currentBook = null;
    els.readerView.classList.add('hidden');
    els.libraryView.classList.remove('hidden');
    await refreshLibrary();
    if (!els.globalNotebookPanel.classList.contains('hidden')) {
      await loadGlobalNotebook(state.globalNotebookBookId, false);
      await renderGlobalNotebookList();
    }
  }

  function showReaderLoading(show) { els.readerLoading.classList.toggle('hidden', !show); }
  function showGlobalLoading(text) {
    els.readerView.classList.remove('hidden');
    els.libraryView.classList.add('hidden');
    els.readerLoading.querySelector('span').textContent = text;
    showReaderLoading(true);
  }
  function hideGlobalLoading() {
    showReaderLoading(false);
    if (!state.currentBook) {
      els.readerView.classList.add('hidden');
      els.libraryView.classList.remove('hidden');
    }
    els.readerLoading.querySelector('span').textContent = 'Đang mở sách...';
  }

  // ---------- PDF ----------
  async function openPDF(book) {
    await ensurePDFEngine();
    els.pdfReader.classList.remove('hidden');
    els.epubReader.classList.add('hidden');
    state.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(book.fileData.slice(0)) }).promise;
    state.currentPage = clamp(state.currentPage, 1, state.pdfDoc.numPages);
    await buildPDFTOC();
    await renderPDFSpread();
    updatePDFProgress();
  }

  async function renderPDFSpread() {
    if (!state.pdfDoc || state.currentBook?.type !== 'pdf') return;
    const token = ++state.renderToken;
    els.pdfPages.innerHTML = '';
    const pages = [state.currentPage];
    if (state.spread && state.currentPage < state.pdfDoc.numPages) pages.push(state.currentPage + 1);
    for (const pageNum of pages) {
      if (token !== state.renderToken) return;
      const node = await renderPDFPage(pageNum);
      if (token !== state.renderToken) return;
      els.pdfPages.appendChild(node);
    }
    updatePDFProgress();
    updateBookmarkButton();
  }

  async function renderPDFPage(pageNum) {
    const page = await state.pdfDoc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const mainWidth = Math.max(280, els.readerMain.clientWidth - 90);
    const targetWidth = state.spread ? Math.max(260, (mainWidth - 28) / 2) : Math.min(930, mainWidth);
    const fitScale = targetWidth / base.width;
    const scale = clamp(fitScale * state.pdfZoom, .25, 4);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);

    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    pageEl.dataset.page = String(pageNum);
    pageEl.style.width = `${viewport.width}px`;
    pageEl.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    pageEl.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
    }).promise;

    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    pageEl.appendChild(textLayer);
    const textContent = await page.getTextContent();
    const textTask = pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayer, viewport, textDivs: [] });
    if (textTask?.promise) await textTask.promise;

    const annLayer = document.createElement('div');
    annLayer.className = 'annotation-layer';
    pageEl.appendChild(annLayer);
    renderPDFAnnotations(pageNum, annLayer);
    return pageEl;
  }

  function renderPDFAnnotations(pageNum, layer) {
    const anns = state.annotations.filter(a => a.format === 'pdf' && a.location?.page === pageNum);
    for (const ann of anns) {
      for (const r of ann.location.rects || []) {
        const el = document.createElement('div');
        el.className = `annotation-rect ${ann.type} ann-${ann.color || 'yellow'}`;
        el.style.left = `${r.x * 100}%`;
        el.style.top = `${r.y * 100}%`;
        el.style.width = `${r.w * 100}%`;
        el.style.height = `${r.h * 100}%`;
        el.title = ann.note ? `${ann.note}\nClick để sửa hoặc xóa đánh dấu` : 'Click để thêm note hoặc xóa đánh dấu';
        el.addEventListener('click', e => { e.stopPropagation(); openNoteModal(ann); });
        layer.appendChild(el);
      }
    }
  }

  function handlePDFSelection() {
    if (state.currentBook?.type !== 'pdf') return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const pageEl = startEl?.closest?.('.pdf-page');
    if (!pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    const rects = [...range.getClientRects()].map(r => ({
      x: (r.left - pageRect.left) / pageRect.width,
      y: (r.top - pageRect.top) / pageRect.height,
      w: r.width / pageRect.width,
      h: r.height / pageRect.height
    })).filter(r => r.w > .001 && r.h > .001 && r.x < 1 && r.y < 1 && r.x + r.w > 0 && r.y + r.h > 0)
      .map(r => ({ x: clamp(r.x,0,1), y: clamp(r.y,0,1), w: clamp(r.w,0,1), h: clamp(r.h,0,1) }));
    if (!rects.length) return;
    state.selection = { format:'pdf', text, location:{ page:Number(pageEl.dataset.page), rects } };
    positionSelectionToolbar(range.getBoundingClientRect());
  }

  async function buildPDFTOC() {
    els.tocList.innerHTML = '<div class="empty-mini">Đang tải mục lục...</div>';
    const outline = await state.pdfDoc.getOutline().catch(() => null);
    if (!outline?.length) {
      els.tocList.innerHTML = '<div class="empty-mini">PDF này không có mục lục.</div>';
      return;
    }
    const flat = [];
    const walk = (items, level = 0) => items.forEach(it => { flat.push({ item:it, level }); if (it.items?.length) walk(it.items, level + 1); });
    walk(outline);
    els.tocList.innerHTML = '';
    for (const {item, level} of flat) {
      const btn = document.createElement('button');
      btn.className = `toc-item level-${Math.min(level,2)}`;
      btn.textContent = item.title || 'Untitled';
      btn.addEventListener('click', async () => {
        try {
          const dest = typeof item.dest === 'string' ? await state.pdfDoc.getDestination(item.dest) : item.dest;
          if (!dest?.[0]) return;
          const idx = await state.pdfDoc.getPageIndex(dest[0]);
          state.currentPage = idx + 1;
          await renderPDFSpread();
        } catch (_) {}
      });
      els.tocList.appendChild(btn);
    }
  }

  function updatePDFProgress() {
    if (!state.pdfDoc) return;
    const pct = (state.currentPage / state.pdfDoc.numPages) * 100;
    els.locationLabel.textContent = `Trang ${state.currentPage} / ${state.pdfDoc.numPages}`;
    setProgress(pct);
    scheduleProgressSave({ page: state.currentPage }, pct);
  }

  // ---------- EPUB ----------
  async function openEPUB(book) {
    await ensureEpubEngine();
    els.pdfReader.classList.add('hidden');
    els.epubReader.classList.remove('hidden');
    els.epubArea.innerHTML = '';
    state.epubBook = ePub(book.fileData.slice(0));
    state.rendition = state.epubBook.renderTo('epubArea', {
      width: '100%', height: '100%', flow: 'paginated', manager: 'default', spread: state.spread ? 'auto' : 'none'
    });
    applyEpubTheme();
    bindEpubEvents();
    await buildEPUBTOC();
    const target = book.lastLocation?.cfi || undefined;
    await state.rendition.display(target);
    refreshReaderLayout();
    replayEPUBAnnotations();
    state.epubBook.locations.generate(1200).then(() => {
      state.epubLocationReady = true;
      const loc = state.rendition.currentLocation();
      if (loc) updateEPUBProgress(loc);
    }).catch(() => {});
  }

  function bindEpubEvents() {
    state.rendition.hooks.content.register(contents => bindEpubSelectionDismissal(contents));

    state.rendition.on('selected', (cfiRange, contents) => {
      captureEpubSelection(contents, cfiRange);
    });

    // iPhone Safari can swallow touch events attached directly to the EPUB
    // iframe. epub.js forwards them through the rendition, so use that path
    // as the reliable fallback for selection and horizontal page swipes.
    state.rendition.on('touchstart', (event, contents) => {
      if (event.touches?.length !== 1) {
        state.epubRenditionGesture = null;
        return;
      }
      const touch = event.touches[0];
      state.epubRenditionGesture = {
        x:touch.clientX, y:touch.clientY, at:Date.now(),
        interactive:!!event.target?.closest?.('button,a,input,textarea,[contenteditable="true"]'),
        contents
      };
    });
    state.rendition.on('touchmove', (event, contents) => {
      const gesture = state.epubRenditionGesture;
      if (!gesture || event.touches?.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const direction = swipeNavigationDirection(dx, dy, 'epub');
      let selectedText = '';
      try { selectedText = contents?.window?.getSelection?.()?.toString?.()?.trim() || ''; } catch (_) {}
      if (!gesture.interactive && !selectedText && Date.now() - gesture.at < 950 && direction) {
        state.epubRenditionGesture = null;
        performSwipeNavigation(direction);
      }
    });
    state.rendition.on('touchend', (event, contents) => {
      scheduleEpubSelectionCapture(contents, null, 80);
      setTimeout(() => scheduleEpubSelectionCapture(contents, null, 0), 280);
      const gesture = state.epubRenditionGesture;
      state.epubRenditionGesture = null;
      if (!gesture || event.touches?.length || !event.changedTouches?.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      let selectedText = '';
      try { selectedText = contents?.window?.getSelection?.()?.toString?.()?.trim() || ''; } catch (_) {}
      const direction = swipeNavigationDirection(dx, dy, 'epub');
      if (!gesture.interactive && !selectedText && Date.now() - gesture.at < 950 && direction) {
        performSwipeNavigation(direction);
      }
    });

    state.rendition.on('relocated', location => {
      updateEPUBProgress(location);
      updateBookmarkButton();
      hideSelectionTools();
    });
  }

  const boundEpubDocuments = new WeakSet();

  function scheduleEpubSelectionCapture(contents, cfiRange = null, delay = 80) {
    clearTimeout(state.epubSelectionTimer);
    state.epubSelectionTimer = setTimeout(() => captureEpubSelection(contents, cfiRange), delay);
  }

  function captureEpubSelection(contents, cfiRange = null) {
    try {
      const selection = contents?.window?.getSelection?.();
      const text = selection?.toString?.()?.trim();
      if (!text || !selection.rangeCount) return false;

      const range = selection.getRangeAt(0);
      const cfi = cfiRange || contents.cfiFromRange?.(range);
      if (!cfi) return false;

      const visibleRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      const rect = visibleRects[visibleRects.length - 1] || range.getBoundingClientRect();
      const frame = contents.document?.defaultView?.frameElement;
      const frameRect = frame?.getBoundingClientRect?.() || { left:0, top:0 };
      state.selection = { format:'epub', text, location:{ cfi } };
      positionSelectionToolbar({
        left: frameRect.left + rect.left,
        right: frameRect.left + rect.right,
        top: frameRect.top + rect.top,
        bottom: frameRect.top + rect.bottom,
        width: rect.width,
        height: rect.height
      });
      return true;
    } catch (err) {
      console.warn('Không thể đọc vùng chọn EPUB', err);
      return false;
    }
  }

  function captureCurrentReaderSelection() {
    if (!state.currentBook) return false;
    if (state.currentBook.type === 'pdf') {
      handlePDFSelection();
      return state.selection?.format === 'pdf';
    }
    try {
      for (const contents of state.rendition?.getContents?.() || []) {
        if (captureEpubSelection(contents)) return true;
      }
    } catch (_) {}
    return false;
  }

  function bindEpubSelectionDismissal(contents) {
    const doc = contents?.document;
    if (!doc || boundEpubDocuments.has(doc)) return;
    boundEpubDocuments.add(doc);
    bindMobileReaderGestures(doc, contents);

    doc.addEventListener('pointerdown', () => hideSelectionTools(), true);
    doc.addEventListener('selectionchange', () => {
      requestAnimationFrame(() => {
        const selection = contents.window?.getSelection?.();
        if (selection && !selection.isCollapsed && selection.toString().trim()) {
          scheduleEpubSelectionCapture(contents, null, 90);
          return;
        }
        setTimeout(() => {
          if (Date.now() < state.selectionHoldUntil) return;
          const latest = contents.window?.getSelection?.();
          if (!latest || latest.isCollapsed || !latest.toString().trim()) hideSelectionTools();
        }, 220);
      });
    });
    // epub.js' `selected` event is inconsistent after a long-press on iOS Safari.
    // These fallbacks read the iframe selection after the touch handles settle.
    doc.addEventListener('touchend', () => {
      scheduleEpubSelectionCapture(contents, null, 70);
      setTimeout(() => scheduleEpubSelectionCapture(contents, null, 0), 210);
    }, { passive:true });
    doc.addEventListener('pointerup', () => scheduleEpubSelectionCapture(contents, null, 50), { passive:true });
    doc.addEventListener('contextmenu', () => scheduleEpubSelectionCapture(contents, null, 30));
    doc.addEventListener('wheel', () => hideSelectionTools(), { passive:true });
    doc.addEventListener('touchmove', () => hideSelectionTools(), { passive:true });
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideSelectionTools(true);
    });
  }

  function applyEpubTheme() {
    if (!state.rendition) return;
    const dark = state.settings.theme === 'dark';
    const body = {
      'font-family': 'ui-rounded, "Segoe UI", Arial, sans-serif',
      'font-size': `${state.epubFontSize}%`,
      'line-height': '1.72',
      'color': dark ? '#f4f5f2' : '#151713',
      'background': dark ? '#302622' : '#FFF9EF',
      'padding-left': '2.2rem',
      'padding-right': '2.2rem'
    };
    try {
      state.rendition.themes.default({
        body,
        'p': {'line-height':'1.72'},
        'a': {'color': dark ? '#D4BE9D' : '#67343A'}
      });
      state.rendition.themes.fontSize(`${state.epubFontSize}%`);
    } catch (_) {}
  }

  async function buildEPUBTOC() {
    els.tocList.innerHTML = '<div class="empty-mini">Đang tải mục lục...</div>';
    const nav = await state.epubBook.loaded.navigation;
    const toc = nav?.toc || [];
    if (!toc.length) {
      els.tocList.innerHTML = '<div class="empty-mini">EPUB này không có mục lục.</div>';
      return;
    }
    const flat = [];
    const walk = (items, level=0) => items.forEach(it => { flat.push({item:it,level}); if (it.subitems?.length) walk(it.subitems, level+1); });
    walk(toc);
    els.tocList.innerHTML = flat.map(({item,level},i) => `<button class="toc-item level-${Math.min(level,2)}" data-toc-index="${i}">${escapeHTML(item.label?.trim() || 'Untitled')}</button>`).join('');
    $$('.toc-item', els.tocList).forEach(btn => btn.addEventListener('click', () => {
      const target = flat[Number(btn.dataset.tocIndex)]?.item?.href;
      if (target) state.rendition.display(target);
    }));
  }

  function replayEPUBAnnotations() {
    if (!state.rendition) return;
    for (const ann of state.annotations.filter(a => a.format === 'epub')) applyEPUBAnnotation(ann);
  }

  function applyEPUBAnnotation(ann) {
    const cfi = ann.location?.cfi;
    if (!cfi || !state.rendition) return;
    const cb = () => openNoteModal(ann);
    const color = colorMap[ann.color || 'yellow'];
    try {
      let rendered;
      if (ann.type === 'underline') {
        rendered = state.rendition.annotations.underline(cfi, { id:ann.id }, cb, `reader-underline-${ann.color || 'blue'}`, {
          'fill':'none',
          'stroke':color,
          'stroke-opacity':'1',
          'mix-blend-mode':'normal'
        });
      } else if (ann.type === 'strike') {
        rendered = state.rendition.annotations.highlight(cfi, { id:ann.id }, cb, `ann-${ann.id}`, { 'fill': '#d96b6b', 'fill-opacity':'0.18', 'mix-blend-mode':'multiply' });
      } else {
        rendered = state.rendition.annotations.highlight(cfi, { id:ann.id }, cb, `ann-${ann.id}`, { 'fill': color, 'fill-opacity':'0.28', 'mix-blend-mode':'multiply' });
      }
      styleEPUBAnnotation(rendered, ann.type, ann.type === 'strike' ? '#d96b6b' : color);
    } catch (err) {
      console.warn('Không thể vẽ annotation EPUB', ann.id, err);
    }
  }

  function styleEPUBAnnotation(annotation, type, color) {
    const paint = mark => {
      const root = mark?.element;
      if (!root) return;
      if (type === 'underline') {
        root.querySelectorAll('rect').forEach(rect => rect.setAttribute('fill', 'none'));
        root.querySelectorAll('line').forEach(line => {
          line.setAttribute('stroke', color);
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-opacity', '1');
        });
        return;
      }
      root.querySelectorAll('rect').forEach(rect => {
        rect.setAttribute('fill', color);
        rect.setAttribute('fill-opacity', type === 'strike' ? '0.18' : '0.28');
        rect.style.mixBlendMode = 'multiply';
      });
    };
    paint(annotation?.mark);
    annotation?.on?.('attach', paint);
  }

  function removeEPUBAnnotation(ann) {
    if (!state.rendition || ann.format !== 'epub') return;
    try { state.rendition.annotations.remove(ann.location.cfi, ann.type === 'underline' ? 'underline' : 'highlight'); } catch (_) {}
  }

  function updateEPUBProgress(location) {
    if (!location?.start) return;
    let pct = state.currentBook?.progress || 0;
    if (state.epubLocationReady && location.start.cfi) {
      try { pct = state.epubBook.locations.percentageFromCfi(location.start.cfi) * 100; } catch (_) {}
    }
    const label = location.start.displayed?.page && location.start.displayed?.total
      ? `${Math.round(pct)}% · ${location.start.displayed.page}/${location.start.displayed.total}`
      : `${Math.round(pct)}%`;
    els.locationLabel.textContent = label;
    setProgress(pct);
    scheduleProgressSave({ cfi: location.start.cfi, href: location.start.href }, pct);
  }

  // ---------- Navigation / view ----------
  async function navigate(dir) {
    if (!state.currentBook) return;
    if (state.currentBook.type === 'pdf') {
      const step = state.spread ? 2 : 1;
      const maxStart = state.spread ? Math.max(1, state.pdfDoc.numPages - ((state.pdfDoc.numPages + 1) % 2)) : state.pdfDoc.numPages;
      state.currentPage = clamp(state.currentPage + dir * step, 1, maxStart);
      await renderPDFSpread();
      els.pdfReader.scrollTop = 0;
    } else if (state.rendition) {
      dir < 0 ? state.rendition.prev() : state.rendition.next();
    }
  }

  function performSwipeNavigation(dir) {
    const now = Date.now();
    if (now - state.lastSwipeAt < 500) return;
    state.lastSwipeAt = now;
    state.epubRenditionGesture = null;
    hideSelectionTools(true);
    navigate(dir);
  }

  function swipeNavigationDirection(dx, dy, format = state.currentBook?.type) {
    const horizontal = Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (horizontal) return dx < 0 ? 1 : -1;
    const vertical = format === 'epub' && Math.abs(dy) >= 62 && Math.abs(dy) > Math.abs(dx) * 1.2;
    if (vertical) return dy < 0 ? 1 : -1;
    return 0;
  }

  function zoomBy(delta) {
    if (!state.currentBook) return;
    if (state.currentBook.type === 'pdf') {
      state.pdfZoom = clamp(state.pdfZoom + delta, .5, 2.5);
      updateZoomIndicators();
      renderPDFSpread();
    } else {
      state.epubFontSize = clamp(state.epubFontSize + delta * 100, 70, 180);
      updateZoomIndicators();
      state.currentBook.epubFontSize = state.epubFontSize;
      applyEpubTheme();
      saveCurrentProgress();
    }
  }

  function fitWidth() {
    if (!state.currentBook) return;
    if (state.currentBook.type === 'pdf') {
      state.pdfZoom = 1;
      updateZoomIndicators(true);
      renderPDFSpread();
    } else {
      state.epubFontSize = 100;
      updateZoomIndicators();
      applyEpubTheme();
    }
  }

  function updateZoomIndicators(showFit = false, previewValue = null) {
    if (!state.currentBook) return;
    const value = previewValue ?? (state.currentBook.type === 'pdf' ? state.pdfZoom * 100 : state.epubFontSize);
    const label = `${Math.round(value)}%`;
    els.fitWidthBtn.textContent = showFit && state.currentBook.type === 'pdf' ? 'Fit' : label;
    els.mobileZoomLabel.textContent = label;
  }

  function touchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  }

  function bindMobileReaderGestures(target, epubContents = null) {
    if (!target || state.mobileGestureBound.has(target)) return;
    state.mobileGestureBound.add(target);
    let gesture = null;
    let pointerGesture = null;

    const selectionText = () => {
      try {
        const selection = epubContents ? epubContents.window?.getSelection?.() : window.getSelection();
        return selection?.toString?.()?.trim() || '';
      } catch (_) { return ''; }
    };

    target.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const startDistance = touchDistance(e.touches);
        gesture = {
          type:'pinch', startDistance, factor:1,
          startValue:state.currentBook?.type === 'pdf' ? state.pdfZoom : state.epubFontSize
        };
        hideSelectionTools();
        return;
      }
      if (e.touches.length !== 1) { gesture = null; return; }
      const touch = e.touches[0];
      gesture = {
        type:'swipe', x:touch.clientX, y:touch.clientY, at:Date.now(),
        interactive:!!e.target?.closest?.('button,a,input,textarea,[contenteditable="true"],.annotation-rect')
      };
    }, { passive:true });

    target.addEventListener('touchmove', e => {
      if (!gesture) return;
      if (gesture.type === 'swipe' && e.touches.length === 1) {
        const touch = e.touches[0];
        const direction = swipeNavigationDirection(touch.clientX - gesture.x, touch.clientY - gesture.y);
        if (!gesture.interactive && !selectionText() && Date.now() - gesture.at < 950 && direction) {
          e.preventDefault();
          gesture = null;
          performSwipeNavigation(direction);
        }
        return;
      }
      if (gesture.type !== 'pinch' || e.touches.length < 2 || !gesture.startDistance) return;
      e.preventDefault();
      gesture.factor = clamp(touchDistance(e.touches) / gesture.startDistance, .55, 1.8);
      const preview = state.currentBook?.type === 'pdf'
        ? clamp(gesture.startValue * gesture.factor, .5, 2.5) * 100
        : clamp(gesture.startValue * gesture.factor, 70, 180);
      updateZoomIndicators(false, preview);
    }, { passive:false });

    target.addEventListener('touchend', e => {
      if (!gesture) return;
      if (gesture.type === 'pinch') {
        if (e.touches.length >= 2) return;
        const factor = gesture.factor || 1;
        const startValue = gesture.startValue;
        gesture = null;
        if (Math.abs(factor - 1) < .04 || !state.currentBook) return updateZoomIndicators();
        if (state.currentBook.type === 'pdf') {
          state.pdfZoom = Math.round(clamp(startValue * factor, .5, 2.5) * 20) / 20;
          updateZoomIndicators();
          renderPDFSpread();
        } else {
          state.epubFontSize = Math.round(clamp(startValue * factor, 70, 180) / 5) * 5;
          state.currentBook.epubFontSize = state.epubFontSize;
          updateZoomIndicators();
          applyEpubTheme();
          saveCurrentProgress();
        }
        toast(`Cỡ đọc ${els.mobileZoomLabel.textContent}`);
        return;
      }

      if (e.touches.length || !e.changedTouches.length) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const elapsed = Date.now() - gesture.at;
      const direction = swipeNavigationDirection(dx, dy);
      const shouldNavigate = !gesture.interactive && !selectionText() && elapsed < 950 && direction;
      gesture = null;
      if (shouldNavigate) {
        performSwipeNavigation(direction);
      }
    }, { passive:true });

    target.addEventListener('touchcancel', () => {
      gesture = null;
      updateZoomIndicators();
    }, { passive:true });

    // Pointer events are a second path for iOS versions that cancel the
    // original TouchEvent once Safari starts handling the page gesture.
    target.addEventListener('pointerdown', e => {
      if (!e.isPrimary || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
      pointerGesture = { x:e.clientX, y:e.clientY, at:Date.now(), interactive:!!e.target?.closest?.('button,a,input,textarea,[contenteditable="true"],.annotation-rect') };
    }, { passive:true });
    target.addEventListener('pointermove', e => {
      if (!pointerGesture || !e.isPrimary) return;
      const direction = swipeNavigationDirection(e.clientX - pointerGesture.x, e.clientY - pointerGesture.y);
      if (!pointerGesture.interactive && !selectionText() && Date.now() - pointerGesture.at < 950 && direction) {
        e.preventDefault();
        pointerGesture = null;
        gesture = null;
        performSwipeNavigation(direction);
      }
    }, { passive:false });
    const clearPointerGesture = () => { pointerGesture = null; };
    target.addEventListener('pointerup', clearPointerGesture, { passive:true });
    target.addEventListener('pointercancel', clearPointerGesture, { passive:true });
  }

  function toggleSpread() {
    state.spread = !state.spread;
    els.spreadBtn.classList.toggle('active', state.spread);
    if (state.currentBook) {
      state.currentBook.spread = state.spread;
      if (state.currentBook.type === 'pdf') renderPDFSpread();
      else if (state.rendition) {
        try { state.rendition.spread(state.spread ? 'auto' : 'none'); } catch (_) {}
        refreshReaderLayout(80);
      }
      saveCurrentProgress();
    }
  }

  function setProgress(pct) {
    pct = clamp(Number(pct) || 0, 0, 100);
    $('#progressBar span').style.width = `${pct}%`;
    els.progressText.textContent = `${Math.round(pct)}%`;
  }

  function scheduleProgressSave(location, pct) {
    if (!state.currentBook) return;
    const previous = Number(state.currentBook.progress || 0);
    const next = clamp(pct, 0, 100);
    if (previous < 99.5 && next >= 99.5) {
      state.currentBook.completedCount = completionCount(state.currentBook) + 1;
      state.currentBook.lastCompletedAt = Date.now();
    }
    state.currentBook.lastLocation = location;
    state.currentBook.progress = next;
    clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = setTimeout(() => saveCurrentProgress(), 450);
  }

  async function saveCurrentProgress(force = false) {
    if (!state.currentBook) return;
    clearTimeout(state.progressSaveTimer);
    state.currentBook.updatedAt = Date.now();
    state.currentBook.spread = state.spread;
    if (state.currentBook.type === 'epub') state.currentBook.epubFontSize = state.epubFontSize;
    await dbPut('books', state.currentBook).catch(() => {});
  }

  function applyLibrarySidebarState() {
    if (!els.libraryView) return;
    els.libraryView.classList.toggle('library-sidebar-collapsed', state.librarySidebarCollapsed);
    els.librarySidebarShowBtn?.classList.toggle('hidden', !state.librarySidebarCollapsed);
    els.librarySidebarHideBtn?.setAttribute('aria-expanded', String(!state.librarySidebarCollapsed));
    els.librarySidebarShowBtn?.setAttribute('aria-expanded', String(!state.librarySidebarCollapsed));
    setLibrarySection('collections', state.libraryCollectionsCollapsed, false);
    setLibrarySection('authors', state.libraryAuthorsCollapsed, false);
  }

  function setLibrarySection(section, collapsed, persist = true) {
    const isCollections = section === 'collections';
    const panel = isCollections ? els.collectionsPanel : els.authorsPanel;
    const toggle = isCollections ? els.collectionsSectionToggle : els.authorsSectionToggle;
    if (!panel || !toggle) return;
    panel.classList.toggle('is-collapsed', !!collapsed);
    toggle.classList.toggle('is-collapsed', !!collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    if (isCollections) state.libraryCollectionsCollapsed = !!collapsed;
    else state.libraryAuthorsCollapsed = !!collapsed;
    if (persist) localStorage.setItem(`reader-library-${section}-collapsed`, collapsed ? '1' : '0');
  }

  function setLibrarySidebar(collapsed) {
    state.librarySidebarCollapsed = !!collapsed;
    localStorage.setItem('reader-library-sidebar-collapsed', collapsed ? '1' : '0');
    els.libraryView.classList.remove('library-sidebar-mobile-open');
    applyLibrarySidebarState();
  }

  function toggleLibrarySidebarMobile() {
    if (window.innerWidth > 780) return setLibrarySidebar(!state.librarySidebarCollapsed);
    els.libraryView.classList.toggle('library-sidebar-mobile-open');
  }

  function toggleSidebar(side) {
    const layout = $('.reader-layout');
    const cls = side === 'left' ? 'left-collapsed' : 'right-collapsed';
    layout.classList.toggle(cls);
    localStorage.setItem(`reader-${side}-sidebar-collapsed`, layout.classList.contains(cls) ? '1' : '0');
    refreshReaderLayout(230);
  }

  function setSidebar(side, open, persist = true) {
    const layout = $('.reader-layout');
    const cls = side === 'left' ? 'left-collapsed' : 'right-collapsed';
    layout.classList.toggle(cls, !open);
    if (persist) localStorage.setItem(`reader-${side}-sidebar-collapsed`, open ? '0' : '1');
    refreshReaderLayout(230);
  }

  function refreshReaderLayout(delay = 0) {
    clearTimeout(state.readerLayoutTimer);
    state.readerLayoutTimer = setTimeout(async () => {
      if (!state.currentBook || els.readerView.classList.contains('hidden')) return;
      if (state.currentBook.type === 'pdf') {
        await renderPDFSpread();
        return;
      }
      if (!state.rendition) return;
      const width = Math.floor(els.epubArea.clientWidth);
      const height = Math.floor(els.epubArea.clientHeight);
      if (width < 1 || height < 1) return;
      const anchor = state.rendition.currentLocation()?.start?.cfi;
      try {
        state.rendition.resize(width, height);
        if (anchor) await state.rendition.display(anchor);
      } catch (_) {}
    }, delay);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  // ---------- Annotations ----------
  function positionSelectionToolbar(rect) {
    const x = clamp(rect.left + rect.width / 2, 170, window.innerWidth - 170);
    const y = Math.max(54, rect.top - 8);
    els.selectionToolbar.style.left = `${x}px`;
    els.selectionToolbar.style.top = `${y}px`;
    els.selectionToolbar.classList.remove('hidden');
    els.mobileSelectionBtn?.classList.add('toolbar-open');
    els.translationPopover.classList.add('hidden');
  }

  function clearNativeSelections() {
    window.getSelection()?.removeAllRanges();
    try {
      for (const contents of state.rendition?.getContents?.() || []) {
        contents.window?.getSelection?.()?.removeAllRanges();
      }
    } catch (_) {}
  }

  function hideSelectionTools(clearNative = false) {
    els.selectionToolbar.classList.add('hidden');
    els.translationPopover.classList.add('hidden');
    state.selection = null;
    els.mobileSelectionBtn?.classList.remove('toolbar-open');
    if (clearNative) clearNativeSelections();
  }

  async function handleSelectionAction(e) {
    const colorBtn = e.target.closest('[data-color]');
    const actionBtn = e.target.closest('[data-action]');
    if (!state.selection) return;
    if (colorBtn) return addAnnotation('highlight', colorBtn.dataset.color);
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (action === 'delete') return deleteAnnotationsAtSelection();
    if (action === 'translate') return translateSelection();
    if (action === 'note') {
      const ann = await addAnnotation('highlight', 'yellow', true);
      if (ann) {
        hideSelectionTools(true);
        openNoteModal(ann);
      }
      return;
    }
    if (action === 'underline') return addAnnotation('underline', 'tobacco');
    if (action === 'strike') return addAnnotation('strike', 'oxblood');
  }

  function normalizedSelectionText(value = '') {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizedRectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function rangesOverlap(first, second, view) {
    const RangeCtor = view?.Range;
    if (!first || !second || !RangeCtor) return false;
    return first.compareBoundaryPoints(RangeCtor.END_TO_START, second) > 0
      && first.compareBoundaryPoints(RangeCtor.START_TO_END, second) < 0;
  }

  function annotationsInsideCurrentSelection() {
    if (!state.selection) return [];
    const sameFormat = state.annotations.filter(ann => ann.format === state.selection.format);
    if (state.selection.format === 'pdf') {
      const selectedRects = state.selection.location?.rects || [];
      return sameFormat.filter(ann => ann.location?.page === state.selection.location?.page
        && (ann.location?.rects || []).some(saved => selectedRects.some(current => normalizedRectsOverlap(saved, current))));
    }

    const matches = [];
    try {
      for (const contents of state.rendition?.getContents?.() || []) {
        let selectedRange;
        try { selectedRange = contents.range(state.selection.location?.cfi); } catch (_) { continue; }
        if (!selectedRange) continue;
        for (const ann of sameFormat) {
          try {
            const annotationRange = contents.range(ann.location?.cfi);
            if (rangesOverlap(selectedRange, annotationRange, contents.window) && !matches.includes(ann)) matches.push(ann);
          } catch (_) {}
        }
      }
    } catch (_) {}
    if (matches.length) return matches;

    // iOS Safari can report a slightly shifted CFI after EPUB text reflows.
    // Fall back to the selected words, even when a positional comparison ran.
    const selectedText = normalizedSelectionText(state.selection.text);
    const textMatches = sameFormat.filter(ann => {
      const savedText = normalizedSelectionText(ann.text);
      return selectedText && savedText && (savedText.includes(selectedText) || selectedText.includes(savedText));
    });
    if (!textMatches.length) return [];
    const smallestLength = Math.min(...textMatches.map(ann => normalizedSelectionText(ann.text).length));
    return textMatches.filter(ann => normalizedSelectionText(ann.text).length === smallestLength);
  }

  async function deleteAnnotationsAtSelection() {
    const matches = annotationsInsideCurrentSelection();
    if (!matches.length) {
      hideSelectionTools(true);
      return toast('Đã bỏ vùng chọn · đoạn này chưa có đánh dấu đã lưu', 3200);
    }
    for (const ann of matches) {
      removeEPUBAnnotation(ann);
      await dbDelete('annotations', ann.id);
    }
    const ids = new Set(matches.map(ann => ann.id));
    state.annotations = state.annotations.filter(ann => !ids.has(ann.id));
    const pdfPages = [...new Set(matches.filter(ann => ann.format === 'pdf').map(ann => ann.location?.page))];
    if (pdfPages.length) await renderPDFSpread();
    renderAnnotationPanels();
    hideSelectionTools(true);
    toast(matches.length > 1 ? `Đã xóa ${matches.length} đánh dấu` : 'Đã xóa đánh dấu');
  }

  async function addAnnotation(type, color, keepSelection = false) {
    if (!state.selection || !state.currentBook) return null;
    const ann = {
      id: uid(), bookId: state.currentBook.id, format: state.selection.format,
      type, color, text: state.selection.text, location: structuredClone(state.selection.location),
      note: '', createdAt: Date.now(), updatedAt: Date.now()
    };
    await dbPut('annotations', ann);
    state.annotations.push(ann);
    if (ann.format === 'pdf') {
      const page = $(`.pdf-page[data-page="${ann.location.page}"] .annotation-layer`);
      if (page) { page.innerHTML = ''; renderPDFAnnotations(ann.location.page, page); }
    } else applyEPUBAnnotation(ann);
    renderAnnotationPanels();
    if (!keepSelection) {
      hideSelectionTools(true);
      toast(type === 'underline' ? 'Đã gạch dưới · Click lại đoạn đó để xóa' : 'Đã đánh dấu · Click lại đoạn đó để xóa', 2800);
    }
    return ann;
  }

  function renderAnnotationPanels() {
    const sorted = [...state.annotations].sort((a,b) => b.updatedAt - a.updatedAt);
    const notes = sorted.filter(a => a.note?.trim());
    els.notesList.innerHTML = notes.length ? notes.map(annotationCardHTML).join('') : '<div class="empty-mini">Note bạn viết sẽ xuất hiện ở đây.</div>';
    els.highlightsList.innerHTML = sorted.length ? sorted.map(annotationCardHTML).join('') : '<div class="empty-mini">Quét một đoạn chữ để highlight hoặc underline.</div>';
    [els.notesList, els.highlightsList].forEach(list => {
      $$('.annotation-card', list).forEach(card => {
        const id = card.dataset.annotationId;
        card.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          const ann = state.annotations.find(a => a.id === id);
          if (ann) jumpToAnnotation(ann);
        });
        $$('button', card).forEach(btn => btn.addEventListener('click', e => {
          e.stopPropagation();
          const ann = state.annotations.find(a => a.id === id);
          if (!ann) return;
          if (btn.dataset.annAction === 'note') openNoteModal(ann);
          if (btn.dataset.annAction === 'notebook') addAnnotationToNotebook(ann);
          if (btn.dataset.annAction === 'delete') deleteAnnotation(ann);
        }));
      });
    });
  }

  function annotationCardHTML(ann) {
    const loc = ann.format === 'pdf' ? `p. ${ann.location.page}` : 'EPUB';
    const color = ['yellow','tobacco','oxblood','green','blue','purple'].includes(ann.color) ? ann.color : 'yellow';
    return `<article class="annotation-card color-${color}" data-annotation-id="${ann.id}">
      <div class="ann-top"><span class="ann-type"><i class="ann-swatch" style="background:${colorMap[ann.color] || colorMap.yellow}"></i>${escapeHTML(ann.type)}</span><span class="ann-location">${loc}</span></div>
      <div class="ann-quote">${escapeHTML(ann.text || '')}</div>
      ${ann.note ? `<div class="ann-note">${escapeHTML(ann.note)}</div>` : ''}
      <div class="ann-actions"><button data-ann-action="note">${ann.note ? 'Sửa note' : '+ Note'}</button><button data-ann-action="notebook">＋ Notebook</button><button data-ann-action="delete">Xóa</button></div>
    </article>`;
  }

  async function jumpToAnnotation(ann) {
    if (ann.format === 'pdf') {
      state.currentPage = ann.location.page;
      await renderPDFSpread();
      els.pdfReader.scrollTop = 0;
    } else if (state.rendition) {
      await state.rendition.display(ann.location.cfi);
    }
  }

  function openNoteModal(ann) {
    state.currentEditingAnnotation = ann;
    els.noteQuote.textContent = ann.text || '';
    els.noteInput.value = ann.note || '';
    openModal(els.noteModal);
    setTimeout(() => els.noteInput.focus(), 50);
  }

  async function saveNoteFromModal() {
    const ann = state.currentEditingAnnotation;
    if (!ann) return;
    ann.note = els.noteInput.value.trim();
    ann.updatedAt = Date.now();
    await dbPut('annotations', ann);
    renderAnnotationPanels();
    closeModals();
    toast('Đã lưu note');
  }

  async function deleteAnnotation(ann) {
    removeEPUBAnnotation(ann);
    await dbDelete('annotations', ann.id);
    state.annotations = state.annotations.filter(a => a.id !== ann.id);
    if (ann.format === 'pdf') renderPDFSpread();
    renderAnnotationPanels();
    toast('Đã xóa');
  }

  // ---------- Bookmarks ----------
  async function saveReadingPlace() {
    if (!state.currentBook) return;
    let place = null;
    if (state.currentBook.type === 'pdf') {
      place = { format:'pdf', location:{ page:state.currentPage }, label:`Trang ${state.currentPage}`, savedAt:Date.now() };
    } else {
      const loc = state.rendition?.currentLocation()?.start;
      if (!loc?.cfi) return toast('Chưa xác định được vị trí hiện tại');
      place = {
        format:'epub',
        location:{ cfi:loc.cfi, href:loc.href },
        label:els.locationLabel.textContent || `${Math.round(state.currentBook.progress || 0)}%`,
        savedAt:Date.now()
      };
    }
    state.currentBook.readingPlace = place;
    await dbPut('books', state.currentBook);
    updateReadingPlaceButtons();
    toast(`Đã lưu chỗ đọc · ${place.label}`);
  }

  async function returnToReadingPlace() {
    const place = state.currentBook?.readingPlace;
    if (!place) return toast('Bạn chưa lưu chỗ đọc');
    if (place.format === 'pdf' && state.currentBook.type === 'pdf') {
      state.currentPage = clamp(place.location.page, 1, state.pdfDoc.numPages);
      await renderPDFSpread();
      els.pdfReader.scrollTop = 0;
    } else if (place.format === 'epub' && state.rendition) {
      await state.rendition.display(place.location.cfi);
    }
    toast(`Đã quay lại · ${place.label}`);
  }

  function updateReadingPlaceButtons() {
    const place = state.currentBook?.readingPlace;
    els.returnPlaceBtn.disabled = !place;
    els.returnPlaceBtn.classList.toggle('active', !!place);
    els.returnPlaceBtn.title = place ? `Quay lại ${place.label}` : 'Chưa có vị trí đã lưu';
  }

  async function toggleBookmark() {
    if (!state.currentBook) return;
    if (state.currentBook.type === 'pdf') {
      const existing = state.bookmarks.find(b => b.format === 'pdf' && b.location?.page === state.currentPage);
      if (existing) return removeBookmark(existing);
      const bm = { id:uid(), bookId:state.currentBook.id, format:'pdf', location:{page:state.currentPage}, label:`Trang ${state.currentPage}`, createdAt:Date.now() };
      await dbPut('bookmarks', bm); state.bookmarks.push(bm);
    } else {
      const loc = state.rendition?.currentLocation()?.start;
      if (!loc?.cfi) return;
      const existing = state.bookmarks.find(b => b.format === 'epub' && b.location?.cfi === loc.cfi);
      if (existing) return removeBookmark(existing);
      const bm = { id:uid(), bookId:state.currentBook.id, format:'epub', location:{cfi:loc.cfi,href:loc.href}, label:`${Math.round(state.currentBook.progress || 0)}%`, createdAt:Date.now() };
      await dbPut('bookmarks', bm); state.bookmarks.push(bm);
    }
    renderBookmarks(); updateBookmarkButton(); toast('Đã bookmark');
  }

  async function removeBookmark(bm) {
    await dbDelete('bookmarks', bm.id);
    state.bookmarks = state.bookmarks.filter(b => b.id !== bm.id);
    renderBookmarks(); updateBookmarkButton(); toast('Đã bỏ bookmark');
  }

  function renderBookmarks() {
    els.bookmarkCount.textContent = state.bookmarks.length;
    if (!state.bookmarks.length) {
      els.bookmarkList.innerHTML = '<div class="empty-mini">Chưa có bookmark.</div>';
      return;
    }
    els.bookmarkList.innerHTML = state.bookmarks.sort((a,b) => a.createdAt-b.createdAt).map(b => `<button class="bookmark-item" data-bookmark-id="${b.id}">☆ ${escapeHTML(b.label)}</button>`).join('');
    $$('.bookmark-item', els.bookmarkList).forEach(btn => btn.addEventListener('click', async () => {
      const bm = state.bookmarks.find(b => b.id === btn.dataset.bookmarkId);
      if (!bm) return;
      if (bm.format === 'pdf') { state.currentPage = bm.location.page; await renderPDFSpread(); }
      else await state.rendition.display(bm.location.cfi);
    }));
  }

  function updateBookmarkButton() {
    let active = false;
    if (state.currentBook?.type === 'pdf') active = state.bookmarks.some(b => b.format === 'pdf' && b.location?.page === state.currentPage);
    else {
      const cfi = state.rendition?.currentLocation()?.start?.cfi;
      active = !!cfi && state.bookmarks.some(b => b.format === 'epub' && b.location?.cfi === cfi);
    }
    els.bookmarkBtn.textContent = active ? '★' : '☆';
  }

  // ---------- Notebook ----------
  async function loadNotebook() {
    const row = await dbGet('notebooks', state.currentBook.id);
    els.notebookEditor.innerHTML = row?.html || '';
    els.notebookSaveState.textContent = 'Đã lưu';
  }

  function scheduleNotebookSave() {
    els.notebookSaveState.textContent = 'Đang lưu...';
    clearTimeout(state.notebookSaveTimer);
    state.notebookSaveTimer = setTimeout(saveNotebook, 450);
  }

  async function saveNotebook() {
    clearTimeout(state.notebookSaveTimer);
    if (!state.currentBook) return;
    await dbPut('notebooks', { bookId:state.currentBook.id, html:els.notebookEditor.innerHTML, updatedAt:Date.now() });
    els.notebookSaveState.textContent = 'Đã lưu';
  }

  function scheduleGlobalNotebookSave() {
    if (!state.globalNotebookLoaded) return;
    els.globalNotebookSaveState.textContent = 'Đang lưu...';
    clearTimeout(state.globalNotebookSaveTimer);
    state.globalNotebookSaveTimer = setTimeout(saveGlobalNotebook, 450);
  }

  async function saveGlobalNotebook() {
    clearTimeout(state.globalNotebookSaveTimer);
    if (!state.globalNotebookLoaded) return;
    await dbPut('notebooks', {
      bookId:state.globalNotebookBookId,
      html:els.globalNotebookEditor.innerHTML,
      updatedAt:Date.now()
    });
    els.globalNotebookSaveState.textContent = 'Đã lưu';
  }

  function bindNotebookEditor(toolbar, editor, scheduleSave) {
    const remember = () => rememberNotebookSelection(editor);
    editor.addEventListener('input', () => { remember(); scheduleSave(); });
    editor.addEventListener('mouseup', remember);
    editor.addEventListener('keyup', remember);
    editor.addEventListener('focus', remember);

    $$('[data-cmd]', toolbar).forEach(button => {
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => execNotebookCommand(editor, button.dataset.cmd, scheduleSave));
    });
    $$('[data-block]', toolbar).forEach(button => {
      button.addEventListener('mousedown', e => e.preventDefault());
      button.addEventListener('click', () => execNotebookBlock(editor, button.dataset.block, scheduleSave));
    });
    $$('[data-color-cmd]', toolbar).forEach(input => {
      input.parentElement.style.setProperty('--picker-color', input.value);
      input.addEventListener('pointerdown', remember);
      input.addEventListener('input', () => {
        input.parentElement.style.setProperty('--picker-color', input.value);
        execNotebookColor(editor, input.dataset.colorCmd, input.value, scheduleSave);
      });
    });
    const divider = $('[data-action="divider"]', toolbar);
    divider.addEventListener('mousedown', e => e.preventDefault());
    divider.addEventListener('click', () => {
      restoreNotebookSelection(editor);
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
      rememberNotebookSelection(editor);
      scheduleSave();
    });
  }

  function rememberNotebookSelection(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    state.notebookRanges.set(editor, selection.getRangeAt(0).cloneRange());
  }

  function restoreNotebookSelection(editor) {
    editor.focus();
    const range = state.notebookRanges.get(editor);
    if (!range || !range.startContainer?.isConnected) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function execNotebookCommand(editor, cmd, scheduleSave) {
    restoreNotebookSelection(editor);
    document.execCommand(cmd, false, null);
    rememberNotebookSelection(editor);
    scheduleSave();
  }

  function execNotebookBlock(editor, tag, scheduleSave) {
    restoreNotebookSelection(editor);
    document.execCommand('formatBlock', false, `<${tag}>`);
    rememberNotebookSelection(editor);
    scheduleSave();
  }

  function execNotebookColor(editor, cmd, color, scheduleSave) {
    restoreNotebookSelection(editor);
    document.execCommand('styleWithCSS', false, true);
    const applied = document.execCommand(cmd, false, color);
    if (!applied && cmd === 'hiliteColor') document.execCommand('backColor', false, color);
    rememberNotebookSelection(editor);
    scheduleSave();
  }

  function addAnnotationToNotebook(ann) {
    showPanel('notebook');
    const loc = ann.format === 'pdf' ? `Trang ${ann.location.page}` : 'EPUB';
    const html = `<div class="notebook-clip"><strong>${escapeHTML(ann.text)}</strong>${ann.note ? `<div>${escapeHTML(ann.note)}</div>` : ''}<small>${escapeHTML(state.currentBook.title)} · ${loc}</small></div><p><br></p>`;
    els.notebookEditor.insertAdjacentHTML('beforeend', html);
    scheduleNotebookSave();
    toast('Đã thêm vào Notebook');
  }

  function addTranslationToNotebook() {
    const source = els.translationSource.textContent.trim();
    const result = els.translationResult.textContent.trim();
    if (!source || !result || result.includes('Đang dịch')) return;
    showPanel('notebook');
    els.notebookEditor.insertAdjacentHTML('beforeend', `<div class="notebook-clip"><strong>${escapeHTML(source)}</strong><div>${escapeHTML(result)}</div><small>Bản dịch</small></div><p><br></p>`);
    scheduleNotebookSave();
    toast('Đã thêm vào Notebook');
  }

  function showPanel(name) {
    $$('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    $$('.side-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`${name}Panel`);
    if (panel) panel.classList.add('active');
    setSidebar('right', true);
  }

  // ---------- Translation ----------
  async function translateSelection() {
    if (!state.selection?.text) return;
    const source = state.selection.text.slice(0, 450);
    els.translationSource.textContent = source;
    els.translationResult.textContent = 'Đang dịch...';
    const tb = els.selectionToolbar.getBoundingClientRect();
    els.translationPopover.style.left = `${clamp(tb.left, 10, window.innerWidth - 290)}px`;
    els.translationPopover.style.top = `${clamp(tb.bottom + 8, 68, window.innerHeight - 180)}px`;
    els.translationPopover.classList.remove('hidden');
    try {
      const pair = `${state.settings.sourceLang}|${state.settings.targetLang}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(source)}&langpair=${encodeURIComponent(pair)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('translate failed');
      const data = await res.json();
      const translated = data?.responseData?.translatedText || '';
      if (!translated) throw new Error('empty translation');
      els.translationResult.textContent = translated;
    } catch (err) {
      els.translationResult.textContent = 'Không dịch được. Kiểm tra kết nối mạng.';
    }
  }

  // ---------- Search ----------
  function openSearch() {
    if (!state.currentBook) return;
    els.bookSearchInput.value = '';
    els.searchResults.innerHTML = '';
    els.searchStatus.textContent = '';
    openModal(els.searchModal);
    setTimeout(() => els.bookSearchInput.focus(), 50);
  }

  async function searchBook(query) {
    if (!query || state.searchBusy) return;
    state.searchBusy = true;
    els.searchResults.innerHTML = '';
    try {
      if (state.currentBook.type === 'pdf') await searchPDF(query);
      else await searchEPUB(query);
    } finally {
      state.searchBusy = false;
    }
  }

  async function searchPDF(query) {
    const q = query.toLowerCase();
    const results = [];
    for (let p = 1; p <= state.pdfDoc.numPages; p++) {
      els.searchStatus.textContent = `Đang tìm... ${p}/${state.pdfDoc.numPages}`;
      const page = await state.pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map(i => i.str).join(' ').replace(/\s+/g,' ');
      let from = 0, count = 0;
      while (count < 4) {
        const idx = text.toLowerCase().indexOf(q, from);
        if (idx < 0) break;
        results.push({ page:p, text, idx, query });
        from = idx + q.length; count++;
        if (results.length >= 100) break;
      }
      if (results.length >= 100) break;
      if (p % 5 === 0) await sleep();
    }
    renderSearchResults(results.map(r => ({
      label:`Trang ${r.page}`,
      excerpt:excerptAround(r.text, r.idx, query.length),
      query,
      onClick: async () => { closeModals(); state.currentPage=r.page; await renderPDFSpread(); }
    })));
  }

  async function searchEPUB(query) {
    const results = [];
    const sections = state.epubBook.spine?.spineItems || [];
    for (let i=0; i<sections.length; i++) {
      const section = sections[i];
      els.searchStatus.textContent = `Đang tìm... ${i+1}/${sections.length}`;
      try {
        await section.load(state.epubBook.load.bind(state.epubBook));
        if (typeof section.find === 'function') {
          const found = section.find(query) || [];
          for (const f of found.slice(0,5)) {
            results.push({ label:`Phần ${i+1}`, excerpt:f.excerpt || query, query, cfi:f.cfi, href:section.href });
            if (results.length >= 100) break;
          }
        } else {
          const text = section.document?.body?.textContent?.replace(/\s+/g,' ') || '';
          const idx = text.toLowerCase().indexOf(query.toLowerCase());
          if (idx >= 0) results.push({ label:`Phần ${i+1}`, excerpt:excerptAround(text, idx, query.length), query, href:section.href });
        }
        section.unload();
      } catch (_) {}
      if (results.length >= 100) break;
      if (i % 3 === 0) await sleep();
    }
    renderSearchResults(results.map(r => ({
      ...r,
      onClick: async () => { closeModals(); await state.rendition.display(r.cfi || r.href); }
    })));
  }

  function excerptAround(text, idx, len) {
    const start = Math.max(0, idx - 55), end = Math.min(text.length, idx + len + 75);
    return `${start ? '…' : ''}${text.slice(start,end)}${end < text.length ? '…' : ''}`;
  }

  function renderSearchResults(results) {
    els.searchStatus.textContent = `${results.length} kết quả${results.length >= 100 ? ' (đã giới hạn)' : ''}`;
    if (!results.length) {
      els.searchResults.innerHTML = '<div class="empty-mini">Không tìm thấy.</div>';
      return;
    }
    els.searchResults.innerHTML = results.map((r,i) => `<div class="search-result" data-search-index="${i}"><strong>${escapeHTML(r.label)}</strong><p>${highlightExcerpt(r.excerpt, r.query)}</p></div>`).join('');
    $$('.search-result', els.searchResults).forEach(el => el.addEventListener('click', () => results[Number(el.dataset.searchIndex)].onClick()));
  }

  function highlightExcerpt(text, query) {
    const safe = escapeHTML(text);
    const q = escapeHTML(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(q, 'ig'), m => `<mark>${m}</mark>`);
  }

  // ---------- Modals / misc ----------
  function openModal(modal) {
    els.modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
  }

  function closeModals() {
    els.modalBackdrop.classList.add('hidden');
    $$('.modal').forEach(m => m.classList.add('hidden'));
    state.currentEditingAnnotation = null;
    state.editingBookId = null;
    state.editingCollectionId = null;
    state.collectionReturnBookId = null;
  }

  function toast(message, duration=2200) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.add('hidden'), duration);
  }

  function handleShortcuts(e) {
    const typing = e.target.matches('input,textarea,select,[contenteditable="true"]');
    if (typing) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'f' && state.currentBook) { e.preventDefault(); return openSearch(); }
    if (!state.currentBook) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); toggleBookmark(); }
    if (e.key.toLowerCase() === 'h' && state.selection) { e.preventDefault(); addAnnotation('highlight','yellow'); }
    if (e.key.toLowerCase() === 'n' && state.selection) { e.preventDefault(); addAnnotation('highlight','yellow',true).then(openNoteModal); }
    if (e.key === 'Escape') { hideSelectionTools(true); closeModals(); }
  }

  function debounce(fn, wait) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  init().catch(err => {
    console.error(err);
    alert('Reader Studio không thể khởi động. Hãy tải lại trang.');
  });
})();
