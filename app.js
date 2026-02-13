    const sourceText = document.getElementById('sourceText');
    const speakBtn = document.getElementById('speakBtn');
const tabsMenuBtn = document.getElementById('tabsMenuBtn');
const tabsMenuPanel = document.getElementById('tabsMenuPanel');
const moveToList = document.getElementById('moveToList');
const saveBtn = document.getElementById('saveBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const batchDeleteBtn = document.getElementById('batchDeleteBtn');
const clearBtn = document.getElementById('clearBtn');
    const tabsList = document.getElementById('tabsList');
    const importFileInput = document.getElementById('importFileInput');

    const zhText = document.getElementById('zhText');
    const pinyinText = document.getElementById('pinyinText');
    const katakanaText = document.getElementById('katakanaText');
    const errorBox = document.getElementById('errorBox');
    const savedList = document.getElementById('savedList');

    const STORAGE_KEY = 'chinese_word_helper_saved_v2';
    let currentResult = null;
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
      if (!currentResult || !currentResult.zh) return;
      speakChinese(currentResult.zh);
    });

    saveBtn.addEventListener('click', () => {
      if (!currentResult) return;
      const activeTab = getActiveTab();
      if (!activeTab) return;
      const nextKey = makeSavedItemKey(currentResult);
      const exists = activeTab.items.some(item => makeSavedItemKey(item) === nextKey);
      if (exists) {
        showError('Already in this tab.');
        sourceText.focus();
        return;
      }
      activeTab.items.unshift({
        id: generateItemId(),
        ...currentResult,
        createdAt: new Date().toISOString()
      });
      activeTab.items = dedupeSaved(activeTab.items);
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
  activeTab.items = activeTab.items.filter(item => !selectedSavedIds.has(item.id));
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
  activeTab.items = [];
  selectedSavedIds.clear();
  lastSelectedSavedId = null;
  tabsMenuPanel.hidden = true;
  tabsMenuBtn.setAttribute('aria-expanded', 'false');
  persistAppState();
  renderTabs();
  renderSavedItems();
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
        const zh = await translateToChinese(input);
        if (requestId !== requestCounter) return;
        const py = window.pinyinPro.pinyin(zh, {
          toneType: 'symbol',
          type: 'array',
          nonZh: 'consecutive'
        }).join(' ');

        const kata = pinyinToKatakana(py);

        currentResult = {
          source: input,
          zh,
          pinyin: py,
          katakana: kata
        };

        zhText.textContent = zh;
        pinyinText.textContent = py || '-';
        katakanaText.textContent = kata || '-';

        speakBtn.disabled = !zh;
        saveBtn.disabled = !zh;
      } catch (error) {
        if (requestId !== requestCounter) return;
        showError(error.message || 'Failed to translate.');
      } finally {
        if (requestId === requestCounter) {
          showBusy(false);
        }
      }
    }

    async function translateToChinese(text) {
      try {
        const endpoint = 'https://translate.googleapis.com/translate_a/single';
        const params = new URLSearchParams({
          client: 'gtx',
          sl: 'auto',
          tl: 'zh-CN',
          dt: 't',
          q: text
        });

        const res = await fetch(endpoint + '?' + params.toString());
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
        return translated;
      } catch {
        const fallback = 'https://api.mymemory.translated.net/get';
        const fbParams = new URLSearchParams({
          q: text,
          langpair: 'auto|zh-CN'
        });
        const fbRes = await fetch(fallback + '?' + fbParams.toString());
        if (!fbRes.ok) throw new Error('Translation service returned an error.');

        const fbData = await fbRes.json();
        const translated = fbData && fbData.responseData && fbData.responseData.translatedText
          ? String(fbData.responseData.translatedText).trim()
          : '';

        if (!translated) throw new Error('No translation text received.');
        return translated;
      }
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

    function speakChinese(text) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.8;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredNamePatterns = [
        'xiaoxiao',
        'tingting',
        'yunxi',
        'google',
        'microsoft'
      ];
      const zhVoices = voices.filter(v => v.lang.toLowerCase().startsWith('zh'));
      const zhVoice = zhVoices.find(v =>
        preferredNamePatterns.some(p => v.name.toLowerCase().includes(p))
      ) || zhVoices[0];
      if (zhVoice) utterance.voice = zhVoice;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
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
      if (hasWanakanaConverter()) return;
      try {
        await loadScript('https://unpkg.com/wanakana@5.3.1/umd/wanakana.min.js');
      } catch {
        // Silent: pinyinToKatakana() already has a safe fallback.
      }
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

    function switchTab(tabId) {
      if (!appState.tabs.some(tab => tab.id === tabId)) return;
      appState.activeTabId = tabId;
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
      const tab = appState.tabs.find(t => t.id === tabId);
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
      const target = appState.tabs.find(tab => tab.id === tabId);
      if (!target) return;
      const ok = window.confirm(`Delete tab "${target.name}"?`);
      if (!ok) return;

      appState.tabs = appState.tabs.filter(tab => tab.id !== tabId);
      if (appState.tabs.length === 0) {
        appState.tabs.push(createTab('List 1'));
      }
      if (!appState.tabs.some(tab => tab.id === appState.activeTabId)) {
        appState.activeTabId = appState.tabs[0].id;
      }

      selectedSavedIds.clear();
      persistAppState();
      renderTabs();
      renderSavedItems();
    }

    function renderTabs() {
      tabsList.innerHTML = '';
      for (const tab of appState.tabs) {
        const item = document.createElement('div');
        item.className = `tab-item${tab.id === appState.activeTabId ? ' active' : ''}`;
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
      tabBtn.textContent = `${tab.name} (${tab.items.length})`;
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
        const newTab = createTab(`List ${appState.tabs.length + 1}`);
        appState.tabs.push(newTab);
        appState.activeTabId = newTab.id;
        editingTabId = newTab.id;
        selectedSavedIds.clear();
        persistAppState();
        renderTabs();
        renderSavedItems();
      });
      tabsList.appendChild(addBtn);
    }

    function clearTabDropHighlights() {
      const nodes = tabsList.querySelectorAll('.tab-item.drag-over-target, .tab-item.drag-over-reorder, .tab-item.drag-insert-left, .tab-item.drag-insert-right, .tab-item.is-dragging');
      nodes.forEach(node => node.classList.remove('drag-over-target', 'drag-over-reorder', 'drag-insert-left', 'drag-insert-right', 'is-dragging'));
    }

    function reorderTabs(sourceTabId, targetTabId, insertAfter) {
      if (!sourceTabId || !targetTabId || sourceTabId === targetTabId) return;
      const sourceIndex = appState.tabs.findIndex(tab => tab.id === sourceTabId);
      const targetIndex = appState.tabs.findIndex(tab => tab.id === targetTabId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const tabs = [...appState.tabs];
      const [moved] = tabs.splice(sourceIndex, 1);
      const nextTargetIndex = tabs.findIndex(tab => tab.id === targetTabId);
      if (nextTargetIndex === -1) return;
      const insertIndex = insertAfter ? nextTargetIndex + 1 : nextTargetIndex;
      tabs.splice(insertIndex, 0, moved);
      appState.tabs = tabs;
      persistAppState();
      renderTabs();
    }

    function makeSavedItemKey(item) {
      return `${item.source || ''}__${item.zh || ''}`;
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

      const sourceTab = appState.tabs.find(tab => tab.id === draggedFromTabId);
      const targetTab = appState.tabs.find(tab => tab.id === targetTabId);
      if (!sourceTab || !targetTab) return;

      const movingIds = draggedSavedItemIds.length > 0
        ? draggedSavedItemIds
        : (draggedSavedItemId ? [draggedSavedItemId] : []);
      if (movingIds.length === 0) return;
      const movingSet = new Set(movingIds);
      const { movable, blocked } = splitMovableItems(sourceTab.items, targetTab.items, movingSet);
      if (movable.length === 0) {
        if (blocked.length > 0) {
          showError('Already exists in destination tab. Kept in original tab.');
        }
        return;
      }

      const movableSet = new Set(movable.map(item => item.id));
      sourceTab.items = sourceTab.items.filter(item => !movableSet.has(item.id));
      targetTab.items = [...movable, ...targetTab.items];
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
      const activeTab = getActiveTab();
      const targetTab = appState.tabs.find(tab => tab.id === targetTabId);
      if (!activeTab || !targetTab) return;
      if (activeTab.id === targetTabId) return;
      const selectedInActiveTab = activeTab.items
        .filter(item => selectedSavedIds.has(item.id))
        .map(item => item.id);
      if (selectedInActiveTab.length === 0) return;

      const movingSet = new Set(selectedInActiveTab);
      const { movable, blocked } = splitMovableItems(activeTab.items, targetTab.items, movingSet);
      if (movable.length === 0) {
        if (blocked.length > 0) {
          showError('Already exists in destination tab. Kept in original tab.');
        }
        return;
      }

      const movableSet = new Set(movable.map(item => item.id));
      activeTab.items = activeTab.items.filter(item => !movableSet.has(item.id));
      targetTab.items = [...movable, ...targetTab.items];

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
  moveToList.innerHTML = '';
  const activeTab = getActiveTab();
  if (!activeTab) return;

  const targets = appState.tabs.filter(tab => tab.id !== activeTab.id);
  if (targets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tabs-menu-muted';
    empty.textContent = 'No other tabs';
    moveToList.appendChild(empty);
    return;
  }

  const selectedCount = activeTab.items.filter(item => selectedSavedIds.has(item.id)).length;
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
    btn.textContent = `${tab.name} (${tab.items.length})`;
    btn.addEventListener('click', () => moveSelectedItemsToTab(tab.id));
    moveToList.appendChild(btn);
  }
}

    function getActiveTab() {
      return appState.tabs.find(tab => tab.id === appState.activeTabId) || null;
    }

    function createTab(name) {
      return {
        id: generateItemId(),
        name,
        items: []
      };
    }

    function normalizeImportedState(data) {
      const root = data && typeof data === 'object' && data.appState ? data.appState : data;
      if (!root || typeof root !== 'object' || !Array.isArray(root.tabs)) return null;

      const tabs = root.tabs.map(tab => ({
        id: tab && tab.id ? String(tab.id) : generateItemId(),
        name: tab && tab.name && String(tab.name).trim() ? String(tab.name).trim() : 'List',
        items: normalizeSavedItems(tab && Array.isArray(tab.items) ? tab.items : [])
      }));

      if (tabs.length === 0) {
        tabs.push(createTab('List 1'));
      }

      const activeTabId = tabs.some(tab => tab.id === root.activeTabId)
        ? root.activeTabId
        : tabs[0].id;

      return { tabs, activeTabId };
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
          if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
            const tabs = parsed.tabs.map(tab => ({
              id: tab.id || generateItemId(),
              name: tab.name || 'List',
              items: normalizeSavedItems(Array.isArray(tab.items) ? tab.items : [])
            }));
            const activeTabId = tabs.some(tab => tab.id === parsed.activeTabId)
              ? parsed.activeTabId
              : tabs[0].id;
            return { tabs, activeTabId };
          }
        }
      } catch {
        // fall through to default state
      }

      const first = createTab('List 1');
      first.items = normalizeSavedItems(loadLegacySavedItems());
      return { tabs: [first], activeTabId: first.id };
    }

    function normalizeSavedItems(items) {
      return items.map(item => ({
        ...item,
        id: item.id || generateItemId()
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
        const key = `${item.source}__${item.zh}`;
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
  const hasActiveSelection = activeTab
    ? activeTab.items.some(item => selectedSavedIds.has(item.id))
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

  const movingIds = draggedSavedItemIds.length > 0
    ? draggedSavedItemIds
    : [sourceId];
  if (movingIds.includes(targetId)) return;

  const movingSet = new Set(movingIds);
  const movingItems = activeTab.items.filter(item => movingSet.has(item.id));
  if (movingItems.length === 0) return;

  const remaining = activeTab.items.filter(item => !movingSet.has(item.id));
  const targetIndex = remaining.findIndex(item => item.id === targetId);
  if (targetIndex === -1) return;

  const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
  remaining.splice(insertIndex, 0, ...movingItems);
  activeTab.items = remaining;
  persistAppState();
  renderTabs();
  renderSavedItems();
}

function reorderSavedItemsToEnd(sourceId) {
  if (!sourceId) return;
  const activeTab = getActiveTab();
  if (!activeTab) return;

  const movingIds = draggedSavedItemIds.length > 0
    ? draggedSavedItemIds
    : [sourceId];
  const movingSet = new Set(movingIds);
  const movingItems = activeTab.items.filter(item => movingSet.has(item.id));
  if (movingItems.length === 0) return;

  const remaining = activeTab.items.filter(item => !movingSet.has(item.id));
  activeTab.items = [...remaining, ...movingItems];
  persistAppState();
  renderTabs();
  renderSavedItems();
}

function renderSavedItems() {
      const activeTab = getActiveTab();
      const items = activeTab ? activeTab.items : [];
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
    li.className = `saved-item${selectedSavedIds.has(item.id) ? ' is-selected' : ''}`;
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
      draggedFromTabId = appState.activeTabId;
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
        inputCell.className = 'saved-cell';
        inputCell.textContent = item.source || '-';

        const zhCell = document.createElement('div');
        zhCell.className = 'saved-cell saved-zh';
        zhCell.textContent = item.zh || '-';

        const pinyinCell = document.createElement('div');
        pinyinCell.className = 'saved-cell';
        pinyinCell.textContent = item.pinyin || '-';

        const kataCell = document.createElement('div');
        kataCell.className = 'saved-cell';
        kataCell.textContent = item.katakana || '-';

        const playBtn = document.createElement('button');
        playBtn.className = 'secondary saved-play';
        playBtn.textContent = '▶';
        playBtn.setAttribute('aria-label', 'Play pronunciation');
        playBtn.title = 'Play pronunciation';
        playBtn.addEventListener('click', () => speakChinese(item.zh || ''));

        li.appendChild(inputCell);
        li.appendChild(zhCell);
        li.appendChild(pinyinCell);
        li.appendChild(kataCell);
        li.appendChild(playBtn);
        savedList.appendChild(li);
  }
  updateBatchDeleteState();
  if (!tabsMenuPanel.hidden) {
    renderMoveToMenuItems();
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
