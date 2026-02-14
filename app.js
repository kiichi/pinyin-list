    const sourceText = document.getElementById('sourceText');
    const speakBtn = document.getElementById('speakBtn');
const modeSelect = document.getElementById('modeSelect');
const subtitleText = document.getElementById('subtitleText');
const inputLabel = document.getElementById('inputLabel');
const targetLabel = document.getElementById('targetLabel');
const readingLabel = document.getElementById('readingLabel');
const kanaLabel = document.getElementById('kanaLabel');
const readingInline = document.getElementById('readingInline');
const kanaInline = document.getElementById('kanaInline');
const tabsMenuBtn = document.getElementById('tabsMenuBtn');
const tabsMenuPanel = document.getElementById('tabsMenuPanel');
const moveToList = document.getElementById('moveToList');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const batchDeleteBtn = document.getElementById('batchDeleteBtn');
const clearBtn = document.getElementById('clearBtn');
const deleteTabBtn = document.getElementById('deleteTabBtn');
    const tabsList = document.getElementById('tabsList');
    const importFileInput = document.getElementById('importFileInput');

    const zhText = document.getElementById('zhText');
    const pinyinText = document.getElementById('pinyinText');
    const katakanaText = document.getElementById('katakanaText');
    const errorBox = document.getElementById('errorBox');
    const savedList = document.getElementById('savedList');

    const STORAGE_KEY = 'chinese_word_helper_saved_v2';
    const MODE_KEY = 'chinese_word_helper_mode_v1';
    let currentResult = null;
let appMode = loadAppMode();
let appState = loadAppState();
let selectedSavedIds = new Set();
let dragSourceId = null;
let draggedSavedItemId = null;
let draggedSavedItemIds = [];
let draggedFromTabId = null;
let draggedTabId = null;
let editingTabId = null;
let lastSelectedSavedId = null;
let debounceId = null;
let requestCounter = 0;

ensureWanakanaLoaded();
applyModeToUi();
renderTabs();
renderSavedItems();

savedList.addEventListener('dragover', (event) => {
  if (!dragSourceId) return;
  event.preventDefault();
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('.saved-item')) {
    savedList.classList.remove('drag-over-end');
    return;
  }
  savedList.classList.add('drag-over-end');
});

savedList.addEventListener('dragleave', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('.saved-item')) return;
  savedList.classList.remove('drag-over-end');
});

savedList.addEventListener('drop', (event) => {
  if (!dragSourceId) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('.saved-item')) return;
  event.preventDefault();
  reorderSavedItemsToEnd(dragSourceId);
  savedList.classList.remove('drag-over-end');
});

    sourceText.addEventListener('input', scheduleTranslate);
modeSelect.addEventListener('change', () => {
  appMode = modeSelect.value === 'ja' ? 'ja' : 'zh';
  persistAppMode(appMode);
  selectedSavedIds.clear();
  lastSelectedSavedId = null;
  applyModeToUi();
  renderTabs();
  renderSavedItems();
  requestCounter += 1;
  currentResult = null;
  sourceText.value = '';
  zhText.textContent = '-';
  pinyinText.textContent = '-';
  katakanaText.textContent = '-';
  speakBtn.disabled = true;
  saveBtn.disabled = true;
  showError('');
  sourceText.focus();
});
    sourceText.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (!saveBtn.disabled) {
        saveBtn.click();
      }
    });

tabsMenuBtn.addEventListener('click', (event) => {
  event.stopPropagation();
  const willOpen = tabsMenuPanel.hidden;
  if (willOpen) {
    renderMoveToMenuItems();
    updateTabsMenuState();
  }
  tabsMenuPanel.hidden = !willOpen;
  tabsMenuBtn.setAttribute('aria-expanded', String(willOpen));
});

    document.addEventListener('click', (event) => {
      if (tabsMenuPanel.hidden) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tabsMenuPanel.contains(target) || tabsMenuBtn.contains(target)) return;
      tabsMenuPanel.hidden = true;
      tabsMenuBtn.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      tabsMenuPanel.hidden = true;
      tabsMenuBtn.setAttribute('aria-expanded', 'false');
    });

    speakBtn.addEventListener('click', () => {
      if (!currentResult || !currentResult.target) return;
      speakText(currentResult.target, currentResult.speakLang || 'zh-CN');
    });

    saveBtn.addEventListener('click', () => {
      if (!currentResult) return;
      const activeTab = getActiveTab();
      if (!activeTab) return;
      const activeItems = getTabItems(activeTab);
      const nextKey = makeSavedItemKey(currentResult);
      const exists = activeItems.some(item => makeSavedItemKey(item) === nextKey);
      if (exists) {
        showError('Already in this tab.');
        sourceText.focus();
        return;
      }
      activeItems.unshift({
        id: generateItemId(),
        ...currentResult,
        createdAt: new Date().toISOString()
      });
      setTabItems(activeTab, dedupeSaved(activeItems));
      selectedSavedIds.clear();
      persistAppState();
      renderTabs();
      renderSavedItems();

      sourceText.value = '';
      requestCounter += 1;
      currentResult = null;
      zhText.textContent = '-';
      pinyinText.textContent = '-';
      katakanaText.textContent = '-';
      speakBtn.disabled = true;
      saveBtn.disabled = true;
      showError('');
      sourceText.focus();
    });

batchDeleteBtn.addEventListener('click', () => {
  if (selectedSavedIds.size === 0) return;
  const activeTab = getActiveTab();
  if (!activeTab) return;
  const activeItems = getTabItems(activeTab);
  setTabItems(activeTab, activeItems.filter(item => !selectedSavedIds.has(item.id)));
  selectedSavedIds.clear();
  lastSelectedSavedId = null;
  tabsMenuPanel.hidden = true;
  tabsMenuBtn.setAttribute('aria-expanded', 'false');
  persistAppState();
  renderTabs();
  renderSavedItems();
});

clearBtn.addEventListener('click', () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;
  setTabItems(activeTab, []);
  selectedSavedIds.clear();
  lastSelectedSavedId = null;
  tabsMenuPanel.hidden = true;
  tabsMenuBtn.setAttribute('aria-expanded', 'false');
  persistAppState();
  renderTabs();
  renderSavedItems();
});

deleteTabBtn.addEventListener('click', () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;
  const modeState = getModeState();
  if (!modeState || modeState.tabs.length <= 1) return;
  tabsMenuPanel.hidden = true;
  tabsMenuBtn.setAttribute('aria-expanded', 'false');
  deleteTab(activeTab.id);
});

    exportBtn.addEventListener('click', () => {
      tabsMenuPanel.hidden = true;
      tabsMenuBtn.setAttribute('aria-expanded', 'false');
      exportAppStateAsJson();
    });

