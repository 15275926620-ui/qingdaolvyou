(() => {
  'use strict';

  const { facts, platforms, themes, tones } = window.QINGDAO_DATA;
  const factMap = new Map(facts.map(fact => [fact.id, fact]));
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const state = {
    route: 'home', platform: 'xiaohongshu', theme: 'landscape', tone: 'warm',
    visualStyle: 'editorial', variant: 0, category: 'all', query: '',
    result: null, prompt: '', imageUrl: ''
  };

  let imageRequest = 0;
  let heroRequest = 0;
  let toastTimer;

  const toneCopy = {
    warm: {
      openers: ['有些城市，要用脚步和味觉慢慢认识。青岛就是。', '当海风吹过红瓦，青岛的故事就有了温度。'],
      closings: ['如果你也喜欢这样的青岛，就把这份心动收藏起来。', '愿下一次出发，你也能亲自走进这片山海。'],
      note: '把这一条放进旅行清单，青岛就离你更近了一点。'
    },
    knowledge: {
      openers: ['这份青岛笔记，只保留资料里能核对的信息。', '想认真了解青岛，可以先从这几条事实开始。'],
      closings: ['收藏这份资料，也欢迎把准确的信息分享给更多人。', '以上内容均可在事实库定位原文，适合继续查阅。'],
      note: '这条信息可以作为了解青岛的一个清晰入口。'
    },
    concise: {
      openers: ['认识青岛，从这几条事实开始。', '一座城，几条硬信息。'],
      closings: ['看懂事实，再出发。', '把准确的青岛，分享给下一个人。'],
      note: '事实很短，信息很准。'
    }
  };

  const themeTags = {
    landscape: ['#青岛旅游', '#青岛打卡', '#山海之间'],
    food: ['#青岛美食', '#青岛探店', '#海鲜'],
    stay: ['#青岛住宿', '#青岛民宿', '#旅行攻略'],
    beer: ['#青岛啤酒', '#啤酒文化', '#青岛旅行'],
    culture: ['#青岛文化', '#城市漫步', '#青岛']
  };

  const docImages = window.QINGDAO_IMAGES || [];
  const hotelData = window.QINGDAO_HOTELS || [];
  const heroImageSrc = 'assets/doc/landscape/image45.jpeg';

  const themeCovers = {
    landscape: 'assets/doc/landscape/image45.jpeg',
    food: 'assets/doc/food/image14.png',
    stay: 'assets/ai/stay-cover.jpg',
    beer: 'assets/ai/beer-cover.jpg',
    culture: 'assets/ai/culture-cover.jpg'
  };

  /* 文档原图中，个别小节的自动匹配不理想，这里做人工校正（Q07无文档图，改用AI示意图） */
  const imageOverrides = {
    Q04: 'assets/doc/landscape/image16.jpeg',
    Q07: 'assets/ai/q07.jpg',
    Q11: 'assets/doc/landscape/image45.jpeg'
  };

  const docKeyOf = source => {
    if (!source) return null;
    if (source.indexOf('青岛景观') === 0) return 'landscape';
    if (source.indexOf('青岛美食') === 0) return 'food';
    return null;
  };

  /* 把文档内嵌图片按段落区间挂到对应事实上，不使用任何生成图片 */
  function attachDocImages() {
    const byDoc = {};
    docImages.forEach(img => {
      (byDoc[img.doc] = byDoc[img.doc] || []).push(img);
    });
    Object.values(byDoc).forEach(list => list.sort((a, b) => a.paragraph - b.paragraph));

    const groups = {};
    facts.forEach(fact => {
      if (!fact.visuals || fact.visuals[0] === 'qingdao') return;
      const key = docKeyOf(fact.source);
      if (!key) return;
      (groups[key] = groups[key] || []).push(fact);
    });

    Object.entries(groups).forEach(([key, list]) => {
      list.sort((a, b) => a.paragraph - b.paragraph);
      const used = new Set();
      list.forEach((fact, index) => {
        if (Object.prototype.hasOwnProperty.call(imageOverrides, fact.id)) {
          fact.image = imageOverrides[fact.id];
          if (fact.image) used.add(fact.image);
          return;
        }
        const to = index + 1 < list.length ? list[index + 1].paragraph : Infinity;
        const pool = (byDoc[key] || []).filter(img => img.paragraph >= fact.paragraph && img.paragraph <= to);
        const pick = pool.find(img => !used.has(img.file));
        fact.image = pick ? pick.file : (themeCovers[fact.theme] || null);
        if (pick) used.add(pick.file);
      });
    });
  }

  function imageParagraphOf(file) {
    const item = docImages.find(img => img.file === file);
    return item ? item.paragraph : null;
  }

  function isAIImage(file) {
    return file && file.indexOf('assets/ai/') === 0;
  }

  function imageSourceNote(fact) {
    if (!fact || !fact.image) {
      const key = fact ? (docKeyOf(fact.source) || fact.theme) : state.theme;
      const cover = themeCovers[key];
      if (cover) {
        if (isAIImage(cover)) return `该条事实所在段落未附图；配图改用 AI 生成的${themes[key].name}主题示意图（非实景，仅用于视觉呈现）。`;
        const coverDoc = key === 'food' ? '《青岛美食》' : '《青岛景观》';
        return `该条事实所在段落未附图；配图改用${coverDoc}文档内嵌图片（${cover.replace('assets/doc/', '')}）。`;
      }
      return '该主题文档未提供图片；平台不生成 AI 图片，仅以文字排版呈现。';
    }
    if (isAIImage(fact.image)) {
      return `图片来源：AI 生成示意图（非实景，仅用于视觉呈现），对应事实 ${fact.id} · ${fact.title}。`;
    }
    const docName = docKeyOf(fact.source) === 'food' ? '《青岛美食》' : '《青岛景观》';
    const para = imageParagraphOf(fact.image);
    return `图片来源：${docName}第 ${para || '—'} 段内嵌图片（${fact.image.replace('assets/doc/', '')}），对应事实 ${fact.id} · ${fact.title}。`;
  }

  const shotGuides = {
    landscape: '无人机或高位镜头，交代山海关系',
    food: '近景与特写交替，突出食物质感',
    stay: '室内外转场，强调窗外海景',
    beer: '倒酒与泡沫特写，穿插城市街景',
    culture: '街巷慢摇，穿插手作与风物细节'
  };

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function rich(text) {
    return escapeHTML(text).replace(/\[(Q\d{2,3})\]/g, (_, id) => {
      if (!factMap.has(id)) return `[${id}]`;
      return `<button type="button" class="citation" data-fact="${id}" aria-label="查看事实 ${id} 原文">${id}</button>`;
    });
  }

  function cite(fact) {
    return `[${fact.id}]`;
  }

  function themePool(themeId) {
    return facts.filter(fact => fact.theme === themeId);
  }

  function pickFacts(count) {
    const pool = themePool(state.theme);
    const start = state.variant % pool.length;
    return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
  }

  function buildResult() {
    const theme = themes[state.theme];
    const unit = themePool(state.theme);
    const title = theme.titles[state.platform][state.variant % 2];
    const tone = toneCopy[state.tone];
    const opener = tone.openers[state.variant % 2];
    const closing = tone.closings[state.variant % 2];
    const tags = themeTags[state.theme];

    if (state.platform === 'xiaohongshu') {
      const picked = pickFacts(3);
      return {
        kind: 'xiaohongshu', title, tags, factsUsed: picked,
        paragraphs: [opener, ...picked.map(fact => `${fact.summary}${cite(fact)}`), tone.note, closing]
      };
    }

    if (state.platform === 'douyin') {
      const picked = pickFacts(4);
      const times = ['00–03s', '03–07s', '07–12s', '12–15s'];
      const shots = picked.map((fact, index) => ({
        time: times[index] || '补充镜头',
        visual: index === 0 ? `${shotGuides[state.theme]}；开场：${fact.title}` : `围绕「${fact.title}」的细节镜头`,
        voice: index === 0 ? `${title}${cite(fact)}` : `${fact.summary}${cite(fact)}`
      }));
      return {
        kind: 'douyin', title, tags, factsUsed: picked,
        hook: `${title}${cite(picked[0])}`,
        shots,
        caption: `${picked[0].summary}${cite(picked[0])} 青岛的细节，值得慢慢看。`
      };
    }

    if (state.platform === 'weibo') {
      const picked = pickFacts(2);
      const brief = fact => {
        const first = fact.summary.split(/[。；]/)[0];
        return first.length > 40 ? `${first.slice(0, 40)}…` : first;
      };
      return {
        kind: 'weibo', title, tags, factsUsed: picked,
        intro: opener,
        paragraphs: picked.map(fact => `${brief(fact)}${cite(fact)}`),
        closing,
        suggestion: `配图建议：${platforms.weibo.ratio}单图，主体围绕「${picked[0].title}」，画面留出话题文字安全区。`
      };
    }

    const picked = pickFacts(4);
    return {
      kind: 'wechat', title, tags, factsUsed: picked,
      summary: `${opener}${picked[0].summary}${cite(picked[0])}`,
      sections: picked.map((fact, index) => ({
        number: String(index + 1).padStart(2, '0'),
        heading: fact.title,
        text: `${fact.summary}${cite(fact)}${tone.note}`
      })),
      closing
    };
  }

  function renderResult() {
    const result = state.result;
    const platform = platforms[state.platform];
    const theme = themes[state.theme];
    let html = '';

    if (result.kind === 'xiaohongshu') {
      html = `
        <p class="content-label">NOTE TITLE / 笔记标题</p>
        <h2 class="note-title">${rich(result.title)}</h2>
        <p class="content-label">NOTE CONTENT / 正文</p>
        <div class="note-body">${result.paragraphs.map(text => `<p>${rich(text)}</p>`).join('')}</div>
        <p class="content-label">TOPICS / 话题</p>
        <div class="hashtag-list">${result.tags.map(tag => `<span class="hashtag">${escapeHTML(tag)}</span>`).join('')}</div>`;
    } else if (result.kind === 'douyin') {
      html = `
        <p class="content-label">0–3S HOOK / 开场钩子</p>
        <h2 class="script-hook">${rich(result.hook)}</h2>
        <p class="content-label">15S STORYBOARD / 分镜与口播</p>
        <div class="shot-list">${result.shots.map(shot => `
          <div class="shot-item">
            <span class="shot-time">${shot.time}</span>
            <div class="shot-content"><strong>${escapeHTML(shot.visual)}</strong><p>${rich(shot.voice)}</p></div>
          </div>`).join('')}</div>
        <p class="content-label">CAPTION / 发布文案</p>
        <p class="publish-caption">${rich(result.caption)}</p>
        <div class="hashtag-list">${result.tags.map(tag => `<span class="hashtag">${escapeHTML(tag)}</span>`).join('')}</div>`;
    } else if (result.kind === 'weibo') {
      html = `
        <p class="content-label">WEIBO POST / 微博正文</p>
        <h2 class="weibo-title">${rich(result.title)}</h2>
        <div class="weibo-body">
          <p>${rich(result.intro)}</p>
          ${result.paragraphs.map(text => `<p>${rich(text)}</p>`).join('')}
          <p>${rich(result.closing)}</p>
        </div>
        <p class="content-label">TOPICS / 话题</p>
        <div class="hashtag-list">${result.tags.map(tag => `<span class="hashtag">${escapeHTML(tag)}</span>`).join('')}</div>
        <p class="content-label">IMAGE NOTE / 配图建议</p>
        <p class="publish-caption">${escapeHTML(result.suggestion)}</p>`;
    } else {
      html = `
        <p class="content-label">ARTICLE TITLE / 文章标题</p>
        <h2 class="article-title">${rich(result.title)}</h2>
        <p class="content-label">ABSTRACT / 摘要</p>
        <p class="article-summary">${rich(result.summary)}</p>
        <p class="content-label">ARTICLE BODY / 分节正文</p>
        ${result.sections.map(section => `
          <section class="article-section"><h3><span>${section.number}</span>${escapeHTML(section.heading)}</h3><p>${rich(section.text)}</p></section>`).join('')}
        <p class="article-summary">${rich(result.closing)}</p>`;
    }

    const container = $('#generated-content');
    container.innerHTML = html;
    container.style.animation = 'none';
    void container.offsetWidth;
    container.style.animation = '';

    $('#output-platform-mark').textContent = platform.mark;
    $('#output-platform-name').textContent = `${platform.name}传播方案`;
    $('#output-theme-name').textContent = `主题：${theme.name} · ${tones[state.tone].name}`;
    $('#content-variant').textContent = `VERSION ${String(state.variant + 1).padStart(2, '0')}`;
    $('#visual-theme-label').textContent = theme.name;
    $('#visual-platform-label').textContent = `${platform.name} · ${platform.description}`;
    $('#image-ratio').textContent = platform.ratio;
    $('#output-grid').classList.toggle('is-wide', state.platform === 'wechat');

    const { factsUsed, ...generatedCopy } = result;
    const references = JSON.stringify(generatedCopy).match(/Q\d{2,3}/g) || [];
    const invalid = references.filter(id => !factMap.has(id));
    $('#validation-badge').innerHTML = invalid.length
      ? `发现 ${invalid.length} 个异常引用`
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>事实校验通过';
    $('#source-summary').textContent = `${references.length} 处引用 · ${factsUsed.length} 项事实`;
    $('#used-facts').innerHTML = factsUsed.map(fact => `
      <button type="button" class="used-fact" data-fact="${fact.id}">
        <strong>${fact.id}</strong><span>${escapeHTML(fact.title)}</span><span>↗</span>
      </button>`).join('');
  }

  function loadGeneratedImage() {
    const image = $('#generated-image');
    const loading = $('#image-loading');
    const error = $('#image-error');
    const request = ++imageRequest;
    const ratioClass = { xiaohongshu: 'ratio-portrait', douyin: 'ratio-story', wechat: 'ratio-landscape', weibo: 'ratio-square' }[state.platform];
    const primary = state.result && state.result.factsUsed[0];
    const hasFactImage = !!(primary && primary.image);
    const cover = themeCovers[state.theme];
    const textCover = $('#text-cover');

    state.prompt = imageSourceNote(primary);
    state.imageUrl = hasFactImage ? primary.image : cover;
    $('#image-prompt').textContent = state.prompt;
    $('#open-image').href = state.imageUrl || '#';
    $('#open-image').hidden = !state.imageUrl;
    const isAI = isAIImage(state.imageUrl);
    $('#visual-source-label').textContent = state.imageUrl
      ? (isAI ? 'AI 示意图' : '文档原图')
      : '文字封面';
    $('#generated-image-frame').className = `generated-image-frame ${ratioClass}${state.imageUrl ? '' : ' is-text-cover'}`;
    textCover.hidden = !!state.imageUrl;
    if (!state.imageUrl) {
      $('#text-cover-title').textContent = themes[state.theme].name;
      loading.hidden = true;
      error.hidden = true;
      image.style.opacity = '0';
      image.removeAttribute('src');
      image.alt = `${themes[state.theme].name}文字封面（文档未提供图片）`;
      return;
    }

    image.alt = hasFactImage
      ? `文档内嵌图片：${primary.title}`
      : `${themes[state.theme].name}主题文档配图`;
    const crops = { editorial: ['50% 50%', 1], macro: ['50% 34%', 1.28], overhead: ['50% 68%', 1.12] };
    const crop = crops[state.visualStyle] || crops.editorial;
    image.style.objectPosition = crop[0];
    $('#generated-image-frame').style.setProperty('--img-zoom', crop[1]);
    loading.hidden = false;
    error.hidden = true;
    image.style.opacity = '0';

    image.onload = () => {
      if (request !== imageRequest) return;
      loading.hidden = true;
      error.hidden = true;
      image.style.opacity = '1';
    };
    image.onerror = () => {
      if (request !== imageRequest) return;
      loading.hidden = true;
      error.hidden = false;
      image.style.opacity = '0';
    };
    image.src = state.imageUrl;
  }

  function loadHeroImage() {
    const image = $('#hero-image');
    const loading = $('#hero-loading');
    const error = $('#hero-error');
    const request = ++heroRequest;
    loading.hidden = false;
    error.hidden = true;
    image.style.opacity = '0';
    image.onload = () => {
      if (request !== heroRequest) return;
      loading.hidden = true;
      image.style.opacity = '1';
    };
    image.onerror = () => {
      if (request !== heroRequest) return;
      loading.hidden = true;
      error.hidden = false;
    };
    image.src = heroImageSrc;
  }

  function generate(increment = false) {
    if (increment) state.variant += 1;
    state.result = buildResult();
    renderResult();
    loadGeneratedImage();
  }

  function syncPressed(containerSelector, key, value) {
    $$(`${containerSelector} [data-${key}]`).forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset[key] === value));
    });
  }

  function syncControls() {
    syncPressed('#platform-options', 'platform', state.platform);
    syncPressed('#theme-options', 'theme', state.theme);
    syncPressed('#tone-options', 'tone', state.tone);
    $('#visual-style').value = state.visualStyle;
    $('#theme-description').textContent = themes[state.theme].description;
  }

  function plainTextResult() {
    const result = state.result;
    const platform = platforms[state.platform];
    const theme = themes[state.theme];
    const lines = [`岛城风物｜${platform.name}传播方案`, `主题：${theme.name}｜风格：${tones[state.tone].name}`, ''];

    if (result.kind === 'xiaohongshu') {
      lines.push(`【标题】${result.title}`, '', '【正文】', ...result.paragraphs, '', `【话题】${result.tags.join(' ')}`);
    } else if (result.kind === 'douyin') {
      lines.push(`【3秒钩子】${result.hook}`, '', '【15秒分镜与口播】');
      result.shots.forEach(shot => lines.push(`${shot.time}｜${shot.visual}`, `口播：${shot.voice}`, ''));
      lines.push(`【发布文案】${result.caption}`, `【话题】${result.tags.join(' ')}`);
    } else if (result.kind === 'weibo') {
      lines.push(`【微博正文】${result.title}`, result.intro, ...result.paragraphs, result.closing, '', `【话题】${result.tags.join(' ')}`, `【配图建议】${result.suggestion}`);
    } else {
      lines.push(`【文章标题】${result.title}`, '', `【摘要】${result.summary}`, '', '【正文】');
      result.sections.forEach(section => lines.push(`${section.number} ${section.heading}`, section.text, ''));
      lines.push(result.closing);
    }

    lines.push('', '—— 事实来源 ——');
    result.factsUsed.forEach(fact => {
      lines.push(`${fact.id}｜${fact.title}`, fact.quote, `来源：《${fact.source}》第${fact.paragraph}段`, '');
    });
    const img = state.imageUrl;
    const imgNote = !img ? '无配图'
      : isAIImage(img) ? '配图说明：无文档图时由 AI 生成示意图（非实景，仅用于视觉呈现）。'
      : '配图说明：配图取自用户提供的《青岛景观》《青岛美食》文档内嵌图片。';
    lines.push(imgNote, '生成方式：事实约束生成 · 本地交互原型');
    return lines.join('\n');
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('copy failed');
      }
      showToast(successMessage);
    } catch (error) {
      showToast('复制未完成，请手动选择文本复制');
    }
  }

  function downloadResult() {
    const blob = new Blob(['\ufeff', plainTextResult()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `青岛_${platforms[state.platform].name}_${themes[state.theme].name}_V${state.variant + 1}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('TXT 已导出，完整事实来源一并附上');
  }

  function showFact(id) {
    const fact = factMap.get(id);
    if (!fact) return;
    $('#dialog-id').textContent = fact.id;
    $('#dialog-category').textContent = `${fact.category} · ${fact.title}`;
    $('#dialog-title').textContent = fact.title;
    $('#dialog-quote').textContent = fact.quote;
    $('#dialog-source').textContent = `《${fact.source}》第 ${fact.paragraph} 段 · 用户提供资料`;
    const dialog = $('#fact-dialog');
    dialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function showToast(message) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function renderFacts() {
    const query = state.query.trim().toLowerCase();
    const filtered = facts.filter(fact => {
      const categoryMatch = state.category === 'all' || fact.category === state.category;
      const haystack = `${fact.id} ${fact.title} ${fact.summary} ${fact.quote} ${fact.tags.join(' ')}`.toLowerCase();
      return categoryMatch && (!query || haystack.includes(query));
    });

    $('#library-result-count').textContent = `显示 ${filtered.length} 条事实`;
    $('#fact-empty').hidden = filtered.length > 0;
    $('#fact-grid').hidden = filtered.length === 0;
    $('#fact-grid').innerHTML = filtered.map(fact => `
      <article class="fact-card">
        <div class="fact-card-top"><span class="fact-id">${fact.id}</span><span class="fact-category">${escapeHTML(fact.category)}</span></div>
        <h2>${escapeHTML(fact.title)}</h2>
        <p class="fact-text">${escapeHTML(fact.summary)}</p>
        <div class="fact-tags">${fact.tags.map(tag => `<span># ${escapeHTML(tag)}</span>`).join('')}</div>
        <div class="fact-card-footer"><span>${escapeHTML(fact.source)} · 第 ${fact.paragraph} 段</span><button type="button" data-fact="${fact.id}">查看原文 <span>↗</span></button></div>
      </article>`).join('');
  }

  function resetFilters() {
    state.category = 'all';
    state.query = '';
    $('#fact-search').value = '';
    syncPressed('#category-filters', 'category', 'all');
    renderFacts();
  }

  /* ---------- 行程攻略 ---------- */

  const guideState = { persona: 'play', days: 1, budget: 'comfort' };

  const guidePersonas = {
    play: {
      name: '爱玩 · 体验派',
      desc: '海水浴场、海岛、公园体验',
      ids: ['Q10', 'Q12', 'Q04', 'Q05', 'Q06', 'Q07', 'Q09']
    },
    sight: {
      name: '爱景点 · 打卡派',
      desc: '地标、万国建筑与名山',
      ids: ['Q11', 'Q01', 'Q02', 'Q03', 'Q08', 'Q09']
    }
  };

  const guideBudgets = {
    economy: { name: '经济', range: '200 元以下', rows: [['100元以下', 8, '4.1%'], ['100—199元', 48, '24.9%']] },
    comfort: { name: '舒适', range: '200—399 元', rows: [['200—299元', 39, '20.2%'], ['300—399元', 57, '29.5%']] },
    quality: { name: '品质', range: '400 元以上', rows: [['400—599元', 23, '11.9%'], ['600元及以上', 18, '9.3%']] }
  };

  const guideHotelRanges = {
    economy: price => price < 200,
    comfort: price => price >= 200 && price <= 399,
    quality: price => price >= 400
  };

  /* 从文档表 4 的 193 家住宿明细中，按价格档挑选评分优先的前 3 家 */
  function guideHotelPicks() {
    const inBand = guideHotelRanges[guideState.budget];
    return hotelData
      .filter(hotel => inBand(hotel.price))
      .sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating) || a.price - b.price)
      .slice(0, 3);
  }

  function hoursRange(fact) {
    const match = (fact.quote || '').match(/(\d{1,2})[：:](\d{2})\s*[-—~－]\s*(\d{1,2})[：:](\d{2})/);
    if (!match) return null;
    return { open: Number(match[1]) * 60 + Number(match[2]), close: Number(match[3]) * 60 + Number(match[4]) };
  }

  /* 文档在另一条事实里写明了开放时间，攻略中直接引用，不做库外推断 */
  const timeEvidenceOverrides = {
    Q10: { slot: '全天', text: '文档：浮山生态公园全年全天开放（见 Q156）' }
  };

  function timeEvidence(fact) {
    if (timeEvidenceOverrides[fact.id]) return timeEvidenceOverrides[fact.id];
    const quote = fact.quote || '';
    if (/夜幕|夜晚|灯光秀/.test(quote)) return { slot: '夜晚', text: '文档：夜幕降临可观赏浮山湾灯光秀' };
    if (/傍晚/.test(quote)) return { slot: '傍晚', text: '文档：傍晚可观赏落日余晖' };
    if (/全天开放/.test(quote)) return { slot: '全天', text: '文档：全年全天开放' };
    return null;
  }

  const ticketOverrides = {
    Q10: { amount: 0, text: '免费（文档 Q156 写明）' }
  };

  function ticketInfo(fact) {
    if (ticketOverrides[fact.id]) return ticketOverrides[fact.id];
    const quote = fact.quote || '';
    if (/门票免费/.test(quote)) return { amount: 0, text: '免费（文档写明）' };
    if (/免费开放/.test(quote)) return { amount: 0, text: '免费开放（文档写明）' };
    if (/通票：120元/.test(quote)) return { amount: 120, text: '通票 120 元（文档写明，可选）' };
    return { amount: null, text: '文档未标注' };
  }

  function guideSightEntries(day) {
    const pool = guidePersonas[guideState.persona].ids.map(id => factMap.get(id)).filter(Boolean);
    const pick = index => pool[index % pool.length];
    const entries = [
      { slot: '上午 · 建议 08:30–11:30', label: '上午', order: 10, fact: pick(day * 2), advice: '建议上午前往' },
      { slot: '午后 · 建议 14:00–17:00', label: '午后', order: 30, fact: pick(day * 2 + 1), advice: '建议午后前往' }
    ];
    if (day === 0) {
      entries.push({ slot: '傍晚 · 建议 17:30–18:20', label: '傍晚', order: 40, fact: factMap.get('Q160'), advice: '文档明确适合傍晚' });
    } else {
      entries.push({ slot: '傍晚 · 建议 17:30–18:20', label: '傍晚', order: 40, fact: pick(day * 2 + 2), advice: '建议傍晚前往' });
    }
    if (day === 0) {
      entries.push({ slot: '夜晚 · 建议 19:30–21:30', label: '夜晚', order: 60, fact: factMap.get('Q159'), advice: '文档明确适合夜晚' });
    }
    return entries.filter(entry => entry.fact);
  }

  function guideMealEntries(day, restaurants) {
    const lunchPool = restaurants.filter(fact => {
      const hours = hoursRange(fact);
      return hours && hours.open <= 12 * 60 && hours.close >= 13 * 60 + 30;
    });
    const dinnerPool = restaurants.filter(fact => {
      const hours = hoursRange(fact);
      return hours && hours.close >= 19 * 60 + 30;
    });
    const entries = [];
    const lunch = lunchPool.length ? lunchPool[day % lunchPool.length] : null;
    const dinnerCandidates = dinnerPool.filter(fact => !lunch || fact.id !== lunch.id);
    const dinner = dinnerCandidates.length ? dinnerCandidates[day % dinnerCandidates.length] : null;
    if (lunch) {
      entries.push({ slot: '午餐 · 建议 12:00–13:30', label: '午餐', order: 20, fact: lunch });
    }
    if (dinner) {
      entries.push({ slot: '晚餐 · 建议 18:30–19:25', label: '晚餐', order: 50, fact: dinner });
    }
    return entries;
  }

  function addressOf(fact) {
    const match = (fact.quote || '').match(/地址：([^\n]+)/);
    return match ? match[1].trim() : '';
  }

  function renderGuide() {
    const persona = guidePersonas[guideState.persona];
    const budget = guideBudgets[guideState.budget];
    const restaurants = facts.filter(fact => fact.tags && fact.tags[0] === '美食' && hoursRange(fact));
    const avgFact = facts.find(fact => (fact.quote || '').includes('均价 325'));
    const bandCount = budget.rows.reduce((sum, row) => sum + row[1], 0);
    const nights = guideState.days;
    const hotels = guideHotelPicks();
    const primaryHotel = hotels[0];
    const nightly = primaryHotel ? primaryHotel.price : 325;
    const hotelPrices = hotels.map(hotel => hotel.price);
    const hotelRange = hotelPrices.length ? `${Math.min(...hotelPrices)}—${Math.max(...hotelPrices)}` : '—';
    const stayCost = nightly * nights;
    const usedSights = [];
    let ticketCost = 0;
    const daysHtml = [];

    for (let day = 0; day < guideState.days; day += 1) {
      const sights = guideSightEntries(day);
      const meals = guideMealEntries(day, restaurants);
      const rows = [...sights, ...meals].sort((a, b) => a.order - b.order);
      const rowHtml = rows.map(entry => {
        const fact = entry.fact;
        const evidence = timeEvidence(fact);
        const ticket = ticketInfo(fact);
        const isMeal = entry.fact.tags && entry.fact.tags[0] === '美食';
        if (!isMeal && !usedSights.includes(fact.id)) {
          usedSights.push(fact.id);
          if (ticket.amount) ticketCost += ticket.amount;
        }
        const hours = hoursRange(fact);
        const timeText = isMeal && hours
          ? `文档营业时间：${fact.quote.match(/(\d{1,2}[：:]\d{2}\s*[-—~－]\s*\d{1,2}[：:]\d{2})/)[1]}`
          : (evidence ? evidence.text : `${entry.advice || '建议'}（文档未注明开放时段）`);
        const address = isMeal ? addressOf(fact) : '';
        const cut = isMeal && address ? fact.summary.indexOf('地址：') : -1;
        const summaryText = (cut > 20 ? fact.summary.slice(0, cut).trim() : fact.summary).replace(/[，,；;、\s]+$/, '');
        return `
          <article class="slot-row">
            <span class="slot-time">${entry.slot}</span>
            <div class="slot-main">
              <h4>${escapeHTML(fact.title)}<button type="button" class="citation" data-fact="${fact.id}" aria-label="查看事实 ${fact.id} 原文">${fact.id}</button></h4>
              <p>${escapeHTML(summaryText)}</p>
              ${address ? `<p class="slot-address">地址（文档原文）：${escapeHTML(address)}</p>` : ''}
              <div class="slot-badges">
                <span class="slot-badge ${evidence || (isMeal && hours) ? 'is-doc' : ''}">${escapeHTML(timeText)}</span>
                <span class="slot-badge ${ticket.amount !== null ? 'is-doc' : ''}">${escapeHTML(ticket.text)}</span>
              </div>
            </div>
          </article>`;
      }).join('');

      daysHtml.push(`
        <section class="guide-day">
          <div class="guide-day-head"><span>DAY ${String(day + 1).padStart(2, '0')}</span><small>${persona.name}</small></div>
          <div class="slot-list">${rowHtml}</div>
        </section>`);
    }

    const ticketRows = usedSights.map(id => {
      const fact = factMap.get(id);
      const ticket = ticketInfo(fact);
      return `<li><span>${escapeHTML(fact.title)}</span><em>${escapeHTML(ticket.text)}</em></li>`;
    }).join('');

    $('#guide-output').innerHTML = `
      <div class="guide-summary">
        <div><span>人群</span><strong>${persona.name}</strong></div>
        <div><span>天数</span><strong>${guideState.days} 天 ${nights} 晚</strong></div>
        <div><span>预算档</span><strong>${budget.name} · ${budget.range}</strong></div>
        <div><span>可核算费用</span><strong>¥${stayCost + ticketCost}</strong></div>
      </div>
      ${daysHtml.join('')}
      ${hotels.length ? `
      <section class="guide-hotel">
        <div class="guide-cost-head"><h3>住宿推荐</h3><small>文档表 4 明细 · 起步价</small></div>
        <div class="hotel-list">
          ${hotels.map(hotel => `
          <article class="hotel-row">
            <div class="hotel-line"><strong>${escapeHTML(hotel.name)}</strong><em>¥${hotel.price}/晚起</em></div>
            <p>${escapeHTML(hotel.type)} · 评分 ${escapeHTML(hotel.rating)} · ${escapeHTML(hotel.address)}</p>
            <small>文档表 4 第 ${hotel.row} 行 · 价格采集于 2026 年 11 月</small>
          </article>`).join('')}
        </div>
        <p class="hotel-note">该档共 ${bandCount} 家；按评分优先列出前 ${hotels.length} 家，均来自文档表 4 原始记录。</p>
      </section>` : ''}
      <section class="guide-cost">
        <div class="guide-cost-head"><h3>费用明细</h3><small>只计文档写明的数字</small></div>
        <table class="cost-table">
          <thead><tr><th>项目</th><th>依据</th><th>金额</th></tr></thead>
          <tbody>
            <tr><td>住宿</td><td>${primaryHotel
              ? `文档推荐「${escapeHTML(primaryHotel.name)}」起步价 ${nightly} 元/晚 × ${nights} 晚（表 4 第 ${primaryHotel.row} 行）`
              : `文档样本均价 325 元/晚 × ${nights} 晚${avgFact ? ` <button type="button" class="citation" data-fact="${avgFact.id}">${avgFact.id}</button>` : ''}`}</td><td>¥${stayCost}</td></tr>
            <tr><td>景点门票</td><td>${ticketCost ? '按下表已标注门票合计' : '行程内景点均免费或未标注门票'}</td><td>¥${ticketCost}</td></tr>
            <tr><td>餐饮</td><td>文档未提供人均价格，不做估算</td><td>未标注</td></tr>
            <tr><td>市内交通</td><td>文档未提供票价，不做估算</td><td>未标注</td></tr>
            <tr class="cost-total"><td>合计（可核算部分）</td><td>住宿 + 已标注门票</td><td>¥${stayCost + ticketCost}</td></tr>
          </tbody>
        </table>
        <ul class="ticket-list">${ticketRows}</ul>
        <p class="guide-disclaimer">住宿价格依据文档表 3：${budget.rows.map(row => `${row[0]} ${row[1]} 家（${row[2]}）`).join('；')}，该档共 ${bandCount} 家。${primaryHotel ? `费用按推荐酒店「${escapeHTML(primaryHotel.name)}」起步价 ${nightly} 元/晚（表 4 第 ${primaryHotel.row} 行）计算。` : '文档未给出分档均价，因此用全样本均价 325 元/晚估算。'}全样本均价 325 元/晚${avgFact ? ` <button type="button" class="citation" data-fact="${avgFact.id}">${avgFact.id}</button>` : ''}。文档注明价格采集于 2026 年 11 月，实际报价可能变动。</p>
      </section>
      <section class="guide-extra">
        <div class="guide-extra-card">
          <h3>住宿怎么选</h3>
          <p>按文档 ${budget.name} 档（${budget.range}）共 ${bandCount} 家可选；本页推荐 ${hotels.length} 家，起步价 ${hotelRange} 元/晚。全样本起步价 68—1503 元、中位数 302 元、均价 325 元。</p>
        </div>
        <div class="guide-extra-card">
          <h3>美食怎么排</h3>
          <p>午餐与晚餐按文档标注的营业时间匹配时段；文档未提供人均消费，探店费用需现场确认。</p>
        </div>
      </section>`;
  }

  function syncGuideControls() {
    $$('#persona-options [data-persona]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.persona === guideState.persona)));
    $$('#day-options [data-days]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.days) === guideState.days)));
    $$('#budget-options [data-budget]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.budget === guideState.budget)));
  }

  function route() {
    const requested = location.hash.replace('#', '') || 'home';
    state.route = ['home', 'guide', 'studio', 'library'].includes(requested) ? requested : 'home';
    $$('.view').forEach(view => { view.hidden = view.dataset.view !== state.route; });
    $$('.nav-link').forEach(link => {
      if (link.dataset.route === state.route) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const titles = {
      home: '岛城风物｜青岛城市营销内容工作室',
      guide: '行程攻略｜岛城风物',
      studio: '智能创作｜岛城风物',
      library: '事实库｜岛城风物'
    };
    document.title = titles[state.route];
    window.scrollTo(0, 0);
  }

  function bindEvents() {
    window.addEventListener('hashchange', route);

    document.addEventListener('click', event => {
      const factButton = event.target.closest('[data-fact]');
      if (factButton) showFact(factButton.dataset.fact);
      if (event.target.closest('[data-go-library]')) location.hash = 'library';
      const themeLink = event.target.closest('[data-theme-link]');
      if (themeLink) {
        state.theme = themeLink.dataset.themeLink;
        state.variant = 0;
        syncControls();
        generate();
        location.hash = 'studio';
      }
    });

    $('#platform-options').addEventListener('click', event => {
      const button = event.target.closest('[data-platform]');
      if (!button) return;
      state.platform = button.dataset.platform;
      state.variant = 0;
      syncControls();
      generate();
    });

    $('#theme-options').addEventListener('click', event => {
      const button = event.target.closest('[data-theme]');
      if (!button) return;
      state.theme = button.dataset.theme;
      state.variant = 0;
      syncControls();
      generate();
    });

    $('#tone-options').addEventListener('click', event => {
      const button = event.target.closest('[data-tone]');
      if (!button) return;
      state.tone = button.dataset.tone;
      syncControls();
      generate();
    });

    $('#visual-style').addEventListener('change', event => {
      state.visualStyle = event.target.value;
      loadGeneratedImage();
    });

    $('#persona-options').addEventListener('click', event => {
      const button = event.target.closest('[data-persona]');
      if (!button) return;
      guideState.persona = button.dataset.persona;
      syncGuideControls();
      renderGuide();
    });

    $('#day-options').addEventListener('click', event => {
      const button = event.target.closest('[data-days]');
      if (!button) return;
      guideState.days = Number(button.dataset.days);
      syncGuideControls();
      renderGuide();
    });

    $('#budget-options').addEventListener('click', event => {
      const button = event.target.closest('[data-budget]');
      if (!button) return;
      guideState.budget = button.dataset.budget;
      syncGuideControls();
      renderGuide();
    });

    $('#guide-generate').addEventListener('click', () => {
      renderGuide();
      showToast('攻略已按当前筛选重新生成');
    });

    $('#generate-button').addEventListener('click', () => generate(true));
    $('#copy-content').addEventListener('click', () => copyText(plainTextResult(), '完整文案与事实来源已复制'));
    $('#download-content').addEventListener('click', downloadResult);
    $('#copy-prompt').addEventListener('click', () => copyText(state.prompt, '配图来源说明已复制'));
    $('#retry-image').addEventListener('click', loadGeneratedImage);
    $('#retry-hero').addEventListener('click', loadHeroImage);

    $('#category-filters').addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.category = button.dataset.category;
      syncPressed('#category-filters', 'category', state.category);
      renderFacts();
    });
    $('#fact-search').addEventListener('input', event => {
      state.query = event.target.value;
      renderFacts();
    });
    $('#reset-filters').addEventListener('click', resetFilters);

    $('#close-dialog').addEventListener('click', () => $('#fact-dialog').close());
    $('#fact-dialog').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    $('#fact-dialog').addEventListener('close', () => document.body.classList.remove('dialog-open'));

    document.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        location.hash = 'library';
        setTimeout(() => $('#fact-search').focus(), 0);
      }
    });
  }

  function init() {
    attachDocImages();
    Object.entries(themeCovers).forEach(([id, src]) => {
      const photo = $(`[data-theme-photo="${id}"]`);
      if (photo && src) photo.style.backgroundImage = `url("${src}")`;
    });
    $('#header-fact-count').textContent = facts.length;
    $('#metric-fact-count').textContent = facts.length;
    $('#library-total').textContent = facts.length;
    Object.entries(themes).forEach(([id, theme]) => {
      const card = $(`[data-count-theme="${id}"]`);
      if (card) card.textContent = `${themePool(id).length} 条`;
    });
    syncControls();
    renderFacts();
    generate();
    loadHeroImage();
    bindEvents();
    route();
    renderGuide();
  }

  init();
})();