importBtn.addEventListener('click', () => {
  tabsMenuPanel.hidden = true;
  tabsMenuBtn.setAttribute('aria-expanded', 'false');
  importFileInput.click();
});

    importFileInput.addEventListener('change', async () => {
      const file = importFileInput.files && importFileInput.files[0];
      importFileInput.value = '';
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const imported = normalizeImportedState(parsed);
        if (!imported) {
          showError('Invalid JSON format for import.');
          return;
        }

        appState = imported;
        selectedSavedIds.clear();
        editingTabId = null;
        persistAppState();
        renderTabs();
        renderSavedItems();
        showError('');
      } catch {
        showError('Failed to import JSON file.');
      }
    });

    function scheduleTranslate() {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        translateInput();
      }, 500);
    }

    async function translateInput() {
      const input = sourceText.value.trim();
      if (!input) {
        requestCounter += 1;
        currentResult = null;
        zhText.textContent = '-';
        pinyinText.textContent = '-';
        katakanaText.textContent = '-';
        speakBtn.disabled = true;
        saveBtn.disabled = true;
        showError('');
        return;
      }

      const requestId = ++requestCounter;
      showError('');
      showBusy(true);

      try {
        const targetLang = appMode === 'ja' ? 'ja' : 'zh-CN';
        const translatedPack = await translateText(input, targetLang);
        const targetText = translatedPack.translated;
        if (requestId !== requestCounter) return;
        let reading = '';
        let kata = '';
        let speakLang = 'zh-CN';
        if (appMode === 'ja') {
          speakLang = 'ja-JP';
          await ensureWanakanaLoaded();
          let kanaDisplay = await fetchJapaneseHiragana(targetText);
          if (!hasKana(kanaDisplay)) {
            const fromInput = await translateInputToJapaneseHiragana(input);
            if (hasKana(fromInput)) {
              kanaDisplay = fromInput;
            }
          }
          if (!hasKana(kanaDisplay)) {
            const rm = await fetchRomanizedJapanese(targetText);
            if (isRomajiLike(rm)) {
              const fromRm = toHiraganaSafe(toPlainRomaji(rm));
              if (hasKana(fromRm)) {
                kanaDisplay = fromRm;
              }
            }
          }
          if (!hasKana(kanaDisplay)) {
            const kuromojiKana = await getJapaneseReadingFromKuromoji(targetText);
            if (hasKana(kuromojiKana)) {
              kanaDisplay = kuromojiKana;
            }
          }
          let romaji = hasKana(kanaDisplay) ? buildJapaneseRomajiFromKana(kanaDisplay) : '';
          if (
            /[\u4E00-\u9FFF]/.test(targetText) &&
            (!romaji || romaji.replace(/\s+/g, '').length < 6)
          ) {
            const fullRomaji = await buildJapaneseRomaji(targetText, translatedPack.raw);
            if (isRomajiLike(fullRomaji)) {
              romaji = fullRomaji;
            }
          }
          reading = hasKana(kanaDisplay) ? kanaDisplay : '';
          kata = romaji;
        } else {
          if (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') {
            reading = window.pinyinPro.pinyin(targetText, {
              toneType: 'symbol',
              type: 'array',
              nonZh: 'consecutive'
            }).join(' ');
            kata = pinyinToKatakana(reading);
          } else {
            reading = '';
            kata = '';
          }
        }
        if (requestId !== requestCounter) return;

        currentResult = {
          mode: appMode,
          source: input,
          target: targetText,
          reading,
          katakana: kata,
          speakLang
        };

        zhText.textContent = targetText || '-';
        pinyinText.textContent = reading || '-';
        katakanaText.textContent = kata || '-';

        speakBtn.disabled = !targetText;
        saveBtn.disabled = !targetText;
      } catch (error) {
        if (requestId !== requestCounter) return;
        showError(error.message || 'Failed to translate.');
      } finally {
        if (requestId === requestCounter) {
          showBusy(false);
        }
      }
    }

    async function translateText(text, targetLang) {
      try {
        const endpoint = 'https://translate.googleapis.com/translate_a/single';
        const params = new URLSearchParams();
        params.set('client', 'gtx');
        params.set('sl', 'auto');
        params.set('tl', targetLang);
        params.append('dt', 't');
        if (targetLang === 'ja') {
          // Needed for Japanese mode reading extraction.
          params.append('dt', 'rm');
        }
        params.set('q', text);

        const res = await fetchWithTimeout(endpoint + '?' + params.toString(), 3500);
        if (!res.ok) throw new Error('Primary translation failed');

        const data = await res.json();
        if (!Array.isArray(data) || !Array.isArray(data[0])) {
          throw new Error('Unexpected primary translation response');
        }

        const translated = data[0]
          .map(chunk => Array.isArray(chunk) ? chunk[0] : '')
          .join('')
          .trim();

        if (!translated) throw new Error('No text in primary translation response');
        return { translated, raw: data };
      } catch {
        const fallback = 'https://api.mymemory.translated.net/get';
        const sourceCandidates = targetLang === 'ja'
          ? ['zh-CN', 'en']
          : ['ja', 'en', 'zh-CN'];

        for (const sourceLang of sourceCandidates) {
          const fbParams = new URLSearchParams({
            q: text,
            langpair: `${sourceLang}|${targetLang}`
          });
          const fbRes = await fetchWithTimeout(fallback + '?' + fbParams.toString(), 3500);
          if (!fbRes.ok) continue;

          const fbData = await fbRes.json();
          const translated = fbData && fbData.responseData && fbData.responseData.translatedText
            ? String(fbData.responseData.translatedText).trim()
            : '';

          if (!translated) continue;
          const upper = translated.toUpperCase();
          const looksLikeError = upper.includes('INVALID SOURCE LANGUAGE')
            || upper.includes('LANGPAIR=')
            || upper.includes('USING 2 LETTER ISO');
          if (looksLikeError) continue;

          return { translated, raw: null };
        }

        throw new Error('Translation service returned an error.');
      }
    }

    async function buildJapaneseRomaji(targetText, rawTranslationData) {
      if (!targetText) return '';
      const fromRaw = extractRomanizedReading(rawTranslationData);
      if (isRomajiLike(fromRaw)) {
        return normalizeRomaji(fromRaw);
      }
      const deepRaw = extractRomanizedReadingDeep(rawTranslationData);
      if (isRomajiLike(deepRaw)) {
        return normalizeRomaji(deepRaw);
      }

      // Second pass: ask for romanization from Japanese text itself.
      try {
        const romanized = await fetchRomanizedJapanese(targetText);
        if (isRomajiLike(romanized)) return normalizeRomaji(romanized);
      } catch {
        // Ignore and fallback below.
      }

      const converter =
        (window.wanakana && typeof window.wanakana.toRomaji === 'function' && window.wanakana) ||
        (window.Wanakana && typeof window.Wanakana.toRomaji === 'function' && window.Wanakana) ||
        (window.WanaKana && typeof window.WanaKana.toRomaji === 'function' && window.WanaKana) ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toRomaji === 'function' && window.wanakana.default);
      if (converter) {
        const romaji = converter.toRomaji(String(targetText || ''));
        if (isRomajiLike(romaji)) {
          return normalizeRomaji(romaji);
        }
      }

      return '';
    }

    function extractRomanizedReading(rawData) {
      if (!Array.isArray(rawData) || !Array.isArray(rawData[0])) return '';
      const parts = [];
      for (const chunk of rawData[0]) {
        if (!Array.isArray(chunk)) continue;
        const candidates = [chunk[3], chunk[2]];
        for (const c of candidates) {
          if (typeof c === 'string' && /[a-z]/i.test(c)) {
            parts.push(c);
            break;
          }
        }
      }
      return parts.join(' ').trim();
    }

    async function fetchRomanizedJapanese(japaneseText) {
      const endpoint = 'https://translate.googleapis.com/translate_a/single';
      const params = new URLSearchParams({
        client: 'gtx',
        sl: 'ja',
        tl: 'en',
        dt: 'rm',
        q: japaneseText
      });
      const res = await fetchWithTimeout(endpoint + '?' + params.toString(), 2500);
      if (!res.ok) return '';
      const data = await res.json();
      return extractRomanizedReading(data);
    }

    async function fetchJapaneseHiragana(japaneseText) {
      if (!japaneseText) return '';
      const endpoint = 'https://translate.googleapis.com/translate_a/single';
      const targets = ['ja-Hira', 'ja-Hrkt'];
      for (const tl of targets) {
        const params = new URLSearchParams();
        params.set('client', 'gtx');
        params.set('sl', 'ja');
        params.set('tl', tl);
        params.append('dt', 't');
        params.set('q', japaneseText);
        const res = await fetchWithTimeout(endpoint + '?' + params.toString(), 2500);
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data) || !Array.isArray(data[0])) continue;
        const translated = data[0]
          .map(chunk => Array.isArray(chunk) ? chunk[0] : '')
          .join('')
          .trim();
        if (translated) {
          const hiraFromTranslated = toHiraganaSafe(translated);
          if (hasKana(hiraFromTranslated) && !/[\u4E00-\u9FFF]/.test(hiraFromTranslated)) {
            return hiraFromTranslated;
          }
        }
      }
      return '';
    }

    async function getJapaneseReadingFromKuromoji(japaneseText) {
      // Disabled to avoid ORB/CSP issues from external tokenizer script loading.
      void japaneseText;
      return '';
    }


    async function translateInputToJapaneseHiragana(sourceTextValue) {
      if (!sourceTextValue) return '';
      const endpoint = 'https://translate.googleapis.com/translate_a/single';
      const params = new URLSearchParams({
        client: 'gtx',
        sl: 'auto',
        tl: 'ja-Hira',
        dt: 't',
        q: sourceTextValue
      });
      const res = await fetchWithTimeout(endpoint + '?' + params.toString(), 2500);
      if (!res.ok) return '';
      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) return '';
      const translated = data[0]
        .map(chunk => Array.isArray(chunk) ? chunk[0] : '')
        .join('')
        .trim();
      if (!hasKana(translated)) return '';
      const hira = toHiraganaSafe(translated);
      if (/[\u4E00-\u9FFF]/.test(hira)) return '';
      return hira;
    }

    function extractRomanizedReadingDeep(rawData) {
      const candidates = [];
      const walk = (value) => {
        if (typeof value === 'string') {
          const t = value.trim();
          if (isRomajiLike(t)) candidates.push(t);
          return;
        }
        if (Array.isArray(value)) {
          for (const v of value) walk(v);
          return;
        }
        if (value && typeof value === 'object') {
          for (const v of Object.values(value)) walk(v);
        }
      };
      walk(rawData);
      candidates.sort((a, b) => b.length - a.length);
      return candidates[0] || '';
    }

    function toHiraganaSafe(value) {
      const converter =
        (window.wanakana && typeof window.wanakana.toHiragana === 'function' && window.wanakana) ||
        (window.Wanakana && typeof window.Wanakana.toHiragana === 'function' && window.Wanakana) ||
        (window.WanaKana && typeof window.WanaKana.toHiragana === 'function' && window.WanaKana) ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toHiragana === 'function' && window.wanakana.default);
      const text = String(value || '');
      if (converter) return converter.toHiragana(text);
      const fromKana = katakanaToHiraganaFallback(text);
      if (/[ぁ-ん]/.test(fromKana)) return fromKana;
      if (/[a-z]/i.test(fromKana)) return romajiToHiraganaFallback(fromKana);
      return fromKana;
    }

    function toKatakanaFromRomaji(romajiText, japaneseText) {
      const converter =
        (window.wanakana && typeof window.wanakana.toKatakana === 'function' && window.wanakana) ||
        (window.Wanakana && typeof window.Wanakana.toKatakana === 'function' && window.Wanakana) ||
        (window.WanaKana && typeof window.WanaKana.toKatakana === 'function' && window.WanaKana) ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toKatakana === 'function' && window.wanakana.default);
      if (!converter) return String(romajiText || japaneseText || '');
      if (/[a-z]/i.test(String(romajiText || ''))) {
        // wanakana expects plain romaji for best results
        const plain = toPlainRomaji(romajiText);
        return converter.toKatakana(plain);
      }
      return converter.toKatakana(toHiraganaSafe(String(japaneseText || '')));
    }

    function toRomajiSafe(value) {
      const converter =
        (window.wanakana && typeof window.wanakana.toRomaji === 'function' && window.wanakana) ||
        (window.Wanakana && typeof window.Wanakana.toRomaji === 'function' && window.Wanakana) ||
        (window.WanaKana && typeof window.WanaKana.toRomaji === 'function' && window.WanaKana) ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toRomaji === 'function' && window.wanakana.default);
      const text = String(value || '');
      const out = converter ? converter.toRomaji(text) : kanaToRomajiFallback(text);
      return isRomajiLike(out) ? normalizeRomaji(out) : '';
    }

    function katakanaToHiraganaFallback(text) {
      return String(text || '').replace(/[ァ-ヶ]/g, (char) => {
        const code = char.charCodeAt(0);
        return String.fromCharCode(code - 0x60);
      });
    }

    function romajiToHiraganaFallback(input) {
      let s = toPlainRomaji(input)
        .toLowerCase()
        .replace(/[^a-z'\s-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!s) return '';

      const tri = {
        kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
        gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
        sha: 'しゃ', shu: 'しゅ', sho: 'しょ',
        ja: 'じゃ', ju: 'じゅ', jo: 'じょ',
        cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ',
        nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
        hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
        bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
        pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
        mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
        rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ'
      };
      const bi = {
        ts: 'つ',
        sh: 'し',
        ch: 'ち',
        ky: 'き',
        gy: 'ぎ',
        ny: 'に',
        hy: 'ひ',
        by: 'び',
        py: 'ぴ',
        my: 'み',
        ry: 'り'
      };
      const mono = {
        a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
        k: 'く', g: 'ぐ', s: 'す', z: 'ず', j: 'じ', t: 'と', d: 'ど',
        n: 'ん', h: 'ふ', b: 'ぶ', p: 'ぷ', m: 'む', y: 'い', r: 'る', w: 'う',
        ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
        ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
        sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
        za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
        ta: 'た', ti: 'てぃ', chi: 'ち', tu: 'とぅ', tsu: 'つ', te: 'て', to: 'と',
        da: 'だ', di: 'でぃ', du: 'どぅ', de: 'で', do: 'ど',
        na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
        ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
        ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
        pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
        ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
        ya: 'や', yu: 'ゆ', yo: 'よ',
        ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
        wa: 'わ', wo: 'を',
        n: 'ん'
      };

      let out = '';
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === ' ' || c === '-') {
          out += c === ' ' ? ' ' : '';
          i += 1;
          continue;
        }
        if (c === '\'') {
          i += 1;
          continue;
        }

        const next = s[i + 1] || '';
        if (
          i + 1 < s.length &&
          c === next &&
          /[bcdfghjklmpqrstvwxyz]/.test(c) &&
          c !== 'n'
        ) {
          out += 'っ';
          i += 1;
          continue;
        }

        const t3 = s.slice(i, i + 3);
        const t2 = s.slice(i, i + 2);
        const t1 = s.slice(i, i + 1);

        if (tri[t3]) {
          out += tri[t3];
          i += 3;
          continue;
        }
        if (mono[t3]) {
          out += mono[t3];
          i += 3;
          continue;
        }
        if (mono[t2]) {
          out += mono[t2];
          i += 2;
          continue;
        }
        if (t1 === 'n') {
          const after = s[i + 1] || '';
          if (!after || /[^aeiouy]/.test(after)) {
            out += 'ん';
            i += 1;
            continue;
          }
        }
        if (bi[t2] && /[aeiou]/.test(s[i + 2] || '')) {
          out += bi[t2];
          i += 2;
          continue;
        }
        if (mono[t1]) {
          out += mono[t1];
          i += 1;
          continue;
        }
        i += 1;
      }
      return out.trim();
    }

    function kanaToRomajiFallback(value) {
      const text = katakanaToHiraganaFallback(String(value || ''));
      if (!text) return '';
      const digraph = {
        'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
        'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
        'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
        'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
        'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
        'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
        'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
        'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
        'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
        'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
        'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
        'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du'
      };
      const mono = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'を': 'o', 'ん': 'n',
        'ゔ': 'vu',
        'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o'
      };
      let out = '';
      let i = 0;
      let geminate = false;
      while (i < text.length) {
        const c = text[i];
        if (c === 'っ') {
          geminate = true;
          i += 1;
          continue;
        }
        if (c === 'ー') {
          const m = out.match(/[aeiou]$/);
          if (m) out += m[0];
          i += 1;
          continue;
        }
        const pair = text.slice(i, i + 2);
        let roma = '';
        if (digraph[pair]) {
          roma = digraph[pair];
          i += 2;
        } else if (mono[c]) {
          roma = mono[c];
          i += 1;
        } else {
          i += 1;
          continue;
        }
        if (geminate && roma) {
          roma = roma[0] + roma;
          geminate = false;
        }
        out += roma;
      }
      return out.trim();
    }

    function toPlainRomaji(value) {
      return String(value || '')
        .toLowerCase()
        .replace(/ā/g, 'aa')
        .replace(/ī/g, 'ii')
        .replace(/ū/g, 'uu')
        .replace(/ē/g, 'ee')
        .replace(/ō/g, 'ou');
    }

    function buildJapaneseKanaDisplay(japaneseText, hiraHint) {
      const text = String(japaneseText || '');
      const hasKatakana = /[\u30A0-\u30FF]/.test(text);
      const hasHiragana = /[\u3040-\u309F]/.test(text);
      const hasKanji = /[\u4E00-\u9FFF]/.test(text);

      if (hasKatakana && !hasHiragana) {
        return toKatakanaFromRomaji('', text) || text;
      }
      if (hasHiragana && !hasKanji) {
        return toHiraganaSafe(text) || text;
      }

      if (hiraHint && /[\u3040-\u309F]/.test(hiraHint)) {
        return hiraHint;
      }

      if (hasKatakana) return toKatakanaFromRomaji('', text) || text;
      if (hasHiragana) return toHiraganaSafe(text) || text;
      return text;
    }

    function buildJapaneseRomajiFromKana(kanaDisplay) {
      const fromKana = toRomajiSafe(kanaDisplay);
      if (isRomajiLike(fromKana)) return normalizeRomaji(fromKana);
      return '';
    }


    function isRomajiLike(value) {
      const t = String(value || '').trim();
      if (!t) return false;
      const upper = t.toUpperCase();
      if (upper.includes('INVALID SOURCE LANGUAGE') || upper.includes('LANGPAIR=')) return false;
      return /[a-z]/i.test(t);
    }

    function hasKana(value) {
      return /[\u3040-\u309F\u30A0-\u30FF]/.test(String(value || ''));
    }

    function normalizeRomaji(value) {
      const text = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

      // Light long-vowel normalization for friendlier romaji display.
      return text
        .replace(/aa/g, 'ā')
        .replace(/ii/g, 'ī')
        .replace(/uu/g, 'ū')
        .replace(/ee/g, 'ē')
        .replace(/ou/g, 'ō')
        .replace(/oo/g, 'ō');
    }

    const PINYIN_TABLE_ROWS = [
      'zero a アー ai アイ ao アオ an アン ang アン yi イー ya ヤー yao ヤオ yan イエン yang ヤン ye イエ you ヨウ yong ヨン yin イン ying イン yu イー yuan ユエン yue ユエ yun イン wu ウー wa ワー wai ワイ wan ワン wang ワン wei ウェイ wen ウェン weng ウォン wo ウオ e オー,ウー ei エイ er アー,アル en エン eng オン o オー ou オウ yo ヨー',
      'b ba バー bai バイ bao バオ ban バン bang バン bi ビー biao ビャオ bian ビエン bie ビエ bin ビン bing ビン bu ブー bei ベイ ben ベン beng ボン bo ボー',
      'p pa パー pai パイ pao パオ pan パン pang パン pi ピー piao ピャオ pian ピエン pie ピエ pin ピン ping ピン pu プー pei ペイ pen ペン peng ポン po ポー pou ポウ',
      'm ma マー mai マイ mao マオ man マン mang マン mi ミー miao ミャオ mian ミエン mie ミエ miu ミュー min ミン ming ミン mu ムー me マー,モー mei メイ men メン meng モン mo モー mou モウ',
      'f fa ファー fan ファン fang ファン fu フー fei フェイ fen フェン feng フォン fo フォー fou フォウ',
      'd da ダー dai ダイ dao ダオ dan ダン dang ダン di ディー dia デャー diao デャオ dian ディエン die ディエ diu デュー ding ディン du ドゥー duan ドワン dui ドゥイ dun ドゥン duo ドゥオ de ダー,ドー dei デイ den デン deng ドン dou ドウ dong ドン',
      't ta ター tai タイ tao タオ tan タン tang タン ti ティー tiao テャオ tian ティエン tie ティエ ting ティン tu トゥー tuan トワン tui トゥイ tun トゥン tuo トゥオ te ター,トー teng トン tou トウ tong トン',
      'n na ナー nai ナイ nao ナオ nan ナン nang ナン ni ニー niao ニャオ nian ニエン niang ニャン nie ニエ niu ニュー nin ニン ning ニン nv ニー nve ニュエ nu ヌー nuan ヌワン nun ヌン nuo ヌオ ne ナー,ノー nei ネイ nen ネン neng ノン nou ノウ nong ノン',
      'l la ラー lai ライ lao ラオ lan ラン lang ラン li リー lia リャー liao リャオ lian リエン liang リャン lie リエ liu リュー lin リン ling リン lv リー lve リュエ lu ルー luan ルワン lun ルン luo ルオ le ラー lei レイ leng ロン lo ロー lou ロウ long ロン',
      'g ga ガー gai ガイ gao ガオ gan ガン gang ガン gu グー gua グワー guai グワイ guan グワン guang グワン gui グイ gun グン guo グオ ge ゴー,グー,ガー gei ゲイ gen ゲン geng ゴン gou ゴウ gong ゴン',
      'k ka カー kai カイ kao カオ kan カン kang カン ku クー kua クワー kuai クワイ kuan クワン kuang クワン kui クイ kun クン kuo クオ ke コー,クー,カー kei ケイ ken ケン keng コン kou コウ kong コン',
      'h ha ハー hai ハイ hao ハオ han ハン hang ハン hu フー hua フワー huai フワイ huan フアン huang フアン hui フイ hun フン huo フオ he ホー,フー,ハー hei ヘイ hen ヘン heng ホン hou ホウ hong ホン',
      'j ji ジー jia ジャー jiao ジャオ jian ジエン jiang ジャン jie ジエ jiu ジュー jiong ジョン jin ジン jing ジン ju ジー juan ジュエン jue ジュエ jun ジン',
      'q qi チー qia チャー qiao チャオ qian チエン qiang チャン qie チエ qiu チュー qiong チョン qin チン qing チン qu チー quan チュエン que チュエ qun チン',
      'x xi シー xia シャー xiao シャオ xian シエン xiang シャン xie シエ xiu シュー xiong ション xin シン xing シン xu シー xuan シュエン xue シュエ xun シン',
      'zh zha ジャー zhai ジャイ zhao ジャオ zhan ジャン zhang ジャン zhi ジー zhu ジュー zhua ジュワー zhuai ジュワイ zhuan ジュワン zhuang ジュワン zhui ジュイ zhun ジュン zhuo ジュオ zhe ジョー,ジャー zhei ジェイ zhen ジェン zheng ジョン zhou ジョウ zhong ジョン',
      'ch cha チャー chai チャイ chao チャオ chan チャン chang チャン chi チー chu チュー chua チュワー chuai チュワイ chuan チュワン chuang チュワン chui チュイ chun チュン chuo チュオ che チョー,チャー chen チェン cheng チョン chou チョウ chong チョン',
      'sh sha シャー shai シャイ shao シャオ shan シャン shang シャン shi シー shu シュー shua シュワー shuai シュワイ shuan シュワン shuang シュワン shui シュイ shun シュン shuo シュオ she ショー,シャー shei シェイ shen シェン sheng ション shou ショウ',
      'r rao ラオ ran ラン rang ラン ri リー ru ルー rua ルワー ruan ルワン rui ルイ run ルン ruo ルオ re ロー,ルー,ラー ren レン reng ロン rou ロウ rong ロン',
      'z za ザー zai ザイ zao ザオ zan ザン zang ザン zi ズー zu ズー zuan ズワン zui ズイ zun ズン zuo ズオ ze ゾー,ザー,ズー zei ゼイ zen ゼン zeng ゾン zou ゾウ zong ゾン',
      'c ca ツァー cai ツァイ cao ツァオ can ツァン cang ツァン ci ツー cu ツー cuan ツワン cui ツイ cun ツン cuo ツオ ce ツォー,ツァー,ツー cen ツェン ceng ツォン cou ツォウ cong ツォン',
      's sa サー sai サイ sao サオ san サン sang サン si スー su スー suan スワン sui スイ sun スン suo スオ se ソー,サー,スー sen セン seng ソン sou ソウ song ソン'
    ];
    const PINYIN_KATAKANA_MAP = buildPinyinKatakanaMap();
    const KATAKANA_TUNING = {
      di: 'ディ',
      ti: 'ティ',
      ji: 'ジ',
      qi: 'チ',
      xi: 'シ',
      ri: 'リ',
      zi: 'ズ',
      ci: 'ツ',
      si: 'ス'
    };

    function pinyinToKatakana(pinyinTextValue) {
      if (!pinyinTextValue) return '';

      const normalized = pinyinTextValue
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/u:/g, 'v')
        .replace(/ü/g, 'v')
        .replace(/[^a-zv\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!normalized) return '';
      const converter =
        (window.wanakana && typeof window.wanakana.toKatakana === 'function' && window.wanakana) ||
        (window.Wanakana && typeof window.Wanakana.toKatakana === 'function' && window.Wanakana) ||
        (window.WanaKana && typeof window.WanaKana.toKatakana === 'function' && window.WanaKana) ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toKatakana === 'function' && window.wanakana.default);

      const tokens = normalized.split(' ').filter(Boolean);
      return tokens
        .map(token => {
          if (KATAKANA_TUNING[token]) return KATAKANA_TUNING[token];
          if (PINYIN_KATAKANA_MAP[token]) return PINYIN_KATAKANA_MAP[token];
          return toKatakanaSafe(token, converter);
        })
        .join(' ');
    }

    function buildPinyinKatakanaMap() {
      const map = {};
      for (const row of PINYIN_TABLE_ROWS) {
        const tokens = row.split(/\s+/).filter(Boolean);
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const roma = tokens[i];
          const kata = tokens[i + 1];
          if (!/^[a-zv:ü]+$/.test(roma)) continue;
          if (!/[ァ-ヶー]/.test(kata)) continue;

          const key = roma.replace(/u:/g, 'v').replace(/ü/g, 'v');
          const value = kata.split(',')[0];
          if (!map[key]) {
            map[key] = value;
          }
        }
      }
      return map;
    }

    function toKatakanaSafe(token, converter) {
      let converted = '';
      if (converter) {
        converted = converter.toKatakana(token);
      }
      if (!converted || /[A-Za-z]/.test(converted)) {
        converted = romanToKatakanaFallback(token);
      }
      return converted || token;
    }

    function romanToKatakanaFallback(token) {
      const map = {
        kya: 'キャ', kyu: 'キュ', kyo: 'キョ',
        gya: 'ギャ', gyu: 'ギュ', gyo: 'ギョ',
        sha: 'シャ', shu: 'シュ', sho: 'ショ',
        ja: 'ジャ', ju: 'ジュ', jo: 'ジョ',
        cha: 'チャ', chu: 'チュ', cho: 'チョ',
        nya: 'ニャ', nyu: 'ニュ', nyo: 'ニョ',
        hya: 'ヒャ', hyu: 'ヒュ', hyo: 'ヒョ',
        bya: 'ビャ', byu: 'ビュ', byo: 'ビョ',
        pya: 'ピャ', pyu: 'ピュ', pyo: 'ピョ',
        mya: 'ミャ', myu: 'ミュ', myo: 'ミョ',
        rya: 'リャ', ryu: 'リュ', ryo: 'リョ',
        tsu: 'ツ', shi: 'シ', chi: 'チ', fu: 'フ',
        ka: 'カ', ki: 'キ', ku: 'ク', ke: 'ケ', ko: 'コ',
        ga: 'ガ', gi: 'ギ', gu: 'グ', ge: 'ゲ', go: 'ゴ',
        sa: 'サ', su: 'ス', se: 'セ', so: 'ソ',
        za: 'ザ', ji: 'ジ', zu: 'ズ', ze: 'ゼ', zo: 'ゾ',
        ta: 'タ', te: 'テ', to: 'ト',
        da: 'ダ', de: 'デ', do: 'ド',
        na: 'ナ', ni: 'ニ', nu: 'ヌ', ne: 'ネ', no: 'ノ',
        ha: 'ハ', hi: 'ヒ', he: 'ヘ', ho: 'ホ',
        ba: 'バ', bi: 'ビ', bu: 'ブ', be: 'ベ', bo: 'ボ',
        pa: 'パ', pi: 'ピ', pu: 'プ', pe: 'ペ', po: 'ポ',
        ma: 'マ', mi: 'ミ', mu: 'ム', me: 'メ', mo: 'モ',
        ya: 'ヤ', yu: 'ユ', yo: 'ヨ',
        ra: 'ラ', ri: 'リ', ru: 'ル', re: 'レ', ro: 'ロ',
        wa: 'ワ', wo: 'ヲ',
        a: 'ア', i: 'イ', u: 'ウ', e: 'エ', o: 'オ',
        n: 'ン'
      };

      let s = token.toLowerCase();
      let out = '';
      while (s.length > 0) {
        const c3 = s.slice(0, 3);
        const c2 = s.slice(0, 2);
        const c1 = s.slice(0, 1);
        if (map[c3]) {
          out += map[c3];
          s = s.slice(3);
          continue;
        }
        if (map[c2]) {
          out += map[c2];
          s = s.slice(2);
          continue;
        }
        if (map[c1]) {
          out += map[c1];
          s = s.slice(1);
          continue;
        }
        s = s.slice(1);
      }
      return out;
    }

    function speakText(text, lang) {
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'zh-CN';
      utterance.rate = 0.8;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferZh = ['xiaoxiao', 'tingting', 'yunxi', 'google', 'microsoft'];
      const preferJa = ['nanami', 'keita', 'google', 'microsoft', 'kyoko', 'otoya'];
      const voicePrefix = (lang || '').toLowerCase().startsWith('ja') ? 'ja' : 'zh';
      const preferred = voicePrefix === 'ja' ? preferJa : preferZh;
      const candidates = voices.filter(v => v.lang.toLowerCase().startsWith(voicePrefix));
      const picked = candidates.find(v =>
        preferred.some(p => v.name.toLowerCase().includes(p))
      ) || candidates[0];
      if (picked) utterance.voice = picked;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }

    function applyModeToUi() {
      modeSelect.value = appMode;
      kanaLabel.textContent = 'Katakana';
      if (appMode === 'ja') {
        subtitleText.textContent = 'Input Chinese or English. Get Japanese + Hiragana + Romaji + audio.';
        inputLabel.textContent = 'Input Word';
        targetLabel.textContent = 'Japanese';
        readingLabel.textContent = 'Hiragana';
        kanaLabel.textContent = 'Romaji';
        sourceText.placeholder = 'Type Chinese or English...';
        if (speakBtn.parentElement !== kanaInline) {
          kanaInline.appendChild(speakBtn);
        }
      } else {
        subtitleText.textContent = 'Input Japanese or English. Get Chinese + pinyin + katakana + audio.';
        inputLabel.textContent = 'Input Word';
        targetLabel.textContent = 'Chinese';
        readingLabel.textContent = 'Pinyin';
        kanaLabel.textContent = 'Katakana';
        sourceText.placeholder = 'Type English or Japanese...';
        if (speakBtn.parentElement !== readingInline) {
          readingInline.appendChild(speakBtn);
        }
      }
    }

    function loadAppMode() {
      const raw = localStorage.getItem(MODE_KEY);
      return raw === 'ja' ? 'ja' : 'zh';
    }

    function persistAppMode(mode) {
      localStorage.setItem(MODE_KEY, mode === 'ja' ? 'ja' : 'zh');
    }

    function showBusy(isBusy) {
      if (isBusy) {
        showError('Looking up...');
        return;
      }
      if (errorBox.textContent === 'Looking up...') {
        showError('');
      }
    }

    function showError(message) {
      errorBox.textContent = message || '';
    }

    function hasWanakanaConverter() {
      return Boolean(
        (window.wanakana && typeof window.wanakana.toKatakana === 'function') ||
        (window.Wanakana && typeof window.Wanakana.toKatakana === 'function') ||
        (window.WanaKana && typeof window.WanaKana.toKatakana === 'function') ||
        (window.wanakana && window.wanakana.default && typeof window.wanakana.default.toKatakana === 'function')
      );
    }

    async function ensureWanakanaLoaded() {
      // Do not dynamically load script to avoid ORB/CSP issues.
      // If wanakana is unavailable, app uses built-in safe fallbacks.
      return;
    }


    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async function fetchWithTimeout(url, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    function switchTab(tabId) {
      const modeState = getModeState();
      if (!modeState) return;
      if (!modeState.tabs.some(tab => tab.id === tabId)) return;
      modeState.activeTabId = tabId;
      selectedSavedIds.clear();
      persistAppState();
      renderTabs();
      renderSavedItems();
    }

    function startTabRename(tabId) {
      editingTabId = tabId;
      renderTabs();
    }

    function commitTabRename(tabId, nextName) {
      const modeState = getModeState();
      if (!modeState) return;
      const tab = modeState.tabs.find(t => t.id === tabId);
      if (!tab) return;
      const trimmed = String(nextName || '').trim();
      editingTabId = null;
      if (!trimmed) {
        renderTabs();
        return;
      }
      tab.name = trimmed;
      persistAppState();
      renderTabs();
    }

    function cancelTabRename() {
      editingTabId = null;
      renderTabs();
    }

    function deleteTab(tabId) {
      const modeState = getModeState();
      if (!modeState) return;
      const target = modeState.tabs.find(tab => tab.id === tabId);
      if (!target) return;
      const ok = window.confirm(`Delete tab "${target.name}"?`);
      if (!ok) return;

      modeState.tabs = modeState.tabs.filter(tab => tab.id !== tabId);
      if (modeState.tabs.length === 0) {
        modeState.tabs.push(createTab('List 1'));
      }
      if (!modeState.tabs.some(tab => tab.id === modeState.activeTabId)) {
        modeState.activeTabId = modeState.tabs[0].id;
      }

      selectedSavedIds.clear();
      persistAppState();
      renderTabs();
      renderSavedItems();
    }

    function renderTabs() {
      const modeState = getModeState();
      tabsList.innerHTML = '';
      if (!modeState) return;
      for (const tab of modeState.tabs) {
        const item = document.createElement('div');
        item.className = `tab-item${tab.id === modeState.activeTabId ? ' active' : ''}`;
        item.dataset.tabId = tab.id;
        item.draggable = editingTabId !== tab.id;
        item.addEventListener('dragstart', (event) => {
          if (editingTabId === tab.id) return;
          draggedTabId = tab.id;
          item.classList.add('is-dragging');
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', tab.id);
          }
        });
        item.addEventListener('dragend', () => {
          draggedTabId = null;
          item.classList.remove('is-dragging');
          clearTabDropHighlights();
        });
        item.addEventListener('dragover', (event) => {
          if (draggedSavedItemId) {
            event.preventDefault();
            item.classList.add('drag-over-target');
            return;
          }
          if (draggedTabId && draggedTabId !== tab.id) {
            event.preventDefault();
            item.classList.add('drag-over-reorder');
            item.classList.remove('drag-insert-left', 'drag-insert-right');
            const rect = item.getBoundingClientRect();
            const insertAfter = event.clientX > rect.left + rect.width / 2;
            item.classList.add(insertAfter ? 'drag-insert-right' : 'drag-insert-left');
          }
        });
        item.addEventListener('dragleave', () => {
          item.classList.remove('drag-over-target');
          item.classList.remove('drag-over-reorder', 'drag-insert-left', 'drag-insert-right');
        });
        item.addEventListener('drop', (event) => {
          if (draggedSavedItemId) {
            event.preventDefault();
            item.classList.remove('drag-over-target');
            moveDraggedItemToTab(tab.id);
            return;
          }
          if (draggedTabId && draggedTabId !== tab.id) {
            event.preventDefault();
            const insertAfter = item.classList.contains('drag-insert-right');
            item.classList.remove('drag-over-reorder', 'drag-insert-left', 'drag-insert-right');
            reorderTabs(draggedTabId, tab.id, insertAfter);
          }
        });

    if (editingTabId === tab.id) {
      const editInput = document.createElement('input');
          editInput.className = 'tab-name-input';
          editInput.type = 'text';
          editInput.value = tab.name;
          editInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTabRename(tab.id, editInput.value);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancelTabRename();
            }
          });
          editInput.addEventListener('blur', () => {
            commitTabRename(tab.id, editInput.value);
          });
          item.appendChild(editInput);
          setTimeout(() => {
            editInput.focus();
            editInput.select();
          }, 0);
    } else {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'tab-btn';
      tabBtn.textContent = `${tab.name} (${getTabItems(tab).length})`;
      tabBtn.addEventListener('click', () => switchTab(tab.id));
      tabBtn.addEventListener('dblclick', () => startTabRename(tab.id));
      item.appendChild(tabBtn);
    }
    tabsList.appendChild(item);
  }

      const addBtn = document.createElement('button');
      addBtn.className = 'tab-add-btn';
      addBtn.textContent = '+';
      addBtn.title = 'New tab';
      addBtn.addEventListener('click', () => {
        const newTab = createTab(`List ${modeState.tabs.length + 1}`);
        modeState.tabs.push(newTab);
        modeState.activeTabId = newTab.id;
        editingTabId = newTab.id;
        selectedSavedIds.clear();
        persistAppState();
        renderTabs();
        renderSavedItems();
      });
      tabsList.appendChild(addBtn);
      updateTabsMenuState();
    }

    function updateTabsMenuState() {
      if (!deleteTabBtn) return;
      const modeState = getModeState();
      const canDeleteTab = Boolean(modeState && Array.isArray(modeState.tabs) && modeState.tabs.length > 1);
      deleteTabBtn.disabled = !canDeleteTab;
      deleteTabBtn.title = canDeleteTab ? '' : 'At least one tab is required';
    }

    function clearTabDropHighlights() {
      const nodes = tabsList.querySelectorAll('.tab-item.drag-over-target, .tab-item.drag-over-reorder, .tab-item.drag-insert-left, .tab-item.drag-insert-right, .tab-item.is-dragging');
      nodes.forEach(node => node.classList.remove('drag-over-target', 'drag-over-reorder', 'drag-insert-left', 'drag-insert-right', 'is-dragging'));
    }

    function reorderTabs(sourceTabId, targetTabId, insertAfter) {
      const modeState = getModeState();
      if (!modeState) return;
      if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return;
      const sourceIndex = modeState.tabs.findIndex(tab => tab.id === sourceTabId);
      const targetIndex = modeState.tabs.findIndex(tab => tab.id === targetTabId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const tabs = [...modeState.tabs];
      const [moved] = tabs.splice(sourceIndex, 1);
      const nextTargetIndex = tabs.findIndex(tab => tab.id === targetTabId);
      if (nextTargetIndex === -1) return;
      const insertIndex = insertAfter ? nextTargetIndex + 1 : nextTargetIndex;
      tabs.splice(insertIndex, 0, moved);
      modeState.tabs = tabs;
      persistAppState();
      renderTabs();
    }

    function makeSavedItemKey(item) {
      return `${item.mode || 'zh'}__${item.source || ''}__${item.target || item.zh || ''}`;
    }

    function splitMovableItems(sourceItems, targetItems, movingSet) {
      const targetKeys = new Set(targetItems.map(makeSavedItemKey));
      const movable = [];
      const blocked = [];
      for (const item of sourceItems) {
        if (!movingSet.has(item.id)) continue;
        const key = makeSavedItemKey(item);
        if (targetKeys.has(key)) {
          blocked.push(item);
        } else {
          movable.push(item);
          targetKeys.add(key);
        }
      }
      return { movable, blocked };
    }

    function moveDraggedItemToTab(targetTabId) {
      if (!draggedFromTabId) return;
      if (targetTabId === draggedFromTabId) return;
      const modeState = getModeState();
      if (!modeState) return;

      const sourceTab = modeState.tabs.find(tab => tab.id === draggedFromTabId);
      const targetTab = modeState.tabs.find(tab => tab.id === targetTabId);
      if (!sourceTab || !targetTab) return;
      const sourceItems = getTabItems(sourceTab);
      const targetItems = getTabItems(targetTab);

      const movingIds = draggedSavedItemIds.length > 0
        ? draggedSavedItemIds
        : (draggedSavedItemId ? [draggedSavedItemId] : []);
      if (movingIds.length === 0) return;
      const movingSet = new Set(movingIds);
      const { movable, blocked } = splitMovableItems(sourceItems, targetItems, movingSet);
      if (movable.length === 0) {
        if (blocked.length > 0) {
          showError('Already exists in destination tab. Kept in original tab.');
        }
        return;
      }

      const movableSet = new Set(movable.map(item => item.id));
      setTabItems(sourceTab, sourceItems.filter(item => !movableSet.has(item.id)));
      setTabItems(targetTab, [...movable, ...targetItems]);
      selectedSavedIds.clear();
      lastSelectedSavedId = null;
      if (blocked.length > 0) {
        showError(`Moved ${movable.length}. Skipped ${blocked.length} duplicates.`);
      } else {
        showError(`Moved ${movable.length} item(s).`);
      }

      persistAppState();
      renderTabs();
      renderSavedItems();
    }

    function moveSelectedItemsToTab(targetTabId) {
      const modeState = getModeState();
      if (!modeState) return;
      const activeTab = getActiveTab();
      const targetTab = modeState.tabs.find(tab => tab.id === targetTabId);
      if (!activeTab || !targetTab) return;
      if (activeTab.id === targetTabId) return;
      const activeItems = getTabItems(activeTab);
      const targetItems = getTabItems(targetTab);
      const selectedInActiveTab = activeItems
        .filter(item => selectedSavedIds.has(item.id))
        .map(item => item.id);
      if (selectedInActiveTab.length === 0) return;

      const movingSet = new Set(selectedInActiveTab);
      const { movable, blocked } = splitMovableItems(activeItems, targetItems, movingSet);
      if (movable.length === 0) {
        if (blocked.length > 0) {
          showError('Already exists in destination tab. Kept in original tab.');
        }
        return;
      }

      const movableSet = new Set(movable.map(item => item.id));
      setTabItems(activeTab, activeItems.filter(item => !movableSet.has(item.id)));
      setTabItems(targetTab, [...movable, ...targetItems]);

      selectedSavedIds.clear();
      lastSelectedSavedId = null;
      tabsMenuPanel.hidden = true;
      tabsMenuBtn.setAttribute('aria-expanded', 'false');
      if (blocked.length > 0) {
        showError(`Moved ${movable.length}. Skipped ${blocked.length} duplicates.`);
      } else {
        showError(`Moved ${movable.length} item(s).`);
      }
      persistAppState();
      renderTabs();
      renderSavedItems();
    }

function renderMoveToMenuItems() {
  const modeState = getModeState();
  moveToList.innerHTML = '';
  const activeTab = getActiveTab();
  if (!activeTab || !modeState) return;

  const targets = modeState.tabs.filter(tab => tab.id !== activeTab.id);
  if (targets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tabs-menu-muted';
    empty.textContent = 'No other tabs';
    moveToList.appendChild(empty);
    return;
  }

  const activeItems = getTabItems(activeTab);
  const selectedCount = activeItems.filter(item => selectedSavedIds.has(item.id)).length;
  if (selectedCount === 0) {
    const hint = document.createElement('div');
    hint.className = 'tabs-menu-muted';
    hint.textContent = 'Select items first';
    moveToList.appendChild(hint);
    return;
  }

  for (const tab of targets) {
    const btn = document.createElement('button');
    btn.className = 'tabs-menu-item';
    btn.type = 'button';
    btn.textContent = `${tab.name} (${getTabItems(tab).length})`;
    btn.addEventListener('click', () => moveSelectedItemsToTab(tab.id));
    moveToList.appendChild(btn);
  }
}

    function getActiveTab() {
      const modeState = getModeState();
      if (!modeState) return null;
      return modeState.tabs.find(tab => tab.id === modeState.activeTabId) || null;
    }

    function createWorkspaceFromTabs(tabsLike, activeTabId) {
      const tabs = Array.isArray(tabsLike) ? tabsLike.map(tab => normalizeTab(tab)) : [];
      if (tabs.length === 0) {
        tabs.push(createTab('List 1'));
      }
      const resolvedActive = tabs.some(tab => tab.id === activeTabId) ? activeTabId : tabs[0].id;
      return { tabs, activeTabId: resolvedActive };
    }

    function getModeState(mode = appMode) {
      const key = mode === 'ja' ? 'ja' : 'zh';
      if (!appState || typeof appState !== 'object') {
        appState = { modes: {} };
      }
      if (!appState.modes || typeof appState.modes !== 'object') {
        appState.modes = {};
      }
      if (!appState.modes[key] || !Array.isArray(appState.modes[key].tabs)) {
        appState.modes[key] = createWorkspaceFromTabs([], null);
      }
      return appState.modes[key];
    }

    function createTab(name) {
      return {
        id: generateItemId(),
        name,
        itemsByMode: {
          zh: [],
          ja: []
        }
      };
    }

    function getTabItems(tab, mode = appMode) {
      if (!tab) return [];
      if (!tab.itemsByMode || typeof tab.itemsByMode !== 'object') {
        tab.itemsByMode = { zh: [], ja: [] };
      }
      if (!Array.isArray(tab.itemsByMode.zh)) tab.itemsByMode.zh = [];
      if (!Array.isArray(tab.itemsByMode.ja)) tab.itemsByMode.ja = [];
      const key = mode === 'ja' ? 'ja' : 'zh';
      return tab.itemsByMode[key];
    }

    function setTabItems(tab, items, mode = appMode) {
      if (!tab) return;
      if (!tab.itemsByMode || typeof tab.itemsByMode !== 'object') {
        tab.itemsByMode = { zh: [], ja: [] };
      }
      if (!Array.isArray(tab.itemsByMode.zh)) tab.itemsByMode.zh = [];
      if (!Array.isArray(tab.itemsByMode.ja)) tab.itemsByMode.ja = [];
      const key = mode === 'ja' ? 'ja' : 'zh';
      tab.itemsByMode[key] = items;
    }

    function normalizeTab(tab) {
      const next = {
        id: tab && tab.id ? String(tab.id) : generateItemId(),
        name: tab && tab.name && String(tab.name).trim() ? String(tab.name).trim() : 'List',
        itemsByMode: { zh: [], ja: [] }
      };

      if (tab && tab.itemsByMode && typeof tab.itemsByMode === 'object') {
        next.itemsByMode.zh = normalizeSavedItems(Array.isArray(tab.itemsByMode.zh) ? tab.itemsByMode.zh : []);
        next.itemsByMode.ja = normalizeSavedItems(Array.isArray(tab.itemsByMode.ja) ? tab.itemsByMode.ja : []);
        return next;
      }

      const legacyItems = normalizeSavedItems(tab && Array.isArray(tab.items) ? tab.items : []);
      next.itemsByMode.zh = legacyItems.filter(item => (item.mode || 'zh') !== 'ja');
      next.itemsByMode.ja = legacyItems.filter(item => (item.mode || 'zh') === 'ja');
      return next;
    }

    function normalizeImportedState(data) {
      const root = data && typeof data === 'object' && data.appState ? data.appState : data;
      if (!root || typeof root !== 'object') return null;

      if (root.modes && typeof root.modes === 'object') {
        return {
          modes: {
            zh: createWorkspaceFromTabs(root.modes.zh && root.modes.zh.tabs, root.modes.zh && root.modes.zh.activeTabId),
            ja: createWorkspaceFromTabs(root.modes.ja && root.modes.ja.tabs, root.modes.ja && root.modes.ja.activeTabId)
          }
        };
      }

      if (Array.isArray(root.tabs)) {
        return migrateSharedTabsToModeState(root.tabs, root.activeTabId);
      }

      return null;
    }

    function exportAppStateAsJson() {
      const payload = {
        app: 'chinese-word-helper',
        version: 2,
        exportedAt: new Date().toISOString(),
        appState
      };
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `chinese-word-helper-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function loadLegacySavedItems() {
      try {
        const raw = localStorage.getItem('chinese_word_helper_saved_v1');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function loadAppState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (parsed.modes && typeof parsed.modes === 'object') {
              return {
                modes: {
                  zh: createWorkspaceFromTabs(parsed.modes.zh && parsed.modes.zh.tabs, parsed.modes.zh && parsed.modes.zh.activeTabId),
                  ja: createWorkspaceFromTabs(parsed.modes.ja && parsed.modes.ja.tabs, parsed.modes.ja && parsed.modes.ja.activeTabId)
                }
              };
            }
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
              return migrateSharedTabsToModeState(parsed.tabs, parsed.activeTabId);
            }
          }
        }
      } catch {
        // fall through to default state
      }

      const first = createTab('List 1');
      const legacyItems = normalizeSavedItems(loadLegacySavedItems());
      first.itemsByMode.zh = legacyItems.filter(item => (item.mode || 'zh') !== 'ja');
      first.itemsByMode.ja = legacyItems.filter(item => (item.mode || 'zh') === 'ja');
      return migrateSharedTabsToModeState([first], first.id);
    }

    function migrateSharedTabsToModeState(tabsLike, activeTabId) {
      const shared = createWorkspaceFromTabs(tabsLike, activeTabId);
      const projectMode = (mode) => {
        const tabs = shared.tabs.map((tab) => {
          const normalized = normalizeTab(tab);
          return {
            id: normalized.id,
            name: normalized.name,
            itemsByMode: {
              zh: mode === 'zh' ? [...normalized.itemsByMode.zh] : [],
              ja: mode === 'ja' ? [...normalized.itemsByMode.ja] : []
            }
          };
        });
        return createWorkspaceFromTabs(tabs, shared.activeTabId);
      };

      return {
        modes: {
          zh: projectMode('zh'),
          ja: projectMode('ja')
        }
      };
    }

    function normalizeSavedItems(items) {
      return items.map(item => ({
        ...item,
        id: item.id || generateItemId(),
        mode: item.mode || 'zh',
        target: item.target || item.zh || '',
        reading: item.reading || item.pinyin || '',
        speakLang: item.speakLang || ((item.mode || 'zh') === 'ja' ? 'ja-JP' : 'zh-CN')
      }));
    }

    function generateItemId() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function persistAppState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    }

function dedupeSaved(items) {
      const seen = new Set();
      const unique = [];

      for (const item of items) {
        const key = makeSavedItemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
      }

  return unique;
}

function setSingleSelection(itemId) {
  selectedSavedIds.clear();
  selectedSavedIds.add(itemId);
  lastSelectedSavedId = itemId;
}

function toggleSelection(itemId) {
  if (selectedSavedIds.has(itemId)) {
    selectedSavedIds.delete(itemId);
  } else {
    selectedSavedIds.add(itemId);
  }
  lastSelectedSavedId = itemId;
}

function selectRangeTo(itemId, items, keepExisting) {
  if (!items.length) return;
  const anchorId = lastSelectedSavedId && items.some(item => item.id === lastSelectedSavedId)
    ? lastSelectedSavedId
    : itemId;
  const from = items.findIndex(item => item.id === anchorId);
  const to = items.findIndex(item => item.id === itemId);
  if (from === -1 || to === -1) {
    setSingleSelection(itemId);
    return;
  }
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (!keepExisting) selectedSavedIds.clear();
  for (let i = start; i <= end; i += 1) {
    selectedSavedIds.add(items[i].id);
  }
  lastSelectedSavedId = itemId;
}

function handleSavedRowSelectionClick(itemId, event, items) {
  const isToggle = event.metaKey || event.ctrlKey;
  const isRange = event.shiftKey;
  if (isRange) {
    selectRangeTo(itemId, items, isToggle);
    return;
  }
  if (isToggle) {
    toggleSelection(itemId);
    return;
  }
  setSingleSelection(itemId);
}

function updateBatchDeleteState() {
  const activeTab = getActiveTab();
  const activeItems = getTabItems(activeTab);
  const hasActiveSelection = activeTab
    ? activeItems.some(item => selectedSavedIds.has(item.id))
    : false;
  batchDeleteBtn.disabled = !hasActiveSelection;
  if (!tabsMenuPanel.hidden) {
    renderMoveToMenuItems();
  }
}

function clearRowDropIndicators() {
  const rows = savedList.querySelectorAll('.saved-item');
  rows.forEach(row => {
    row.classList.remove('drag-over', 'drag-insert-before', 'drag-insert-after');
  });
}

function reorderSavedItems(sourceId, targetId, insertAfter) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const activeTab = getActiveTab();
  if (!activeTab) return;
  const activeItems = getTabItems(activeTab);

  const movingIds = draggedSavedItemIds.length > 0
    ? draggedSavedItemIds
    : [sourceId];
  if (movingIds.includes(targetId)) return;

  const movingSet = new Set(movingIds);
  const movingItems = activeItems.filter(item => movingSet.has(item.id));
  if (movingItems.length === 0) return;

  const remaining = activeItems.filter(item => !movingSet.has(item.id));
  const targetIndex = remaining.findIndex(item => item.id === targetId);
  if (targetIndex === -1) return;

  const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
  remaining.splice(insertIndex, 0, ...movingItems);
  setTabItems(activeTab, remaining);
  persistAppState();
  renderTabs();
  renderSavedItems();
}

function reorderSavedItemsToEnd(sourceId) {
  if (!sourceId) return;
  const activeTab = getActiveTab();
  if (!activeTab) return;
  const activeItems = getTabItems(activeTab);

  const movingIds = draggedSavedItemIds.length > 0
    ? draggedSavedItemIds
    : [sourceId];
  const movingSet = new Set(movingIds);
  const movingItems = activeItems.filter(item => movingSet.has(item.id));
  if (movingItems.length === 0) return;

  const remaining = activeItems.filter(item => !movingSet.has(item.id));
  setTabItems(activeTab, [...remaining, ...movingItems]);
  persistAppState();
  renderTabs();
  renderSavedItems();
}

function renderSavedItems() {
      const activeTab = getActiveTab();
      const items = activeTab ? getTabItems(activeTab) : [];
      savedList.innerHTML = '';

      if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'hint';
        li.textContent = 'No saved words yet.';
        savedList.appendChild(li);
        updateBatchDeleteState();
        return;
      }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = `saved-item mode-${item.mode || 'zh'}${selectedSavedIds.has(item.id) ? ' is-selected' : ''}`;
    li.draggable = true;
    li.dataset.id = item.id;
    li.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.closest('button')) return;
      }
      handleSavedRowSelectionClick(item.id, event, items);
      renderSavedItems();
    });

    li.addEventListener('dragstart', (event) => {
      if (!selectedSavedIds.has(item.id)) {
        setSingleSelection(item.id);
      }
      dragSourceId = item.id;
      draggedSavedItemId = item.id;
      const modeState = getModeState();
      draggedFromTabId = modeState ? modeState.activeTabId : null;
      draggedSavedItemIds = items
        .filter(row => selectedSavedIds.has(row.id))
        .map(row => row.id);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
      }
      li.classList.add('is-dragging');
        });
        li.addEventListener('dragend', () => {
      dragSourceId = null;
      draggedSavedItemId = null;
      draggedSavedItemIds = [];
      draggedFromTabId = null;
      li.classList.remove('is-dragging');
      savedList.classList.remove('drag-over-end');
      clearRowDropIndicators();
      clearTabDropHighlights();
        });
        li.addEventListener('dragover', (event) => {
          event.preventDefault();
          clearRowDropIndicators();
          li.classList.add('drag-over');
          const rect = li.getBoundingClientRect();
          const insertAfter = event.clientY > rect.top + rect.height / 2;
          li.classList.add(insertAfter ? 'drag-insert-after' : 'drag-insert-before');
        });
        li.addEventListener('dragleave', () => {
          li.classList.remove('drag-over', 'drag-insert-before', 'drag-insert-after');
        });
        li.addEventListener('drop', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const insertAfter = li.classList.contains('drag-insert-after');
          li.classList.remove('drag-over', 'drag-insert-before', 'drag-insert-after');
          reorderSavedItems(dragSourceId, item.id, insertAfter);
        });

        const inputCell = document.createElement('div');
        inputCell.className = 'saved-cell saved-source';
        inputCell.textContent = item.source || '-';

        const zhCell = document.createElement('div');
        zhCell.className = 'saved-cell saved-zh saved-chinese';
        zhCell.textContent = item.target || item.zh || '-';

        const pinyinCell = document.createElement('div');
        pinyinCell.className = 'saved-cell saved-pinyin';
        pinyinCell.textContent = item.reading || item.pinyin || '-';

        const kataCell = document.createElement('div');
        kataCell.className = 'saved-cell saved-katakana';
        kataCell.textContent = item.katakana || '-';

        const playBtn = document.createElement('button');
        playBtn.className = 'secondary saved-action-btn saved-play';
        playBtn.textContent = '▶';
        playBtn.setAttribute('aria-label', 'Play pronunciation');
        playBtn.title = 'Play pronunciation';
        playBtn.addEventListener('click', () => speakText(item.target || item.zh || '', item.speakLang || (item.mode === 'ja' ? 'ja-JP' : 'zh-CN')));

        const copyBtn = document.createElement('button');
        copyBtn.className = 'secondary saved-action-btn saved-copy';
        copyBtn.textContent = '⧉';
        copyBtn.setAttribute('aria-label', 'Copy item');
        copyBtn.title = 'Copy item';
        copyBtn.addEventListener('click', async () => {
          const text = formatSavedItemForCopy(item);
          const ok = await copyTextToClipboard(text);
          showError(ok ? 'Copied.' : 'Copy failed.');
        });

        const actionsCell = document.createElement('div');
        actionsCell.className = 'saved-actions';
        actionsCell.appendChild(playBtn);
        actionsCell.appendChild(copyBtn);

        li.appendChild(inputCell);
        li.appendChild(zhCell);
        li.appendChild(pinyinCell);
        li.appendChild(kataCell);
        li.appendChild(actionsCell);
        savedList.appendChild(li);
  }
  updateBatchDeleteState();
  if (!tabsMenuPanel.hidden) {
    renderMoveToMenuItems();
  }
}

    function formatSavedItemForCopy(item) {
      const source = String(item.source || '').trim();
      const target = String(item.target || item.zh || '').trim();
      const reading = String(item.reading || item.pinyin || '').trim();
      const extra = String(item.katakana || '').trim();
      return [source, target, reading, extra].filter(Boolean).join(' | ');
    }

    async function copyTextToClipboard(text) {
      const value = String(text || '');
      if (!value) return false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch {
        // fallback below
      }
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        return Boolean(ok);
      } catch {
        return false;
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    if (window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => {
        // Trigger loading voices for browsers that populate voices asynchronously.
        window.speechSynthesis.getVoices();
      };
    }
